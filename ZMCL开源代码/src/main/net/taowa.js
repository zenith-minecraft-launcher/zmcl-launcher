/* ============================================================
 * 陶瓦联机 —— 基于 EasyTier 的 P2P 虚拟局域网（参考 Terracotta）
 *
 * 核心架构（Terracotta 简化版）：
 *   1) 启动器内置 easytier-core 二进制（打包于 resources/assets/easytier）
 *   2) 房主启动后生成 16 位邀请码，房客以相同邀请码加入
 *   3) 所有玩家以 network-name=mc-<邀请码> 加入同一 EasyTier 虚拟网络
 *   4) 房主固定虚拟 IP 10.144.144.1，房客随机分配 10.144.144.x
 *   5) Minecraft 通过 127.0.0.1:25565 对局域网开放 → 其他人通过虚拟 IP 访问
 *
 * 本文件结构：
 *   - 工具函数（路径、延迟加载、crypto）
 *   - 二进制管理（下载、解压、查找）
 *   - 进程管理（启动、watchdog、停止）
 *   - 会话状态机（HOST/GUEST/IDLE）
 *   - 对外 API（startHost/startGuest/stop/status）
 * ============================================================ */

const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const zlib = require('zlib');

/* -------- 延迟加载（避免 Electron 未启动时崩） -------- */

let _app = null;
let _fse = null;
let _axios = null;

function getApp() {
  if (_app) return _app;
  try { _app = require('electron').app; } catch (_) { _app = null; }
  return _app;
}
function getFsExtra() {
  if (_fse) return _fse;
  try { _fse = require('fs-extra'); } catch (_) { _fse = fs; }
  return _fse;
}
function getAxios() {
  if (_axios) return _axios;
  try { _axios = require('axios'); } catch (_) { _axios = null; }
  return _axios;
}

/* -------- HTTPS Agent：兼容国内 HTTPS 握手不稳定的环境 -------- */

let _httpsAgent = null;
function makeHttpsAgent() {
  if (_httpsAgent) return _httpsAgent;
  try {
    const https = require('https');
    const constants = require('constants');
    /* 只使用 rejectUnauthorized + ciphers 放宽限制，
     * 避免 secureProtocol 与 minVersion 冲突（Node.js 的限制） */
    _httpsAgent = new https.Agent({
      keepAlive: true,
      rejectUnauthorized: false,
      ciphers: 'ALL',
      secureOptions:
        constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION |
        (typeof constants.SSL_OP_NO_TLSv1_3 !== 'undefined' ? constants.SSL_OP_NO_TLSv1_3 : 0)
    });
    return _httpsAgent;
  } catch (_) {
    return undefined;
  }
}

/* ============================================================
 * 第一部分：常量与配置
 * ============================================================ */

const TAOWA_NODES = [
  { name: '陶瓦节点 1 (上海)', addr: 'tcp://cn1.easytier.taowa.club:11010' },
  { name: '陶瓦节点 2 (上海)', addr: 'tcp://cn2.easytier.taowa.club:11010' },
  { name: '陶瓦节点 3 (广州)', addr: 'tcp://cn3.easytier.taowa.club:11010' },
  { name: '陶瓦节点 4 (香港)', addr: 'tcp://hk1.easytier.taowa.club:11010' }
];

const HOST_VIP = '10.144.144.1';
const NETWORK_SECRET = 'mc123456';
const LISTENERS = 'tcp://0.0.0.0:11010,udp://0.0.0.0:11010';

/* EasyTier 发布信息（用于兜底下载）
 * 参考：https://easytier.rs/en/guide/download.html
 * 文件名格式：easytier-{os}-{arch}-v{version}.zip
 * 例如：easytier-windows-x86_64-v2.6.4.zip */
const EASYTIER_RELEASE = {
  repo: 'EasyTier/EasyTier',
  version: '2.6.4',
  expectedSize: 28 * 1024 * 1024
};

/* 国内 GitHub Releases 镜像源（按顺序尝试，全部指向二进制文件，优先国内镜像）
 * 参考官方推荐的加速源：
 *   ghfast.top / gh-proxy 系列（v6/hk/cdn/edgeone）/ ghproxy.com / ghproxy.net
 *   gh-api.99988866.xyz / 还有一些 jsdelivr / mirrors.tencent 等
 * 注：jsDelivr 只支持大小 <= 50MB 的文件，对 EasyTier（~28MB）仍可用
 * URL 格式分两类：
 *   A) 镜像前缀 + 完整 GitHub URL：https://github.com/{repo}/releases/download/{tag}/{file}
 *   B) 镜像前缀 + releases/download/{tag}/{file}（gh-proxy.org 系列） */
