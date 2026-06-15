const { app } = require('electron');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
let AdmZip = null;
try { AdmZip = require('adm-zip'); } catch(e) {}

const configStore = require('../config/store');
const versionManager = require('./version');
const javaDetector = require('./java');
const microsoftAuth = require('../auth/microsoft');
const offlineAuth = require('../auth/offline');
const authlibAuth = require('../auth/authlib');

let launchProcess = null;
let launchState = { running: false, versionId: null, status: 'idle', logs: [] };
let cancelRequested = false;
// 持久化保存对渲染层日志/状态回调的引用，用于在进程退出时通知前端
let currentOnLogCallback = null;

// ======================================================================
// 第一部分：通用工具函数
// ======================================================================

function osName() {
  switch (process.platform) {
    case 'win32': return 'windows';
    case 'darwin': return 'osx';
    default: return 'linux';
  }
}

function nativeExts() {
  switch (process.platform) {
    case 'win32': return ['.dll'];
    case 'darwin': return ['.dylib', '.jnilib'];
    default: return ['.so'];
  }
}

function classpathSeparator() {
  return process.platform === 'win32' ? ';' : ':';
}

function evaluateRules(rules, features) {
  if (!rules || !rules.length) return true;
  for (const r of rules) {
    let ok = true;
    if (r.os) {
      if (r.os.name && r.os.name !== osName()) ok = false;
      if (r.os.version) try { if (!new RegExp(r.os.version).test(os.release())) ok = false; } catch (_) { ok = false; }
      if (r.os.arch && r.os.arch !== process.arch) ok = false;
    }
    if (r.features && features) for (const [k, v] of Object.entries(r.features)) if ((features[k] || false) !== v) ok = false;
    if (ok) return r.action === 'allow';
  }
  return false;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function resolveLibPath(lib) {
  if (lib.downloads && lib.downloads.artifact && lib.downloads.artifact.path) return lib.downloads.artifact.path;
  if (!lib.name) return null;
  const parts = lib.name.split(':');
  if (parts.length < 3) return null;
  const [group, artifact, ver] = parts;
  const classifier = parts[3] || null;
  return group.replace(/\./g, '/') + '/' + artifact + '/' + ver + '/' +
    (classifier ? artifact + '-' + ver + '-' + classifier + '.jar' : artifact + '-' + ver + '.jar');
}

function resolveNativeArtifact(lib) {
  if (!lib.natives) return null;
  const key = lib.natives[osName()];
  if (!key) return null;
  return lib.downloads && lib.downloads.classifiers && lib.downloads.classifiers[key] || null;
}

// 处理新版 native 库格式：classifier 在 name 中 (如 "org.lwjgl:lwjgl:3.3.3:natives-windows")
// 无 natives 字段，使用 rules 进行 OS 过滤，downloads.artifact 提供路径
function resolveNativeArtifactNewFormat(lib) {
  if (!lib.name) return null;
  const parts = lib.name.split(':');
  if (parts.length < 4) return null;
  const classifier = parts[3] || '';
  if (!classifier.includes('natives')) return null;

  // 架构过滤：跳过 arm64 和 x86（只在 x64 平台运行）
  if (classifier.includes('arm64') || classifier.includes('aarch64')) return null;
  if (classifier.includes('x86') && !classifier.includes('x86_64')) return null;

  // 获取 jar 路径
  if (lib.downloads && lib.downloads.artifact && lib.downloads.artifact.path) {
    return lib.downloads.artifact.path;
  }
  return null;
}

function recDeleteDir(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  const stat = fs.lstatSync(targetPath);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(targetPath)) {
      recDeleteDir(path.join(targetPath, entry));
    }
    try { fs.rmdirSync(targetPath); } catch (_) {
      try { fs.rmSync(targetPath, { recursive: true, force: true }); } catch (_2) {}
    }
  } else {
    try { fs.unlinkSync(targetPath); } catch (_) {
      try { const tmp = targetPath + '.tmp-del'; if (fs.existsSync(tmp)) fs.unlinkSync(tmp); fs.renameSync(targetPath, tmp); fs.unlinkSync(tmp); } catch (_2) {}
    }
  }
}

function recCopyDir(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) recCopyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function getActiveAccount() {
  const msAccount = microsoftAuth.getSelectedAccount();
  if (msAccount) return msAccount;
  return offlineAuth.getSelectedAccount()
    || authlibAuth.getSelectedAccount()
    || null;
}

// ======================================================================
// 第二部分：MC 版本解析与 Classpath
// ======================================================================

function mergeVersion(parent, child) {
  if (!parent) return JSON.parse(JSON.stringify(child));
  if (!child) return JSON.parse(JSON.stringify(parent));
  const r = JSON.parse(JSON.stringify(parent));
  r.id = child.id;
  if (child.mainClass) r.mainClass = child.mainClass;
  if (child.jar) r.jar = child.jar;
  if (child.minecraftArguments) r.minecraftArguments = child.minecraftArguments;
  if (child.assetIndex) r.assetIndex = child.assetIndex;
  if (child.downloads) r.downloads = { ...(r.downloads || {}), ...child.downloads };

  const pLibs = r.libraries || [];
  const cLibs = child.libraries || [];
  const cNames = new Set(cLibs.map(l => l && l.name).filter(Boolean));
  r.libraries = [...cLibs, ...pLibs.filter(l => l && l.name && !cNames.has(l.name))];

  if (child.arguments) {
    if (!r.arguments) r.arguments = {};
    const dedupe = (c, p) => {
      const set = new Set();
      const out = [];
      for (const item of [...c, ...p]) {
        const key = typeof item === 'string' ? item : JSON.stringify(item);
        if (!set.has(key)) { set.add(key); out.push(item); }
      }
      return out;
    };
    r.arguments.game = dedupe(
      Array.isArray(child.arguments.game) ? child.arguments.game : [],
      Array.isArray(r.arguments.game) ? r.arguments.game : []
    );
    r.arguments.jvm = dedupe(
      Array.isArray(child.arguments.jvm) ? child.arguments.jvm : [],
      Array.isArray(r.arguments.jvm) ? r.arguments.jvm : []
    );
    delete r.minecraftArguments;
  }
  return r;
}

function resolveVersion(versionJson) {
  if (!versionJson.inheritsFrom) return versionJson;
  // getVersionJson 已内含继承链合并，直接返回完整版本，避免双重合并
  try { return versionManager.getVersionJson(versionJson.id); }
  catch (_) { return versionJson; }
}

function compareVersions(a, b) {
  const aParts = a.split(/[.\-_]/).map(p => /^\d+$/.test(p) ? parseInt(p, 10) : p);
  const bParts = b.split(/[.\-_]/).map(p => /^\d+$/.test(p) ? parseInt(p, 10) : p);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const pa = i < aParts.length ? aParts[i] : 0;
    const pb = i < bParts.length ? bParts[i] : 0;
    if (typeof pa === 'number' && typeof pb === 'number') {
      if (pa !== pb) return pa - pb;
    } else {
      const sa = String(pa);
      const sb = String(pb);
      if (sa !== sb) return sa < sb ? -1 : 1;
    }
  }
  return 0;
}

function buildClasspath(versionJson, librariesDir, versionsDir) {
  const jars = [];
  const seen = new Set();

  if (versionJson.libraries) {
    // 按 group:artifact 去重，保留最高版本，避免 Fabric 检测到重复类
    const libMap = new Map();
    for (const lib of versionJson.libraries) {
      if (!evaluateRules(lib.rules)) continue;
      if (lib.natives) continue;
      if (!lib.name) continue;
      const parts = lib.name.split(':');
      if (parts.length < 3) continue;
      const key = parts[0] + ':' + parts[1];
      const ver = parts[2];
      const existing = libMap.get(key);
      if (!existing || compareVersions(ver, existing.version) > 0) {
        libMap.set(key, { lib, version: ver });
      }
    }
    for (const { lib } of libMap.values()) {
      const lp = resolveLibPath(lib);
      if (lp && !seen.has(lp)) {
        seen.add(lp);
        jars.push(path.join(librariesDir, lp));
      }
    }
  }

  const tryAdd = (jar) => {
    if (jar && fs.existsSync(jar) && !seen.has(jar)) {
      seen.add(jar);
      jars.push(jar);
    }
  };

  if (versionJson.jar) {
    tryAdd(path.join(versionsDir, versionJson.jar, versionJson.jar + '.jar'));
  }
  if (versionJson.inheritsFrom) {
    tryAdd(path.join(versionsDir, versionJson.inheritsFrom, versionJson.inheritsFrom + '.jar'));
  }
  tryAdd(path.join(versionsDir, versionJson.id, versionJson.id + '.jar'));

  // 最后的兜底：从 downloads.client.path 尝试添加
  if (versionJson.downloads && versionJson.downloads.client && versionJson.downloads.client.path) {
    tryAdd(path.join(librariesDir, versionJson.downloads.client.path));
  }

  return jars;
}

function buildTokens(version, account, gameRoot, assetsRoot, nativesDir, classpath, opts) {
  return {
    'auth_player_name': account.username || account.userName || 'Player',
    'version_name': version.id,
    'game_directory': gameRoot,
    'assets_root': assetsRoot,
    'assets_index_name': (version.assetIndex || {}).id || version.id,
    'auth_uuid': account.uuid || '0',
    'auth_access_token': account.accessToken || '0',
    'clientid': crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
    'auth_xuid': account.xuid || account.userHash || '0',
    'user_type': account.type === 'microsoft' ? 'msa' : (account.type === 'authlib' ? 'msa' : 'mojang'),
    'version_type': version.type || 'release',
    'natives_directory': nativesDir,
    'launcher_name': 'Zenith',
    'launcher_version': '0.1.0',
    'classpath': classpath,
    'classpath_separator': classpathSeparator(),
    'resolution_width': String(opts.width || configStore.get('width', 854)),
    'resolution_height': String(opts.height || configStore.get('height', 480)),
  };
}

function replaceTokens(val, tokens) {
  if (typeof val !== 'string') return val;
  let r = val;
  for (const [k, v] of Object.entries(tokens)) {
    r = r.split('${' + k + '}').join(v != null ? v : '');
  }
  return r;
}

function parseArgs(args, tokens, features) {
  const out = [];
  if (!args) return out;
  for (const e of args) {
    if (typeof e === 'string') { const v = replaceTokens(e, tokens); if (v) out.push(v); }
    else if (e && e.rules && evaluateRules(e.rules, features)) {
      const vs = Array.isArray(e.value) ? e.value : [e.value];
      for (const v of vs) { const x = replaceTokens(v, tokens); if (x) out.push(x); }
    }
  }
  return out;
}

// ======================================================================
// 第三部分：Natives 提取
// ======================================================================

function extractNatives(versionJson, librariesDir, nativesDir) {
  if (!versionJson.libraries) return;
  ensureDir(nativesDir);
  const exts = nativeExts();

  for (const lib of versionJson.libraries) {
    if (!evaluateRules(lib.rules)) continue;
    let artPath = null;
    const art = resolveNativeArtifact(lib);
    if (art) {
      artPath = art.path;
    } else {
      // 尝试新版格式：classifier 在 name 中
      artPath = resolveNativeArtifactNewFormat(lib);
    }
    if (!artPath) continue;
    const jarP = path.join(librariesDir, artPath);
    if (!fs.existsSync(jarP)) continue;
    const mark = path.join(nativesDir, '.' + path.basename(artPath, '.jar') + '.done');
    if (fs.existsSync(mark)) {
      try { if (fs.statSync(mark).mtimeMs > fs.statSync(jarP).mtimeMs) continue; } catch (_) {}
    }
    try {
      const adm = (() => { try { return require('adm-zip'); } catch (_) { return null; } })();
      if (adm) {
        const zip = new adm(jarP);
        for (const entry of zip.getEntries()) {
          if (entry.isDirectory) continue;
          if (exts.includes(path.extname(entry.entryName).toLowerCase())) {
            try { zip.extractEntryTo(entry, nativesDir, false, true); } catch (_) {}
          }
        }
        try { fs.writeFileSync(mark, ''); } catch (_) {}
        continue;
      }
      if (process.platform === 'win32') {
        try {
          execSync(
            `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${jarP.replace(/'/g, "''")}' -DestinationPath '${nativesDir.replace(/'/g, "''")}' -Force"`,
            { stdio: 'pipe', timeout: 30000 }
          );
          try { fs.writeFileSync(mark, ''); } catch (_) {}
        } catch (_) {}
      }
    } catch (_) {}
  }
}

// ======================================================================
// 第四部分：加载器检测
// ======================================================================

