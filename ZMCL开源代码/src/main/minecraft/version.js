const fs = require('fs');
const path = require('path');
const configStore = require('../config/store');

function ensureDir(dirPath) {
  if (!dirPath) return dirPath;
  if (!fs.existsSync(dirPath)) {
    try { fs.mkdirSync(dirPath, { recursive: true }); } catch (e) {
      console.warn('[Version] ensureDir 失败:', dirPath, e.message);
    }
  }
  return dirPath;
}

function getDefaultMinecraftDir() {
  return path.join(require('os').homedir(), '.zenith-launcher', '.minecraft');
}

function getMinecraftDir() {
  let dir = configStore.get('minecraftDir');
  let isValid = false;
  if (dir && typeof dir === 'string' && dir.length > 0) {
    if (fs.existsSync(dir)) {
      isValid = true;
    } else {
      try {
        const parent = path.dirname(dir);
        if (fs.existsSync(parent)) {
          fs.accessSync(parent, fs.constants.W_OK);
          isValid = true;
        }
      } catch (_) { isValid = false; }
    }
  }
  if (!isValid) {
    const fallback = getDefaultMinecraftDir();
    ensureDir(fallback);
    try { configStore.set('minecraftDir', fallback); } catch (_) {}
    dir = fallback;
    console.log('[Version] minecraftDir 使用默认路径:', fallback);
  }
  return dir;
}

function getVersionsDir() {
  return ensureDir(path.join(getMinecraftDir(), 'versions'));
}

function getVersionDir(versionId) {
  const vDir = path.join(getVersionsDir(), versionId);
  ensureDir(vDir);
  ensureDir(path.join(vDir, 'mods'));
  ensureDir(path.join(vDir, 'saves'));
  ensureDir(path.join(vDir, 'config'));
  ensureDir(path.join(vDir, 'resourcepacks'));
  ensureDir(path.join(vDir, 'shaderpacks'));
  return vDir;
}

function getVersionModsDir(versionId) { return ensureDir(path.join(getVersionDir(versionId), 'mods')); }
function getVersionSavesDir(versionId) { return ensureDir(path.join(getVersionDir(versionId), 'saves')); }
function getVersionConfigDir(versionId) { return ensureDir(path.join(getVersionDir(versionId), 'config')); }
function getVersionResourcepacksDir(versionId) { return ensureDir(path.join(getVersionDir(versionId), 'resourcepacks')); }
function getVersionShaderpacksDir(versionId) { return ensureDir(path.join(getVersionDir(versionId), 'shaderpacks')); }

// 版本列表缓存（加速重复读取）
let versionsCache = null;
let versionsCacheTime = 0;
const CACHE_TTL = 5000; // 5秒内不重新扫描