const MIRRORS = [
  /* ==== 推荐的国内 CDN / 加速源 ==== */
  { label: 'ghfast', buildUrl: (repo, tag, file) => `https://ghfast.top/https://github.com/${repo}/releases/download/${tag}/${file}` },
  { label: 'gh-proxy(v6)', buildUrl: (repo, tag, file) => `https://v6.gh-proxy.org/https://github.com/${repo}/releases/download/${tag}/${file}` },
  { label: 'gh-proxy(hk)', buildUrl: (repo, tag, file) => `https://hk.gh-proxy.org/https://github.com/${repo}/releases/download/${tag}/${file}` },
  { label: 'gh-proxy(cdn)', buildUrl: (repo, tag, file) => `https://cdn.gh-proxy.org/https://github.com/${repo}/releases/download/${tag}/${file}` },
  { label: 'gh-proxy(edgeone)', buildUrl: (repo, tag, file) => `https://edgeone.gh-proxy.org/https://github.com/${repo}/releases/download/${tag}/${file}` },
  { label: 'ghproxy.com', buildUrl: (repo, tag, file) => `https://ghproxy.com/https://github.com/${repo}/releases/download/${tag}/${file}` },
  { label: 'ghproxy.net', buildUrl: (repo, tag, file) => `https://ghproxy.net/https://github.com/${repo}/releases/download/${tag}/${file}` },
  { label: 'Moeyy镜像', buildUrl: (repo, tag, file) => `https://gh.api.99988866.xyz/https://github.com/${repo}/releases/download/${tag}/${file}` },
  { label: 'ghps.cc', buildUrl: (repo, tag, file) => `https://ghps.cc/https://github.com/${repo}/releases/download/${tag}/${file}` },
  { label: 'ghps.cc(2)', buildUrl: (repo, tag, file) => `https://mirror.ghproxy.com/https://github.com/${repo}/releases/download/${tag}/${file}` },
  /* ==== 对 <=50MB 文件有效的 CDN ==== */
  { label: 'jsdelivr', buildUrl: (repo, tag, file) => `https://cdn.jsdelivr.net/gh/${repo}@${tag}/${file}` },
  { label: 'jsdelivr(fastly)', buildUrl: (repo, tag, file) => `https://fastly.jsdelivr.net/gh/${repo}@${tag}/${file}` },
  /* ==== GitHub 官方（位于最后，国内访问受限但最稳）==== */
  { label: '官方(github.com)', buildUrl: (repo, tag, file) => `https://github.com/${repo}/releases/download/${tag}/${file}` },
  { label: '官方(object.githubusercontent)', buildUrl: (repo, tag, file) => `https://objects.githubusercontent.com/github-production-release-asset-2e65be/${repo.replace('/', '/')}/${tag}/${file}` }
];

/* ============================================================
 * 第二部分：路径与二进制查找
 * ============================================================ */

function platformBinName() { return process.platform === 'win32' ? 'easytier-core.exe' : 'easytier-core'; }

function getUserDataHome() {
  const app = getApp();
  if (app && app.getPath) {
    try { return app.getPath('userData'); } catch (_) {}
  }
  return path.join(os.homedir(), '.zenith_launcher');
}

/** 查找打包后的二进制（开发环境/生产环境都能找到） */
function findBundledBin() {
  const binName = platformBinName();
  const app = getApp();

  /* 候选路径列表（按优先级） */
  const candidates = [];

  /* 1. 开发环境：项目根目录下的 assets/easytier/win64 */
  try {
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    candidates.push(path.join(projectRoot, 'assets', 'easytier', process.platform === 'win32' ? 'win64' : (process.platform === 'darwin' ? 'mac' : 'linux'), binName));
  } catch (_) {}

  /* 2. Electron 打包后：resources 目录下 */
  if (app) {
    try {
      const exeDir = path.dirname(app.getPath('exe'));
      candidates.push(path.join(exeDir, 'resources', 'assets', 'easytier', process.platform === 'win32' ? 'win64' : (process.platform === 'darwin' ? 'mac' : 'linux'), binName));
      candidates.push(path.join(app.getAppPath(), 'resources', 'assets', 'easytier', process.platform === 'win32' ? 'win64' : (process.platform === 'darwin' ? 'mac' : 'linux'), binName));
    } catch (_) {}
  }

  /* 3. 相对于当前文件的 assets 目录 */
  try {
    candidates.push(path.resolve(__dirname, '..', '..', '..', 'assets', 'easytier', process.platform === 'win32' ? 'win64' : (process.platform === 'darwin' ? 'mac' : 'linux'), binName));
  } catch (_) {}

  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).size > 0) { /* 只要文件存在且非空，就认为是可用的内置核心 */
        return p;
      }
    } catch (_) {}
  }
  return null;
}

/** 下载到 userData 后的二进制位置 */
function downloadedBinPath() {
  return path.join(getUserDataHome(), 'taowa', 'bin', platformBinName());
}