function detectLoader(mainClass, libraries, gameArgs) {
  const mc = mainClass || '';
  const libNames = (libraries || []).map(l => l.name || '').join(' ');
  const ga = JSON.stringify(gameArgs || []);

  if (mc.includes('neoforged') || mc.includes('neoforge') || libNames.includes('net.neoforged.fancymodloader:loader') || ga.includes('--fml.neoForgeVersion')) {
    return 'neoforge';
  }
  if (mc.includes('modlauncher') || mc.includes('fml') || mc.includes('forge') || mc.includes('bootstraplauncher') || mc.includes('BootstrapLauncher') || ga.includes('forgeclient')) {
    return 'forge';
  }
  if (mc.includes('fabricmc') || mc.includes('knot')) {
    return 'fabric';
  }
  if (mc.includes('quilt')) {
    return 'quilt';
  }
  return 'vanilla';
}

// ======================================================================
// 第五部分：JVM 参数构建
// ======================================================================

const JPMS_FLAGS = [
  '--add-exports', 'java.base/sun.security.util=ALL-UNNAMED',
  '--add-exports', 'java.base/sun.security.x509=ALL-UNNAMED',
  '--add-opens', 'java.base/java.lang=ALL-UNNAMED',
  '--add-opens', 'java.base/java.lang.invoke=ALL-UNNAMED',
  '--add-opens', 'java.base/java.lang.reflect=ALL-UNNAMED',
  '--add-opens', 'java.base/java.io=ALL-UNNAMED',
  '--add-opens', 'java.base/java.nio=ALL-UNNAMED',
  '--add-opens', 'java.base/java.util=ALL-UNNAMED',
  '--add-opens', 'java.base/java.util.concurrent=ALL-UNNAMED',
  '--add-opens', 'java.base/java.util.concurrent.atomic=ALL-UNNAMED',
  '--add-opens', 'java.base/java.util.concurrent.locks=ALL-UNNAMED',
  '--add-opens', 'java.base/sun.nio.ch=ALL-UNNAMED',
  '--add-opens', 'java.base/sun.nio.fs=ALL-UNNAMED',
  '--add-opens', 'java.base/sun.security.action=ALL-UNNAMED',
  '--add-opens', 'java.base/sun.security.provider=ALL-UNNAMED',
  '--add-opens', 'java.base/jdk.internal.loader=ALL-UNNAMED',
  '--add-opens', 'java.base/jdk.internal.ref=ALL-UNNAMED',
  '--add-opens', 'java.base/jdk.internal.reflect=ALL-UNNAMED',
  '--add-opens', 'java.base/jdk.internal.math=ALL-UNNAMED',
  '--add-opens', 'java.base/jdk.internal.misc=ALL-UNNAMED',
  '--add-opens', 'java.base/jdk.internal.util=ALL-UNNAMED',
  '--add-opens', 'java.management/sun.management=ALL-UNNAMED',
  '--add-opens', 'java.management/com.sun.jmx.mbeanserver=ALL-UNNAMED',
  '--add-opens', 'jdk.management/com.sun.management.internal=ALL-UNNAMED',
  '--add-opens', 'java.rmi/sun.rmi.registry=ALL-UNNAMED',
  '--add-opens', 'java.rmi/sun.rmi.server=ALL-UNNAMED',
  '--add-opens', 'java.desktop/java.awt=ALL-UNNAMED',
  '--add-opens', 'java.desktop/java.awt.font=ALL-UNNAMED',
  '--add-opens', 'java.desktop/java.awt.peer=ALL-UNNAMED',
  '--add-opens', 'java.desktop/javax.swing=ALL-UNNAMED',
  '--add-opens', 'java.desktop/sun.awt=ALL-UNNAMED',
  '--add-opens', 'java.desktop/sun.java2d=ALL-UNNAMED',
  '--add-opens', 'java.desktop/sun.font=ALL-UNNAMED',
  '--add-opens', 'jdk.unsupported/sun.misc=ALL-UNNAMED',
];

function addJpmsFlagsIfMissing(args) {
  for (let i = 0; i < JPMS_FLAGS.length; i += 2) {
    const flag = JPMS_FLAGS[i];
    const val = JPMS_FLAGS[i + 1];
    const idx = args.indexOf(flag);
    if (idx === -1 || args[idx + 1] !== val) {
      args.push(flag, val);
    }
  }
}

function hasGcArg(args) {
  return args.some(a => /^-XX:\+Use/.test(a) || /^-XX:-Use/.test(a));
}

function buildGcArgs(maxMemMB, javaMajorVer, modCount) {
  const args = [];
  if (maxMemMB >= 8192) {
    args.push('-XX:+UseG1GC');
    if (javaMajorVer >= 21) args.push('-XX:+UnlockExperimentalVMOptions', '-XX:G1NewSizePercent=30');
  } else if (maxMemMB >= 4096) {
    args.push('-XX:+UseG1GC');
  } else {
    args.push('-XX:+UseG1GC');
  }
  if (modCount > 20 && javaMajorVer >= 21) {
    args.push('-XX:+UseStringDeduplication');
  }
  return args;
}

// ======================================================================
// 第六部分：Forge @-文件模式检测与命令构建
// ======================================================================

// ======================================================================
// Forge / NeoForge 启动辅助函数
// ======================================================================

// 检测当前版本是否为 Forge/NeoForge（基于多种线索，不依赖 @files 存在）
function isForgeVersion(versionJson) {
  const id = String(versionJson.id || '');
  const mainClass = String(versionJson.mainClass || '').toLowerCase();
  const inheritsFrom = String(versionJson.inheritsFrom || '').toLowerCase();

  // 1. versionId 明确是 forge/neoforge
  if (id.includes('forge') || id.includes('neoforge')) return true;
  // 2. mainClass 指向 Forge/ModLauncher
  if (mainClass.includes('forge') || mainClass.includes('modlauncher') || mainClass.includes('cpw.mods')) return true;
  // 3. inheritsFrom 指向 forge/neoforge
  if (inheritsFrom.includes('forge') || inheritsFrom.includes('neoforge')) return true;
  // 4. libraries 中包含 forge/neoforge
  if (versionJson.libraries) {
    for (const lib of versionJson.libraries) {
      if (lib && lib.name) {
        const name = lib.name.toLowerCase();
        if (name.includes('net.minecraftforge') || name.includes('net.neoforged')) return true;
      }
    }
  }
  return false;
}

// 查找 @argfiles（可选，用于获取额外参数和 module-path）
function findForgeArgsFiles(gameRoot, versionId, versionJson) {
  const foundFiles = [];

  // 1. user_jvm_args.txt - 用户自定义 JVM 参数，通常在 gameRoot 根目录
  const possibleUserArgs = [
    path.join(gameRoot, 'user_jvm_args.txt'),
    path.join(gameRoot, 'versions', versionId, 'user_jvm_args.txt'),
  ];
  for (const p of possibleUserArgs) {
    if (fs.existsSync(p)) { foundFiles.push({ type: 'user', path: p }); break; }
  }

  // 2. 平台特定的参数文件（在 forge library 目录下）
  const match = versionId.match(/^(\d+\.\d+(?:\.\d+)?)-(?:forge|neoforge)-(.+)$/);
  if (match) {
    const mcVer = match[1];
    const loaderVer = match[2];
    const isNeo = versionId.includes('neoforge');
    const baseOrg = isNeo ? 'net/neoforged/neoforge' : 'net/minecraftforge/forge';
    const baseVer = isNeo ? loaderVer : `${mcVer}-${loaderVer}`;
    const platform = process.platform === 'win32' ? 'win' : (process.platform === 'darwin' ? 'osx' : 'unix');

    const forgeLibDir = path.join(gameRoot, 'libraries', baseOrg, baseVer);
    const possiblePlatformFiles = [
      path.join(forgeLibDir, `${platform}_args.txt`),
      path.join(forgeLibDir, `${baseVer}_args.txt`),
      path.join(forgeLibDir, `${mcVer}-${loaderVer}_args.txt`),
    ];
    for (const p of possiblePlatformFiles) {
      if (fs.existsSync(p)) { foundFiles.push({ type: 'platform', path: p, org: baseOrg, ver: baseVer }); break; }
    }

    // 扫描 forge 目录中的所有 .txt 文件
    if (fs.existsSync(forgeLibDir)) {
      try {
        const entries = fs.readdirSync(forgeLibDir);
        for (const entry of entries) {
          if (entry.endsWith('_args.txt') || (entry.endsWith('.txt') && entry.toLowerCase().includes('args'))) {
            const fullPath = path.join(forgeLibDir, entry);
            if (!foundFiles.find(f => f.path === fullPath)) {
              foundFiles.push({ type: 'extra', path: fullPath });
            }
          }
        }
      } catch (_) {}
    }

    return { files: foundFiles, baseOrg, baseVer, isNeo, mcVer, loaderVer };
  }

  // 即使没有找到平台文件，也要检测是否为 Forge / NeoForge
  if (isForgeVersion(versionJson)) {
    // 从 libraries 中提取 forge / neoforge 版本信息
    if (versionJson.libraries) {
      for (const lib of versionJson.libraries) {
        if (!lib || !lib.name) continue;
        // Forge: net.minecraftforge:forge:<mcver>-<forgever>
        if (lib.name.startsWith('net.minecraftforge:forge:')) {
          const parts = lib.name.split(':');
          const ver = parts[2] || '';
          const forgeLibDir = path.join(gameRoot, 'libraries', 'net', 'minecraftforge', 'forge', ver);
          if (fs.existsSync(forgeLibDir)) {
            try {
              const entries = fs.readdirSync(forgeLibDir);
              for (const entry of entries) {
                if (entry.endsWith('_args.txt')) {
                  foundFiles.push({ type: 'platform', path: path.join(forgeLibDir, entry), org: 'net/minecraftforge/forge', ver: ver });
                }
              }
            } catch (_) {}
          }
          return { files: foundFiles, baseOrg: 'net/minecraftforge/forge', baseVer: ver, isNeo: false };
        }
        // NeoForge: net.neoforged:neoforge:<neoforgever>
        if (lib.name.startsWith('net.neoforged:neoforge:')) {
          const parts = lib.name.split(':');
          const ver = parts[2] || '';
          const neoLibDir = path.join(gameRoot, 'libraries', 'net', 'neoforged', 'neoforge', ver);
          if (fs.existsSync(neoLibDir)) {
            try {
              const entries = fs.readdirSync(neoLibDir);
              for (const entry of entries) {
                if (entry.endsWith('_args.txt')) {
                  foundFiles.push({ type: 'platform', path: path.join(neoLibDir, entry), org: 'net/neoforged/neoforge', ver: ver });
                }
              }
            } catch (_) {}
          }
          return { files: foundFiles, baseOrg: 'net/neoforged/neoforge', baseVer: ver, isNeo: true };
        }
      }
    }
    // 退而求其次：从 versionId/mainClass 中推断是否为 NeoForge
    const idOrMain = (String(versionJson.id || '') + ' ' + String(versionJson.mainClass || '')).toLowerCase();
    const detectedIsNeo = idOrMain.includes('neoforge') || idOrMain.includes('neoforged');
    const detectedOrg = detectedIsNeo ? 'net/neoforged/neoforge' : 'net/minecraftforge/forge';
    return { files: foundFiles, baseOrg: detectedOrg, baseVer: '', isNeo: detectedIsNeo };
  }

  return null;
}

// 解析 @argfile - 返回参数数组
function parseArgFileSimple(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const args = [];
    const lines = content.split(/\r?\n/);
    for (const rawLine of lines) {
      let line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      if ((line.startsWith('"') && line.endsWith('"')) || (line.startsWith("'") && line.endsWith("'"))) {
        line = line.slice(1, -1);
      }
      if (line) args.push(line);
    }
    return args;
  } catch (e) {
    return [];
  }
}

