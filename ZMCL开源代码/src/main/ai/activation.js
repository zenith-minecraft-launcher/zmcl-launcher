const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const axios = require('axios');

const IFDIAN_API = 'https://ifdian.net/api/open/query-random-reply';

function getStoreDir() {
  const dir = path.join(os.homedir(), '.zenith-launcher', 'ai');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
  return dir;
}

const ACTIVATION_FILE = path.join(getStoreDir(), 'activation.json');

function readActivationFile() {
  try {
    if (!fs.existsSync(ACTIVATION_FILE)) return { code: null, usedCodes: [], activatedAt: null };
    const raw = fs.readFileSync(ACTIVATION_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      code: parsed.code || null,
      usedCodes: Array.isArray(parsed.usedCodes) ? parsed.usedCodes : [],
      activatedAt: parsed.activatedAt || null,
      planId: parsed.planId || null,
    };
  } catch (e) {
    console.error('[AI][activation] read failed:', e.message);
    return { code: null, usedCodes: [], activatedAt: null };
  }
}

function writeActivationFile(data) {
  try {
    fs.writeFileSync(ACTIVATION_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('[AI][activation] write failed:', e.message);
  }
}

/**
 * 当前激活状态
 */
function getStatus() {
  const data = readActivationFile();
  return {
    activated: !!data.code,
    code: data.code,
    activatedAt: data.activatedAt,
    planId: data.planId || null,
    usedCount: data.usedCodes.length,
  };
}

/**
 * 构建爱发电签名请求体（与官方文档一致）
 * sign = md5(token + params + ts + user_id 的 kv 按固定位置拼接)
 * 官方简化：sign = md5(`${token}params{${paramsJson}}ts{${ts}}user_id{${userId}}`)
 */
function buildIfdianPayload(userId, token, paramsObj) {
  const paramsJson = JSON.stringify(paramsObj);
  const ts = Math.floor(Date.now() / 1000).toString();
  const kvString = `params${paramsJson}ts${ts}user_id${userId}`;
  const signStr = `${token}${kvString}`;
  const sign = crypto.createHash('md5').update(signStr, 'utf8').digest('hex');
  return {
    user_id: userId,
    params: paramsJson,
    ts: ts,
    sign: sign,
  };
}

/**
 * 调用爱发电 query-random-reply 校验某笔订单号是否存在有效回复
 * 若返回 ec===200 且 list 至少有一条，则认为该激活码有效
 */
async function verifyCodeOnIfdian(code, options) {
  if (!code) return { ok: false, error: '激活码不能为空' };
  const trimmed = String(code).trim();
  if (!trimmed) return { ok: false, error: '激活码不能为空' };

  const userId = (options && options.userId) || '';
  const token = (options && options.token) || '';
  if (!userId || !token) {
    return { ok: false, error: '启动器尚未配置爱发电 API 凭据（user_id / token）' };
  }

  const payload = buildIfdianPayload(userId, token, { out_trade_no: trimmed });

  console.log('[AI][activation] POST', IFDIAN_API, 'out_trade_no=', trimmed, 'user_id=', userId);

  try {
    const res = await axios.post(IFDIAN_API, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    const body = res.data;

    // 开发期调试：整段打印响应，便于作者定位 plan_id / 字段名
    try {
      console.log('[AI][activation] raw-response=', JSON.stringify(body, null, 2));
    } catch (_) {
      console.log('[AI][activation] raw-response=', body);
    }

    console.log('[AI][activation] response ec=', body && body.ec, 'em=', body && body.em);

    if (!body || typeof body !== 'object') {
      return { ok: false, error: '爱发电服务返回异常，请稍后重试' };
    }

    // 成功：能查到订单 => 说明这个订单号是真实赞助产生的
    if (body.ec === 200) {
      const list = (body.data && Array.isArray(body.data.list)) ? body.data.list : [];
      let planId = null;
      let orderPlanId = null;
      if (list.length > 0 && list[0]) {
        // 爱发电常见字段：plan_id / scheme_id / planId / schemeId
        planId = list[0].plan_id || list[0].planId || list[0].scheme_id || list[0].schemeId || list[0].sponsor_plan_id || null;
      }
      // 另外可能整笔订单在 data 下：data.order / data.plan
      const candidateOrder = (body.data && (body.data.order || body.data.Order || body.data.out_trade_no_info)) || null;
      if (candidateOrder && typeof candidateOrder === 'object') {
        orderPlanId = candidateOrder.plan_id || candidateOrder.planId || candidateOrder.scheme_id || candidateOrder.schemeId || candidateOrder.sponsor_plan_id || null;
      }

      const finalPlanId = planId || orderPlanId;
      console.log('[AI][activation] detected plan_id=', finalPlanId, 'list[0].plan_id=', list[0] && list[0].plan_id, 'list.length=', list.length);

      // 订单必须至少有一条有效回复（爱发电 random-reply 规则）
      // 如果 list 为空，说明作者侧没有为该订单登记回复 → 认为订单号无效/不存在
      if (list.length === 0 && !finalPlanId) {
        return { ok: false, error: '未查询到有效的赞助记录，请确认订单号（out_trade_no）是否正确', code: 'ORDER_NOT_FOUND' };
      }

      // 白名单校验：必须在作者配置允许的方案内才算激活成功
      const allowedPlansRaw = (options && Array.isArray(options.allowedPlanIds)) ? options.allowedPlanIds : null;
      const allowedPlans = Array.isArray(allowedPlansRaw) && allowedPlansRaw.length > 0 ? allowedPlansRaw : null;
      if (allowedPlans) {
        if (!finalPlanId) {
          // 无法识别方案，但作者明确要求只放行特定方案 → 拒绝
          return { ok: false, error: '无法识别该订单的方案，无法激活', code: 'NO_PLAN' };
        }
        const ok = allowedPlans.some((pid) => String(pid).trim() === String(finalPlanId).trim());
        if (!ok) {
          return {
            ok: false,
            error: '该订单并非来自 "更多功能!" 方案，无法激活 AI 功能',
            code: 'WRONG_PLAN',
          };
        }
      }

      return { ok: true, reply: (list[0] && list[0].content) || '', planId: finalPlanId, raw: body };
    }

    // 签名/过期等错误
    const em = (body.em || '').toString();
    const ec = body.ec;
    if (ec === 400005) return { ok: false, error: '激活签名校验失败，请联系作者', code: 'SIGN_ERR' };
    if (ec === 400002) return { ok: false, error: '请求时间戳过期，请检查系统时间后重试', code: 'TS_EXPIRED' };
    if (ec === 400004) return { ok: false, error: '作者未配置有效的 API Token', code: 'NO_TOKEN' };
    if (ec === 400001) return { ok: false, error: '请求参数不完整', code: 'PARAMS' };
    return { ok: false, error: `爱发电校验失败：${em || ec}（可能订单号有误或尚未赞助成功）`, code: 'IFDIAN_ERR' };
  } catch (err) {
    console.error('[AI][activation] ifdian request failed:', err.message);
    return { ok: false, error: '网络异常，无法连接到爱发电：' + (err.message || '') };
  }
}

/**
 * 使用激活码（订单号 out_trade_no）激活 AI 功能
 * options: { userId, token, allowCustomMode }
 */
async function activate(code, options) {
  const trimmed = String(code || '').trim();
  if (!trimmed) return { ok: false, error: '激活码不能为空' };

  // 管理员激活码：本地直接通过，不需要联网、不受每日 40 条限制
  // （硬编码在启动器内部，只有作者/调试人员知道）
  const ADMIN_CODE = 'ZenithAdminPassword52323';
  if (trimmed === ADMIN_CODE) {
    const current = readActivationFile();
    // 若已是此码激活，视为重复激活，放行但提示已激活
    if (current.code === trimmed) {
      return { ok: true, already: true, message: '已通过管理员激活码激活' };
    }
    const next = {
      code: trimmed,
      activatedAt: Date.now(),
      planId: 'admin',
      usedCodes: [...(current.usedCodes || []), trimmed],
      isAdmin: true,
    };
    writeActivationFile(next);
    console.log('[AI][activation] 管理员激活码验证通过');
    return {
      ok: true,
      already: false,
      message: '已通过管理员激活码激活',
      reply: '',
    };
  }

  const current = readActivationFile();

  // 本机已激活：允许覆盖（比如换了新码/再次输入同一个码重新激活）
  if (current.code === trimmed) {
    return { ok: true, already: true, message: '当前已使用此激活码激活' };
  }

  // 走爱发电 API 校验（普通订单号）；此前没有被本机使用过的码也允许再次激活（即：可无限次激活）

  // 1) 走爱发电 API 校验
  const verify = await verifyCodeOnIfdian(trimmed, options);
  if (!verify.ok) {
    return { ok: false, error: verify.error, code: verify.code };
  }

  // 2) 写入本地；planId 来源于爱发电返回
  const next = {
    code: trimmed,
    activatedAt: Date.now(),
    planId: verify.planId || null,
    usedCodes: [...(current.usedCodes || []), trimmed],
  };
  writeActivationFile(next);

  return {
    ok: true,
    already: false,
    message: '激活成功',
    reply: verify.reply || '',
  };
}

function deactivate() {
  const current = readActivationFile();
  writeActivationFile({ ...current, code: null, activatedAt: null, planId: null });
  return { ok: true };
}

module.exports = {
  getStatus,
  activate,
  deactivate,
  verifyCodeOnIfdian,
  buildIfdianPayload, // 暴露以便调试/测试
};