/** 返回当前可用的二进制路径（优先内置，其次下载，否则 null） */
function resolveBinPath() {
  const bundled = findBundledBin();
  if (bundled) return bundled;
  const ud = downloadedBinPath();
  try {
    if (ud && fs.existsSync(ud)) {
      const s = fs.statSync(ud);
      /* 已下载文件：非空即可，不做过度严格的 size 过滤
       * 避免不同版本/平台的二进制大小差异导致误判为"未安装"
       */
      if (s && s.size > 0) return ud;
    }
  } catch (_) {}
  return null;
}

/* ============================================================
 * 第三部分：邀请码
 * ============================================================ */

function genInviteCode() { return crypto.randomBytes(8).toString('hex'); }

function normalizeInviteCode(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const clean = raw.replace(/[\s\-_]/g, '').toLowerCase();
  return /^[0-9a-f]{16}$/.test(clean) ? clean : null;
}

/* ============================================================
 * 第四部分：ZIP 解压（轻量实现，无第三方依赖）
 * ============================================================ */

function extractZip(zipPath, dest) {
  const tool = getFsExtra();
  tool.ensureDirSync(dest);

  let buf;
  try {
    buf = fs.readFileSync(zipPath);
  } catch (e) {
    throw new Error(`读取 zip 文件失败：${e.message}`);
  }

  if (!buf || buf.length < 22) throw new Error('ZIP 文件过小（可能未完整下载）');

  /* 查找 central directory */
  let eocdStart = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocdStart = i; break; }
  }
  if (eocdStart === -1) throw new Error('非法 ZIP 文件（未找到 central directory）');

  const entries = buf.readUInt16LE(eocdStart + 10);
  const centralOffset = buf.readUInt32LE(eocdStart + 16);
  if (centralOffset >= buf.length) throw new Error('损坏的 ZIP 文件（central directory 偏移越界）');

  const binName = platformBinName();
  let extractedBin = null;

  let offset = centralOffset;
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > buf.length) break;
    if (buf.readUInt32LE(offset) !== 0x02014b50) break;

    const compressed = buf.readUInt32LE(offset + 20);
    const uncompressed = buf.readUInt32LE(offset + 24);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const method = buf.readUInt16LE(offset + 10);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);
    const entryName = buf.slice(offset + 46, offset + 46 + nameLen).toString('utf8');

    /* 只提取我们关心的二进制（减少文件数量） */
    if (entryName.endsWith('/') || entryName.endsWith('\\')) {
      const dirPath = path.join(dest, entryName);
      if (path.resolve(dirPath).startsWith(path.resolve(dest))) tool.ensureDirSync(dirPath);
    } else {
      const baseName = path.basename(entryName).toLowerCase();
      /* 只提取二进制和一些必要文件 */
      if (baseName === binName.toLowerCase() || baseName.startsWith('easytier') || baseName.endsWith('.dll')) {
        const lhStart = localHeaderOffset;
        if (lhStart + 30 <= buf.length && buf.readUInt32LE(lhStart) === 0x04034b50) {
          const lhNameLen = buf.readUInt16LE(lhStart + 26);
          const lhExtraLen = buf.readUInt16LE(lhStart + 28);
          const dataStart = lhStart + 30 + lhNameLen + lhExtraLen;
          const raw = buf.slice(dataStart, dataStart + compressed);
          let outData;
          try {
            outData = method === 8 ? zlib.inflateRawSync(raw) : raw;
          } catch (zErr) {
            /* 解压失败继续下一项 */
            offset += 46 + nameLen + extraLen + commentLen;
            continue;
          }
          const outPath = path.join(dest, path.basename(entryName));
          try {
            fs.writeFileSync(outPath, outData);
            if (process.platform !== 'win32' && path.basename(entryName).startsWith('easytier')) {
              try { fs.chmodSync(outPath, 0o755); } catch (_) {}
            }
            if (path.basename(entryName) === binName || baseName === binName.toLowerCase()) {
              extractedBin = outPath;
            }
          } catch (_) {}
        }
      }
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }

  return extractedBin;
}

/* ============================================================
 * 第五部分：EasyTier 在线下载（多镜像回退 + 文件锁定保护）
 * ============================================================ */

/* 生成 EasyTier Release 文件名
 * 格式：easytier-{os}-{arch}-v{version}.zip
 * 例如：easytier-windows-x86_64-v2.6.4.zip
 * 参考：https://easytier.rs/en/guide/download.html */
function getReleaseFilename() {
  const plat = process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'macos' : 'linux');
  const arch = process.arch === 'x64' ? 'x86_64' : process.arch;
  return `easytier-${plat}-${arch}-v${EASYTIER_RELEASE.version}.zip`;
}