// 在 .minecraft 目录中搜索 Minecraft 客户端 JAR
function locateMinecraftClientJar(launchDir, versionJson) {
  const versionId = versionJson.id;
  const versionsDir = path.join(launchDir, 'versions');
  const libDir = path.join(launchDir, 'libraries');
  const candidates = [];

  // 使用 resolveVersion 以确保能访问父版本的信息
  const resolved = resolveVersion(versionJson);
  const parentVer = versionJson.inheritsFrom;
  // Forge version.json 可能有 jar 字段来指定客户端 JAR 的基础名称
  const jarBase = versionJson.jar || parentVer || versionId;

  // 1. 版本目录下 - 最常用路径（可能是父版本的 jar 字段指向的）
  candidates.push(path.join(versionsDir, jarBase, jarBase + '.jar'));
  candidates.push(path.join(versionsDir, jarBase, 'client.jar'));
  candidates.push(path.join(versionsDir, versionId, versionId + '.jar'));
  candidates.push(path.join(versionsDir, versionId, 'client.jar'));

  // 2. 父版本目录（Forge 版本的客户端 JAR 通常在父版本目录下）
  if (parentVer && parentVer !== jarBase) {
    candidates.push(path.join(versionsDir, parentVer, parentVer + '.jar'));
    candidates.push(path.join(versionsDir, parentVer, 'client.jar'));
  }

  // 3. 从 version.json 的 downloads 信息中查找
  if (resolved.downloads && resolved.downloads.client) {
    const d = resolved.downloads.client;
    if (d.path) candidates.push(path.join(libDir, d.path));
    if (d.url) {
      const urlParts = d.url.split('/');
      const fileName = urlParts[urlParts.length - 1];
      candidates.push(path.join(versionsDir, jarBase, fileName));
      if (parentVer) candidates.push(path.join(versionsDir, parentVer, fileName));
      candidates.push(path.join(versionsDir, versionId, fileName));
    }
  }

  // 4. 从 libraries 列表中查找 net.minecraft:client 条目
  if (resolved.libraries) {
    for (const lib of resolved.libraries) {
      if (!lib || !lib.name) continue;
      if (lib.name.startsWith('net.minecraft:client')) {
        if (lib.downloads && lib.downloads.artifact && lib.downloads.artifact.path) {
          candidates.push(path.join(libDir, lib.downloads.artifact.path));
        }
      }
    }
  }

  // 5. Forge/NeoForge library 目录下搜索
  const match = versionId.match(/^(\d+\.\d+(?:\.\d+)?)-(?:forge|neoforge)-(.+)$/);
  if (match) {
    const mcVer = match[1];
    const loaderVer = match[2];
    const isNeo = versionId.includes('neoforge');
    const baseOrg = isNeo ? 'net/neoforged/neoforge' : 'net/minecraftforge/forge';
    const baseVer = isNeo ? loaderVer : `${mcVer}-${loaderVer}`;
    const forgeDir = path.join(libDir, baseOrg, baseVer);
    if (fs.existsSync(forgeDir)) {
      try {
        const entries = fs.readdirSync(forgeDir).filter(f => f.endsWith('.jar'));
        for (const e of entries) {
          const lower = e.toLowerCase();
          if (lower.includes('client') || (lower.includes(mcVer) && !lower.includes('universal'))) {
            candidates.push(path.join(forgeDir, e));
          }
        }
      } catch (_) {}
    }
  }

  // 查找第一个存在且大小合理的 JAR
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const stat = fs.statSync(p);
        if (stat.size > 50 * 1024) return p; // > 50KB
      }
    } catch (_) {}
  }
  return null;
}

// 从 version.json 的 libraries 列表构建 classpath/module-path
function buildLibraryPathsFromVersionJson(versionJson, launchDir) {
  const librariesDir = path.join(launchDir, 'libraries');
  const paths = [];

  if (!versionJson.libraries) return paths;

  for (const lib of versionJson.libraries) {
    if (!lib) continue;
    // 跳过仅用于 native 的库（但如果也有 artifact 则保留）
    if (lib.natives && !(lib.downloads && lib.downloads.artifact)) {
      continue;
    }
    let jarPath = null;

    // 1. 从 downloads.artifact.path 获取
    if (lib.downloads && lib.downloads.artifact && lib.downloads.artifact.path) {
      jarPath = path.join(librariesDir, lib.downloads.artifact.path);
    }
    // 2. 从 library name 推导路径 (org:name:ver[:classifier] -> org/name/ver/name-ver[-classifier].jar)
    if (!jarPath && lib.name) {
      const parts = lib.name.split(':');
      if (parts.length >= 3) {
        const [org, name, ver] = parts;
        const classifier = parts[3] || null;
        const fileName = classifier ? `${name}-${ver}-${classifier}.jar` : `${name}-${ver}.jar`;
        jarPath = path.join(librariesDir, ...org.split('.'), name, ver, fileName);
      }
    }

    if (jarPath) {
      if (fs.existsSync(jarPath)) {
        paths.push(jarPath);
      }
    }
  }

  return paths;
}

// 工具函数：从 JAR/ZIP 文件读取指定条目的文本内容
function readJarEntryText(jarPath, entryName) {
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(jarPath);
    const entry = zip.getEntry(entryName);
    if (!entry) return null;
    return entry.getData().toString('utf8');
  } catch (e) {
    // adm-zip 失败时，回退到使用 Node.js 内置 zlib 手动解析
    try {
      return readJarEntryFallback(jarPath, entryName);
    } catch (e2) {
      throw new Error('无法读取 ' + entryName + ': ' + e.message + ' / ' + e2.message);
    }
  }
}