function getInstalledVersions(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && versionsCache && (now - versionsCacheTime) < CACHE_TTL) {
    return versionsCache;
  }

  const versionsDir = getVersionsDir();
  const result = [];

  if (!fs.existsSync(versionsDir)) {
    versionsCache = result;
    versionsCacheTime = now;
    return result;
  }

  try {
    const entries = fs.readdirSync(versionsDir);
    entries.forEach(entry => {
      const versionDir = path.join(versionsDir, entry);
      try {
        const stat = fs.statSync(versionDir);
        if (stat.isDirectory()) {
          const jsonPath = path.join(versionDir, `${entry}.json`);
          if (fs.existsSync(jsonPath)) {
            try {
              const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
              const jarPath = path.join(versionDir, `${entry}.jar`);
              result.push({
                id: jsonData.id || entry,
                name: entry,
                type: jsonData.type || 'release',
                jarExists: fs.existsSync(jarPath),
                jsonExists: true,
                jsonData: jsonData,
                path: versionDir,
                inheritsFrom: jsonData.inheritsFrom || null
              });
            } catch (e) {
              result.push({
                id: entry,
                name: entry,
                type: 'release',
                jarExists: fs.existsSync(path.join(versionDir, `${entry}.jar`)),
                jsonExists: true,
                path: versionDir,
                inheritsFrom: null
              });
            }
          } else {
            const jarPath = path.join(versionDir, `${entry}.jar`);
            if (fs.existsSync(jarPath)) {
              result.push({
                id: entry,
                name: entry,
                type: 'release',
                jarExists: true,
                jsonExists: false,
                path: versionDir,
                inheritsFrom: null
              });
            }
          }
        }
      } catch (e) {
        // 单个版本失败不影响其它版本
      }
    });
  } catch (e) {
    console.error('[Version] Failed to list versions:', e.message);
  }

  // ============================================================
  // 过滤：若某版本是其它版本的父版本（被 inheritsFrom 引用），
  // 且它本身没有 inheritsFrom，视为"纯原版基底"，不在启动器已安装列表中展示，
  // 避免"下载了 Forge/Fabric 还能看到原版"的冗余。
  // ============================================================
  const inheritsFromSet = new Set();
  result.forEach(v => {
    if (v.inheritsFrom) inheritsFromSet.add(v.inheritsFrom);
  });

  const filtered = [];
  result.forEach(v => {
    const isBaseOnly = inheritsFromSet.has(v.id) && !v.inheritsFrom;
    if (isBaseOnly) return; // 保留在磁盘供加载器 inheritsFrom 使用，但不展示到 UI
    filtered.push(v);
  });

  // ============================================================
  // 排序优化：
  // 1) 按 MC 主版本号倒序（21.1 > 20.4 > 1.21.1 > 1.20.1 …）
  // 2) 子版本（forge/neoforge/fabric）紧接同名父版本后
  // 3) 若提取不到主版本号，退化为目录名字典序，保证稳定性
  // ============================================================
  function parseMCVersionPart(name) {
    if (!name) return [];
    const m = name.match(/(?:^|[-_\s])(\d+(?:\.\d+){0,3})(?:[-_\s]|$)/);
    if (!m) return [];
    return m[1].split('.').map(x => parseInt(x, 10) || 0);
  }

  function compareVersionParts(a, b) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const av = a[i] || 0;
      const bv = b[i] || 0;
      if (av !== bv) return bv - av; // 倒序
    }
    return 0;
  }

  filtered.sort((a, b) => {
    const partsA = parseMCVersionPart(a.name || a.id);
    const partsB = parseMCVersionPart(b.name || b.id);
    const cmp = compareVersionParts(partsA, partsB);
    if (cmp !== 0) return cmp;
    // 同 MC 版本：有 inheritsFrom 的子版本排在父版本之后
    const aIsChild = !!a.inheritsFrom;
    const bIsChild = !!b.inheritsFrom;
    if (aIsChild !== bIsChild) return aIsChild ? 1 : -1;
    const nameA = (a.name || a.id || '').toLowerCase();
    const nameB = (b.name || b.id || '').toLowerCase();
    if (nameA < nameB) return 1;
    if (nameA > nameB) return -1;
    return 0;
  });

  versionsCache = filtered;
  versionsCacheTime = now;
  return filtered;
}