/* 尝试多个备用文件名格式（应对不同版本可能的命名变化） */
function getReleaseFilenames() {
  const plat = process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'macos' : 'linux');
  const arch = process.arch === 'x64' ? 'x86_64' : process.arch;
  const altArch = process.arch === 'x64' ? 'amd64' : process.arch;
  const v = EASYTIER_RELEASE.version;
  const tag = `v${v}`;
  return [
    /* 标准格式：easytier-windows-x86_64-v2.6.4.zip（官方文档） */
    `easytier-${plat}-${arch}-${tag}.zip`,
    /* 无 v 前缀：easytier-windows-x86_64-2.6.4.zip */
    `easytier-${plat}-${arch}-${v}.zip`,
    /* 连字符改为下划线 */
    `easytier_${plat}_${arch}_${tag}.zip`,
    `easytier_${plat}_${arch}_${v}.zip`,
    /* 使用 amd64 替代 x86_64 */
    `easytier-${plat}-${altArch}-${tag}.zip`,
    `easytier-${plat}-${altArch}-${v}.zip`,
    /* 大写 EasyTier */
    `EasyTier_${plat}_${arch}_${v}.zip`,
    `EasyTier-${plat}-${arch}-${v}.zip`,
    /* 旧版本可能使用的格式：tag 放在前面 */
    `${tag}_${plat}_${arch}.zip`,
    `easytier-${plat}-${arch}.zip`
  ];
}

/** 测试写入权限（提前检查，避免下载到一半才失败） */
function testWritePermission(targetDir) {
  const tool = getFsExtra();
  tool.ensureDirSync(targetDir);
  const testFile = path.join(targetDir, `.write_test_${Date.now()}.tmp`);
  try {
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: `无法写入目录 "${targetDir}"：${e.message || '权限不足'}\n请尝试以下方案：\n1. 以管理员身份重新启动启动器\n2. 关闭杀毒软件后重试\n3. 手动下载 EasyTier 核心到 resources/assets/easytier/win64/`
    };
  }
}

/** 清理指定路径（忽略错误） */
function safeUnlink(p) {
  try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
}