// 工具函数：使用 Node.js 原生 fs/zlib 手动解析 ZIP（fallback）
function readJarEntryFallback(jarPath, entryName) {
  const fsRaw = require('fs');
  const zlib = require('zlib');
  const buf = fsRaw.readFileSync(jarPath);

  // 查找 end of central directory record (EOCD)
  let eocdPos = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocdPos = i; break; }
  }
  if (eocdPos < 0) throw new Error('Not a valid ZIP');

  const centralDirStart = buf.readUInt32LE(eocdPos + 16);
  const numEntries = buf.readUInt16LE(eocdPos + 8);

  let pos = centralDirStart;
  for (let i = 0; i < numEntries; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const uncompressedSize = buf.readUInt32LE(pos + 24);
    const compression = buf.readUInt16LE(pos + 10);
    const localHeaderOffset = buf.readUInt32LE(pos + 42);
    const name = buf.slice(pos + 46, pos + 46 + nameLen).toString('utf8');
    if (name === entryName) {
      // 读取 local file header
      const lhNameLen = buf.readUInt16LE(localHeaderOffset + 26);
      const lhExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
      const compressed = buf.slice(dataStart, dataStart + compressedSize);
      if (compression === 0) return compressed.toString('utf8');
      return zlib.inflateRawSync(compressed).toString('utf8');
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

// SHIM 模式启动命令构建：java [-JVM参数] -jar shim.jar [--launchTarget forge_client] [--游戏参数...]
// shim.jar 是可执行 JAR，内部包含：
//   - META-INF/MANIFEST.MF (Main-Class: net.minecraftforge.bootstrap.shim.Main)
//   - bootstrap-shim.properties (Main-Class: net.minecraftforge.bootstrap.ForgeBootstrap, Arguments: --launchTarget forge_server)
//   - bootstrap-shim.list (完整 classpath 列表，相对于 libraries 目录)
// shim.Main 会：读取 properties -> 从 .list 构建 classpath -> 设置 fml.* 系统属性 -> 调用 ForgeBootstrap
// SHIM 模式（新版 Forge 21.x/26.x+）：
// 不使用 java -jar shim.jar（会检查所有 .list 条目，包括不存在的 server.jar）
// 而是：手动解析 shim.jar 内的 bootstrap-shim.list + 从 version.json 收集 Minecraft 库
// + 正确设置 fml.* 系统属性 + 直接调用 ForgeBootstrap
// 经过验证：这种方式可以正确启动 ModLauncher/GLFW/Forge
function buildShimLaunchCmd(javaPath, shimJarPath, opts, launchDir, versionJson, log) {
  const versionId = versionJson.id;
  const librariesDir = path.join(launchDir, 'libraries');
  const sep = process.platform === 'win32' ? ';' : ':';

  // ===== 1. 从 shim.jar 的 bootstrap-shim.list 收集 Forge 库 =====
  const forgeJars = [];
  try {
    let listContent = null;
    if (AdmZip) {
      const zip = new AdmZip(shimJarPath);
      const entry = zip.getEntry('bootstrap-shim.list');
      if (entry) listContent = entry.getData().toString('utf8');
    }
    // fallback：手动 ZIP 解析
    if (!listContent) listContent = readJarEntryText(shimJarPath, 'bootstrap-shim.list');

    if (listContent) {
      for (const line of listContent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // 格式: "hash  group:name:ver[:classifier]  relative/path.jar"
        const parts = trimmed.split(/\s+/);
        const relPath = parts[parts.length - 1];
        // 跳过 server.jar（客户端不需要，且通常不存在）
        if (relPath.includes('server.jar')) continue;
        const absPath = path.join(librariesDir, relPath);
        // 过滤跨平台/跨架构的 natives jar（只保留 Windows x64）
        if (relPath.includes('-natives-')) {
          const fname = path.basename(relPath).toLowerCase();
          if (fname.includes('-natives-linux') || fname.includes('-natives-macos')) continue;
          if (fname.includes('-natives-windows-arm64') || fname.includes('-natives-windows-x86')) continue;
        }
        if (fs.existsSync(absPath)) {
          forgeJars.push(absPath);
        } else {
          log(`[Forge] shim.list 库缺失（跳过）: ${relPath}`, 'warning');
        }
      }
      log(`[Forge] 从 shim.list 收集到 ${forgeJars.length} 个 Forge 库`);
    }
  } catch (e) {
    log(`[Forge] 解析 shim.list 警告: ${e.message}`, 'warning');
  }

  // shim.jar 自身也要加入 classpath（包含 bootstrap.shim.Main 和资源）
  forgeJars.push(shimJarPath);

  // ===== 2. 从 shim.jar 路径解析 mcVersion/forgeVersion =====
  // shim.jar 通常在: libraries/net/minecraftforge/forge/<mcVer>-<forgeVer>/forge-<mcVer>-<forgeVer>-shim.jar
  let mcVersion = null;
  let forgeVersion = null;
  try {
    const shimDir = path.dirname(shimJarPath);
    const shimDirName = path.basename(shimDir);
    // shimDirName 如: "26.1-62.0.9"
    const m = shimDirName.match(/^(\d+(?:\.\d+)*)-(\d+(?:\.\d+)*)/);
    if (m) {
      mcVersion = m[1];
      forgeVersion = m[2];
    } else if (versionId) {
      const vm = versionId.match(/^(\d+(?:\.\d+)*)-(?:forge|neoforge)-(\d+(?:\.\d+)*)$/);
      if (vm) { mcVersion = vm[1]; forgeVersion = vm[2]; }
    }
  } catch(_) {}

  // ===== 3. 从 version.json 收集 Minecraft 客户端库 =====
  const mcJars = [];
  let mcJarToReport = null;
  const nativeJarsToExtract = []; // 需要解压 DLL 的 natives jar 列表
  try {
    // 解析 version.json 继承链
    const allVersions = [];
    let cur = versionJson;
    while (cur) {
      allVersions.push(cur);
      if (cur.inheritsFrom) {
        const parentPath = path.join(launchDir, 'versions', cur.inheritsFrom, cur.inheritsFrom + '.json');
        if (fs.existsSync(parentPath)) {
          cur = JSON.parse(fs.readFileSync(parentPath, 'utf8'));
        } else {
          cur = null;
        }
      } else {
        cur = null;
      }
    }

    for (const v of allVersions) {
      // 收集客户端 JAR（位于 versions/versionId/versionId.jar）
      const verJarPath = path.join(launchDir, 'versions', v.id, v.id + '.jar');
      if (fs.existsSync(verJarPath) && !mcJars.includes(verJarPath)) {
        mcJars.push(verJarPath);
        if (!mcJarToReport) mcJarToReport = verJarPath;
      }
      // 收集 libraries
      if (v.libraries) {
        for (const lib of v.libraries) {
          if (!lib || !lib.name) continue;
          // 检查 rule（操作系统 + 架构过滤）
          if (lib.rules) {
            let allowed = false; // 有 rules 时默认不允许，需有匹配的 allow
            for (const rule of lib.rules) {
              let applies = true;
              if (rule.os) {
                if (rule.os.name && rule.os.name !== 'windows') applies = false;
                if (rule.os.arch) {
                  const sysArch = process.arch === 'x64' ? 'x86_64' : process.arch === 'ia32' ? 'x86' : process.arch;
                  if (rule.os.arch !== sysArch) applies = false;
                }
              }
              if (applies) {
                allowed = (rule.action === 'allow');
              }
            }
            if (!allowed) continue;
          }

          const coords = lib.name.split(':');
          if (coords.length < 3) continue;
          const [group, name, ver] = coords;
          const groupPath = group.replace(/\./g, '/');
          const classifier = coords.length >= 4 ? coords[3] : null;

          // 优先使用 downloads 中指定的准确路径（最可靠）
          let jarPath = null;
          if (lib.downloads && lib.downloads.artifact && lib.downloads.artifact.path) {
            jarPath = path.join(librariesDir, lib.downloads.artifact.path);
          } else if (classifier) {
            jarPath = path.join(librariesDir, groupPath, name, ver, `${name}-${ver}-${classifier}.jar`);
          } else {
            jarPath = path.join(librariesDir, groupPath, name, ver, `${name}-${ver}.jar`);
          }

          if (jarPath && fs.existsSync(jarPath) && !mcJars.includes(jarPath)) {
            mcJars.push(jarPath);
            // 判断是否为 natives jar（需要解压 DLL）
            const isNative = classifier ? classifier.includes('natives') : !!(lib.natives && lib.natives.windows);
            if (isNative) {
              nativeJarsToExtract.push(jarPath);
            }
          }

          // 兼容旧格式：lib.natives.windows（name 中不带 classifier，但 natives 字段指定了 classifier）
          if (!classifier && lib.natives && lib.natives.windows) {
            const windowsNativeClassifier = lib.natives.windows;
            const nativeCandidates = [
              path.join(librariesDir, groupPath, name, ver, `${name}-${ver}-${windowsNativeClassifier}.jar`),
              path.join(librariesDir, groupPath, name, ver, `${name}-${ver}-${windowsNativeClassifier}-x86_64.jar`),
              path.join(librariesDir, groupPath, name, ver, `${name}-${ver}-${windowsNativeClassifier}-amd64.jar`),
            ];
            for (const absPath of nativeCandidates) {
              const fname = path.basename(absPath).toLowerCase();
              // 跳过 arm64 / x86 架构
              if (fname.includes('arm64') || fname.includes('-x86-') || fname.endsWith('-x86.jar') || fname.includes('aarch64')) continue;
              if (fs.existsSync(absPath) && !mcJars.includes(absPath)) {
                mcJars.push(absPath);
                nativeJarsToExtract.push(absPath);
              }
            }
          }

          // 特殊处理：lwjgl 还需要 -unsafe.jar
          if (name === 'lwjgl') {
            const unsafeJar = path.join(librariesDir, groupPath, name, ver, `${name}-${ver}-unsafe.jar`);
            if (fs.existsSync(unsafeJar) && !mcJars.includes(unsafeJar)) {
              mcJars.push(unsafeJar);
            }
          }
        }
      }
    }
  } catch(e) {
    log(`[Forge] 收集 Minecraft 库警告: ${e.message}`, 'warning');
  }
  log(`[Forge] 收集到 ${mcJars.length} 个 Minecraft 客户端库（含 ${nativeJarsToExtract.length} 个 natives）`);

  // ===== 3b. 解压 natives jar 中的 DLL 到 natives 目录 =====
  const nativesDir = path.join(launchDir, 'versions', versionId, 'natives');
  try {
    if (!fs.existsSync(nativesDir)) fs.mkdirSync(nativesDir, { recursive: true });
    if (nativeJarsToExtract.length > 0 && AdmZip) {
      let extracted = 0;
      for (const jarPath of nativeJarsToExtract) {
        try {
          const zip = new AdmZip(jarPath);
          const entries = zip.getEntries();
          for (const entry of entries) {
            if (entry.isDirectory) continue;
            const ename = path.basename(entry.entryName);
            // 只提取 .dll 文件
            if (!ename.endsWith('.dll')) continue;
            // 避免路径遍历
            if (ename.includes('/') || ename.includes('\\') || ename.startsWith('.')) continue;
            const target = path.join(nativesDir, ename);
            try {
              zip.extractEntryTo(entry, nativesDir, false, true);
              extracted++;
            } catch(_) {}
          }
        } catch(e) {
          log(`[Forge] 解压 ${path.basename(jarPath)} 失败: ${e.message}`, 'warning');
        }
      }
      log(`[Forge] 已从 natives jar 提取 ${extracted} 个 DLL 到 ${nativesDir}`);
    } else if (nativeJarsToExtract.length > 0) {
      log(`[Forge] 警告: 无法解压 natives DLL（AdmZip 不可用）`, 'warning');
    }
  } catch(e) {
    log(`[Forge] 创建 natives 目录失败: ${e.message}`, 'warning');
  }

  // ===== 4. 去重合并所有 JAR =====
  const seen = new Set();
  const allJars = [];
  for (const p of forgeJars) {
    if (!seen.has(p)) { seen.add(p); allJars.push(p); }
  }
  for (const p of mcJars) {
    if (!seen.has(p)) { seen.add(p); allJars.push(p); }
  }
  log(`[Forge] 最终 classpath: ${allJars.length} 个 JAR`);

  // ===== 5. 构建 JVM 参数 =====
  // ===== 5a. 从 version.json 继承链解析 arguments.jvm =====
  // 这是 Minecraft 原版要求的参数，包括 Java 25 必需的 --sun-misc-unsafe-memory-access
  // 注意：nativesDir 已在第 3b 部分定义（DLL 解压目标目录）
  const inheritedJvmArgs = [];
  try {
    let curV = versionJson;
    const chain = [];
    while (curV) {
      chain.push(curV);
      if (curV.inheritsFrom) {
        const parentPath = path.join(launchDir, 'versions', curV.inheritsFrom, curV.inheritsFrom + '.json');
        if (fs.existsSync(parentPath)) curV = JSON.parse(fs.readFileSync(parentPath, 'utf8'));
        else curV = null;
      } else curV = null;
    }
    for (const v of chain) {
      if (!v.arguments || !v.arguments.jvm) continue;
      for (const arg of v.arguments.jvm) {
        let values = null;
        let rules = null;
        if (typeof arg === 'string') {
          values = [arg];
        } else if (arg && arg.value) {
          values = Array.isArray(arg.value) ? arg.value : [arg.value];
          rules = arg.rules;
        }
        if (!values) continue;
        if (rules) {
          let allowed = true;
          for (const rule of rules) {
            if (rule.os) {
              if (rule.os.name && rule.os.name !== 'windows' && rule.action === 'allow') allowed = false;
              if (rule.os.name === 'windows' && rule.action === 'disallow') allowed = false;
              if (rule.os.arch === 'x86' && rule.action === 'allow') allowed = false;
            }
          }
          if (!allowed) continue;
        }
        for (let val of values) {
          val = String(val).replace(/\$\{natives_directory\}/g, nativesDir.replace(/\\/g, '/'));
          val = val.replace(/\$\{launcher_name\}/g, 'zenith-launcher');
          val = val.replace(/\$\{launcher_version\}/g, '1.0');
          if (val === '-cp' || val === '${classpath}') continue;
          inheritedJvmArgs.push(val);
        }
      }
    }
  } catch(e) {
    log(`[Forge] 解析继承链 jvm args 警告: ${e.message}`);
  }

  // ===== 5b. 组装最终 JVM 参数列表（去重）=====
  const javaMajorVer = opts.javaMajorVer || 0;
  const unsupportedJvmArgs = [];
  if (javaMajorVer > 0 && javaMajorVer < 24) {
    unsupportedJvmArgs.push('-XX:+UseCompactObjectHeaders', '-XX:-UseCompactObjectHeaders');
  }
  if (javaMajorVer > 0 && javaMajorVer < 23) {
    unsupportedJvmArgs.push('--sun-misc-unsafe-memory-access=allow');
  }

  const jvmArgs = [];
  const seenJvmArg = new Set();
  const addJvmArg = (a) => {
    if (unsupportedJvmArgs.includes(a)) return;
    const key = a.startsWith('-D') || a.startsWith('-X') || a.startsWith('--') ? a.split('=')[0] : a;
    if (seenJvmArg.has(key) && !key.startsWith('--add-opens')) return; // --add-opens 允许多个不同模块
    seenJvmArg.add(key);
    jvmArgs.push(a);
  };

  // 内存
  const maxMem = opts.maxMemory || configStore.get('memoryMax', 4096);
  const minMem = opts.minMemory || configStore.get('memoryMin', 512);
  addJvmArg('-Xmx' + maxMem + 'M');
  addJvmArg('-Xms' + minMem + 'M');

  // 从 version.json 继承的参数
  for (const a of inheritedJvmArgs) addJvmArg(a);

  // 补充模块系统兼容参数
  if (javaMajorVer >= 9) {
    addJvmArg('--enable-native-access=ALL-UNNAMED');
    if (javaMajorVer >= 23) {
      addJvmArg('--sun-misc-unsafe-memory-access=allow');
    }
    for (const mod of ['java.base/java.lang', 'java.base/java.util', 'java.base/java.nio', 'java.base/sun.nio.ch', 'java.base/sun.misc']) {
      jvmArgs.push('--add-opens');
      jvmArgs.push(mod + '=ALL-UNNAMED');
    }
  }

  // 用户自定义 JVM 参数
  const extraJvm = configStore.get('extraJvmArgs', '');
  if (extraJvm) {
    for (const a of extraJvm.trim().split(/\s+/).filter(Boolean)) addJvmArg(a);
  }

  // ===== 关键：fml.* 系统属性（TypesafeMap NPE 的根因） =====
  jvmArgs.push('-Dfml.ignoreInvalidMinecraftCertificates=true');
  jvmArgs.push('-Dfml.ignorePatchDiscrepancies=true');
  if (mcJarToReport) jvmArgs.push('-Dminecraft.client.jar=' + mcJarToReport.replace(/\\/g, '/'));

  const isNeo = versionId && versionId.toLowerCase().includes('neoforge');
  if (mcVersion && forgeVersion) {
    jvmArgs.push('-Dfml.mcVersion=' + mcVersion);
    if (isNeo) {
      jvmArgs.push('-Dfml.neoForgeVersion=' + forgeVersion);
      jvmArgs.push('-Dfml.neoVersion=' + forgeVersion);
    } else {
      jvmArgs.push('-Dfml.forgeVersion=' + forgeVersion);
    }
    jvmArgs.push('-Dfml.mcpVersion=' + mcVersion + '-' + forgeVersion);
    log(`[Forge] 系统属性: fml.mcVersion=${mcVersion}, ${isNeo ? 'neoForge' : 'forge'}Version=${forgeVersion}`);
  } else {
    log('[Forge] 警告: 未能解析 mcVersion/forgeVersion，可能导致启动失败', 'warning');
  }

  // classpath
  const cpStr = allJars.map(p => p.replace(/\\/g, '/')).join(sep);

  // ===== 6. 构建游戏参数（传递给 ForgeBootstrap） =====
  const gameArgs = [];
  gameArgs.push('--launchTarget', 'forge_client');

  const account = getActiveAccount();
  const username = (account && (account.username || account.userName)) || 'Player';
  const resolvedVer = resolveVersion(versionJson);
  const assetIndexId = (resolvedVer.assetIndex && resolvedVer.assetIndex.id) || versionId;
  const uuid = (account && account.uuid) || '00000000-0000-0000-0000-000000000000';
  const accessToken = (account && account.accessToken) || '0';
  const clientId = (account && account.clientId) || (crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000');

  gameArgs.push('--username', username);
  gameArgs.push('--version', versionId);
  gameArgs.push('--gameDir', launchDir.replace(/\\/g, '/'));
  gameArgs.push('--assetsDir', path.join(launchDir, 'assets').replace(/\\/g, '/'));
  gameArgs.push('--assetIndex', assetIndexId);
  gameArgs.push('--uuid', uuid);
  gameArgs.push('--accessToken', accessToken);
  gameArgs.push('--clientId', clientId);
  gameArgs.push('--xuid', (account && account.xuid) || '0');
  gameArgs.push('--versionType', 'release');
  gameArgs.push('--modsDir', path.join(launchDir, 'mods').replace(/\\/g, '/'));

  if (opts.width && opts.height) {
    gameArgs.push('--width', String(opts.width), '--height', String(opts.height));
  }
  if (opts.serverIp) {
    gameArgs.push('--server', opts.serverIp);
  }
  const extraGame = opts.extraGameArgs || configStore.get('extraGameArgs', '');
  if (extraGame) {
    for (const a of extraGame.trim().split(/\s+/).filter(Boolean)) gameArgs.push(a);
  }

  // ===== 7. 写入 @argfile =====
  const argsDir = path.join(os.tmpdir(), 'zenith-launcher-args');
  if (!fs.existsSync(argsDir)) {
    try { fs.mkdirSync(argsDir, { recursive: true }); } catch (_) {}
  }
  const argsFile = path.join(argsDir, `shim_args_${versionId}_${Date.now()}.txt`);

  const lines = [];
  for (const a of jvmArgs) lines.push(a);
  lines.push('-cp');
  lines.push(cpStr);
  lines.push('net.minecraftforge.bootstrap.ForgeBootstrap');
  for (const a of gameArgs) lines.push(a);

  try {
    fs.writeFileSync(argsFile, lines.join('\n'), 'utf8');
    log(`[Forge] 启动参数文件: ${argsFile} (${lines.length} 行)`);
  } catch (e) {
    log(`[Forge] 写入参数文件失败: ${e.message}`, 'warning');
    const fallbackCmd = [];
    const wrapper = configStore.get('javaWrapper', '');
    if (wrapper && wrapper.trim()) fallbackCmd.push(...wrapper.trim().split(/\s+/));
    fallbackCmd.push(javaPath);
    fallbackCmd.push(...jvmArgs, '-cp', cpStr, 'net.minecraftforge.bootstrap.ForgeBootstrap', ...gameArgs);
    return fallbackCmd;
  }

  // ===== 8. 构建最终 Java 命令 =====
  const cmd = [];
  const wrapper = configStore.get('javaWrapper', '');
  if (wrapper && wrapper.trim()) cmd.push(...wrapper.trim().split(/\s+/));
  cmd.push(javaPath);
  cmd.push('@' + argsFile.replace(/\\/g, '/'));

  log(`[Forge] SHIM 启动命令已构建（${allJars.length} 个 classpath JAR）`);
  return cmd;
}

// 主函数：构建 Forge/NeoForge 的完整启动命令
// 支持两种启动模式：
// 1. SHIM 模式（新版 Forge 26.x+）：存在 *-shim.jar 可执行 JAR，使用 java -jar shim.jar
//    shim.jar 内部包含 bootstrap-shim.properties 和 bootstrap-shim.list，
//    会自动设置 fml.* 系统属性、构建 classpath，并调用 ForgeBootstrap
// 2. MODULE 模式（NeoForge / 某些新版 Forge）：使用 --module-path + --module X/Y
// 3. CLASSPATH 模式（旧版 Forge/无 @files）：使用 -cp + mainClass
function buildForgeModLauncherCmd(javaPath, forgeFiles, opts, launchDir, versionJson, logFn) {
  const log = logFn || ((msg) => {});
  const sep = process.platform === 'win32' ? ';' : ':';

  const versionId = versionJson.id;
  const isNeo = forgeFiles.isNeo || (versionId && versionId.includes('neoforge'));

  // ===== 模式 0：检测 shim.jar —— 新版 Forge 的标准启动方式 =====
  // shim.jar 是可执行 JAR，包含自己的 bootstrap-shim.properties / bootstrap-shim.list
  // 它会自动设置 fml.mcVersion/fml.forgeVersion 等系统属性
  const librariesDir = path.join(launchDir, 'libraries');

  // 尝试从 version.json 的 libraries 中定位 shim jar
  let shimJarPath = null;
  if (versionJson.libraries) {
    for (const lib of versionJson.libraries) {
      if (!lib || !lib.name) continue;
      // 查找含 shim classifier 的库 或 名称含 forge 的库
      const libName = lib.name;
      if (libName.includes(':shim') || libName.endsWith(':shim')) {
        const parts = libName.split(':');
        if (parts.length >= 4) {
          const [org, name, ver, classifier] = parts;
          const jarPath = path.join(librariesDir, ...org.split('.'), name, ver, `${name}-${ver}-${classifier}.jar`);
          if (fs.existsSync(jarPath)) { shimJarPath = jarPath; break; }
        }
      }
      // 从 downloads.artifact.path 读取
      if (lib.downloads && lib.downloads.artifact && lib.downloads.artifact.path) {
        const p = path.join(librariesDir, lib.downloads.artifact.path);
        if (fs.existsSync(p) && p.includes('shim')) {
          shimJarPath = p;
          break;
        }
      }
    }
  }

  // 如果 version.json 没找到，直接扫描 forge 目录
  if (!shimJarPath) {
    for (const baseDir of [
      path.join(librariesDir, 'net', 'minecraftforge', 'forge'),
      path.join(librariesDir, 'net', 'neoforged', 'neoforge'),
      path.join(librariesDir, 'net', 'neoforged', 'forge'),
    ]) {
      if (!fs.existsSync(baseDir)) continue;
      for (const ver of fs.readdirSync(baseDir)) {
        const verDir = path.join(baseDir, ver);
        if (!fs.statSync(verDir).isDirectory()) continue;
        try {
          const entries = fs.readdirSync(verDir);
          const shim = entries.find(f => f.endsWith('-shim.jar'));
          if (shim) {
            shimJarPath = path.join(verDir, shim);
            break;
          }
        } catch (_) {}
      }
      if (shimJarPath) break;
    }
  }

  // ============ SHIM 模式：使用 java -jar shim.jar 启动 ============
  if (shimJarPath) {
    log(`[Forge] 检测到 shim.jar (SHIM 模式): ${shimJarPath}`);
    return buildShimLaunchCmd(javaPath, shimJarPath, opts, launchDir, versionJson, log);
  }

  // ============ 继续原有 MODULE / CLASSPATH 模式 ============
  log(`[Forge] 未检测到 shim.jar，使用 Module/Classpath 模式`);

  // ===== 第一步：查找 Minecraft 客户端 JAR =====
  const clientJar = locateMinecraftClientJar(launchDir, versionJson);
  if (clientJar) {
    log('[Forge] 找到 Minecraft 客户端 JAR: ' + clientJar);
  } else {
    log('[Forge] 警告: 未找到 Minecraft 客户端 JAR，启动可能失败', 'warning');
  }

  // ===== 第二步：从 Forge @files 提取参数 =====
  const jvmFlags = [];
  const systemProps = [];
  const modulePathEntries = [];
  let mainModule = null;
  let launchTarget = null;

  const forgeArgFiles = [];
  for (const f of forgeFiles.files) {
    if (fs.existsSync(f.path)) forgeArgFiles.push(f.path);
  }
  log(`[Forge] 可用的 @files: ${forgeArgFiles.length} 个`);
  for (const p of forgeArgFiles) log(`  → ${p}`);

  for (const filePath of forgeArgFiles) {
    const args = parseArgFileSimple(filePath);
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if ((arg === '--module-path' || arg === '-p') && i + 1 < args.length) {
        const val = args[++i];
        const parts = val.split(sep).map(s => s.trim()).filter(Boolean);
        for (const part of parts) {
          const abs = path.isAbsolute(part) ? part : path.resolve(launchDir, part);
          modulePathEntries.push(abs);
        }
        continue;
      }
      if (arg.startsWith('--module-path=')) {
        const val = arg.substring(14);
        const parts = val.split(sep).map(s => s.trim()).filter(Boolean);
        for (const part of parts) {
          const abs = path.isAbsolute(part) ? part : path.resolve(launchDir, part);
          modulePathEntries.push(abs);
        }
        continue;
      }
      if ((arg === '--module' || arg === '-m') && i + 1 < args.length) {
        mainModule = args[++i];
        continue;
      }
      if (arg.startsWith('--module=') || arg.startsWith('-m=')) {
        mainModule = arg.substring(arg.indexOf('=') + 1);
        continue;
      }
      if (arg === '--launchTarget' && i + 1 < args.length) {
        launchTarget = args[++i];
        continue;
      }
      if (arg.startsWith('--launchTarget=')) {
        launchTarget = arg.substring(15);
        continue;
      }
      if (arg === '--add-modules') { i++; continue; }
      if (arg.startsWith('--add-modules=')) continue;
      if (arg.startsWith('-Xmx') || arg.startsWith('-Xms')) continue;
      if (arg === '-cp' || arg === '-classpath' || arg === '--class-path') { i++; continue; }
      if (arg.startsWith('-cp=') || arg.startsWith('-classpath=') || arg.startsWith('--class-path=')) continue;
      if (args[i-1] === '--add-modules') continue;
      if (arg.startsWith('-D')) {
        systemProps.push(arg);
      } else {
        jvmFlags.push(arg);
      }
    }
  }

  if (!launchTarget) launchTarget = isNeo ? 'neoforge_client' : 'forge_client';
  if (!mainModule) {
    mainModule = isNeo
      ? 'net.neoforged.bootstraplauncher/net.neoforged.bootstraplauncher.BootstrapLauncher'
      : 'net.minecraftforge.bootstrap/net.minecraftforge.bootstrap.ForgeBootstrap';
  }
  log(`[Forge] 启动目标: ${launchTarget}`);
  log(`[Forge] 主模块: ${mainModule}`);

  // ===== 第四步：收集 classpath 和 module-path JAR =====
  const canBeOnModulePath = (jarPath) => {
    if (!jarPath) return false;
    const basename = path.basename(jarPath, '.jar');
    const m = basename.match(/^([A-Za-z_][A-Za-z0-9_\-\.]*?)(-\d.*)?$/);
    if (m) return true;
    return /^[A-Za-z_$]/.test(basename.charAt(0));
  };

  const seen = new Set();
  const allJars = [];
  for (const p of modulePathEntries) {
    const abs = path.resolve(p);
    if (!seen.has(abs) && fs.existsSync(abs)) { seen.add(abs); allJars.push(abs); }
  }
  if (clientJar) {
    const abs = path.resolve(clientJar);
    if (!seen.has(abs)) {
      seen.add(abs);
      allJars.push(abs);
    }
  }
  const resolved = resolveVersion(versionJson);
  const libPathsFromJson = buildLibraryPathsFromVersionJson(resolved, launchDir);
  for (const lib of libPathsFromJson) {
    const abs = path.resolve(lib);
    if (!seen.has(abs) && fs.existsSync(abs)) { seen.add(abs); allJars.push(abs); }
  }

  const mpJars = [];
  const cpJars = [];
  for (const jar of allJars) {
    if (canBeOnModulePath(jar)) mpJars.push(jar);
    else cpJars.push(jar);
  }

  log(`[Forge] module-path: ${mpJars.length} 个 JAR`);
  log(`[Forge] classpath: ${cpJars.length} 个 JAR`);

  // ===== 构建 arg 文件 =====
  const argsDir = path.join(os.tmpdir(), 'zenith-launcher-args');
  if (!fs.existsSync(argsDir)) {
    try { fs.mkdirSync(argsDir, { recursive: true }); } catch (_) {}
  }
  const argsFile = path.join(argsDir, `args_${versionId}_${Date.now()}.txt`);

  const toArgPath = (p) => (path.isAbsolute(p) ? p : path.resolve(launchDir, p)).replace(/\\/g, '/');

  const argFileLines = [];
  const maxMem = opts.maxMemory || configStore.get('memoryMax', 4096);
  const minMem = opts.minMemory || configStore.get('memoryMin', 512);
  argFileLines.push('-Xmx' + maxMem + 'M');
  argFileLines.push('-Xms' + minMem + 'M');

  const extraJvm = configStore.get('extraJvmArgs', '');
  if (extraJvm) {
    for (const a of extraJvm.trim().split(/\s+/).filter(Boolean)) argFileLines.push(a);
  }

  const javaMajorVer = opts.javaMajorVer || 0;
  if (javaMajorVer >= 9) argFileLines.push('--enable-native-access=ALL-UNNAMED');
  for (const flag of jvmFlags) argFileLines.push(flag);

  if (clientJar) argFileLines.push('-Dminecraft.client.jar=' + toArgPath(clientJar));
  argFileLines.push('-Dfml.ignoreInvalidMinecraftCertificates=true');
  argFileLines.push('-Dfml.ignorePatchDiscrepancies=true');
  argFileLines.push('-Dminecraft.launcher.brand=zenith-launcher');
  argFileLines.push('-Dminecraft.launcher.version=1.0');

  // 设置 fml.* 系统属性 —— 当使用 MODULE 模式（非 shim）且无 @file 时必需
  let forgeVersion = null;
  let mcVersion = null;
  if (versionId) {
    const fMatch = versionId.match(/^(\d+(?:\.\d+)*)-(?:forge|neoforge)-(\d+(?:\.\d+)*)$/);
    if (fMatch) {
      mcVersion = fMatch[1];
      forgeVersion = fMatch[2];
      argFileLines.push('-Dfml.mcVersion=' + mcVersion);
      if (isNeo) {
        argFileLines.push('-Dfml.neoForgeVersion=' + forgeVersion);
        argFileLines.push('-Dfml.neoVersion=' + forgeVersion);
      } else {
        argFileLines.push('-Dfml.forgeVersion=' + forgeVersion);
      }
      log('[Forge] 设置 fml.mcVersion=' + mcVersion + (isNeo ? ', fml.neoForgeVersion=' : ', fml.forgeVersion=') + forgeVersion);
    }
  }
  if (mcVersion && forgeVersion) argFileLines.push('-Dfml.mcpVersion=' + mcVersion + '-' + forgeVersion);

  for (const prop of systemProps) {
    if (prop.startsWith('-Dminecraft.client.jar=')) continue;
    if (prop.startsWith('-Dfml.ignoreInvalidMinecraft')) continue;
    argFileLines.push(prop);
  }

  if (cpJars.length > 0) {
    argFileLines.push('-cp');
    argFileLines.push(cpJars.map(toArgPath).join(sep));
  }
  if (mpJars.length > 0) {
    argFileLines.push('--module-path');
    argFileLines.push(mpJars.map(toArgPath).join(sep));
    argFileLines.push('--add-modules', 'ALL-MODULE-PATH');
    argFileLines.push('--module', mainModule);
  } else {
    // 纯 classpath 模式：使用 mainClass 直接启动
    const mainClass = versionJson.mainClass || 'net.minecraftforge.bootstrap.ForgeBootstrap';
    log(`[Forge] 使用 classpath 模式，主类: ${mainClass}`);
    argFileLines.push(mainClass);
  }

  // 游戏参数（--module 或 mainClass 之后的程序参数）
  const account = getActiveAccount();
  const username = (account && (account.username || account.userName)) || 'Player';
  const resolvedForAsset = resolveVersion(versionJson);
  const assetIndexId = (resolvedForAsset.assetIndex && resolvedForAsset.assetIndex.id) || versionId;
  const uuid = (account && account.uuid) || '00000000-0000-0000-0000-000000000000';
  const accessToken = (account && account.accessToken) || '0';
  const clientId = (account && account.clientId) || (crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-0000-0000-000000000000');

  argFileLines.push('--launchTarget', launchTarget);
  argFileLines.push('--username', username);
  argFileLines.push('--version', versionId);
  argFileLines.push('--gameDir', launchDir.replace(/\\/g, '/'));
  argFileLines.push('--assetsDir', path.join(launchDir, 'assets').replace(/\\/g, '/'));
  argFileLines.push('--assetIndex', assetIndexId);
  argFileLines.push('--uuid', uuid);
  argFileLines.push('--accessToken', accessToken);
  argFileLines.push('--clientId', clientId);
  argFileLines.push('--xuid', (account && account.xuid) || '0');
  argFileLines.push('--versionType', 'release');
  argFileLines.push('--modsDir', path.join(launchDir, 'mods').replace(/\\/g, '/'));

  if (opts.width && opts.height) argFileLines.push('--width', String(opts.width), '--height', String(opts.height));
  if (opts.serverIp) argFileLines.push('--server', opts.serverIp);

  const extraGame = opts.extraGameArgs || configStore.get('extraGameArgs', '');
  if (extraGame) {
    for (const a of extraGame.trim().split(/\s+/).filter(Boolean)) argFileLines.push(a);
  }

  try {
    fs.writeFileSync(argsFile, argFileLines.join('\n'), 'utf8');
    log(`[Forge] 已写入启动参数文件: ${argsFile} (${argFileLines.length} 行)`);
  } catch (e) {
    log(`[Forge] 写入参数文件失败: ${e.message}`, 'warning');
    const fallbackCmd = [];
    const wrapper = configStore.get('javaWrapper', '');
    if (wrapper && wrapper.trim()) fallbackCmd.push(...wrapper.trim().split(/\s+/));
    fallbackCmd.push(javaPath);
    fallbackCmd.push(...argFileLines);
    return fallbackCmd;
  }

  // ===== 构建最终命令：Java 路径 + @argfile =====
  const cmd = [];
  const wrapper = configStore.get('javaWrapper', '');
  if (wrapper && wrapper.trim()) cmd.push(...wrapper.trim().split(/\s+/));
  cmd.push(javaPath);
  cmd.push('@' + toArgPath(argsFile));

  log(`[Forge] 命令已构建，共 ${cmd.length} 个参数`);
  return cmd;
}

// 第七部分：versePc 风格启动参数构建（核心）
// ======================================================================

function buildLaunchArgs(versionJson, account, javaPath, opts) {
  const gameRoot = versionManager.getMinecraftDir();
  const assetsRoot = versionManager.getAssetsDir();
  const nativesDir = versionManager.getNativesDir(versionJson.id);
  const librariesDir = versionManager.getLibrariesDir();
  const versionsDir = versionManager.getVersionsDir();
  const features = { is_demo_user: false, has_custom_resolution: !!(opts.width && opts.height) };

  const resolved = resolveVersion(versionJson);
  const cpList = buildClasspath(resolved, librariesDir, versionsDir);
  const cpStr = cpList.join(classpathSeparator());
  const tokens = buildTokens(resolved, account, gameRoot, assetsRoot, nativesDir, cpStr, opts);

  const maxMem = opts.maxMemory || configStore.get('memoryMax', 4096);
  const minMem = opts.minMemory || configStore.get('memoryMin', 512);
  const mainClass = resolved.mainClass || 'net.minecraft.client.main.Main';
  const loader = detectLoader(mainClass, resolved.libraries, resolved.arguments && resolved.arguments.game);

  let modCount = 0;
  try {
    const modsDir = path.join(gameRoot, 'mods');
    if (fs.existsSync(modsDir)) {
      modCount = fs.readdirSync(modsDir).filter(f => f.endsWith('.jar') && !f.endsWith('.jar.disabled')).length;
    }
  } catch (_) {}

  const javaMajorVer = opts.javaMajorVer || 0;

  const jvmArgs = [];

  // 内存
  jvmArgs.push('-Xmx' + maxMem + 'M', '-Xms' + minMem + 'M');

  // 基础安全
  jvmArgs.push(
    '-Dfile.encoding=UTF-8',
    '-Djava.rmi.server.useCodebaseOnly=true',
    '-Dcom.sun.jndi.rmi.object.trustURLCodebase=false',
    '-Dcom.sun.jndi.cosnaming.object.trustURLCodebase=false',
  );

  if (!jvmArgs.some(a => a.includes('log4j2.formatMsgNoLookups'))) {
    jvmArgs.push('-Dlog4j2.formatMsgNoLookups=true');
  }

  jvmArgs.push('-Dminecraft.launcher.brand=Zenith', '-Dminecraft.launcher.version=0.1.0');

  // GC 选择
  const hasVersionGc = (() => {
    const srcs = [];
    if (resolved.arguments && resolved.arguments.jvm) srcs.push(...resolved.arguments.jvm);
    if (resolved.arguments && resolved.arguments['default-user-jvm']) srcs.push(...resolved.arguments['default-user-jvm']);
    const flat = srcs.map(e => typeof e === 'string' ? e : (e && e.value !== undefined ? (Array.isArray(e.value) ? e.value.join(' ') : String(e.value)) : '')).join(' ');
    return /Use\w+GC/.test(flat);
  })();

  if (!hasVersionGc) {
    const gcArgs = buildGcArgs(maxMem, javaMajorVer, modCount);
    for (const a of gcArgs) {
      if (!jvmArgs.some(e => e.startsWith(a.split('=')[0]))) jvmArgs.push(a);
    }
  }

  jvmArgs.push('-XX:+UnlockExperimentalVMOptions', '-XX:+IgnoreUnrecognizedVMOptions');

  // Forge 特殊参数
  if (loader === 'forge' || loader === 'neoforge') {
    if (!jvmArgs.some(a => a.includes('fml.ignoreInvalidMinecraftCertificates'))) {
      jvmArgs.push('-Dfml.ignoreInvalidMinecraftCertificates=true');
    }
    if (!jvmArgs.some(a => a.includes('fml.ignorePatchDiscrepancies'))) {
      jvmArgs.push('-Dfml.ignorePatchDiscrepancies=true');
    }
    // 关键修复：设置 fml 版本系统属性，避免 ModLauncher 的 TypesafeMap.putIfAbsent(null) NPE
    const verId = resolved.id || '';
    const verMatch = verId.match(/^(\d+(?:\.\d+)*)-(?:forge|neoforge)-(\d+(?:\.\d+)*)$/);
    if (verMatch) {
      const mcVer = verMatch[1];
      const forgeVer = verMatch[2];
      if (!jvmArgs.some(a => a.includes('fml.mcVersion='))) {
        jvmArgs.push('-Dfml.mcVersion=' + mcVer);
      }
      if (loader === 'neoforge') {
        if (!jvmArgs.some(a => a.includes('fml.neoForgeVersion='))) {
          jvmArgs.push('-Dfml.neoForgeVersion=' + forgeVer);
          jvmArgs.push('-Dfml.neoVersion=' + forgeVer);
        }
      } else {
        if (!jvmArgs.some(a => a.includes('fml.forgeVersion='))) {
          jvmArgs.push('-Dfml.forgeVersion=' + forgeVer);
        }
      }
      if (!jvmArgs.some(a => a.includes('fml.mcpVersion='))) {
        jvmArgs.push('-Dfml.mcpVersion=' + mcVer + '-' + forgeVer);
      }
    }
    if (!jvmArgs.some(a => a.includes('forge.logging.console.level'))) {
      jvmArgs.push('-Dforge.logging.console.level=debug');
    }
    if (!jvmArgs.some(a => a.includes('forge.enableLoginPrompt'))) {
      jvmArgs.push('-Dforge.enableLoginPrompt=false');
    }
    if (!jvmArgs.some(a => a.includes('minecraft.client.jar'))) {
      const clientJar = path.join(versionsDir, resolved.id, resolved.id + '.jar');
      if (fs.existsSync(clientJar)) {
        jvmArgs.push('-Dminecraft.client.jar=' + clientJar);
      }
    }
  }

  if (loader === 'neoforge') {
    if (!jvmArgs.some(a => a.includes('fml.earlyprogresswindow'))) {
      jvmArgs.push('-Dfml.earlyprogresswindow=false');
    }
  }

  // JPMS flags
  if (loader === 'forge' || loader === 'neoforge') {
    addJpmsFlagsIfMissing(jvmArgs);
  }

  // Java 9+ 启用原生访问
  if (javaMajorVer >= 9) {
    if (!jvmArgs.some(a => a && a.startsWith('--enable-native-access'))) {
      jvmArgs.push('--enable-native-access=ALL-UNNAMED');
    }
  }

  // 离线 API
  if (account.type === 'offline' || !account.accessToken || account.accessToken === '0') {
    if (!jvmArgs.some(a => a.includes('minecraft.api.auth=off'))) {
      jvmArgs.push('-Dminecraft.api.auth=off', '-Dminecraft.api.env=local');
    }
  }

  // 处理 version.json 中的 JVM 参数
  const jvmSrcs = [];
  if (resolved.arguments && resolved.arguments.jvm) jvmSrcs.push(...resolved.arguments.jvm);
  if (resolved.arguments && resolved.arguments['default-user-jvm']) jvmSrcs.push(...resolved.arguments['default-user-jvm']);

  for (let i = 0; i < jvmSrcs.length; i++) {
    const arg = jvmSrcs[i];
    if (typeof arg === 'string') {
      const replaced = replaceTokens(arg, tokens);
      if (replaced === '-cp' || replaced === '-classpath') continue;
      if (i > 0 && typeof jvmSrcs[i - 1] === 'string' && replaceTokens(jvmSrcs[i - 1], tokens) === '-cp') continue;
      if (replaced.includes('--enable-native-access')) continue;
      if (replaced.startsWith('-Xmx') || replaced.startsWith('-Xms')) {
        if (!jvmArgs.some(e => e.startsWith(replaced.substring(0, 4)))) jvmArgs.push(replaced);
      } else if (/^-XX:\+Use/.test(replaced) || /^-XX:-Use/.test(replaced)) {
        if (!hasGcArg(jvmArgs)) jvmArgs.push(replaced);
      } else if (!jvmArgs.some(e => e === replaced)) {
        jvmArgs.push(replaced);
      }
    } else if (arg && arg.value !== undefined) {
      const rulesMatch = !arg.rules || evaluateRules(arg.rules, features);
      if (!rulesMatch) continue;
      const values = Array.isArray(arg.value) ? arg.value : [arg.value];
      for (const v of values) {
        const replaced = replaceTokens(String(v), tokens);
        if (replaced.includes('--enable-native-access')) continue;
        if (replaced.startsWith('-Xmx') || replaced.startsWith('-Xms')) {
          if (!jvmArgs.some(e => e.startsWith(replaced.substring(0, 4)))) jvmArgs.push(replaced);
        } else if (/^-XX:\+Use/.test(replaced) || /^-XX:-Use/.test(replaced)) {
          if (!hasGcArg(jvmArgs)) jvmArgs.push(replaced);
        } else if (!jvmArgs.some(e => e === replaced)) {
          jvmArgs.push(replaced);
        }
      }
    }
  }

  // authlib-injector
  if (account.type === 'authlib' && account.serverUrl) {
    const aiDir = path.join(versionManager.getMinecraftDir(), '..', 'authlib-injector');
    const aiFiles = fs.existsSync(aiDir) ? fs.readdirSync(aiDir).filter(f => f.endsWith('.jar')).sort() : [];
    if (aiFiles.length > 0) {
      const aiJar = path.join(aiDir, aiFiles[aiFiles.length - 1]);
      let serverUrl = account.serverUrl.replace(/@@@.*$/, '').replace(/@@.*$/, '');
      if (!jvmArgs.some(a => a.includes('-javaagent'))) {
        jvmArgs.unshift('-javaagent:' + aiJar + '=' + serverUrl);
      }
    }
  }

  // library path
  if (!jvmArgs.some(a => a.includes('java.library.path'))) {
    jvmArgs.push('-Djava.library.path=' + nativesDir);
  }

  // 用户自定义 JVM 参数
  const extraJvm = opts.extraJvmArgs || configStore.get('extraJvmArgs', '');
  if (extraJvm) {
    const userArgs = extraJvm.trim().split(/\s+/).filter(Boolean);
    for (const ua of userArgs) {
      const baseArg = ua.split('=')[0];
      const hasConflict = jvmArgs.some(existing => existing.startsWith(baseArg));
      if (/^-XX:\+Use/.test(ua) || /^-XX:-Use/.test(ua)) {
        if (!hasGcArg(jvmArgs)) jvmArgs.push(ua);
      } else if (!hasConflict) {
        jvmArgs.push(ua);
      }
    }
  }

  // Logging config
  if (resolved.logging && resolved.logging.client && resolved.logging.client.argument && resolved.logging.client.file && resolved.logging.client.file.id) {
    const logConfigPath = path.join(versionsDir, resolved.id, resolved.logging.client.file.id);
    if (fs.existsSync(logConfigPath)) {
      const logArg = resolved.logging.client.argument.replace(/\$\{path\}/g, logConfigPath);
      if (!jvmArgs.some(a => a.includes('log4j') || a.includes('Log4j'))) {
        jvmArgs.push(logArg);
      }
    }
  }

  // CDS
  const cdsDir = path.join(versionManager.getMinecraftDir(), '..', 'cds');
  const cdsArchive = path.join(cdsDir, resolved.id + '.jsa');
  if (javaMajorVer >= 8 && !jvmArgs.some(a => a.includes('SharedArchiveFile'))) {
    if (fs.existsSync(cdsArchive)) {
      try {
        if (fs.statSync(cdsArchive).size > 1024) {
          jvmArgs.push('-Xshare:on', '-XX:SharedArchiveFile=' + cdsArchive);
        }
      } catch (_) {}
    }
  }

  // Classpath + MainClass
  jvmArgs.push('-cp', cpStr);
  jvmArgs.push(mainClass);

  // 游戏参数
  const gameArgs = [];

  const gameSrcs = [];
  if (resolved.arguments && resolved.arguments.game) gameSrcs.push(...resolved.arguments.game);
  if (resolved.arguments && resolved.arguments['default-user-game']) gameSrcs.push(...resolved.arguments['default-user-game']);

  if (gameSrcs.length > 0) {
    for (const arg of gameSrcs) {
      if (typeof arg === 'string') {
        gameArgs.push(replaceTokens(arg, tokens));
      } else if (arg && arg.value !== undefined) {
        const rulesMatch = !arg.rules || evaluateRules(arg.rules, features);
        if (rulesMatch) {
          if (typeof arg.value === 'string') {
            gameArgs.push(replaceTokens(arg.value, tokens));
          } else if (Array.isArray(arg.value)) {
            gameArgs.push(...arg.value.map(v => replaceTokens(String(v), tokens)));
          }
        }
      }
    }
  } else if (resolved.minecraftArguments) {
    const parts = resolved.minecraftArguments.split(/\s+/).filter(Boolean);
    for (const p of parts) gameArgs.push(replaceTokens(p, tokens));
  }

  // 注入/覆盖参数
  const isForgeLoader = (resolved.id || '').includes('forge');

  const injectMap = {
    '--launchTarget': 'minecraft',
    '--gameDir': gameRoot,
    '--assetsDir': assetsRoot,
    '--modsDir': path.join(gameRoot, 'mods'),
    '--version': resolved.id,
  };

  for (const [flag, val] of Object.entries(injectMap)) {
    if (flag === '--launchTarget' && isForgeLoader) continue;
    const idx = gameArgs.indexOf(flag);
    if (idx >= 0 && idx + 1 < gameArgs.length) {
      const next = gameArgs[idx + 1];
      if (!next || next.startsWith('-') || next.trim() === '') {
        gameArgs[idx + 1] = val;
      }
    } else if (idx < 0) {
      gameArgs.push(flag, val);
    }
  }

  if (opts.width && opts.height) {
    if (!gameArgs.some(a => a === '--width')) gameArgs.push('--width', String(opts.width));
    if (!gameArgs.some(a => a === '--height')) gameArgs.push('--height', String(opts.height));
  }

  if (opts.fullscreen) {
    if (!gameArgs.some(a => a === '--fullscreen')) gameArgs.push('--fullscreen');
  }

  if (opts.serverIp) {
    if (!gameArgs.some(a => a === '--server')) gameArgs.push('--server', opts.serverIp);
  }

  const extraGame = opts.extraGameArgs || configStore.get('extraGameArgs', '');
  if (extraGame) {
    gameArgs.push(...extraGame.trim().split(/\s+/).filter(Boolean));
  }

  const deduped = [];
  const seenSet = new Set();
  for (const g of gameArgs) {
    if (!seenSet.has(g)) { deduped.push(g); seenSet.add(g); }
  }

  return [...jvmArgs, ...deduped];
}

// ======================================================================
// 第八部分：Manifest JAR 回退
// ======================================================================

function tryManifestJarFallback(javaPath, fullArgs, mainClass) {
  const cpIdx = fullArgs.indexOf('-cp');
  if (cpIdx === -1 || cpIdx + 1 >= fullArgs.length) return null;

  const cpStr = fullArgs[cpIdx + 1];
  const jvmPart = fullArgs.slice(0, cpIdx);
  const mcIdx = fullArgs.indexOf(mainClass);

  let mainPart = [];
  let gamePart = [];
  if (mcIdx > cpIdx + 1) {
    mainPart = fullArgs.slice(cpIdx + 2, mcIdx);
    gamePart = fullArgs.slice(mcIdx + 1);
  } else {
    mainPart = fullArgs.slice(cpIdx + 2);
  }

  const cleanJvm = jvmPart.filter(a => !a.startsWith('@'));

  const tmpDir = path.join(os.tmpdir(), 'zenith-launch');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const wrapperJar = path.join(tmpDir, `launcher-${Date.now()}.jar`);

  try {
    const cpEntries = cpStr.split(';');
    const manifestCp = cpEntries.map(p => {
      let encoded = p.replace(/\\/g, '/');
      return encoded.replace(/%/g, '%25').replace(/ /g, '%20');
    }).join(' ');

    let manifest = 'Manifest-Version: 1.0\r\n';
    manifest += `Main-Class: ${mainClass}\r\n`;

    const cpLine = `Class-Path: ${manifestCp}`;
    let formatted = '';
    for (let i = 0; i < cpLine.length; i++) {
      if (i > 0 && i % 71 === 0) formatted += '\r\n ';
      formatted += cpLine[i];
    }
    manifest += formatted + '\r\n\r\n';

    const metaDir = path.join(tmpDir, 'META-INF');
    ensureDir(metaDir);
    fs.writeFileSync(path.join(metaDir, 'MANIFEST.MF'), manifest);

    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    zip.addLocalFile(path.join(metaDir, 'MANIFEST.MF'), 'META-INF');
    zip.writeZip(wrapperJar);

    const result = [...cleanJvm, '-jar', wrapperJar, ...gamePart];

    return { args: result, cleanup: () => { try { fs.unlinkSync(wrapperJar); } catch (_) {} try { fs.rmSync(metaDir, { recursive: true, force: true }); } catch (_) {} } };
  } catch (_) {
    try { fs.unlinkSync(wrapperJar); } catch (__) {}
    return null;
  }
}

// ======================================================================
// 第九部分：主启动函数
// ======================================================================

async function launch(options = {}, onLog) {
  if (launchState.running) throw new Error('游戏已在运行中');

  cancelRequested = false;
  launchState = { running: true, versionId: null, status: 'preparing', logs: [] };
  // 持久化保存回调，用于在进程异步退出事件（exit/close）中通知前端
  currentOnLogCallback = typeof onLog === 'function' ? onLog : null;
  let launchPid = null;
  // 启动器日志文件（持久化保存所有启动日志）
  let launcherLogStream = null;
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, 'launcher-' + new Date().toISOString().slice(0, 10) + '.log');
    launcherLogStream = fs.createWriteStream(logFile, { flags: 'a' });
    launcherLogStream.write('\n[' + new Date().toISOString() + '] === Zenith Launcher 启动 ===\n');
  } catch (_) {}

  const log = (msg, level) => {
    const ts = '[' + new Date().toLocaleTimeString() + '] ' + msg;
    launchState.logs.push(ts);
    if (launchState.logs.length > 1000) launchState.logs.shift();
    // 写入持久化日志文件
    if (launcherLogStream) {
      try { launcherLogStream.write('[' + new Date().toISOString() + '] [' + (level || 'info') + '] ' + msg + '\n'); } catch (_) {}
    }
    if (onLog) onLog({
      message: msg,
      level: level || 'info',
      running: launchState.running,
      versionId: launchState.versionId,
      pid: launchPid,
      exited: launchState.status === 'exited' || launchState.status === 'closed' || launchState.status === 'crashed'
    });
    console.log('[Launch] ' + msg);
  };
  const checkCancel = () => { if (cancelRequested) { log('启动已被取消', 'warning'); throw new Error('启动已取消'); } };

  try {
    log('正在启动 Minecraft...');

    const gameRoot = versionManager.getMinecraftDir();
    if (!gameRoot || gameRoot.trim() === '') throw new Error('Minecraft 目录为空');
    if (!fs.existsSync(gameRoot)) throw new Error('Minecraft 目录不存在: ' + gameRoot);
    if (gameRoot.includes('!') || gameRoot.includes(';')) throw new Error('Minecraft 目录不可包含 ! 或 ;');

    const versionId = options.versionId || configStore.get('selectedVersion');
    if (!versionId) throw new Error('未选择游戏版本');
    log('版本: ' + versionId);

    let versionJson;
    try { versionJson = versionManager.getVersionJson(versionId); }
    catch (e) { throw new Error('无法读取版本信息: ' + e.message); }
    checkCancel();

    const account = getActiveAccount();
    if (!account) throw new Error('请先登录账号');

    // 微软账号 token 过期自动刷新
    if (account.type === 'microsoft' && account.expiresAt && account.expiresAt < Date.now()) {
      if (account.refreshToken) {
        log('微软 token 已过期，正在刷新...');
        try {
          const refreshed = await microsoftAuth.refreshToken(account.refreshToken);
          if (refreshed && refreshed.accessToken) {
            // refreshToken 返回新账号对象，替换当前 account
            account.accessToken = refreshed.accessToken;
            account.expiresAt = refreshed.expiresAt;
            if (refreshed.refreshToken) account.refreshToken = refreshed.refreshToken;
            log('微软 token 刷新成功');
          }
        } catch (e) {
          log('微软 token 刷新失败: ' + e.message, 'error');
          throw new Error('微软账号登录已过期，请重新登录');
        }
      } else {
        throw new Error('微软账号登录已过期，请重新登录');
      }
    }

    log('账号: ' + (account.username || account.userName || 'Unknown') + ' (' + account.type + ')');
    checkCancel();

    let javaPath = configStore.get('javaPath', '');
    const autoSelect = configStore.get('autoSelectJava', true);
    if (javaPath && !fs.existsSync(javaPath)) { log('Java 路径无效: ' + javaPath, 'warning'); javaPath = ''; }

    if (autoSelect || !javaPath) {
      const result = await javaDetector.selectBestJavaForVersion(versionJson, { allowDownload: true });
      if (result.success && result.path) {
        javaPath = result.path;
        log('Java ' + result.majorVersion + ': ' + javaPath);
        if (result.warning) log('警告: ' + result.warning, 'warning');
      } else {
        const target = result.recommendedVersion || 17;
        log('未找到 Java，尝试下载 Java ' + target + '...');
        const { downloadAndInstallJava } = require('./javaDownloader');
        const dl = await downloadAndInstallJava(versionJson.id || versionId, (p) => {
          if (p.stage && p.percent !== undefined) log('[下载] ' + p.stage + ': ' + p.percent + '%');
        });
        if (!dl.success || !dl.path) throw new Error('Java ' + target + ' 下载失败: ' + (dl.message || '未知错误'));
        javaPath = dl.path;
        log('Java ' + dl.version + ' 下载完成: ' + javaPath);
        if (!autoSelect) { configStore.set('javaPath', javaPath); log('已保存 Java 路径'); }
      }
    } else {
      log('手动 Java: ' + javaPath);
    }

    // 检测 Java 主版本（在替换 javaw.exe 之前，用 java.exe 检测）
    let javaMajorVer = 0;
    try {
      const versionOut = execSync(`"${javaPath}" -version 2>&1`).toString();
      const verMatch = versionOut.match(/version\s+"?(\d+)(?:\.(\d+))?/);
      if (verMatch) {
        let major = parseInt(verMatch[1]);
        if (major === 1 && verMatch[2]) {
          major = parseInt(verMatch[2]);
        }
        javaMajorVer = major;
      }
    } catch (_) {}
    log('Java 主版本: ' + javaMajorVer);
    options.javaMajorVer = javaMajorVer;

    // Windows: 优先使用 javaw.exe
    if (process.platform === 'win32' && !javaPath.endsWith('javaw.exe')) {
      const javawPath = javaPath.replace('java.exe', 'javaw.exe');
      if (fs.existsSync(javawPath)) javaPath = javawPath;
    }
    checkCancel();

    // 检查客户端 JAR 是否存在（Fabric/Forge 依赖此文件），缺失时尝试自动下载
    const clientJarPath = locateMinecraftClientJar(gameRoot, resolveVersion(versionJson));
    if (!clientJarPath) {
      log('警告: 未找到 Minecraft 客户端 JAR，尝试自动下载...', 'warning');
      try {
        const { checkAndDownloadMissing } = require('../download/manager');
        await checkAndDownloadMissing(versionId, (p) => {
          if (p.stageText) log('[下载] ' + p.stageText);
          if (p.percent !== undefined) log('[下载] ' + (p.stageText || '') + ': ' + p.percent + '%');
        });
        log('客户端文件下载完成');
      } catch (e) {
        log('客户端文件下载失败: ' + e.message, 'error');
        // 不阻止启动，让 Java 自行报错
      }

      // 关键修复：再次验证 JAR 是否真的被下载了
      // checkAndDownloadMissing 现在会在父版本 JSON 缺失时自动下载它，
      // 但首次调用可能因网络问题失败，这里提供一个重试机会
      const retryJarPath = locateMinecraftClientJar(gameRoot, resolveVersion(versionJson));
      if (!retryJarPath && versionJson.inheritsFrom) {
        log('再次尝试: 重新检查缺失的客户端 JAR...', 'warning');
        try {
          const retryResult = await checkAndDownloadMissing(versionId, (p) => {
            if (p.stageText) log('[下载] ' + p.stageText);
            if (p.percent !== undefined) log('[下载] ' + (p.stageText || '') + ': ' + p.percent + '%');
          });
          if (retryResult && retryResult.clientJar) {
            log('客户端 JAR 下载成功: ' + retryResult.clientJar);
          } else {
            log('客户端 JAR 仍然缺失，启动可能失败', 'warning');
          }
        } catch (e2) {
          log('客户端 JAR 重试下载失败: ' + e2.message, 'error');
        }
      }
    }

    const assetsRoot = versionManager.getAssetsDir();
    const nativesDir = versionManager.getNativesDir(versionId);
    const librariesDir = versionManager.getLibrariesDir();

    log('解压原生库...');
    extractNatives(versionJson, librariesDir, nativesDir);
    const nativeFiles = fs.existsSync(nativesDir) ? fs.readdirSync(nativesDir) : [];
    log('Natives: ' + nativeFiles.length + ' 个文件');
    checkCancel();

    log('构建启动参数...');
    let cmd;

    const forgeFiles = findForgeArgsFiles(gameRoot, versionId, versionJson);
    const isForge = forgeFiles !== null || isForgeVersion(versionJson);
    if (isForge) {
      log('检测到 Forge/NeoForge 版本，启动 Forge 模式: ' + versionId);
      if (forgeFiles && forgeFiles.files && forgeFiles.files.length > 0) {
        for (const f of forgeFiles.files) {
          log(`  → 参数文件 (${f.type}): ${f.path}`);
        }
      } else {
        log('  → 未找到 @-files 参数文件，使用 version.json 库列表');
      }
      const effectiveForgeFiles = forgeFiles || { files: [], baseOrg: 'net/minecraftforge/forge', baseVer: '', isNeo: false };
      cmd = buildForgeModLauncherCmd(javaPath, effectiveForgeFiles, options, gameRoot, versionJson, log);
    } else {
      log('使用标准启动模式');
      const args = buildLaunchArgs(versionJson, account, javaPath, options);
      const mainClass = (resolveVersion(versionJson).mainClass || 'net.minecraft.client.main.Main');
      const totalLen = args.reduce((s, a) => s + a.length + 3, javaPath.length + 3);

      if (totalLen > 25000) {
        log('命令行过长 (' + totalLen + ' 字符)，尝试 Manifest JAR 模式...');
        const fallback = tryManifestJarFallback(javaPath, args, mainClass);
        if (fallback) {
          log('使用 Manifest JAR 启动');
          cmd = [javaPath, ...fallback.args];
        } else {
          log('Manifest JAR 回退失败，使用直接模式', 'warning');
          cmd = [javaPath, ...args];
        }
      } else {
        cmd = [javaPath, ...args];
      }
    }
    checkCancel();

    // ===== 调试增强：把完整启动命令和所有日志保存到文件 =====
    const debugLogDir = path.join(require('os').homedir(), 'zenith-logs');
    try { if (!fs.existsSync(debugLogDir)) fs.mkdirSync(debugLogDir, { recursive: true }); } catch (_) {}
    const debugLogFile = path.join(debugLogDir, 'minecraft-launch-' + Date.now() + '.log');
    const debugBatFile = path.join(debugLogDir, 'minecraft-launch-' + Date.now() + '.bat');

    // 把完整命令写入 .bat 文件（方便手动运行调试）
    try {
      const quotedCmd = cmd.map(c => {
        if (/[\s"]/.test(c)) return '"' + c.replace(/"/g, '""') + '"';
        return c;
      });
      const batContent = '@echo off\r\nchcp 65001 >nul\r\ncd /d "' + gameRoot.replace(/\//g, '\\') + '"\r\n' +
        quotedCmd.join(' ') + '\r\npause\r\n';
      fs.writeFileSync(debugBatFile, batContent, 'utf8');
      log('调试脚本已保存: ' + debugBatFile);
    } catch(e) {
      log('保存调试脚本失败: ' + e.message, 'warning');
    }

    // 把启动命令和所有 Java 输出写入日志文件
    let logFileHandle = null;
    try {
      logFileHandle = fs.openSync(debugLogFile, 'w');
      fs.writeSync(logFileHandle, '=== Zenith Minecraft Launcher ===\r\n');
      fs.writeSync(logFileHandle, '时间: ' + new Date().toLocaleString() + '\r\n');
      fs.writeSync(logFileHandle, '游戏目录: ' + gameRoot + '\r\n');
      fs.writeSync(logFileHandle, 'Java 路径: ' + cmd[0] + '\r\n');
      fs.writeSync(logFileHandle, '\r\n=== 完整启动命令 ===\r\n');
      for (let i = 0; i < cmd.length; i++) {
        fs.writeSync(logFileHandle, '[' + i + '] ' + cmd[i] + '\r\n');
      }
      fs.writeSync(logFileHandle, '\r\n=== Java 进程输出 (stdout + stderr) ===\r\n');
      log('完整日志文件已保存: ' + debugLogFile);
    } catch(e) {
      log('创建日志文件失败: ' + e.message, 'warning');
      logFileHandle = null;
    }

    log('启动命令: ' + cmd.join(' '), 'debug');
    const cmdLen = cmd.join(' ').length;
    log('命令总长度: ' + cmdLen + ' 字符', 'debug');
    if (cmdLen > 30000) {
      log('警告: 命令行过长(' + cmdLen + '字符)，可能触发 Windows 限制', 'warning');
    }
    log('启动 Java 进程...');

    let spawnError = null;
    launchProcess = spawn(cmd[0], cmd.slice(1), {
      cwd: gameRoot,
      windowsHide: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    launchProcess.on('error', (err) => {
      spawnError = err;
      log('进程创建失败: ' + err.message, 'error');
      if (logFileHandle) { try { fs.writeSync(logFileHandle, 'SPAWN ERROR: ' + err.message + '\r\n'); } catch(_){} }
    });

    const pendingOut = [];
    const pendingErr = [];
    const decodeJava = (buf) => {
      try { return buf.toString('utf8'); } catch (_) {
        try { return buf.toString('latin1'); } catch (_2) { return buf.toString('binary'); }
      }
    };
    const writeToLogFile = (prefix, text) => {
      if (!logFileHandle) return;
      try {
        for (const line of text.split('\n').filter(Boolean)) {
          fs.writeSync(logFileHandle, prefix + line + '\r\n');
        }
      } catch(_) {}
    };

    const earlyPromise = new Promise(resolve => {
      const timer = setTimeout(() => {
        if (!spawnError) resolve(null);
        else resolve({ code: -1, signal: null });
      }, 5000);  // 5秒确认启动
      launchProcess.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
    });
    launchProcess.stdout.on('data', d => {
      try {
        const lines = decodeJava(d).split('\n').filter(Boolean);
        pendingOut.push(...lines);
        for (const l of lines) writeToLogFile('[STDOUT] ', l);
      } catch (_) {}
    });
    launchProcess.stderr.on('data', d => {
      try {
        const lines = decodeJava(d).split('\n').filter(Boolean);
        pendingErr.push(...lines);
        for (const l of lines) writeToLogFile('[STDERR] ', l);
      } catch (_) {}
    });

    if (spawnError) {
      throw new Error('无法启动 Java 进程: ' + spawnError.message + '\n请检查 Java 路径: ' + cmd[0]);
    }

    const earlyExit = await earlyPromise;

    if (spawnError) {
      throw new Error('无法启动 Java 进程: ' + spawnError.message + '\n请检查 Java 路径: ' + cmd[0]);
    }

    const closeLogFile = (extraMsg) => {
      if (logFileHandle) {
        try {
          if (extraMsg) fs.writeSync(logFileHandle, '\r\n' + extraMsg + '\r\n');
          fs.closeSync(logFileHandle);
        } catch(_) {}
        logFileHandle = null;
        log('日志已保存至: ' + debugLogFile);
      }
    };

    if (earlyExit) {
      if (earlyExit.code === 0) {
        log('进程已退出（退出码: 0）', 'info');
        closeLogFile('进程正常退出 (exit code 0)');
        launchState = { running: false, versionId, status: 'exited', logs: launchState.logs };
        return { success: true, pid: null, versionId, earlyExit: true };
      }
      closeLogFile('进程异常退出 (exit code ' + earlyExit.code + ')');
      const allLogs = [...pendingOut, ...pendingErr];
      // 提前更新 launchState，让 log 回调发送正确的状态
      launchState = { running: false, versionId, status: 'crashed', logs: launchState.logs };
      log('进程启动失败（退出码: ' + earlyExit.code + '）', 'error');
      log('完整日志已保存至: ' + debugLogFile, 'error');
      log('调试脚本已保存至: ' + debugBatFile, 'error');
      log('=== 完整日志开始 ===', 'error');
      for (const l of allLogs) log(l, 'error');
      log('=== 完整日志结束 ===', 'error');
      throw new Error('Java 进程异常退出，退出码: ' + earlyExit.code);
    }

    log('游戏已启动');
    launchState = { running: true, versionId, status: 'running', logs: launchState.logs };
    launchPid = launchProcess.pid;
    // 发送状态到渲染层
    if (onLog) onLog({
      message: '游戏进程已启动',
      level: 'info',
      running: true,
      pid: launchPid,
      versionId,
      exited: false
    });

    setTimeout(() => {
      for (const l of pendingOut) log(l);
      for (const l of pendingErr) log(l);
    }, 100);

    launchProcess.on('exit', (code) => {
      launchProcess = null;
      launchState = { running: false, versionId, status: code === 0 ? 'exited' : 'crashed', logs: launchState.logs };
      log('游戏进程退出，退出码: ' + code, code === 0 ? 'info' : 'error');
      closeLogFile('进程退出 (exit code ' + code + ')');
      // 向前端发送进程退出通知，使停止按钮能正确变回启动游戏按钮
      if (currentOnLogCallback) {
        try {
          currentOnLogCallback({
            message: '游戏进程已退出（退出码: ' + code + '）',
            level: code === 0 ? 'info' : 'error',
            running: false,
            pid: null,
            versionId,
            exited: true,
            exitCode: code
          });
        } catch (_) { /* 忽略回调异常 */ }
      }
    });

    launchProcess.on('close', () => {
      launchProcess = null;
      if (launchState.running) {
        launchState = { running: false, versionId, status: 'closed', logs: launchState.logs };
        // 兜底：若 exit 事件未触发，此处也向前端发送退出通知
        if (currentOnLogCallback) {
          try {
            currentOnLogCallback({
              message: '游戏进程已关闭',
              level: 'info',
              running: false,
              pid: null,
              versionId,
              exited: true
            });
          } catch (_) {}
        }
      }
    });

    return { success: true, pid: launchPid, versionId };

  } catch (err) {
    if (launcherLogStream) { try { launcherLogStream.end(); } catch (_) {} launcherLogStream = null; }
    if (logFileHandle) {
      try {
        fs.writeSync(logFileHandle, '\r\n=== ERROR ===\r\n' + err.message + '\r\n');
        fs.closeSync(logFileHandle);
      } catch(_) {}
      logFileHandle = null;
    }
    launchProcess = null;
    launchState = { running: false, versionId: null, status: 'error', logs: launchState.logs };
    log('启动失败: ' + err.message, 'error');
    if (debugLogFile) log('完整日志已保存至: ' + debugLogFile, 'error');
    if (debugBatFile) log('调试脚本已保存至: ' + debugBatFile, 'error');
    throw err;
  }
}

function cancel() {
  cancelRequested = true;
  const stoppedVersionId = launchState && launchState.versionId;
  // 重置启动状态，避免"游戏已在运行中"的错误
  launchState = { running: false, versionId: null, status: 'cancelled', logs: launchState.logs };
  if (launchProcess) {
    try {
      // Windows 不支持 SIGTERM，使用无参数 kill() 会自动适配平台
      if (process.platform === 'win32') {
        launchProcess.kill(); // 在 Windows 上使用 TerminateProcess
      } else {
        launchProcess.kill('SIGTERM'); // 在 POSIX 系统上使用 SIGTERM
      }
    } catch (_) {}
    // 不再手动将 launchProcess 设为 null，让 exit/close 事件自然触发，
    // 这样前端能收到进程退出通知；同时主动向前端发送一次取消通知以快速响应
    if (currentOnLogCallback) {
      try {
        currentOnLogCallback({
          message: '已请求停止游戏',
          level: 'info',
          running: false,
          pid: null,
          versionId: stoppedVersionId,
          exited: true
        });
      } catch (_) {}
    }
  }
}

// stop() 是 cancel() 的别名，方便 main.js 统一调用
function stop() {
  cancel();
}

function getState() {
  return { ...launchState };
}

module.exports = {
  launch,
  cancel,
  stop,
  getState,
};
