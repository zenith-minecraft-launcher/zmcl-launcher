/* ============================================================
 * 工具箱（Toolbox）— 启动器常用系统/文件/游戏辅助工具
 *
 * 分类：
 *   1) Minecraft 实用工具  —— 打开目录 / 备份 / 清理 / 诊断（由主进程执行）
 *   2) 其他工具            —— 外部链接集合（由前端调用系统浏览器打开）
 *
 * 对外 API：
 *   listTools()              -> 返回所有工具定义（前端据此渲染）
 *   exec(toolKey, payload)   -> 执行指定工具，返回 { ok, message, data? }
 *
 * 本模块只做轻量操作（不调用第三方依赖），避免启动器变臃肿。
 * ============================================================ */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');

/* 懒加载上下文：由主进程在调用 init 时注入，便于获取 .minecraft / userData 等路径 */
let _ctx = {
  minecraftDir: null,      // 游戏根目录（.minecraft 或 自定义目录）
  launcherDataDir: null,   // 启动器的数据目录（Electron userData / Zenith 数据）
  javaAutoSelect: null,    // (可选) main/java 的 autoSelect 函数
  javaDetect: null         // (可选) main/java 的 detect 函数
};

function init(ctx) {
  if (ctx && typeof ctx === 'object') {
    _ctx = Object.assign({}, _ctx, ctx);
  }
}

/* ---------------- 工具函数 ---------------- */

function resolveMinecraftDir() {
  if (_ctx.minecraftDir && fs.existsSync(_ctx.minecraftDir)) return _ctx.minecraftDir;
  // 默认位置
  const candidates = [
    _ctx.minecraftDir,
    path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft'),
    path.join(os.homedir(), '.minecraft')
  ].filter(Boolean);
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch (_) {}
  }
  // 若都不存在，退回第一个（可能不存在，调用方需自行判断）
  return candidates[0] || path.join(os.homedir(), '.minecraft');
}

function safeExists(p) {
  try { return fs.existsSync(p); } catch (_) { return false; }
}