async function downloadEasyTier(onProgress) {
  const ax = getAxios();
  if (!ax) throw new Error('缺少 axios 依赖，请检查 node_modules');

  const binDir = path.dirname(downloadedBinPath());
  const binPath = downloadedBinPath();

  if (resolveBinPath()) {
    if (onProgress) onProgress({ phase: 'ready', percent: 100, message: '已检测到本地 EasyTier' });
    return binPath;
  }

  const writeCheck = testWritePermission(binDir);
  if (!writeCheck.ok) throw new Error(writeCheck.message);

  const repo = EASYTIER_RELEASE.repo;
  const tag = `v${EASYTIER_RELEASE.version}`;
  const filenames = getReleaseFilenames();
  const agent = makeHttpsAgent();
  const minSize = 5 * 1024 * 1024;   /* 5MB，用来过滤无效小响应 */
  const maxSize = 120 * 1024 * 1024; /* 120MB 上界，过滤异常响应 */

  /* ========== 阶段 1：并发 HEAD 探测，快速定位可用的 (镜像, 文件名) 组合 ==========
   * 7 镜像 × 10 文件名 = 70 个候选。如果串行等待每个 60s 超时，极端情况下要 70 分钟。
   * 使用并发 + 短超时的 HEAD 探测，能在几秒内找到可用源。
   */
  if (onProgress) onProgress({
    phase: 'prepare', percent: 1,
    message: `正在检查可用的下载源（${MIRRORS.length} 个镜像 × ${filenames.length} 个文件名）…`
  });

  const candidates = [];
  for (let i = 0; i < MIRRORS.length; i++) {
    const m = MIRRORS[i];
    for (let j = 0; j < filenames.length; j++) {
      candidates.push({
        mirror: m,
        filename: filenames[j],
        url: m.buildUrl(repo, tag, filenames[j]),
        /* 镜像越靠前（官方/国内）优先级越高，文件名越靠前（标准格式）优先级越高 */
        priority: i * 1000 + j
      });
    }
  }

  /* 并发 8 个 HEAD；每个 3 秒超时；找到 3 个有效源即停止探测（快进下载） */
  const probeConcurrency = 8;
  const probeTimeoutMs = 3000;
  const probeResults = [];
  let cursor = 0;
  let anyProbeOk = false;
  let stopEarly = false;
  const needProbeOk = 3;

  async function probeOne(cand) {
    try {
      if (stopEarly) return;
      const head = await ax.head(cand.url, {
        timeout: probeTimeoutMs,
        httpsAgent: agent,
        headers: { 'User-Agent': 'Zenith-Launcher/1.0' },
        maxRedirects: 5,
        validateStatus: () => true /* 我们自己判断 */
      });
      const status = head && head.status ? head.status : 0;
      if (stopEarly) return;
      if (status >= 200 && status < 300) {
        const cl = parseInt(String(head.headers && head.headers['content-length'] || 0), 10);
        if (cl >= minSize && cl <= maxSize) {
          probeResults.push({ ...cand, size: cl });
          anyProbeOk = true;
          if (probeResults.length >= needProbeOk) stopEarly = true;
          return;
        }
        /* 没有 Content-Length 但状态是 2xx，仍然作为候选 */
        probeResults.push({ ...cand, size: 0 });
        anyProbeOk = true;
        return;
      }
      /* 30x：交给下载阶段处理；404/5xx：直接放弃 */
    } catch (_) {}
  }

  /* 并发 worker：一个 worker 不断从 cursor 取下一个任务，直到所有任务完成或找到足够多的有效源 */
  async function worker() {
    while (!stopEarly && cursor < candidates.length) {
      const idx = cursor++;
      await probeOne(candidates[idx]);
    }
  }

  const workers = [];
  for (let w = 0; w < probeConcurrency; w++) workers.push(worker());
  await Promise.all(workers);

  /* 如果没有任何源返回 2xx，降级为尝试所有组合（容错机制） */
  let ordered = probeResults.slice();
  if (ordered.length === 0) {
    ordered = candidates.map((c) => ({ ...c, size: 0 }));
  }

  /* 排序：有 Content-Length 且大小合理的优先；再按镜像/文件名的顺序 */
  ordered.sort((a, b) => {
    const aScore = a.size > 0 ? 0 : 1;
    const bScore = b.size > 0 ? 0 : 1;
    if (aScore !== bScore) return aScore - bScore;
    return (a.priority || 0) - (b.priority || 0);
  });

  /* ========== 阶段 2：按优先级尝试下载 ========== */
  let lastErr = null;
  const startTime = Date.now();

  for (const cand of ordered) {
    const url = cand.url;
    const total = cand.size > 0 ? cand.size : EASYTIER_RELEASE.expectedSize;
    const totalMB = (total / 1024 / 1024).toFixed(1);
    const tempZip = path.join(
      binDir,
      `.dl_${Date.now()}_${Math.floor(Math.random() * 9999)}.zip`
    );

    if (onProgress) onProgress({
      phase: 'download', percent: 0,
      message: `[${cand.mirror.label}] 正在下载 EasyTier（约 ${totalMB} MB）…`
    });

    let writer = null;
    try {
      writer = fs.createWriteStream(tempZip);
      /* 下载超时按文件大小动态估算：最低 30s，每 1MB 给 2s，上限 600s */
      const dynamicTimeout = Math.min(600000, Math.max(30000, Math.ceil(total / (1024 * 1024)) * 2000));

      const res = await ax.get(url, {
        responseType: 'stream',
        timeout: dynamicTimeout,
        httpsAgent: agent,
        headers: { 'User-Agent': 'Zenith-Launcher/1.0' },
        maxRedirects: 10
      });

      /* 如果响应头给了 Content-Length，优先使用真实值，便于更准确的进度 */
      const realCL = parseInt(String(res.headers && res.headers['content-length'] || 0), 10);
      const actualTotal = realCL > 0 ? realCL : total;

      let downloaded = 0;
      const dlStart = Date.now();
      let lastProgressAt = 0;

      res.data.on('data', (chunk) => {
        downloaded += chunk.length;
        const now = Date.now();
        /* 限制 UI 进度刷新到 ~8 次 / 秒，避免卡顿 */
        if (onProgress && now - lastProgressAt > 120) {
          lastProgressAt = now;
          onProgress({
            phase: 'download',
            percent: Math.min(95, Math.round((downloaded / actualTotal) * 100)),
            message: `[${cand.mirror.label}] ${(downloaded / 1024 / 1024).toFixed(1)} / ${(actualTotal / 1024 / 1024).toFixed(1)} MB`
          });
        }
      });

      await new Promise((resolve, reject) => {
        res.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
        res.data.on('error', reject);
      });

      /* 防御性校验：如果下载文件远小于预期，判定为无效响应（例如镜像返回错误页 HTML）*/
      const finalLen = fs.existsSync(tempZip) ? fs.statSync(tempZip).size : 0;
      if (finalLen < minSize) {
        throw new Error(`下载文件过小（${(finalLen / 1024).toFixed(1)} KB），可能是错误页`);
      }

      if (onProgress) onProgress({
        phase: 'extract', percent: 98,
        message: `[${cand.mirror.label}] 正在解压…`
      });
      extractZip(tempZip, binDir);
      safeUnlink(tempZip);

      if (process.platform !== 'win32') {
        try { fs.chmodSync(binPath, 0o755); } catch (_) {}
      }

      const finalBin = resolveBinPath();
      if (!finalBin) {
        throw new Error('解压后未找到 easytier-core 可执行文件');
      }

      if (onProgress) onProgress({
        phase: 'ready', percent: 100,
        message: `EasyTier 安装完成（来自 ${cand.mirror.label}，耗时 ${((Date.now() - dlStart) / 1000).toFixed(1)} 秒）`
      });
      return finalBin;
    } catch (err) {
      lastErr = err;
      try { if (writer) writer.destroy(); } catch (_) {}
      safeUnlink(tempZip);
      /* 继续尝试下一个候选 */
      continue;
    }
  }

  /* 全部失败 */
  const msg = (lastErr && lastErr.message) ? String(lastErr.message) : '未知错误';
  const fallbackUrls = filenames
    .slice(0, 3)
    .map((f) => `    - https://github.com/${repo}/releases/download/${tag}/${f}`)
    .join('\n');
  throw new Error(
    `无法从任何镜像下载 EasyTier（${msg}）。\n\n` +
    `尝试组合数：${ordered.length}（探测成功 ${probeResults.length}，总耗时 ${((Date.now() - startTime) / 1000).toFixed(1)}s）\n` +
    `请手动下载 EasyTier 核心文件（v${EASYTIER_RELEASE.version}）：\n` +
    `${fallbackUrls}\n` +
    `  解压后将 ${platformBinName()} 放到以下任一目录：\n` +
    `    1. ${path.join(getUserDataHome(), 'taowa', 'bin', platformBinName())}\n` +
    `    2. <启动器安装目录>/resources/assets/easytier/win64/${platformBinName()}`
  );
}