function getVersionJson(versionId) {
  const versionsDir = getVersionsDir();
  const jsonPath = path.join(versionsDir, versionId, `${versionId}.json`);

  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Version ${versionId} not found`);
  }

  let jsonData;
  try {
    jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  } catch (e) {
    throw new Error(`Version ${versionId} JSON 解析失败: ${e.message}`);
  }

  if (jsonData.inheritsFrom) {
    try {
      const parentJson = getVersionJson(jsonData.inheritsFrom);
      return mergeVersionJson(parentJson, jsonData);
    } catch (e) {
      console.warn(`[Version] 版本 ${versionId} 继承的父版本 ${jsonData.inheritsFrom} 不可用，跳过继承合并`);
      return jsonData;
    }
  }

  return jsonData;
}

function mergeVersionJson(parent, child) {
  if (!parent || typeof parent !== 'object') {
    return child;
  }
  if (!child || typeof child !== 'object') {
    return parent;
  }

  const result = { ...parent, ...child };

  const parentLibs = Array.isArray(parent.libraries) ? parent.libraries : [];
  const childLibs = Array.isArray(child.libraries) ? child.libraries : [];

  if (parentLibs.length > 0 || childLibs.length > 0) {
    result.libraries = [...childLibs, ...parentLibs.filter(
      pLib => pLib && pLib.name && !childLibs.find(cLib => cLib && cLib.name === pLib.name)
    )];
  } else if (!result.libraries) {
    result.libraries = [];
  }

  const childHasArgsObj = child.arguments && typeof child.arguments === 'object' && !Array.isArray(child.arguments);
  const parentHasArgsObj = parent.arguments && typeof parent.arguments === 'object' && !Array.isArray(parent.arguments);
  const childHasMCArgs = typeof child.minecraftArguments === 'string';
  const parentHasMCArgs = typeof parent.minecraftArguments === 'string';

  if (childHasArgsObj || parentHasArgsObj) {
    const mergedArgs = {};

    const childGame = childHasArgsObj && Array.isArray(child.arguments.game) ? child.arguments.game : [];
    const parentGame = parentHasArgsObj && Array.isArray(parent.arguments.game) ? parent.arguments.game : [];
    const childJvm = childHasArgsObj && Array.isArray(child.arguments.jvm) ? child.arguments.jvm : [];
    const parentJvm = parentHasArgsObj && Array.isArray(parent.arguments.jvm) ? parent.arguments.jvm : [];

    if (childHasArgsObj) {
      Object.assign(mergedArgs, child.arguments);
    } else if (parentHasArgsObj) {
      Object.assign(mergedArgs, parent.arguments);
    }

    if (childGame.length > 0 || parentGame.length > 0) {
      mergedArgs.game = [...childGame, ...parentGame.filter(
        g => {
          const gStr = typeof g === 'string' ? g : JSON.stringify(g);
          return !childGame.some(c => {
            const cStr = typeof c === 'string' ? c : JSON.stringify(c);
            return cStr === gStr;
          });
        }
      )];
    }
    if (childJvm.length > 0 || parentJvm.length > 0) {
      mergedArgs.jvm = [...childJvm, ...parentJvm.filter(
        g => {
          const gStr = typeof g === 'string' ? g : JSON.stringify(g);
          return !childJvm.some(c => {
            const cStr = typeof c === 'string' ? c : JSON.stringify(c);
            return cStr === gStr;
          });
        }
      )];
    }

    result.arguments = mergedArgs;
    delete result.minecraftArguments;
  } else if (childHasMCArgs) {
    result.minecraftArguments = child.minecraftArguments;
  } else if (parentHasMCArgs) {
    result.minecraftArguments = parent.minecraftArguments;
  }

  const childHasDownloads = child.downloads && typeof child.downloads === 'object' && Object.keys(child.downloads).length > 0;
  const parentHasDownloads = parent.downloads && typeof parent.downloads === 'object' && Object.keys(parent.downloads).length > 0;

  if (childHasDownloads && parentHasDownloads) {
    result.downloads = { ...parent.downloads, ...child.downloads };
  } else if (childHasDownloads) {
    result.downloads = child.downloads;
  } else if (parentHasDownloads) {
    result.downloads = parent.downloads;
  }

  if (child.assetIndex && typeof child.assetIndex === 'object') {
    result.assetIndex = child.assetIndex;
  } else if (parent.assetIndex && typeof parent.assetIndex === 'object') {
    result.assetIndex = parent.assetIndex;
  }

  if (typeof child.mainClass === 'string' && child.mainClass.length > 0) {
    result.mainClass = child.mainClass;
  } else if (typeof parent.mainClass === 'string' && parent.mainClass.length > 0) {
    result.mainClass = parent.mainClass;
  }

  return result;
}

function selectVersion(versionId) {
  // 强制刷新缓存，避免偶发"选择不到版本"的问题
  const versions = getInstalledVersions(true);
  const version = versions.find(v => v.id === versionId || v.name === versionId);

  if (!version) {
    throw new Error(`Version ${versionId} not found`);
  }

  configStore.set('selectedVersion', versionId);
  return version;
}

function getSelectedVersion() {
  const selectedId = configStore.get('selectedVersion');
  if (!selectedId) {
    return null;
  }
  const versions = getInstalledVersions();
  const selected = versions.find(v => v.id === selectedId || v.name === selectedId);
  // 如果存储的选中版本找不到（例如已被删除/过滤），自动回退到第一个可用版本
  if (selected) return selected;
  return versions.length > 0 ? versions[0] : null;
}

function getLibrariesDir() {
  return ensureDir(path.join(getMinecraftDir(), 'libraries'));
}

function getAssetsDir() {
  return path.join(getMinecraftDir(), 'assets');
}

function getNativesDir(versionId) {
  return path.join(getVersionsDir(), versionId, `${versionId}-natives`);
}

function deleteDirectoryRecursive(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach((file) => {
      const curPath = path.join(dirPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteDirectoryRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(dirPath);
  }
}

function deleteVersion(versionId) {
  const versionsDir = getVersionsDir();
  const versionDir = path.join(versionsDir, versionId);

  if (!fs.existsSync(versionDir)) {
    throw new Error(`版本 ${versionId} 不存在`);
  }

  try {
    deleteDirectoryRecursive(versionDir);

    // 删除后强制刷新缓存，避免 UI 仍显示旧版本（偶发"删除不了"）
    refreshVersionsCache();

    const selectedVersion = configStore.get('selectedVersion');
    if (selectedVersion === versionId) {
      configStore.set('selectedVersion', '');
    }

    return {
      success: true,
      versionId: versionId,
      message: `版本 ${versionId} 已删除`
    };
  } catch (e) {
    throw new Error(`删除版本 ${versionId} 失败: ${e.message}`);
  }
}

// 强制刷新版本缓存（在下载/删除版本后调用）
function refreshVersionsCache() {
  versionsCache = null;
  versionsCacheTime = 0;
  return getInstalledVersions(true);
}

module.exports = {
  getInstalledVersions,
  refreshVersionsCache,
  getVersionJson,
  selectVersion,
  getSelectedVersion,
  deleteVersion,
  getMinecraftDir,
  getVersionsDir,
  getLibrariesDir,
  getAssetsDir,
  getNativesDir,
  getVersionDir,
  getVersionModsDir,
  getVersionSavesDir,
  getVersionConfigDir,
  getVersionResourcepacksDir,
  getVersionShaderpacksDir
};