function formatBytes(bytes) {
  if (typeof bytes !== 'number' || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(2)} ${units[i]}`;
}

/** 计算目录大小（递归），出错时忽略 */
function dirSize(p) {
  let total = 0;
  let items = 0;
  if (!safeExists(p)) return { size: 0, items: 0 };
  try {
    const stat = fs.statSync(p);
    if (stat.isFile()) return { size: stat.size, items: 1 };
    if (!stat.isDirectory()) return { size: 0, items: 0 };
    const stack = [p];
    while (stack.length) {
      const cur = stack.pop();
      try {
        const entries = fs.readdirSync(cur, { withFileTypes: true });
        for (const e of entries) {
          const full = path.join(cur, e.name);
          try {
            const s = fs.statSync(full);
            if (s.isDirectory()) {
              stack.push(full);
            } else if (s.isFile()) {
              total += s.size;
              items += 1;
            }
          } catch (_) {}
        }
      } catch (_) {}
    }
  } catch (_) {}
  return { size: total, items };
}

/** 打开目录/文件（跨平台） */
function openInShell(targetPath) {
  return new Promise((resolve) => {
    try {
      if (!safeExists(targetPath)) {
        resolve({ ok: false, error: `路径不存在：${targetPath}` });
        return;
      }
      let cmd = '';
      let args = [];
      if (process.platform === 'win32') {
        cmd = 'explorer.exe';
        args = [targetPath];
      } else if (process.platform === 'darwin') {
        cmd = 'open';
        args = [targetPath];
      } else {
        cmd = 'xdg-open';
        args = [targetPath];
      }
      const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
      child.unref();
      // spawn 通常立即返回；这里给 200ms 用于判断启动错误
      setTimeout(() => resolve({ ok: true }), 200);
    } catch (err) {
      resolve({ ok: false, error: String(err && err.message || err) });
    }
  });
}

/** 安全递归删除（白名单内的目录），避免误删 */
function safeRemove(targetPath, allowedParents) {
  if (!targetPath || typeof targetPath !== 'string') return { ok: false, error: '非法路径' };
  if (!safeExists(targetPath)) return { ok: true, removed: 0, freed: 0 };
  // 白名单校验：确保 targetPath 在允许的父目录内
  const normalized = path.resolve(targetPath);
  let inside = false;
  for (const parent of (allowedParents || [])) {
    const p = path.resolve(parent);
    if (normalized === p || normalized.startsWith(p + path.sep)) { inside = true; break; }
  }
  if (!inside) return { ok: false, error: `拒绝操作：路径不在允许的范围内（${targetPath}）` };

  let removedFiles = 0;
  let freedBytes = 0;
  const stack = [normalized];
  // 先计算大小 & 收集文件/子目录，再删除，避免路径被清空后判断失败
  const toDeleteFiles = [];
  const toDeleteDirs = [];
  while (stack.length) {
    const cur = stack.pop();
    try {
      const entries = fs.readdirSync(cur, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(cur, e.name);
        try {
          const s = fs.statSync(full);
          if (s.isDirectory()) {
            stack.push(full);
            toDeleteDirs.push(full);
          } else if (s.isFile()) {
            freedBytes += s.size;
            removedFiles += 1;
            toDeleteFiles.push(full);
          }
        } catch (_) {}
      }
    } catch (_) {}
  }
  // 删除文件
  for (const f of toDeleteFiles) { try { fs.unlinkSync(f); } catch (_) {} }
  // 删除目录（子目录先删）
  toDeleteDirs.sort((a, b) => b.length - a.length);
  for (const d of toDeleteDirs) { try { fs.rmdirSync(d); } catch (_) {} }
  // 最后删除根（如果本身是目录）
  try {
    const s = fs.statSync(normalized);
    if (s.isDirectory()) fs.rmdirSync(normalized);
    else fs.unlinkSync(normalized);
  } catch (_) {}
  return { ok: true, removed: removedFiles, freed: freedBytes };
}

/* ---------------- 工具注册表 ---------------- */
/**
 * 每个工具定义：
 *   key          唯一标识
 *   category     分类（system/backup/cleanup/diagnose）
 *   title / description / icon
 *   action(ctx, payload) => Promise<{ ok, message, data? }>
 *   dangerous    是否危险操作（前端会加二次确认）
 */
function buildTools() {
  const mcDir = resolveMinecraftDir();
  const launcherDir = _ctx.launcherDataDir || path.join(os.homedir(), 'zenith-logs');

  const sub = (rel) => path.join(mcDir, ...rel.split('/'));

  const tools = [
    /* ========== Minecraft 实用工具 ========== */
    // 系统 / 路径
    {
      key: 'open-minecraft-dir',
      category: 'minecraft',
      type: 'action',
      title: '打开 .minecraft 目录',
      description: '在文件管理器中打开当前 Minecraft 根目录，便于手动管理 mods/resourcepacks/saves。',
      icon: 'folder',
      action: async () => openInShell(mcDir)
    },
    {
      key: 'open-saves',
      category: 'minecraft',
      type: 'action',
      title: '打开 存档 目录',
      description: '打开 .minecraft/saves，用于手动备份/恢复单人世界。',
      icon: 'folder',
      action: async () => openInShell(sub('saves'))
    },
    {
      key: 'open-mods',
      category: 'minecraft',
      type: 'action',
      title: '打开 mods 目录',
      description: '打开 .minecraft/mods，便于手动添加 / 删除 Forge/Fabric 模组。',
      icon: 'folder',
      action: async () => openInShell(sub('mods'))
    },
    {
      key: 'open-resourcepacks',
      category: 'minecraft',
      type: 'action',
      title: '打开 资源包 目录',
      description: '打开 .minecraft/resourcepacks。',
      icon: 'folder',
      action: async () => openInShell(sub('resourcepacks'))
    },
    {
      key: 'open-shaderpacks',
      category: 'minecraft',
      type: 'action',
      title: '打开 光影 目录',
      description: '打开 .minecraft/shaderpacks（Optifine / Iris 光影配置目录）。',
      icon: 'folder',
      action: async () => openInShell(sub('shaderpacks'))
    },
    {
      key: 'open-launcher-logs',
      category: 'minecraft',
      type: 'action',
      title: '打开 启动器日志 目录',
      description: '查看启动器生成的运行日志，用于排查异常。',
      icon: 'folder',
      action: async () => openInShell(launcherDir)
    },

    // 资源 / 备份
    {
      key: 'backup-saves',
      category: 'minecraft',
      type: 'action',
      title: '备份：所有单人存档',
      description: '统计当前 saves 目录中的存档数量与总大小，并在文件管理器中打开，便于复制备份。',
      icon: 'save',
      action: async () => {
        const p = sub('saves');
        if (!safeExists(p)) return { ok: false, message: '尚未发现 saves 目录（启动过一次 Minecraft 后才会生成）' };
        const info = dirSize(p);
        await openInShell(p);
        return { ok: true, message: `共有 ${info.items} 个文件，总大小 ${formatBytes(info.size)}。已在文件管理器中打开。`, data: info };
      }
    },
    {
      key: 'backup-mods',
      category: 'minecraft',
      type: 'action',
      title: '备份：当前模组列表',
      description: '统计当前 mods 目录的文件数量与大小，并在文件管理器中打开，便于整体复制。',
      icon: 'save',
      action: async () => {
        const p = sub('mods');
        if (!safeExists(p)) return { ok: false, message: '尚未发现 mods 目录' };
        const info = dirSize(p);
        await openInShell(p);
        return { ok: true, message: `共有 ${info.items} 个文件，总大小 ${formatBytes(info.size)}。已在文件管理器中打开。`, data: info };
      }
    },

    // 清理 / 缓存
    {
      key: 'clean-launcher-logs',
      category: 'minecraft',
      type: 'action',
      title: '清理：启动器旧日志',
      description: '清空 启动器日志 目录内的所有 .log 文件。不会影响任何 Minecraft 自身文件。',
      icon: 'trash',
      action: async () => {
        const p = launcherDir;
        const result = safeRemove(p, [launcherDir, os.tmpdir()]);
        if (!result.ok) return { ok: false, message: result.error || '清理失败' };
        try { fs.mkdirSync(p, { recursive: true }); } catch (_) {}
        return { ok: true, message: `已清理 ${result.removed} 个文件，释放 ${formatBytes(result.freed)}` };
      }
    },
    {
      key: 'clean-temp-launcher',
      category: 'minecraft',
      type: 'action',
      title: '清理：启动器临时文件',
      description: '清除启动器在系统临时目录中遗留的缓存文件（如下载中的临时包）。',
      icon: 'trash',
      action: async () => {
        const tempRoot = os.tmpdir();
        const patterns = ['zenith', 'minecraft-launcher', 'electron'];
        let removed = 0, freed = 0, errs = 0;
        try {
          const entries = fs.readdirSync(tempRoot, { withFileTypes: true });
          for (const e of entries) {
            const name = (e.name || '').toLowerCase();
            const match = patterns.some(p => name.includes(p));
            if (!match) continue;
            const full = path.join(tempRoot, e.name);
            const r = safeRemove(full, [tempRoot]);
            if (r.ok) { removed += r.removed || 0; freed += r.freed || 0; }
            else errs += 1;
          }
        } catch (_) {}
        return { ok: true, message: `已清理 ${removed} 个临时文件，释放 ${formatBytes(freed)}${errs ? `（${errs} 项因权限跳过）` : ''}` };
      }
    },
    {
      key: 'clean-minecraft-logs',
      category: 'minecraft',
      type: 'action',
      title: '清理：Minecraft 日志',
      description: '清空 .minecraft/logs 目录下的全部日志与崩溃报告（不含存档/模组）。',
      icon: 'trash',
      dangerous: true,
      action: async () => {
        const p = sub('logs');
        if (!safeExists(p)) return { ok: false, message: 'logs 目录不存在，无需清理' };
        const result = safeRemove(p, [mcDir]);
        try { fs.mkdirSync(p, { recursive: true }); } catch (_) {}
        return { ok: true, message: `已清理 ${result.removed} 个日志文件，释放 ${formatBytes(result.freed)}` };
      }
    },

    // 诊断 / 网络
    {
      key: 'diagnose-system',
      category: 'minecraft',
      type: 'action',
      title: '诊断：系统信息',
      description: '汇总当前系统的 OS / CPU / 内存 / 用户目录，便于反馈问题时复制。',
      icon: 'info',
      action: async () => {
        const info = {
          platform: os.platform(),
          arch: os.arch(),
          release: os.release(),
          hostname: os.hostname(),
          homedir: os.homedir(),
          totalMem: formatBytes(os.totalmem()),
          freeMem: formatBytes(os.freemem()),
          cpuCores: (os.cpus() || []).length,
          cpuModel: (os.cpus() && os.cpus()[0] && os.cpus()[0].model) || '未知',
          minecraftDir: mcDir,
          launcherDir
        };
        return {
          ok: true,
          message: `系统：${info.platform} ${info.arch} · CPU ${info.cpuCores} 核 · 内存 ${info.freeMem} / ${info.totalMem}`,
          data: info
        };
      }
    },
    {
      key: 'diagnose-network',
      category: 'minecraft',
      type: 'action',
      title: '诊断：网络连通性',
      description: '快速测试启动器常用域名（Mojang / Microsoft / BMCLAPI / Modrinth）是否可达。',
      icon: 'globe',
      action: async () => {
        const targets = [
          { name: 'Mojang API', host: 'api.mojang.com' },
          { name: 'Microsoft Login', host: 'login.microsoftonline.com' },
          { name: 'BMCLAPI（国内镜像）', host: 'bmclapi2.bangbang93.com' },
          { name: 'Modrinth', host: 'api.modrinth.com' },
          { name: 'CurseForge', host: 'api.curseforge.com' }
        ];
        const net = require('net');
        const results = await Promise.all(targets.map(t => new Promise((resolve) => {
          const start = Date.now();
          const sock = net.createConnection(443, t.host, () => {
            const ping = Date.now() - start;
            sock.destroy();
            resolve({ name: t.name, host: t.host, reachable: true, ping });
          });
          sock.setTimeout(4000, () => {
            sock.destroy();
            resolve({ name: t.name, host: t.host, reachable: false, error: 'timeout' });
          });
          sock.on('error', (err) => resolve({ name: t.name, host: t.host, reachable: false, error: err && err.message || 'error' }));
        })));
        const ok = results.filter(r => r.reachable).length;
        return {
          ok: ok > 0,
          message: `已测试 ${results.length} 个目标，${ok} 个可达`,
          data: results
        };
      }
    },
    {
      key: 'diagnose-java',
      category: 'minecraft',
      type: 'action',
      title: '诊断：Java 环境',
      description: '检查当前系统 Java 版本（若有）；优先返回启动器内置检测结果。',
      icon: 'info',
      action: async () => {
        try {
          if (typeof _ctx.javaDetect === 'function') {
            const result = await _ctx.javaDetect();
            return { ok: true, message: result ? '检测到已安装的 Java' : '未检测到 Java（可在 下载 页面安装）', data: result };
          }
        } catch (_) {}
        return new Promise((resolve) => {
          try {
            execFile('java', ['-version'], { timeout: 5000 }, (err, _stdout, stderr) => {
              if (err) resolve({ ok: false, message: `未检测到系统 Java：${err.message || err}` });
              else resolve({ ok: true, message: String(stderr || '').trim().split('\n')[0] || '已安装 Java' });
            });
          } catch (e) {
            resolve({ ok: false, message: String(e && e.message || e) });
          }
        });
      }
    },

    // 其他工具：外部链接
    { key: 'link-minecraft-net', category: 'links', type: 'link', title: 'Minecraft 官方网站', description: 'Minecraft 国际版官方站点。', icon: 'globe', url: 'https://www.minecraft.net/zh-hans' },
    { key: 'link-mc-163', category: 'links', type: 'link', title: '我的世界中国版', description: '网易代理的 Minecraft 中国版官网。', icon: 'globe', url: 'https://mc.163.com/' },
    { key: 'link-mcmod', category: 'links', type: 'link', title: 'MC百科', description: 'MC百科，提供模组/资源包/光影等中文资料。', icon: 'globe', url: 'https://www.mcmod.cn/' },
    { key: 'link-cbcreator', category: 'links', type: 'link', title: '指令生成器', description: 'MC百科提供的可视化命令方块指令生成工具。', icon: 'globe', url: 'https://www.mcmod.cn/tools/cbcreator/' },
    { key: 'link-minecraft-wiki', category: 'links', type: 'link', title: 'Minecraft Wiki', description: 'Minecraft 中文官方维基，涵盖全部游戏内容。', icon: 'globe', url: 'https://zh.minecraft.wiki/' },
    { key: 'link-zmcl', category: 'links', type: 'link', title: 'ZMCL 官方网站', description: 'Zenith Minecraft Launcher （ZMCL）官方网站。', icon: 'globe', url: 'https://zmcl.mkserver.xin' },
    { key: 'link-curseforge', category: 'links', type: 'link', title: 'CurseForge', description: '全球最大的 Minecraft 模组 / 资源包 / 地图下载平台。', icon: 'globe', url: 'https://www.curseforge.cc/' },
    { key: 'link-modrinth', category: 'links', type: 'link', title: 'Modrinth', description: '开放、开源的 Minecraft 模组与资源包平台。', icon: 'globe', url: 'https://modrinth.com/' },
    { key: 'link-fansmc', category: 'links', type: 'link', title: '找服网', description: '收录大量 Minecraft 服务器的导航/推荐平台。', icon: 'globe', url: 'https://www.fansmc.com/' },
    { key: 'link-littleskin', category: 'links', type: 'link', title: 'LittleSkin', description: '皮肤站：免费上传、管理 Minecraft 皮肤与披风。', icon: 'globe', url: 'https://littleskin.cn/' },
    { key: 'link-3dt', category: 'links', type: 'link', title: 'MC 立体字生成器', description: '生成 Minecraft 风格 3D 立体文字图片。', icon: 'globe', url: 'https://3dt.easecation.net/' },
    { key: 'link-mkdelta', category: 'links', type: 'link', title: 'MK三角洲山头服务器官网', description: 'MK 三角洲山头服务器官方网站。', icon: 'globe', url: 'https://china.mkserver.xin' }
  ];

  return tools;
}

/* ---------------- 对外 API ---------------- */

function listTools() {
  return buildTools().map(t => ({
    key: t.key,
    category: t.category,
    type: t.type || 'action',
    title: t.title,
    description: t.description,
    icon: t.icon,
    dangerous: !!t.dangerous,
    url: t.url || null
  }));
}

async function exec(toolKey, payload) {
  const tools = buildTools();
  const tool = tools.find(t => t.key === toolKey);
  if (!tool) return { ok: false, message: `工具不存在：${toolKey}` };
  if (tool.type === 'link') return { ok: false, message: `该工具为外部链接，请由前端直接打开：${tool.title}` };
  try {
    const result = await tool.action(payload || {});
    if (!result) return { ok: false, message: '工具无返回' };
    return { ok: !!result.ok, message: result.message || (result.ok ? '执行成功' : '执行失败'), data: result.data || null };
  } catch (err) {
    return { ok: false, message: String(err && err.message || err) };
  }
}

module.exports = {
  init,
  listTools,
  exec,
  // 导出便于测试 / 复用
  _private: {
    resolveMinecraftDir,
    dirSize,
    formatBytes,
    openInShell,
    safeRemove
  }
};