/** 安全递归删除目录（避免在 Electron 中使用 rimraf 时路径差异）*/
function safeRmtree(targetPath) {
  if (!targetPath) return false;
  try {
    if (!fs.existsSync(targetPath)) return false;
    const stat = fs.lstatSync(targetPath);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(targetPath);
      for (const e of entries) {
        safeRmtree(path.join(targetPath, e));
      }
      fs.rmdirSync(targetPath);
    } else {
      fs.unlinkSync(targetPath);
    }
    return true;
  } catch (err) {
    /* 文件被占用 / 权限不足等；由上层决定是否重试 */
    return false;
  }
}

/** 卸载（清理）陶瓦联机核心
 *  步骤：1) 停止正在运行的子进程  2) 删除 <userData>/taowa/bin 目录
 *  返回：{ ok, binPath, removed, error, hasBundled }
 *    - hasBundled: true 表示启动器里仍内置了一份（下次进入陶瓦联机还能用）
 */
function uninstallEasyTier() {
  /* 先停止会话（释放子进程锁）*/
  try { stop(); } catch (_) {}

  const binDir = path.dirname(downloadedBinPath());
  const binPath = downloadedBinPath();
  const parentDir = path.dirname(binDir); /* <userData>/taowa */

  const result = { ok: false, binPath, removed: null, error: null, hasBundled: false };

  /* 标记是否仍有内置二进制（方便 UI 提示）*/
  try { result.hasBundled = !!findBundledBin(); } catch (_) {}

  /* 如果二进制目录不存在，直接视为成功（无残留）*/
  if (!fs.existsSync(binDir)) {
    result.ok = true;
    result.removed = null;
    return result;
  }

  /* Windows 下子进程可能还在释放句柄，给个短暂延迟（同步阻塞即可，不需要异步）*/
  let attempts = 0;
  while (attempts < 3) {
    if (safeRmtree(binDir)) {
      result.ok = true;
      result.removed = binDir;
      return result;
    }
    attempts++;
    /* ~200ms 小等待，但不使用 setTimeout（它异步），换成同步阻塞 150ms */
    const end = Date.now() + 150;
    while (Date.now() < end) { /* noop */ }
  }

  /* 兜底：仅删除 easytier-core.exe（其他 dll 残留也可忽略）*/
  try {
    if (fs.existsSync(binPath)) {
      fs.unlinkSync(binPath);
      result.ok = true;
      result.removed = binPath;
    }
  } catch (err) {
    result.error = err && err.message ? String(err.message) : String(err);
  }

  /* 清理空的 taowa 目录（整洁）*/
  try {
    if (fs.existsSync(parentDir) && fs.readdirSync(parentDir).length === 0) {
      fs.rmdirSync(parentDir);
    }
  } catch (_) {}

  return result;
}

/* ============================================================
 * 第六部分：EasyTier 进程管理（启动、watchdog、停止）
 * ============================================================ */

/** 生成房客的随机虚拟 IP */
function randomGuestVip() {
  const last = 2 + Math.floor(Math.random() * 253);
  return `10.144.144.${last}`;
}

/**
 * 启动 EasyTier 子进程
 * 返回 Promise<{ pid, child, vip, peer }>
 *
 * 启动成功的判断依据（Terracotta 同款简化版）：
 * - 子进程存活超过 5 秒
 * - 输出中出现 session created / peer discovered / tun opened
 * - 或超过 20 行日志后仍在运行
 */
function startEasytierProcess({ bin, networkName, secret, vip, onLog }) {
  return new Promise((resolve, reject) => {
    const peer = TAOWA_NODES[Math.floor(Math.random() * TAOWA_NODES.length)];

    /* EasyTier v2.x 参数说明（来自 `easytier-core --help`）：
     *   --peers [<PEERS>...]         复数，非旧版 --peer
     *   --listeners [<LISTENERS>...] 复数，支持多个监听地址
     *   --network-name / --network-secret / --ipv4 均保留
     *   --instance-name              可选，便于调试
     * Windows 下创建 TUN 虚拟网卡需要**管理员权限**，
     * 所以如果启动器不是以管理员运行，首次启动会失败；
     * 此时在 UI 上提示 "请以管理员身份重新启动启动器"。
     */
    const args = [
      '--network-name', networkName,
      '--network-secret', secret,
      '--ipv4', vip,
      '--peers', peer.addr,
      '--listeners', LISTENERS,
      '--instance-name', `zenith-${process.pid}`
    ];

    if (onLog) onLog(`> ${bin} ${args.join(' ')}`);

    const child = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, RUST_LOG: 'info' }
    });

    let settled = false;
    let lineCount = 0;
    let outputBuffer = ''; /* 保留最近 20 行，用于错误诊断 */
    const recentLines = [];

    function safeReject(err) {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch (_) {}
      reject(err);
    }
    function safeResolve() {
      if (settled) return;
      settled = true;
      resolve({ pid: child.pid, child, vip, peer });
    }

    function processLine(line) {
      if (!line) return;
      if (onLog) onLog(line);
      lineCount++;
      recentLines.push(line);
      if (recentLines.length > 20) recentLines.shift();

      /* 成功关键词（EasyTier v1.x / v2.x 核心的典型成功输出）
       * v1.x: session created / peer discovered / tun opened / bridge started
       * v2.x: "peer with id" / "Connected to peer" / "EasyTier started" / "instance started" / "listener" 成功
       * 兜底：存活超过一定行数 / 时间，视为成功 */
      if (/session\s*created|peer\s*discovered|instance\s*started|tun\s+opened|registered|peer\s+connected|bridge\s+started|peer\s+with\s+id|Connected\s+to\s+peer|EasyTier\s+started|listening\s+on|listener/i.test(line)) {
        safeResolve();
      }
      /* 兜底：存活时间 + 行数足够视为成功 */
      if (lineCount > 50) safeResolve();
    }

    function collectOutput(data) {
      outputBuffer += data.toString('utf8');
      let idx;
      while ((idx = outputBuffer.indexOf('\n')) >= 0) {
        processLine(outputBuffer.substring(0, idx).trim());
        outputBuffer = outputBuffer.substring(idx + 1);
      }
    }

    child.stdout.on('data', collectOutput);
    child.stderr.on('data', collectOutput);

    child.on('error', (err) => {
      safeReject(new Error(
        `easytier-core 启动失败：${err && err.message || err}\n` +
        `可能的原因：\n` +
        `  1. 文件被杀毒软件隔离\n` +
        `  2. 需要管理员权限（创建虚拟网卡）\n` +
        `  3. 二进制文件损坏\n\n` +
        `最近输出：\n${recentLines.join('\n') || '(无)'}`
      ));
    });

    child.on('exit', (code, signal) => {
      if (!settled) {
        safeReject(new Error(
          `easytier-core 启动后立即退出（退出码 ${code}，信号 ${signal}）\n` +
          `请以管理员身份重新启动启动器。\n\n` +
          `最近输出：\n${recentLines.join('\n') || '(无)'}`
        ));
      }
    });

    /* 30 秒兜底超时 */
    setTimeout(() => {
      if (!settled) safeResolve();
    }, 30000);
  });
}

/* ============================================================
 * 第七部分：会话状态机（IDLE / HOST / GUEST）
 * ============================================================ */

let _session = null; /* { role: 'host'|'guest', inviteCode, vip, pid, child, peer, startedAt } */

function getStatus() {
  if (!_session) return { state: 'idle', role: null, inviteCode: null, vip: null, pid: null };
  return {
    state: 'running',
    role: _session.role,
    inviteCode: _session.inviteCode,
    vip: _session.vip,
    pid: _session.pid,
    hostVip: _session.role === 'host' ? _session.vip : HOST_VIP,
    startedAt: _session.startedAt,
    peer: _session.peer
  };
}

/* ============================================================
 * 第八部分：对外 API（保持与主进程 IPC 兼容）
 * ============================================================ */

/** 房主：创建房间，返回邀请码 */
async function startHost(onProgress, onEvent) {
  if (_session) {
    throw new Error('已有活跃的陶瓦联机会话，请先停止当前连接');
  }

  if (onProgress) onProgress({ phase: 'preparing', percent: 0, message: '正在准备 EasyTier 核心…' });

  /* 1. 获取/下载二进制 */
  let bin = resolveBinPath();
  if (!bin) {
    bin = await downloadEasyTier(onProgress);
  }
  if (onProgress) onProgress({ phase: 'ready', percent: 100, message: 'EasyTier 已就绪' });

  /* 2. 生成邀请码 */
  const inviteCode = genInviteCode();
  const networkName = `mc-${inviteCode}`;
  if (onEvent) onEvent({ type: 'log', line: `房主模式：network-name=${networkName}, vip=${HOST_VIP}` });

  /* 3. 启动 EasyTier */
  const info = await startEasytierProcess({
    bin,
    networkName,
    secret: NETWORK_SECRET,
    vip: HOST_VIP,
    onLog: (line) => onEvent && onEvent({ type: 'log', line })
  });

  /* 4. 保存会话 */
  _session = {
    role: 'host',
    inviteCode,
    vip: HOST_VIP,
    pid: info.pid,
    child: info.child,
    peer: info.peer,
    startedAt: Date.now()
  };

  /* 5. 监听进程意外退出 */
  info.child.once('exit', () => {
    if (_session && _session.pid === info.pid) {
      _session = null;
    }
  });

  return {
    ok: true,
    inviteCode,
    vip: HOST_VIP,
    hostVip: HOST_VIP,
    peer: info.peer,
    pid: info.pid
  };
}

/** 房客：输入邀请码加入 */
async function startGuest(inviteCodeRaw, onProgress, onEvent) {
  if (_session) {
    throw new Error('已有活跃的陶瓦联机会话，请先停止当前连接');
  }

  const code = normalizeInviteCode(inviteCodeRaw);
  if (!code) throw new Error('邀请码格式不正确（应为 16 位十六进制字符，如：abcd-1234-ef56-7890）');

  if (onProgress) onProgress({ phase: 'preparing', percent: 0, message: '正在准备 EasyTier 核心…' });

  /* 1. 获取/下载二进制 */
  let bin = resolveBinPath();
  if (!bin) {
    bin = await downloadEasyTier(onProgress);
  }
  if (onProgress) onProgress({ phase: 'ready', percent: 100, message: 'EasyTier 已就绪' });

  /* 2. 启动 */
  const networkName = `mc-${code}`;
  const vip = randomGuestVip();
  if (onEvent) onEvent({ type: 'log', line: `房客模式：network-name=${networkName}, vip=${vip}` });

  const info = await startEasytierProcess({
    bin,
    networkName,
    secret: NETWORK_SECRET,
    vip,
    onLog: (line) => onEvent && onEvent({ type: 'log', line })
  });

  /* 3. 保存会话 */
  _session = {
    role: 'guest',
    inviteCode: code,
    vip,
    pid: info.pid,
    child: info.child,
    peer: info.peer,
    startedAt: Date.now()
  };

  info.child.once('exit', () => {
    if (_session && _session.pid === info.pid) _session = null;
  });

  return {
    ok: true,
    inviteCode: code,
    vip,
    hostVip: HOST_VIP,
    peer: info.peer,
    pid: info.pid
  };
}

/** 停止当前会话 */
function stop() {
  if (!_session) return { ok: true, disconnected: false };

  const { child, pid } = _session;
  _session = null;

  try {
    if (child && typeof child.kill === 'function') {
      child.kill('SIGTERM');
    }
  } catch (_) {}

  /* Windows 兜底：taskkill 强制清理 */
  if (pid && process.platform === 'win32') {
    try {
      spawn('taskkill', ['/F', '/T', '/PID', String(pid)], {
        stdio: 'ignore',
        windowsHide: true
      });
    } catch (_) {}
  }

  return { ok: true, disconnected: true };
}

/* 进程退出时自动清理 */
if (process && process.on) {
  process.on('exit', () => { try { stop(); } catch (_) {} });
}

/* ============================================================
 * 模块导出（保持与原接口兼容，主进程无需修改）
 * ============================================================ */

module.exports = {
  TAOWA_NODES,
  HOST_VIP,
  STATE: { IDLE: 'idle', RUNNING: 'running' },
  genInviteCode,
  normalizeInviteCode,
  resolveBinPath,
  downloadEasyTier,
  uninstallEasyTier,
  startHost,
  startGuest,
  stop,
  getStatus
};
