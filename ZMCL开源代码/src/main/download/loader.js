/* ============================================================
 * 模组加载器管理器（BMCLAPI 源，不依赖 Java）
 *
 * 安装流程说明：
 *  - Forge / NeoForge：下载 installer.jar -> 解压 -> 读取
 *    install_profile.json -> 构造 version.json (inheritsFrom
 *    mcVersion) -> 复制 forge 主库到 libraries -> 下载声明的
 *    依赖库
 *  - Fabric：直接从 fabric-meta 获取 version.json -> 写入
 *    versions/<mcVersion>-fabric-<loaderVer>/ -> 下载库
 *  - OptiFine：下载 jar -> 放入 .minecraft/mods/
 *
 * 参考：https://bmclapidoc.bangbang93.com
 * ============================================================ */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execFile, exec } = require('child_process');

const versionManager = require('../minecraft/version');
const sources = require('./sources');
const downloadManager = require('./manager');
const { runWithConcurrency, DEFAULT_CONCURRENCY_LIBRARIES } = downloadManager;

// 延迟加载 adm-zip，避免启动时依赖检查失败
let AdmZip = null;
function getAdmZip() {
  if (!AdmZip) {
    try {
      AdmZip = require('adm-zip');
    } catch (e) {
      console.warn('[Loader] adm-zip 未安装，将使用系统命令解压');
    }
  }
  return AdmZip;
}

/* ================== 取消标志（使用 manager.js 的共享标志）================== */

function requestCancel() { downloadManager.requestCancel(); }
function resetCancel() { downloadManager.resetCancel(); }
function checkCancelled() { downloadManager.checkCancelled(); }

/* ======================= URL 常量 ======================= */

const BMCLAPI_BASE = sources.BMCLAPI_BASE;

// 归一化版本号，移除重复的 mcversion 前缀
// BMCLAPI 返回的 version 字段可能是 "47.0.1"（纯 Forge 版本）或 "1.20.1-47.1.85"（含 mcversion 前缀）
// 返回 { raw: "47.0.1", full: "1.20.1-47.0.1" }
function normalizeVersion(mcv, ver) {
  if (!ver) return { raw: '', full: mcv || '' };
  const v = String(ver).trim();
  if (mcv && v.startsWith(mcv + '-')) {
    const raw = v.substring(mcv.length + 1);
    return { raw, full: v };
  }
  return { raw: v, full: mcv ? `${mcv}-${v}` : v };
}

function FORGE_LIST_URL(mcv) { return `${BMCLAPI_BASE}/forge/minecraft/${encodeURIComponent(mcv)}`; }
function FORGE_INSTALLER_URL(mcv, forgeVer) {
  const { raw, full } = normalizeVersion(mcv, forgeVer);
  return `${BMCLAPI_BASE}/maven/net/minecraftforge/forge/${encodeURIComponent(full)}/forge-${encodeURIComponent(full)}-installer.jar`;
}
function NEOFORGE_LIST_URL(mcv) { return `${BMCLAPI_BASE}/neoforge/list/${encodeURIComponent(mcv)}`; }
function NEOFORGE_INSTALLER_URL(mcv, nfVer) {
  // NeoForge 版本号不使用 Minecraft 版本前缀，直接使用原始版本号
  // 例如：21.0.0 而不是 1.21.0-21.0.0
  const rawVer = String(nfVer).trim();
  return `${BMCLAPI_BASE}/maven/net/neoforged/neoforge/${encodeURIComponent(rawVer)}/neoforge-${encodeURIComponent(rawVer)}-installer.jar`;
}
function FABRIC_LIST_URL(mcv) { return `${BMCLAPI_BASE}/fabric-meta/v2/versions/loader/${encodeURIComponent(mcv)}`; }
function FABRIC_META_URL(mcv, loaderVer) {
  return `${BMCLAPI_BASE}/fabric-meta/v2/versions/loader/${encodeURIComponent(mcv)}/${encodeURIComponent(loaderVer)}/profile/json`;
}
function OPTIFINE_LIST_URL(mcv) { return `${BMCLAPI_BASE}/optifine/${encodeURIComponent(mcv)}`; }
// BMCLAPI OptiFine URL 格式：/optifine/<mcv>/<type>/<patch>
// 例如：/optifine/1.20.1/HD_U/I6
// 如果 patch 为空，则使用：/optifine/1.20.1/HD_U_I6（把 type 和 patch 合并为单个路径段）
function OPTIFINE_DOWNLOAD_URL(mcv, type, patch) {
  if (!type) return `${BMCLAPI_BASE}/optifine/${encodeURIComponent(mcv)}`;
  if (patch && patch.length > 0) {
    return `${BMCLAPI_BASE}/optifine/${encodeURIComponent(mcv)}/${encodeURIComponent(type)}/${encodeURIComponent(patch)}`;
  }
  return `${BMCLAPI_BASE}/optifine/${encodeURIComponent(mcv)}/${encodeURIComponent(type)}`;
}

// 生成所有可能的 OptiFine URL 变体（BMCLAPI 对不同版本格式不统一）
function OPTIFINE_ALL_URLS(mcv, type, patch) {
  const urls = [];
  if (patch && patch.length > 0) {
    urls.push(`${BMCLAPI_BASE}/optifine/${mcv}/${type}/${patch}`);
    urls.push(`${BMCLAPI_BASE}/optifine/${mcv}/${type}_${patch}`);
    urls.push(`${BMCLAPI_BASE}/optifine/${mcv}/${type}${patch}`);
  } else {
    urls.push(`${BMCLAPI_BASE}/optifine/${mcv}/${type}`);
  }
  return urls;
}

/* ======================= 工具函数 ======================= */

function ensureDir(dirPath) {
  if (!dirPath) return dirPath;
  if (!fs.existsSync(dirPath)) {
    try { fs.mkdirSync(dirPath, { recursive: true }); } catch (e) {
      console.error('[Loader] ensureDir 失败:', dirPath, e.message);
    }
  }
  return dirPath;
}

async function httpGetJson(url, timeout = 30000) {
  try {
    const res = await axios.get(url, { timeout, headers: { 'User-Agent': 'Zenith-Launcher/1.0' } });
    return res.data;
  } catch (e) {
    console.error(`[Loader] HTTP GET 失败 ${url}:`, e.message);
    return null;
  }
}

/* ==================== 下载速度 / 剩余时间 辅助工具 ==================== */

function formatBytesRate(bps) {
  if (!bps || bps <= 0) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let i = 0;
  let v = bps;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return v.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

function formatEtaSeconds(sec) {
  if (!sec || sec <= 0) return '—';
  if (!isFinite(sec)) return '—';
  if (sec < 1) return '即将完成';
  const s = Math.round(sec);
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m} 分 ${rs} 秒`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h} 时 ${rm} 分`;
}

async function downloadFile(url, targetPath, onProgress, timeout = 300000, expectedSize = null) {
  // 如果文件已存在，检查大小是否匹配
  if (fs.existsSync(targetPath)) {
    if (expectedSize && expectedSize > 0) {
      try {
        const actualSize = fs.statSync(targetPath).size;
        if (actualSize === expectedSize) {
          if (onProgress) onProgress({ downloaded: 100, total: 100, percent: 100, speedText: '已完成', etaText: '已完成' });
          return targetPath;
        }
        console.log(`[Loader]   文件大小不匹配 (${actualSize} != ${expectedSize})，重新下载: ${path.basename(targetPath)}`);
      } catch (_) {}
    } else {
      // 没有预期大小：做 HEAD 请求检查 content-length（避免下载不完整的文件
      try {
        const actualSize = fs.statSync(targetPath).size;
        if (actualSize > 0) {
          // 仅在文件较小时强制重新下载（可能是 shim.jar 这类 16KB 的错误文件
          if (actualSize < 50000) {
            // 小文件可能是 shim/installer 放置的占位文件
            // 尝试从 server 检查 content-length
          } else {
            // 大文件：信任现有文件
            if (onProgress) onProgress({ downloaded: 100, total: 100, percent: 100, speedText: '已完成', etaText: '已完成' });
            return targetPath;
          }
        }
      } catch (_) {}
    }
  }
  ensureDir(path.dirname(targetPath));

  console.log(`[Loader] 下载: ${url}`);
  console.log(`[Loader]   保存到: ${targetPath}`);

  checkCancelled();

  const response = await axios({
    url, method: 'GET', responseType: 'stream', timeout,
    headers: { 'User-Agent': 'Zenith-Launcher/1.0' }
  });
  const totalLength = parseInt(response.headers['content-length'], 10) || 0;
  let downloaded = 0;
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(targetPath);
    response.data.on('data', (chunk) => {
      if (downloadManager.isCancelled()) {
        try { response.data.destroy(); } catch (_) {}
        try { writer.destroy(); } catch (_) {}
        const cancelErr = new Error('下载已被用户取消');
        cancelErr.cancelled = true;
        reject(cancelErr);
        return;
      }
      downloaded += chunk.length;
      if (onProgress && totalLength > 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const bps = elapsed > 0.1 ? downloaded / elapsed : 0;
        const remaining = Math.max(0, totalLength - downloaded);
        const eta = (bps > 0 && totalLength > 0) ? remaining / bps : 0;
        onProgress({
          downloaded,
          total: totalLength,
          percent: Math.round((downloaded / totalLength) * 100),
          speedBytesPerSec: bps,
          speedText: formatBytesRate(bps),
          etaSeconds: eta,
          etaText: formatEtaSeconds(eta)
        });
      }
    });
    response.data.on('error', reject);
    writer.on('finish', () => {
      console.log(`[Loader]   下载完成 (${downloaded} bytes)`);
      resolve(targetPath);
    });
    writer.on('error', reject);
    response.data.pipe(writer);
  });
}

/**
 * 解压 ZIP/JAR 文件（优先使用 adm-zip，回退到系统命令）
 */
function extractZip(zipPath, destDir) {
  ensureDir(destDir);

  // 优先使用 adm-zip（跨平台、更可靠）
  const admzip = getAdmZip();
  if (admzip) {
    try {
      console.log(`[Loader] 使用 adm-zip 解压: ${zipPath} -> ${destDir}`);
      const zip = new admzip(zipPath);
      zip.extractAllTo(destDir, true); // true = overwrite
      console.log(`[Loader] adm-zip 解压完成`);
      return Promise.resolve(destDir);
    } catch (e) {
      console.warn(`[Loader] adm-zip 解压失败，回退到系统命令: ${e.message}`);
    }
  }

  // 回退到系统命令
  return new Promise((resolve, reject) => {
    const platform = process.platform;
    let cmd, args;
    if (platform === 'win32') {
      const safeZipPath = zipPath.replace(/'/g, "''");
      const safeDestDir = destDir.replace(/'/g, "''");
      cmd = 'powershell.exe';
      args = [
        '-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -Force -LiteralPath '${safeZipPath}' -DestinationPath '${safeDestDir}'`
      ];
    } else {
      cmd = 'tar';
      args = ['-xf', zipPath, '-C', destDir];
    }
    console.log(`[Loader] 执行解压: ${cmd} ${args.join(' ')}`);
    const child = execFile(cmd, args, { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) {
        console.error(`[Loader] 解压失败: ${err.message}`);
        if (platform === 'win32') {
          try {
            exec(`tar -xf "${zipPath}" -C "${destDir}"`, { timeout: 120000 }, (err2) => {
              if (err2) reject(err2); else resolve(destDir);
            });
          } catch (e2) { reject(e2); }
        } else {
          reject(err);
        }
      } else {
        resolve(destDir);
      }
    });
  });
}

/**
 * 递归查找解压目录中的 forge-*.jar
 */
function findForgeJar(extractDir, mcVersion, forgeVersion) {
  // 优先从 maven 目录找
  const mavenDir = path.join(extractDir, 'maven', 'net', 'minecraftforge', 'forge', `${mcVersion}-${forgeVersion}`);
  if (fs.existsSync(mavenDir)) {
    const files = fs.readdirSync(mavenDir).filter(f => f.endsWith('.jar') && !f.includes('installer') && !f.includes('universal'));
    if (files.length > 0) {
      return path.join(mavenDir, files[0]);
    }
    // 退回 universal
    const universal = fs.readdirSync(mavenDir).find(f => f.includes('universal') && f.endsWith('.jar'));
    if (universal) return path.join(mavenDir, universal);
  }
  // 兜底：递归查找
  const results = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir);
    for (const e of entries) {
      const full = path.join(dir, e);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (e.endsWith('.jar') && (e.startsWith('forge') || e.startsWith('neoforge')) && !e.includes('installer')) {
        results.push({ path: full, size: stat.size });
      }
    }
  }
  walk(extractDir);
  if (results.length === 0) return null;
  results.sort((a, b) => b.size - a.size);
  return results[0].path;
}

/**
 * 从 BMCLAPI maven 下载一个库文件
 */
async function downloadLibrary(groupPath, name, version, librariesDir, classifier = null) {
  const groupParts = groupPath.split('.');
  const groupDir = groupParts.join('/');
  const fileName = classifier ? `${name}-${version}-${classifier}.jar` : `${name}-${version}.jar`;
  const localDir = path.join(librariesDir, groupDir, name, version);
  const localPath = path.join(localDir, fileName);
  if (fs.existsSync(localPath)) return localPath;
  const url = `${BMCLAPI_BASE}/maven/${groupDir}/${name}/${version}/${fileName}`;
  await downloadFile(url, localPath);
  return localPath;
}

/**
 * 运行 Forge 安装器的处理器（processors）
 * 这些处理器负责生成 .forge_patched_minecraft.jar 等文件
 * 注意：处理器运行是可选的，失败不会中断安装流程
 */
async function runForgeProcessors(installProfile, extractDir, librariesDir, mcVersion, forgeVersion, onProgress) {
  const { execFile } = require('child_process');
  const processors = installProfile.processors;
  const data = installProfile.data || {};
  
  if (!processors || processors.length === 0) {
    console.log('[Loader]   没有需要运行的处理器');
    return;
  }
  
  console.log(`[Loader]   运行 ${processors.length} 个处理器...`);
  
  // 查找 Java 路径
  let javaPath = 'java';
  try {
    const javaDetector = require('../minecraft/java');
    const javaInstallations = await javaDetector.detectJavaInstallations();
    if (javaInstallations && javaInstallations.length > 0) {
      // 优先使用 Java 17+（Forge 1.20.1+ 需要）
      const suitableJava = javaInstallations.find(j => j.majorVersion >= 17) || javaInstallations[0];
      javaPath = suitableJava.path;
    }
  } catch (e) {
    console.warn('[Loader]   无法检测 Java，使用默认 java 命令');
  }
  
  // 准备变量替换映射
  const varMap = {};
  for (const [key, value] of Object.entries(data)) {
    if (value && value.file) {
      // 解析文件路径，去掉方括号
      const filePath = value.file.replace(/^\[|\]$/g, '');
      varMap[`{${key}}`] = path.join(librariesDir, filePath);
    } else if (value && value.server) {
      varMap[`{${key}}`] = value.server;
    } else if (value && value.client) {
      varMap[`{${key}}`] = value.client;
    }
  }
  
  // 添加特殊变量
  const versionId = `${mcVersion}-forge-${forgeVersion}`;
  const versionsDir = versionManager.getVersionsDir();
  const versionDir = path.join(versionsDir, versionId);
  ensureDir(versionDir);
  
  varMap['{MINECRAFT_JAR}'] = path.join(versionsDir, mcVersion, `${mcVersion}.jar`);
  varMap['{PATCHED_JAR}'] = path.join(versionDir, '.forge_patched_minecraft.jar');
  varMap['{EXTRACT_DIR}'] = extractDir;
  varMap['{VERSION_ID}'] = versionId;
  
  // 运行每个处理器
  for (let i = 0; i < processors.length; i++) {
    const processor = processors[i];
    if (!processor.jar) continue;
    
    // 解析处理器 jar 路径
    const jarPath = path.join(librariesDir, processor.jar.replace(/^\[|\]$/g, ''));
    if (!fs.existsSync(jarPath)) {
      console.warn(`[Loader]   处理器 jar 不存在: ${jarPath}`);
      continue;
    }
    
    // 构建参数
    const args = [];
    
    // 添加 classpath
    const classpath = [jarPath];
    if (processor.classpath) {
      for (const cp of processor.classpath) {
        const cpPath = path.join(librariesDir, cp.replace(/^\[|\]$/g, ''));
        if (fs.existsSync(cpPath)) {
          classpath.push(cpPath);
        }
      }
    }
    args.push('-cp', classpath.join(process.platform === 'win32' ? ';' : ':'));
    
    // 添加主类 - 使用 jar 的 Main-Class 或默认的处理器主类
    // 大多数 Forge 安装器使用 net.minecraftforge.installer.SimpleInstaller
    args.push('net.minecraftforge.installer.SimpleInstaller');
    
    // 添加处理器参数
    if (processor.args) {
      for (const arg of processor.args) {
        let resolvedArg = arg;
        // 替换变量
        for (const [varName, varValue] of Object.entries(varMap)) {
          if (resolvedArg.includes(varName)) {
            resolvedArg = resolvedArg.split(varName).join(varValue);
          }
        }
        // 处理文件路径引用 [path/to/file]
        if (resolvedArg.startsWith('[') && resolvedArg.endsWith(']')) {
          const filePath = resolvedArg.slice(1, -1);
          resolvedArg = path.join(librariesDir, filePath);
        }
        args.push(resolvedArg);
      }
    }
    
    console.log(`[Loader]   运行处理器 ${i + 1}/${processors.length}: ${path.basename(jarPath)}`);
    console.log(`[Loader]   命令: ${javaPath} ${args.join(' ')}`);
    
    try {
      await new Promise((resolve, reject) => {
        const child = execFile(javaPath, args, { 
          timeout: 120000,
          maxBuffer: 10 * 1024 * 1024 // 10MB 缓冲区
        }, (error, stdout, stderr) => {
          if (error) {
            console.warn(`[Loader]   处理器错误: ${error.message}`);
            if (stderr) console.warn(`[Loader]   stderr: ${stderr}`);
            // 不 reject，继续运行
            resolve();
          } else {
            if (stdout) console.log(`[Loader]   处理器输出: ${stdout.substring(0, 500)}`);
            resolve();
          }
        });
      });
    } catch (e) {
      console.warn(`[Loader]   处理器 ${i + 1} 失败: ${e.message}`);
      // 继续运行其他处理器，不中断安装
    }
    
    onProgress && onProgress({ 
      stage: 'processors', 
      message: `运行 Forge 处理器 (${i + 1}/${processors.length})...`, 
      percent: 36 + ((i + 1) / processors.length) * 2 
    });
  }
  
  console.log('[Loader]   处理器运行完成');
}

/**
 * 直接运行 Forge 安装器来生成必要的文件
 * 这是针对新版 Forge 1.20.1+ 的备选方案
 */
async function runForgeInstaller(installerPath, mcVersion, versionsDir, librariesDir, onProgress) {
  const { execFile } = require('child_process');
  
  console.log('[Loader]   运行 Forge 安装器...');
  
  // 查找 Java 路径
  let javaPath = 'java';
  try {
    const javaDetector = require('../minecraft/java');
    const javaInstallations = await javaDetector.detectJavaInstallations();
    if (javaInstallations && javaInstallations.length > 0) {
      // 优先使用 Java 17+（Forge 1.20.1+ 需要）
      const suitableJava = javaInstallations.find(j => j.majorVersion >= 17) || javaInstallations[0];
      javaPath = suitableJava.path;
    }
  } catch (e) {
    console.warn('[Loader]   无法检测 Java，使用默认 java 命令');
  }
  
  // 构建安装器参数
  // --installClient 表示安装客户端
  // --target 指定安装目录
  // --offline 防止安装器下载原版 Minecraft（我们已经有了）
  const args = [
    '-jar', installerPath,
    '--installClient',
    '--target', versionsDir,
    '--offline'
  ];
  
  console.log(`[Loader]   命令: ${javaPath} ${args.join(' ')}`);
  
  try {
    await new Promise((resolve, reject) => {
      const child = execFile(javaPath, args, { 
        timeout: 300000, // 5分钟超时
        maxBuffer: 10 * 1024 * 1024 // 10MB 缓冲区
      }, (error, stdout, stderr) => {
        if (error) {
          console.warn(`[Loader]   安装器错误: ${error.message}`);
          if (stderr) console.warn(`[Loader]   stderr: ${stderr}`);
          // 不 reject，继续
          resolve();
        } else {
          if (stdout) console.log(`[Loader]   安装器输出: ${stdout.substring(0, 1000)}`);
          resolve();
        }
      });
    });
    console.log('[Loader]   安装器运行完成');
  } catch (e) {
    console.warn(`[Loader]   运行安装器失败: ${e.message}`);
    // 不抛出错误，继续安装流程
  }
}

/* =========================================================
 *                 可用性检测
 * ========================================================= */

async function detectForge(mcVersion) {
  const url = FORGE_LIST_URL(mcVersion);
  const data = await httpGetJson(url, 15000);
  if (!data || !Array.isArray(data) || data.length === 0) {
    console.log(`[Loader] Forge: 无返回数据 (${mcVersion})`);
    return { available: false };
  }
  const sorted = [...data].sort((a, b) => {
    const av = a.version || String(a.build || '');
    const bv = b.version || String(b.build || '');
    const pa = String(av).split(/[.\-_]/);
    const pb = String(bv).split(/[.\-_]/);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = parseInt(pa[i] || '0', 10);
      const nb = parseInt(pb[i] || '0', 10);
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return nb - na;
    }
    return 0;
  });
  const latest = sorted[0];
  const recommended = sorted.find(v =>
    !String(v.version || '').toLowerCase().includes('beta') &&
    !String(v.version || '').toLowerCase().includes('pre') &&
    !String(v.version || '').toLowerCase().includes('rc')
  ) || latest;
  const allVersions = sorted.map(v => v.version).filter(Boolean).slice(0, 12);
  console.log(`[Loader] Forge(${mcVersion}): latest=${latest.version}, recommended=${recommended.version}, 共 ${data.length} 个版本`);
  return {
    available: true,
    version: recommended.version,
    recommended: recommended.version,
    latest: latest.version,
    allVersions
  };
}

async function detectNeoForge(mcVersion) {
  const url = NEOFORGE_LIST_URL(mcVersion);
  const data = await httpGetJson(url, 15000);
  if (!data || !Array.isArray(data) || data.length === 0) {
    console.log(`[Loader] NeoForge: 无返回数据 (${mcVersion})`);
    return { available: false };
  }
  const sorted = [...data].sort((a, b) => {
    const av = a.version || '';
    const bv = b.version || '';
    const pa = String(av).split(/[.\-_]/);
    const pb = String(bv).split(/[.\-_]/);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = parseInt(pa[i] || '0', 10);
      const nb = parseInt(pb[i] || '0', 10);
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return nb - na;
    }
    return 0;
  });
  const latest = sorted[0];
  const recommended = sorted.find(v =>
    !String(v.version || '').toLowerCase().includes('beta') &&
    !String(v.version || '').toLowerCase().includes('pre') &&
    !String(v.version || '').toLowerCase().includes('rc')
  ) || latest;
  const allVersions = sorted.map(v => v.version).filter(Boolean).slice(0, 12);
  console.log(`[Loader] NeoForge(${mcVersion}): latest=${latest.version}, recommended=${recommended.version}`);
  return {
    available: true,
    version: recommended.version,
    recommended: recommended.version,
    latest: latest.version,
    allVersions
  };
}

async function detectFabric(mcVersion) {
  // 先尝试 BMCLAPI，失败回退到官方 Fabric Meta API
  const urls = [
    FABRIC_LIST_URL(mcVersion),
    `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}`
  ];

  let data = null;
  for (const url of urls) {
    if (data) break;
    const result = await httpGetJson(url, 12000);
    if (result && Array.isArray(result) && result.length > 0) {
      data = result;
      console.log(`[Loader] Fabric: 从 ${url.includes('fabricmc') ? '官方' : 'BMCLAPI'} 获取数据成功 (${mcVersion})`);
      break;
    }
    console.log(`[Loader] Fabric: ${url.includes('fabricmc') ? '官方' : 'BMCLAPI'} 无有效数据`);
  }

  if (!data || !Array.isArray(data) || data.length === 0) {
    console.log(`[Loader] Fabric: 无返回数据 (${mcVersion})`);
    return { available: false };
  }
  const stable = data.find(v => v && v.loader && v.loader.stable) || data[0];
  const latest = data[0];
  const allVersions = data.filter(v => v && v.loader && v.loader.version).map(v => v.loader.version).slice(0, 10);
  console.log(`[Loader] Fabric(${mcVersion}): recommended=${stable && stable.loader ? stable.loader.version : null}, latest=${latest && latest.loader ? latest.loader.version : null}`);
  return {
    available: true,
    version: stable && stable.loader ? stable.loader.version : null,
    recommended: stable && stable.loader ? stable.loader.version : null,
    latest: latest && latest.loader ? latest.loader.version : null,
    allVersions
  };
}

async function detectOptiFine(mcVersion) {
  const url = OPTIFINE_LIST_URL(mcVersion);
  const data = await httpGetJson(url, 15000);
  let list = null;
  if (Array.isArray(data) && data.length > 0) list = data;
  else if (data && typeof data === 'object' && data.type) list = [data];

  if (!list || list.length === 0) {
    // 硬编码兜底
    const fallback = [
      { type: 'HD_U_L7', patch: '' },
      { type: 'HD_U_L6', patch: '' },
      { type: 'HD_U_I7', patch: '' }
    ];
    console.log(`[Loader] OptiFine(${mcVersion}): BMCLAPI 无数据，使用硬编码兜底`);
    return {
      available: true,
      version: 'HD_U_L7',
      recommended: 'HD_U_L7',
      latest: 'HD_U_L7',
      allVersions: ['HD_U_L7', 'HD_U_L6', 'HD_U_I7']
    };
  }

  // 组装格式化的版本名
  const formatted = list.map(item => {
    if (item.type && item.patch) return `${item.type}_${item.patch}`;
    if (item.type) return item.type;
    return item.name || item.version || 'unknown';
  });
  const latest = list[0];
  const recommended = list.find(v => !String(v.patch || '').toLowerCase().startsWith('pre')) || latest;
  const latestVersion = latest.type && latest.patch ? `${latest.type}_${latest.patch}` : formatted[0];
  const recIdx = list.indexOf(recommended);
  const recVersion = recIdx >= 0 ? formatted[recIdx] : latestVersion;

  console.log(`[Loader] OptiFine(${mcVersion}): recommended=${recVersion}, latest=${latestVersion}, 共 ${list.length} 个版本`);
  return {
    available: true,
    version: recVersion,
    recommended: recVersion,
    latest: latestVersion,
    allVersions: formatted.slice(0, 10)
  };
}

async function detectLoaders(mcVersion) {
  if (!mcVersion) {
    console.warn('[Loader] detectLoaders: mcVersion 为空，跳过');
    return {};
  }
  console.log(`[Loader] ========== 检测加载器可用性 (${mcVersion}) ==========`);

  const DETECT_TIMEOUT = 20000; // 20 秒全局超时
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('检测超时')), DETECT_TIMEOUT)
  );

  // ============================================================
  // Forge / NeoForge 当前存在启动报错问题，暂不对外开放下载，
  // 这里直接返回统一的禁用说明，避免安装后启动失败。
  // ============================================================
  const FORGE_DISABLED_REASON = 'Forge 暂因启动报错问题正在修复，暂不可下载';
  const NEOFORGE_DISABLED_REASON = 'NeoForge 暂因启动报错问题正在修复，暂不可下载';

  try {
    const [forge, neoforge, fabric, optifine] = await Promise.race([
      Promise.all([
        // Forge / NeoForge：仍走检测，但最终将 available 置为 false 并附带原因说明
        (async () => { try { return await detectForge(mcVersion); } catch (e) { return { available: false, error: e.message }; } })(),
        (async () => { try { return await detectNeoForge(mcVersion); } catch (e) { return { available: false, error: e.message }; } })(),
        detectFabric(mcVersion),
        detectOptiFine(mcVersion)
      ]),
      timeoutPromise
    ]);

    const forgeOut = {
      ...(forge || {}),
      available: false,
      disabled: true,
      disabledReason: FORGE_DISABLED_REASON
    };
    const neoforgeOut = {
      ...(neoforge || {}),
      available: false,
      disabled: true,
      disabledReason: NEOFORGE_DISABLED_REASON
    };

    return { forge: forgeOut, neoforge: neoforgeOut, fabric, optifine };
  } catch (e) {
    console.warn(`[Loader] 加载器检测异常: ${e.message}`);
    return {
      forge: { available: false, disabled: true, disabledReason: FORGE_DISABLED_REASON, error: e.message },
      neoforge: { available: false, disabled: true, disabledReason: NEOFORGE_DISABLED_REASON, error: e.message },
      fabric: { available: false, error: e.message },
      optifine: { available: false, error: e.message }
    };
  }
}

/* =========================================================
 *                    冲突检测
 * ========================================================= */

function checkConflicts(selection, mcVersion, availability) {
  if (!selection) return { ok: true, errors: [], warnings: [] };
  const conflicts = [];
  const modLoaders = [];
  if (selection.forge) modLoaders.push('forge');
  if (selection.neoforge) modLoaders.push('neoforge');
  if (selection.fabric) modLoaders.push('fabric');

  if (modLoaders.length > 1) {
    const names = { forge: 'Forge', neoforge: 'NeoForge', fabric: 'Fabric' };
    conflicts.push({
      level: 'error',
      message: `${modLoaders.map(k => names[k]).join(' / ')} 不能同时安装，请只保留一个主加载器。`,
      keys: modLoaders
    });
  }
  if (selection.optifine) {
    if (!selection.forge && !selection.neoforge) {
      conflicts.push({
        level: 'error',
        message: 'OptiFine 必须配合 Forge 或 NeoForge 使用。',
        keys: ['optifine']
      });
    }
  }
  if (availability) {
    if (selection.forge && availability.forge && !availability.forge.available) {
      conflicts.push({ level: 'error', message: `MC ${mcVersion} 暂无可下载的 Forge 版本。`, keys: ['forge'] });
    }
    if (selection.neoforge && availability.neoforge && !availability.neoforge.available) {
      conflicts.push({ level: 'error', message: `MC ${mcVersion} 暂无可下载的 NeoForge 版本。`, keys: ['neoforge'] });
    }
    if (selection.fabric && availability.fabric && !availability.fabric.available) {
      conflicts.push({ level: 'error', message: `MC ${mcVersion} 暂无可下载的 Fabric 版本。`, keys: ['fabric'] });
    }
    if (selection.optifine && availability.optifine && !availability.optifine.available) {
      conflicts.push({ level: 'warning', message: `MC ${mcVersion} 暂无 OptiFine 记录。`, keys: ['optifine'] });
    }
  }
  const hasError = conflicts.some(c => c.level === 'error');
  return {
    ok: !hasError,
    warnings: conflicts.filter(c => c.level === 'warning'),
    errors: conflicts.filter(c => c.level === 'error'),
    conflicts
  };
}

/* =========================================================
 *                Forge 安装核心流程
 *
 *  关键产物：
 *    versions/<mcVersion>-forge-<forgeVersion>/<id>.json
 *    libraries/net/minecraftforge/forge/<mcVersion>-<fv>/forge-<mcVersion>-<fv>.jar
 *    libraries/... (其他依赖库)
 * ========================================================= */

async function installForge(mcVersion, forgeVersion, onProgress) {
  console.log(`[Loader] ========== 开始安装 Forge ${mcVersion}-${forgeVersion} ==========`);
  if (!mcVersion || !forgeVersion) throw new Error('Forge 安装参数错误：mcVersion/forgeVersion 不能为空');

  const versionsDir = versionManager.getVersionsDir();
  const librariesDir = versionManager.getLibrariesDir();
  ensureDir(versionsDir);
  ensureDir(librariesDir);
  console.log(`[Loader]   versions 目录: ${versionsDir}`);
  console.log(`[Loader]   libraries 目录: ${librariesDir}`);

  const { raw: rawForgeVer, full: fullForgeVersion } = normalizeVersion(mcVersion, forgeVersion);
  const versionId = `${mcVersion}-forge-${rawForgeVer}`;
  const url = FORGE_INSTALLER_URL(mcVersion, forgeVersion);

  const tempDir = path.join(versionsDir, '.temp', `forge-${fullForgeVersion}`);
  ensureDir(tempDir);
  const installerPath = path.join(tempDir, `forge-${fullForgeVersion}-installer.jar`);

  // 1) 下载 installer.jar
  onProgress && onProgress({ stage: 'download', message: `下载 Forge 安装器...`, percent: 3 });
  try {
    await downloadFile(url, installerPath, (p) => {
      onProgress && onProgress({
        stage: 'download',
        message: `下载 Forge 安装器 ${p.percent}%`,
        percent: 3 + (p.percent || 0) * 0.15,
        speedBytesPerSec: p.speedBytesPerSec,
        speedText: p.speedText,
        etaSeconds: p.etaSeconds,
        etaText: p.etaText
      });
    });
  } catch (e) {
    throw new Error(`下载 Forge 安装器失败: ${e.message}\nURL: ${url}`);
  }

  // 2) 解压
  onProgress && onProgress({ stage: 'extract', message: '解压 Forge 安装器文件...', percent: 22 });
  const extractDir = path.join(tempDir, 'extracted');
  ensureDir(extractDir);
  try {
    await extractZip(installerPath, extractDir);
  } catch (e) {
    throw new Error(`解压 Forge 安装器失败: ${e.message}`);
  }

  // 3) 解析 install_profile.json / version.json
  onProgress && onProgress({ stage: 'parse', message: '解析安装配置...', percent: 26 });
  let versionInfo = null;
  let installProfile = null;
  let installData = null; // 新版 forge 安装器的 install 块

  const vJsonPath = path.join(extractDir, 'version.json');
  if (fs.existsSync(vJsonPath)) {
    try { versionInfo = JSON.parse(fs.readFileSync(vJsonPath, 'utf-8')); }
    catch (e) { console.warn('[Loader] version.json 解析失败:', e.message); }
  }

  const profilePath = path.join(extractDir, 'install_profile.json');
  if (fs.existsSync(profilePath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
      installProfile = raw;
      if (raw && raw.install) installData = raw.install;
    } catch (e) { console.warn('[Loader] install_profile.json 解析失败:', e.message); }
  }

  // 老版格式：install_profile.versionInfo
  if (!versionInfo && installProfile && installProfile.versionInfo) {
    versionInfo = installProfile.versionInfo;
  }
  // 新版格式：install_profile.json 中指定的外部 json 文件
  if (!versionInfo && installData && installData.json) {
    const externalJsonPath = path.join(extractDir, installData.json);
    if (fs.existsSync(externalJsonPath)) {
      try { versionInfo = JSON.parse(fs.readFileSync(externalJsonPath, 'utf-8')); }
      catch (e) { console.warn('[Loader] 外部 json 解析失败:', e.message); }
    }
  }

  if (!versionInfo || typeof versionInfo !== 'object') {
    throw new Error(`无法从 Forge 安装器解析版本配置`);
  }
  console.log('[Loader] versionInfo 解析完成');
  console.log('[Loader]   mainClass (from versionInfo):', versionInfo.mainClass);
  console.log('[Loader]   mainClass (from installData):', installData && installData.mainClass);

  // 4) 从解压的 maven 目录复制所有 jar 到 libraries 目录
  // 这是 PCL/versePc 的核心做法：maven 目录结构与 libraries 目录结构一一对应
  onProgress && onProgress({ stage: 'copy-main-jar', message: '复制 Forge 依赖库到 libraries...', percent: 32 });

  const mavenRoot = path.join(extractDir, 'maven');
  let forgeJarName = null;
  let forgeLocalJar = null;

  if (fs.existsSync(mavenRoot)) {
    // 递归复制 maven 目录下的所有 jar 文件到 libraries 目录
    function copyMavenToLibraries(srcDir) {
      const entries = fs.readdirSync(srcDir);
      for (const entry of entries) {
        const srcPath = path.join(srcDir, entry);
        try {
          const stat = fs.statSync(srcPath);
          if (stat.isDirectory()) {
            copyMavenToLibraries(srcPath);
          } else if (entry.endsWith('.jar')) {
            // mavenRoot 下的相对路径 = libraries 目录下的相对路径
            const relPath = path.relative(mavenRoot, srcPath);
            const destPath = path.join(librariesDir, relPath);
            ensureDir(path.dirname(destPath));
            try {
              if (!fs.existsSync(destPath)) {
                fs.copyFileSync(srcPath, destPath);
              }
              // 记录 forge 主库文件位置（用于后续检查）
              if (entry.startsWith('forge') && !entry.includes('installer')) {
                forgeJarName = entry;
                forgeLocalJar = destPath;
              }
            } catch (copyErr) {
              console.warn(`[Loader]   复制失败 ${entry}: ${copyErr.message}`);
            }
          }
        } catch (e) {}
      }
    }
    copyMavenToLibraries(mavenRoot);
    console.log('[Loader]   已复制 maven 目录到 libraries');
  }

  // 如果 maven 目录中没有找到 forge jar，尝试回退搜索
  if (!forgeLocalJar) {
    const found = findForgeJar(extractDir, mcVersion, forgeVersion);
    if (found && fs.existsSync(found)) {
      const forgeLocalDir = path.join(librariesDir, 'net', 'minecraftforge', 'forge', fullForgeVersion);
      ensureDir(forgeLocalDir);
      forgeJarName = path.basename(found);
      forgeLocalJar = path.join(forgeLocalDir, forgeJarName);
      if (!fs.existsSync(forgeLocalJar)) {
        fs.copyFileSync(found, forgeLocalJar);
      }
    }
  }

  if (!forgeLocalJar || !fs.existsSync(forgeLocalJar)) {
    throw new Error(`在 Forge 安装器中未找到主库 jar 文件`);
  }
  console.log(`[Loader]   forge 主库: ${forgeLocalJar}`);

  // 5) 复制 forge_patched_minecraft.jar（如果存在）
  // 对于 Forge 1.20.1+，这个文件可能在 data 目录下，需要从安装器解压
  const patchedJarPatterns = [
    path.join(extractDir, '.forge_patched_minecraft.jar'),
    path.join(extractDir, 'forge_patched_minecraft.jar'),
    path.join(extractDir, 'data', '.forge_patched_minecraft.jar'),
    path.join(extractDir, 'data', 'forge_patched_minecraft.jar'),
    // 新版 Forge 安装器可能使用不同的命名
    path.join(extractDir, 'data', `${mcVersion}-forge_patched_minecraft.jar`),
    path.join(extractDir, `${mcVersion}-forge_patched_minecraft.jar`)
  ];
  
  let patchedJarFound = false;
  for (const patchedPattern of patchedJarPatterns) {
    if (fs.existsSync(patchedPattern)) {
      const versionDir = path.join(versionsDir, versionId);
      ensureDir(versionDir);
      const destPatchedJar = path.join(versionDir, '.forge_patched_minecraft.jar');
      try {
        fs.copyFileSync(patchedPattern, destPatchedJar);
        console.log(`[Loader]   已复制 forge_patched_minecraft.jar: ${destPatchedJar}`);
        patchedJarFound = true;
      } catch (e) {
        console.warn(`[Loader]   复制 forge_patched_minecraft.jar 失败: ${e.message}`);
      }
      break;
    }
  }
  
  // 如果没有找到 patched jar，尝试从安装器运行提取（对于新版 Forge）
  if (!patchedJarFound) {
    console.log('[Loader]   未找到预生成的 forge_patched_minecraft.jar，尝试从安装器提取...');
    try {
      // 检查安装器是否包含 data/client.lzma 或类似文件需要解压
      const dataDir = path.join(extractDir, 'data');
      if (fs.existsSync(dataDir)) {
        const dataFiles = fs.readdirSync(dataDir);
        console.log('[Loader]   data 目录内容:', dataFiles);
        
        // 查找可能的 patched jar 文件（各种命名格式）
        const possiblePatchedFiles = dataFiles.filter(f => 
          f.includes('patched') || 
          f.includes('client') || 
          f.endsWith('.lzma') ||
          f.endsWith('.jar')
        );
        
        for (const file of possiblePatchedFiles) {
          const srcPath = path.join(dataDir, file);
          const stat = fs.statSync(srcPath);
          if (stat.isFile() && file.endsWith('.jar')) {
            const versionDir = path.join(versionsDir, versionId);
            ensureDir(versionDir);
            const destPatchedJar = path.join(versionDir, '.forge_patched_minecraft.jar');
            try {
              fs.copyFileSync(srcPath, destPatchedJar);
              console.log(`[Loader]   从 data 目录复制 jar: ${destPatchedJar}`);
              patchedJarFound = true;
              break;
            } catch (e) {
              console.warn(`[Loader]   复制失败: ${e.message}`);
            }
          }
        }
      }
    } catch (e) {
      console.warn(`[Loader]   提取 patched jar 失败: ${e.message}`);
    }
  }
  
  // 6) 运行 install_profile.json 中的处理器（对于新版 Forge 1.20.1+ 必需）
  // 这些处理器负责生成 .forge_patched_minecraft.jar 等文件
  if (installProfile && installProfile.processors && Array.isArray(installProfile.processors)) {
    onProgress && onProgress({ stage: 'processors', message: '运行 Forge 安装处理器...', percent: 36 });
    try {
      // 使用 rawForgeVer（纯 Forge 版本号，不含 MC 版本前缀）
      await runForgeProcessors(installProfile, extractDir, librariesDir, mcVersion, rawForgeVer, onProgress);
    } catch (e) {
      console.warn(`[Loader]   运行处理器失败: ${e.message}`);
      // 处理器失败不中断安装，因为某些处理器可能是可选的
    }
  }
  
  // 7) 如果仍然没有找到 patched jar，尝试直接运行 Forge 安装器
  // 这是最后的备选方案，适用于新版 Forge
  if (!patchedJarFound) {
    const versionDir = path.join(versionsDir, versionId);
    const patchedJarPath = path.join(versionDir, '.forge_patched_minecraft.jar');
    if (!fs.existsSync(patchedJarPath)) {
      console.log('[Loader]   尝试直接运行 Forge 安装器生成必要文件...');
      try {
        await runForgeInstaller(installerPath, mcVersion, versionsDir, librariesDir, onProgress);
      } catch (e) {
        console.warn(`[Loader]   运行安装器失败: ${e.message}`);
      }
    }
  }

  // 5) 组装 version.json：直接使用安装器提供的 versionInfo.libraries
  // 这是最关键的简化：Forge 安装器的 version.json 已经包含正确的 libraries 列表
  onProgress && onProgress({ stage: 'build', message: '生成 version.json 配置...', percent: 38 });

  // 从多个来源获取 mainClass，优先级：installData > installProfile > versionInfo > 默认值
  // 注意：对于 Forge 1.17+，versionInfo.mainClass 可能是原版的 net.minecraft.client.main.Main
  // 我们需要使用 Forge 的启动类
  let mainClass = null;
  
  // 首先尝试从 installData 获取
  if (installData && installData.mainClass) {
    mainClass = installData.mainClass;
    console.log('[Loader]   使用 installData 中的 mainClass:', mainClass);
  }
  
  // 然后尝试从 installProfile 获取
  if (!mainClass && installProfile && installProfile.mainClass) {
    mainClass = installProfile.mainClass;
    console.log('[Loader]   使用 installProfile 中的 mainClass:', mainClass);
  }
  
  // 如果还是没有，根据 Minecraft 版本推断默认的 mainClass
  if (!mainClass) {
    // Forge 1.17+ / MC 2.0+ 使用 net.minecraftforge.bootstrap.ForgeBootstrap
    // 旧版使用 cpw.mods.bootstraplauncher.BootstrapLauncher 或 net.minecraftforge.userdev.LaunchTesting
    const mcVerParts = mcVersion.split('.');
    const mcMajor = parseInt(mcVerParts[0], 10);
    const mcMinor = parseInt(mcVerParts[1], 10);
    // MC 2.0+ (如 26.1) 或 1.17+ 都使用 ForgeBootstrap
    const isModernMC = mcMajor > 1;
    if (isModernMC || (mcMajor === 1 && mcMinor >= 17)) {
      mainClass = 'net.minecraftforge.bootstrap.ForgeBootstrap';
    } else {
      mainClass = 'net.minecraftforge.userdev.LaunchTesting';
    }
    console.warn('[Loader] 未找到 mainClass，使用默认值:', mainClass);
  }
  
  // 最后才使用 versionInfo 中的 mainClass（通常是原版的，不推荐用于 Forge）
  if (!mainClass && versionInfo.mainClass) {
    mainClass = versionInfo.mainClass;
    console.warn('[Loader]   使用 versionInfo 中的 mainClass（可能是原版的）:', mainClass);
  }
  console.log('[Loader]   最终使用的 mainClass:', mainClass);
  const actualForgeJarName = forgeJarName || `forge-${fullForgeVersion}.jar`;

  // 只使用 versionInfo 中已有的 libraries（这是 Forge 官方设计的运行时依赖）
  // 不把 install_profile.libraries 加进去，那些是安装时的依赖
  let libraries = Array.isArray(versionInfo.libraries) ? versionInfo.libraries.slice() : [];

  // 确保 Forge 主库本身在 libraries 里，且 path 与实际复制的文件匹配
  const forgeArtifactPath = `net/minecraftforge/forge/${fullForgeVersion}/${actualForgeJarName}`;
  const forgeLibName = `net.minecraftforge:forge:${fullForgeVersion}`;

  // 检查 versionInfo 中是否已有 forge 主库，如果有但 path 不匹配，修正 path
  const forgeLibIndex = libraries.findIndex(l => l && l.name && l.name.startsWith('net.minecraftforge:forge'));
  if (forgeLibIndex >= 0) {
    const existingLib = libraries[forgeLibIndex];
    if (existingLib.downloads && existingLib.downloads.artifact) {
      const existingPath = existingLib.downloads.artifact.path;
      const actualPath = `net/minecraftforge/forge/${fullForgeVersion}/${actualForgeJarName}`;
      // 如果文件在实际路径存在，但 versionInfo 指定的路径不存在，使用实际路径
      if (!fs.existsSync(path.join(librariesDir, existingPath)) &&
          fs.existsSync(path.join(librariesDir, actualPath))) {
        existingLib.downloads.artifact.path = actualPath;
        existingLib.downloads.artifact.url = `${BMCLAPI_BASE}/maven/${actualPath}`;
      }
    }
  } else {
    // 没有找到 forge 主库条目，手动添加
    libraries.unshift({
      name: forgeLibName,
      downloads: {
        artifact: {
          path: forgeArtifactPath,
          url: `${BMCLAPI_BASE}/maven/${forgeArtifactPath}`,
          sha1: ''
        }
      }
    });
  }

  // 规范化所有库的 URL 到 BMCLAPI，并确保 downloads.artifact.path 存在
  // 关键：保持原有的 path 不变（因为从 maven 目录复制的文件路径是正确的）
  const seenNames = new Set();
  const finalLibraries = [];
  for (const lib of libraries) {
    if (!lib || !lib.name) continue;
    if (seenNames.has(lib.name)) continue;
    seenNames.add(lib.name);

    const cloned = JSON.parse(JSON.stringify(lib));

    if (!cloned.downloads) cloned.downloads = {};
    if (!cloned.downloads.artifact) cloned.downloads.artifact = {};

    // 如果没有 path，根据 maven 坐标构建一个默认的
    if (!cloned.downloads.artifact.path) {
      const parts = cloned.name.split(':'); // group:artifact:version[:classifier]
      if (parts.length >= 3) {
        const [grp, art, ver, cls] = parts;
        const fileName = cls ? `${art}-${ver}-${cls}.jar` : `${art}-${ver}.jar`;
        cloned.downloads.artifact.path = `${grp.replace(/\./g, '/')}/${art}/${ver}/${fileName}`;
      }
    }

    // 关键修复：验证 path 是否指向实际存在的文件
    // 如果 versionInfo 中的 path 指向的文件不存在，尝试根据 maven 坐标找到实际文件
    if (cloned.downloads.artifact.path) {
      const expectedPath = path.join(librariesDir, cloned.downloads.artifact.path);
      if (!fs.existsSync(expectedPath)) {
        // 尝试根据 maven 坐标找到实际文件
        const parts = cloned.name.split(':');
        if (parts.length >= 3) {
          const [grp, art, ver] = parts;
          const groupPath = grp.replace(/\./g, '/');
          const libDir = path.join(librariesDir, groupPath, art, ver);
          if (fs.existsSync(libDir)) {
            const files = fs.readdirSync(libDir).filter(f => f.endsWith('.jar') && !f.includes('sources') && !f.includes('javadoc'));
            if (files.length > 0) {
              // 使用找到的第一个 jar 文件
              const actualFileName = files[0];
              cloned.downloads.artifact.path = `${groupPath}/${art}/${ver}/${actualFileName}`;
              console.log(`[Loader]   修正库路径: ${cloned.name} -> ${cloned.downloads.artifact.path}`);
            }
          }
        }
      }
    }

    // 统一 URL 到 BMCLAPI（保持 path 不变）
    if (cloned.downloads.artifact.path) {
      cloned.downloads.artifact.url = `${BMCLAPI_BASE}/maven/${cloned.downloads.artifact.path}`;
    }

    finalLibraries.push(cloned);
  }
  console.log(`[Loader]   共 ${finalLibraries.length} 个依赖库`);

  // 启动参数：直接使用 versionInfo 提供的
  let finalArguments;
  if (versionInfo.arguments) {
    finalArguments = versionInfo.arguments;
  } else if (versionInfo.minecraftArguments) {
    finalArguments = {
      game: versionInfo.minecraftArguments.split(' ').filter(a => a.length > 0),
      jvm: []
    };
  } else {
    finalArguments = { game: [], jvm: [] };
  }

  const finalVersionJson = {
    id: versionId,
    inheritsFrom: mcVersion,
    releaseTime: new Date().toISOString(),
    time: new Date().toISOString(),
    type: 'release',
    mainClass: mainClass,
    arguments: finalArguments,
    libraries: finalLibraries
  };

  // 6) 写入 version.json
  const versionDir = path.join(versionsDir, versionId);
  ensureDir(versionDir);
  const jsonPath = path.join(versionDir, `${versionId}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(finalVersionJson, null, 2));
  console.log(`[Loader]   已写入版本配置: ${jsonPath}`);

  // 8) 下载所有缺失的库（并发）
  onProgress && onProgress({ stage: 'libraries', message: `下载 Forge 依赖库 (共 ${finalLibraries.length} 个)...`, percent: 48 });

  // 第一步：快速收集需要下载的库
  const forgeLibTasks = [];
  for (let i = 0; i < finalLibraries.length; i++) {
    const lib = finalLibraries[i];
    if (!lib.downloads || !lib.downloads.artifact || !lib.downloads.artifact.path) continue;
    const artifact = lib.downloads.artifact;
    const localPath = path.join(librariesDir, artifact.path);
    const expectedSize = artifact.size;
    if (fs.existsSync(localPath)) {
      if (expectedSize && expectedSize > 0) {
        try {
          const actualSize = fs.statSync(localPath).size;
          if (actualSize === expectedSize) continue;
          console.log(`[Loader]   重新下载 (大小不匹配): ${lib.name} (${actualSize} != ${expectedSize})`);
        } catch (_) {}
      } else {
        // 没有 size 字段：根据文件大小判断
        // 小文件（<50KB）可能是从安装器的 maven 目录复制的占位文件，需要重新从 BMCLAPI 下载
        // 大文件（>=50KB）信任现有文件，避免重复下载
        try {
          const actualSize = fs.statSync(localPath).size;
          if (actualSize >= 50000) continue;
          console.log(`[Loader]   小文件需要验证: ${lib.name} (${actualSize} bytes, 无 size)`);
        } catch (_) {}
      }
    }
    const libUrl = artifact.url || `${BMCLAPI_BASE}/maven/${artifact.path}`;
    forgeLibTasks.push({ lib, localPath, libUrl, expectedSize });
  }

  if (forgeLibTasks.length > 0) {
    console.log(`[Loader]   并发下载 ${forgeLibTasks.length} 个库 (并发 ${DEFAULT_CONCURRENCY_LIBRARIES})`);
    let doneCount = 0;
    const total = forgeLibTasks.length;
    await runWithConcurrency(
      forgeLibTasks,
      async (libItem) => {
        ensureDir(path.dirname(libItem.localPath));
        try {
          await downloadFile(libItem.libUrl, libItem.localPath, null, 300000, libItem.expectedSize);
        } catch (e) {
          // 关键：如果是取消信号，立即重新抛出，让上层处理
          if (e && e.cancelled) throw e;
          console.warn(`[Loader]   库下载失败 (${libItem.lib.name}): ${e.message}`);
        }
        doneCount += 1;
        const stagePct = 48 + (doneCount / total) * 50;
        onProgress && onProgress({
          stage: 'libraries',
          message: `下载 Forge 依赖库 (${doneCount}/${total})`,
          percent: Math.min(98, Math.round(stagePct))
        });
      },
      { concurrency: DEFAULT_CONCURRENCY_LIBRARIES }
    );
  } else {
    console.log('[Loader]   所有库已存在，跳过下载');
  }

  // 清理
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {
    console.warn(`[Loader]   清理临时目录失败: ${e.message}`);
  }

  console.log(`[Loader] ========== Forge 安装完成: ${versionId} ==========`);
  onProgress && onProgress({ stage: 'complete', message: `Forge 安装完成 (${versionId})`, percent: 100 });
  return versionId;
}

/* =========================================================
 *              NeoForge 安装（同 Forge 流程）
 * ========================================================= */

async function installNeoForge(mcVersion, neoforgeVersion, onProgress) {
  console.log(`[Loader] ========== 开始安装 NeoForge ${neoforgeVersion} for MC ${mcVersion} ==========`);
  if (!mcVersion || !neoforgeVersion) throw new Error('NeoForge 安装参数错误');

  const versionsDir = versionManager.getVersionsDir();
  const librariesDir = versionManager.getLibrariesDir();
  ensureDir(versionsDir);
  ensureDir(librariesDir);

  // NeoForge 版本号不使用 Minecraft 版本前缀，直接使用原始版本号
  // 例如：21.0.0 而不是 1.21.0-21.0.0
  const rawNeoVer = neoforgeVersion.trim();
  const fullNeoVer = rawNeoVer;
  const versionId = `${mcVersion}-neoforge-${rawNeoVer}`;
  const url = NEOFORGE_INSTALLER_URL(mcVersion, neoforgeVersion);

  onProgress && onProgress({ stage: 'download', message: `下载 NeoForge 安装器...`, percent: 3 });
  const tempDir = path.join(versionsDir, '.temp', `neoforge-${fullNeoVer}`);
  ensureDir(tempDir);
  const installerPath = path.join(tempDir, `neoforge-${fullNeoVer}-installer.jar`);
  try {
    await downloadFile(url, installerPath, (p) => {
      onProgress && onProgress({
        stage: 'download', message: `下载 NeoForge 安装器 ${p.percent}%`,
        percent: 3 + (p.percent || 0) * 0.15
      });
    });
  } catch (e) {
    throw new Error(`下载 NeoForge 安装器失败: ${e.message}\nURL: ${url}`);
  }

  onProgress && onProgress({ stage: 'extract', message: '解压 NeoForge 安装器...', percent: 22 });
  const extractDir = path.join(tempDir, 'extracted');
  ensureDir(extractDir);
  try {
    await extractZip(installerPath, extractDir);
  } catch (e) {
    throw new Error(`解压 NeoForge 安装器失败: ${e.message}`);
  }

  onProgress && onProgress({ stage: 'parse', message: '解析 NeoForge 配置...', percent: 28 });
  let versionInfo = null;
  let installProfile = null;
  const vJsonPath = path.join(extractDir, 'version.json');
  if (fs.existsSync(vJsonPath)) {
    try { versionInfo = JSON.parse(fs.readFileSync(vJsonPath, 'utf-8')); }
    catch (e) { console.warn(e.message); }
  }
  const profilePath = path.join(extractDir, 'install_profile.json');
  if (fs.existsSync(profilePath)) {
    try { installProfile = JSON.parse(fs.readFileSync(profilePath, 'utf-8')); }
    catch (e) { console.warn(e.message); }
  }
  if (!versionInfo && installProfile && installProfile.versionInfo) versionInfo = installProfile.versionInfo;
  if (!versionInfo && installProfile && installProfile.install && installProfile.install.json) {
    const externalPath = path.join(extractDir, installProfile.install.json);
    if (fs.existsSync(externalPath)) {
      try { versionInfo = JSON.parse(fs.readFileSync(externalPath, 'utf-8')); }
      catch (e) { console.warn(e.message); }
    }
  }
  if (!versionInfo) {
    throw new Error(`无法从 NeoForge 安装器解析版本配置`);
  }

  // 从解压的 maven 目录复制所有 jar 到 libraries 目录（同 Forge 模式）
  onProgress && onProgress({ stage: 'copy-main-jar', message: '复制 NeoForge 依赖库到 libraries...', percent: 34 });
  const nfMavenRoot = path.join(extractDir, 'maven');
  let mainJarName = null;
  let nfLocalJar = null;

  if (fs.existsSync(nfMavenRoot)) {
    function copyNfMavenToLibraries(srcDir) {
      const entries = fs.readdirSync(srcDir);
      for (const entry of entries) {
        const srcPath = path.join(srcDir, entry);
        try {
          const stat = fs.statSync(srcPath);
          if (stat.isDirectory()) {
            copyNfMavenToLibraries(srcPath);
          } else if (entry.endsWith('.jar')) {
            const relPath = path.relative(nfMavenRoot, srcPath);
            const destPath = path.join(librariesDir, relPath);
            ensureDir(path.dirname(destPath));
            try {
              if (!fs.existsSync(destPath)) {
                fs.copyFileSync(srcPath, destPath);
              }
              if (entry.startsWith('neoforge') && !entry.includes('installer')) {
                mainJarName = entry;
                nfLocalJar = destPath;
              }
            } catch (copyErr) {}
          }
        } catch (e) {}
      }
    }
    copyNfMavenToLibraries(nfMavenRoot);
    console.log('[Loader]   已拷贝 NeoForge maven 目录到 libraries');
  }

  // 回退搜索
  if (!nfLocalJar) {
    let biggest = { size: 0, path: null };
    function walk(dir) {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir)) {
        const full = path.join(dir, e);
        const st = fs.statSync(full);
        if (st.isDirectory()) walk(full);
        else if (e.endsWith('.jar') && !e.includes('installer')) {
          if (st.size > biggest.size) biggest = { size: st.size, path: full };
        }
      }
    }
    walk(extractDir);
    if (biggest.path) {
      const nfLocalDir = path.join(librariesDir, 'net', 'neoforged', 'neoforge', fullNeoVer);
      ensureDir(nfLocalDir);
      mainJarName = path.basename(biggest.path);
      nfLocalJar = path.join(nfLocalDir, mainJarName);
      if (!fs.existsSync(nfLocalJar)) fs.copyFileSync(biggest.path, nfLocalJar);
    }
  }
  if (!nfLocalJar || !fs.existsSync(nfLocalJar)) {
    throw new Error(`在 NeoForge 解压目录中未找到主库 jar`);
  }
  console.log(`[Loader]   NeoForge 主库: ${nfLocalJar}`);

  // 构造 version.json：同 Forge 简化流程，只使用 versionInfo.libraries
  onProgress && onProgress({ stage: 'build', message: '生成 version.json...', percent: 40 });

  // 从 versionInfo 或 installProfile 获取 mainClass
  let mainClass = versionInfo.mainClass;
  if (!mainClass && installProfile && installProfile.install && installProfile.install.mainClass) {
    mainClass = installProfile.install.mainClass;
  }
  if (!mainClass) {
    // NeoForge 1.20.1+ 使用 net.neoforged.neoforge.common.NeoForgeLaunchHandler
    // 新版使用 net.neoforged.fml.common.launcher.FMLLaunchHandler
    // 默认使用最常见的启动类
    mainClass = 'net.neoforged.fml.common.launcher.FMLLaunchHandler';
    console.warn('[Loader] 未找到 mainClass，使用默认值:', mainClass);
  }
  console.log('[Loader]   最终使用的 mainClass:', mainClass);

  const actualJarName = mainJarName || `neoforge-${fullNeoVer}.jar`;

  let rawLibraries = Array.isArray(versionInfo.libraries) ? versionInfo.libraries.slice() : [];

  // 确保 NeoForge 主库在 libraries 里，并确保 path 与实际文件匹配
  const nfArtifactPath = `net/neoforged/neoforge/${fullNeoVer}/${actualJarName}`;
  const nfLibName = `net.neoforged:neoforge:${fullNeoVer}`;

  const nfLibIndex = rawLibraries.findIndex(l => l && l.name && l.name.startsWith('net.neoforged:neoforge'));
  if (nfLibIndex >= 0) {
    const existingLib = rawLibraries[nfLibIndex];
    if (existingLib.downloads && existingLib.downloads.artifact) {
      const existingPath = existingLib.downloads.artifact.path;
      const actualPath = `net/neoforged/neoforge/${fullNeoVer}/${actualJarName}`;
      if (!fs.existsSync(path.join(librariesDir, existingPath)) &&
          fs.existsSync(path.join(librariesDir, actualPath))) {
        existingLib.downloads.artifact.path = actualPath;
        existingLib.downloads.artifact.url = `${BMCLAPI_BASE}/maven/${actualPath}`;
      }
    }
  } else {
    rawLibraries.unshift({
      name: nfLibName,
      downloads: {
        artifact: {
          path: nfArtifactPath,
          url: `${BMCLAPI_BASE}/maven/${nfArtifactPath}`,
          sha1: ''
        }
      }
    });
  }

  // 规范化 URL 到 BMCLAPI（保持原有的 path 不变）
  const seenNames = new Set();
  const finalLibraries = [];
  for (const lib of rawLibraries) {
    if (!lib || !lib.name) continue;
    if (seenNames.has(lib.name)) continue;
    seenNames.add(lib.name);
    const cloned = JSON.parse(JSON.stringify(lib));

    if (!cloned.downloads) cloned.downloads = {};
    if (!cloned.downloads.artifact) cloned.downloads.artifact = {};

    // 如果没有 path，根据 maven 坐标构建一个默认的
    if (!cloned.downloads.artifact.path) {
      const parts = cloned.name.split(':');
      if (parts.length >= 3) {
        const [grp, nm, ver, cls] = parts;
        const fileName = cls ? `${nm}-${ver}-${cls}.jar` : `${nm}-${ver}.jar`;
        cloned.downloads.artifact.path = `${grp.replace(/\./g, '/')}/${nm}/${ver}/${fileName}`;
      }
    }

    // 关键修复：验证 path 是否指向实际存在的文件
    if (cloned.downloads.artifact.path) {
      const expectedPath = path.join(librariesDir, cloned.downloads.artifact.path);
      if (!fs.existsSync(expectedPath)) {
        const parts = cloned.name.split(':');
        if (parts.length >= 3) {
          const [grp, nm, ver] = parts;
          const groupPath = grp.replace(/\./g, '/');
          const libDir = path.join(librariesDir, groupPath, nm, ver);
          if (fs.existsSync(libDir)) {
            const files = fs.readdirSync(libDir).filter(f => f.endsWith('.jar') && !f.includes('sources') && !f.includes('javadoc'));
            if (files.length > 0) {
              const actualFileName = files[0];
              cloned.downloads.artifact.path = `${groupPath}/${nm}/${ver}/${actualFileName}`;
              console.log(`[Loader]   修正库路径: ${cloned.name} -> ${cloned.downloads.artifact.path}`);
            }
          }
        }
      }
    }

    // 统一 URL 到 BMCLAPI（保持 path 不变）
    if (cloned.downloads.artifact.path) {
      cloned.downloads.artifact.url = `${BMCLAPI_BASE}/maven/${cloned.downloads.artifact.path}`;
    }

    finalLibraries.push(cloned);
  }

  let finalArguments;
  if (versionInfo.arguments) finalArguments = versionInfo.arguments;
  else if (versionInfo.minecraftArguments) {
    finalArguments = { game: versionInfo.minecraftArguments.split(' ').filter(a => a.length > 0), jvm: [] };
  } else finalArguments = { game: [], jvm: [] };

  const finalVersionJson = {
    id: versionId,
    inheritsFrom: mcVersion,
    releaseTime: new Date().toISOString(),
    time: new Date().toISOString(),
    type: 'release',
    mainClass,
    arguments: finalArguments,
    libraries: finalLibraries
  };

  const versionDir = path.join(versionsDir, versionId);
  ensureDir(versionDir);
  fs.writeFileSync(path.join(versionDir, `${versionId}.json`), JSON.stringify(finalVersionJson, null, 2));
  console.log(`[Loader]   已写入版本配置: ${path.join(versionDir, versionId + '.json')}`);

  onProgress && onProgress({ stage: 'libraries', message: `下载 NeoForge 依赖库 (共 ${finalLibraries.length} 个)...`, percent: 50 });

  const nfLibTasks = [];
  for (let i = 0; i < finalLibraries.length; i++) {
    const lib = finalLibraries[i];
    if (!lib.downloads || !lib.downloads.artifact || !lib.downloads.artifact.path) continue;
    const artifact = lib.downloads.artifact;
    const localPath = path.join(librariesDir, artifact.path);
    const expectedSize = artifact.size;
    if (fs.existsSync(localPath)) {
      if (expectedSize && expectedSize > 0) {
        try {
          const actualSize = fs.statSync(localPath).size;
          if (actualSize === expectedSize) continue;
          console.log(`[Loader]   重新下载 (大小不匹配): ${lib.name} (${actualSize} != ${expectedSize})`);
        } catch (_) {}
      } else {
        // 没有 size 字段：小文件（<50KB）可能是占位文件，需要重新下载
        try {
          const actualSize = fs.statSync(localPath).size;
          if (actualSize >= 50000) continue;
          console.log(`[Loader]   小文件需要验证: ${lib.name} (${actualSize} bytes, 无 size)`);
        } catch (_) {}
      }
    }
    const libUrl = artifact.url || `${BMCLAPI_BASE}/maven/${artifact.path}`;
    nfLibTasks.push({ lib, localPath, libUrl, expectedSize });
  }

  if (nfLibTasks.length > 0) {
    console.log(`[Loader]   并发下载 ${nfLibTasks.length} 个库 (并发 ${DEFAULT_CONCURRENCY_LIBRARIES})`);
    let doneCount = 0;
    const total = nfLibTasks.length;
    await runWithConcurrency(
      nfLibTasks,
      async (libItem) => {
        ensureDir(path.dirname(libItem.localPath));
        try {
          await downloadFile(libItem.libUrl, libItem.localPath, null, 300000, libItem.expectedSize);
        } catch (e) {
          if (e && e.cancelled) throw e;
          console.warn(`[Loader]   库下载失败 (${libItem.lib.name}): ${e.message}`);
        }
        doneCount += 1;
        const pct = 50 + (doneCount / total) * 48;
        onProgress && onProgress({
          stage: 'libraries',
          message: `下载 NeoForge 依赖库 (${doneCount}/${total})`,
          percent: Math.min(98, Math.round(pct))
        });
      },
      { concurrency: DEFAULT_CONCURRENCY_LIBRARIES }
    );
  } else {
    console.log('[Loader]   所有库已存在，跳过下载');
  }

  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}

  console.log(`[Loader] ========== NeoForge 安装完成: ${versionId} ==========`);
  onProgress && onProgress({ stage: 'complete', message: `NeoForge 安装完成 (${versionId})`, percent: 100 });
  return versionId;
}

/* =========================================================
 *                    Fabric 安装
 * ========================================================= */

async function installFabric(mcVersion, fabricLoaderVersion, onProgress) {
  console.log(`[Loader] ========== 开始安装 Fabric ${fabricLoaderVersion} for MC ${mcVersion} ==========`);
  if (!mcVersion || !fabricLoaderVersion) throw new Error('Fabric 安装参数错误');

  const versionsDir = versionManager.getVersionsDir();
  const librariesDir = versionManager.getLibrariesDir();
  ensureDir(versionsDir);
  ensureDir(librariesDir);

  const versionId = `${mcVersion}-fabric-${fabricLoaderVersion}`;

  // 先试 BMCLAPI，失败回退到官方 fabricmc.net
  const metaUrls = [
    FABRIC_META_URL(mcVersion, fabricLoaderVersion),
    `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(fabricLoaderVersion)}/profile/json`
  ];

  onProgress && onProgress({ stage: 'fetch', message: `获取 Fabric 版本元数据...`, percent: 5 });
  let versionJson = null;
  let lastMetaError = null;
  for (const url of metaUrls) {
    try {
      console.log(`[Loader]   请求 Fabric 元数据: ${url}`);
      const data = await httpGetJson(url, 20000);
      if (data && typeof data === 'object' && data.mainClass) {
        versionJson = data;
        break;
      }
    } catch (e) {
      console.warn(`[Loader]   Fabric meta 失败: ${e.message}`);
      lastMetaError = e;
    }
  }
  if (!versionJson || typeof versionJson !== 'object') {
    throw new Error(`无法从 Fabric Meta 获取版本数据 (最后一次错误: ${lastMetaError ? lastMetaError.message : 'unknown'})`);
  }

  versionJson.id = versionId;
  versionJson.inheritsFrom = mcVersion;
  console.log(`[Loader]   version.json: id=${versionId}, inheritsFrom=${mcVersion}, mainClass=${versionJson.mainClass}`);

  // 重写库 URL 到 BMCLAPI
  if (Array.isArray(versionJson.libraries)) {
    versionJson.libraries = versionJson.libraries.map(lib => {
      if (!lib) return lib;
      const cloned = JSON.parse(JSON.stringify(lib));
      // 确保 downloads.artifact 存在
      if (!cloned.downloads) cloned.downloads = {};
      if (!cloned.downloads.artifact) cloned.downloads.artifact = {};

      // 从 maven 坐标构造 path
      if (!cloned.downloads.artifact.path && cloned.name) {
        const parts = cloned.name.split(':');
        if (parts.length >= 3) {
          const [grp, nm, ver, cls] = parts;
          const fileName = cls ? `${nm}-${ver}-${cls}.jar` : `${nm}-${ver}.jar`;
          cloned.downloads.artifact.path = `${grp.replace(/\./g, '/')}/${nm}/${ver}/${fileName}`;
        }
      }
      // 重写 URL 到 BMCLAPI
      if (cloned.downloads.artifact.path) {
        cloned.downloads.artifact.url = `${BMCLAPI_BASE}/maven/${cloned.downloads.artifact.path}`;
      }
      return cloned;
    });
  }

  const versionDir = path.join(versionsDir, versionId);
  ensureDir(versionDir);
  const jsonPath = path.join(versionDir, `${versionId}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(versionJson, null, 2));
  console.log(`[Loader]   已写入: ${jsonPath}`);

  // 下载库
  const libs = Array.isArray(versionJson.libraries) ? versionJson.libraries : [];
  onProgress && onProgress({ stage: 'libraries', message: `下载 Fabric 依赖库 (共 ${libs.length} 个)...`, percent: 15 });

  // 收集需要下载的库，然后并发下载
  const fabricLibTasks = [];
  for (let i = 0; i < libs.length; i++) {
    const lib = libs[i];
    if (!lib || !lib.downloads || !lib.downloads.artifact || !lib.downloads.artifact.path) continue;
    const artifact = lib.downloads.artifact;
    const localPath = path.join(librariesDir, artifact.path);
    const expectedSize = artifact.size;
    if (fs.existsSync(localPath)) {
      if (expectedSize && expectedSize > 0) {
        try {
          const actualSize = fs.statSync(localPath).size;
          if (actualSize === expectedSize) continue;
          console.log(`[Loader]   重新下载 (大小不匹配): ${lib.name} (${actualSize} != ${expectedSize})`);
        } catch (_) {}
      } else {
        try {
          const actualSize = fs.statSync(localPath).size;
          if (actualSize >= 50000) continue;
        } catch (_) {}
      }
    }
    // 构造回退 URL：优先 BMCLAPI，失败时回退到原始 maven 源
    const primaryUrl = artifact.url;
    // lib.url 格式类似 https://maven.fabricmc.net/，拼接完整 path
    const fallbackUrl = lib.url && lib.url.startsWith('http')
      ? (lib.url.endsWith('/') ? lib.url : lib.url + '/') + artifact.path
      : null;
    fabricLibTasks.push({ lib, url: primaryUrl, fallbackUrl, localPath, expectedSize });
  }

  if (fabricLibTasks.length > 0) {
    console.log(`[Loader]   并发下载 ${fabricLibTasks.length} 个库 (并发 ${DEFAULT_CONCURRENCY_LIBRARIES})`);
    let doneCount = 0;
    const total = fabricLibTasks.length;
    await runWithConcurrency(
      fabricLibTasks,
      async (libItem) => {
        ensureDir(path.dirname(libItem.localPath));
        try {
          await downloadFile(libItem.url, libItem.localPath, null, 300000, libItem.expectedSize);
        } catch (e) {
          if (e && e.cancelled) throw e;
          console.warn(`[Loader]   Fabric 库下载失败 (${libItem.lib.name}): ${e.message}`);
          if (libItem.fallbackUrl && libItem.fallbackUrl !== libItem.url) {
            console.log(`[Loader]   回退到原始源: ${libItem.fallbackUrl}`);
            try {
              await downloadFile(libItem.fallbackUrl, libItem.localPath, null, 300000, libItem.expectedSize);
            } catch (e2) {
              if (e2 && e2.cancelled) throw e2;
              console.warn(`[Loader]   Fabric 库回退下载也失败 (${libItem.lib.name}): ${e2.message}`);
            }
          }
        }
        doneCount += 1;
        const pct = 15 + (doneCount / total) * 80;
        onProgress && onProgress({
          stage: 'libraries',
          message: `下载 Fabric 依赖库 (${doneCount}/${total})`,
          percent: Math.min(98, Math.round(pct))
        });
      },
      { concurrency: DEFAULT_CONCURRENCY_LIBRARIES }
    );
  } else {
    console.log('[Loader]   所有库已存在，跳过下载');
  }

  console.log(`[Loader] ========== Fabric 安装完成: ${versionId} ==========`);
  onProgress && onProgress({ stage: 'complete', message: `Fabric 安装完成 (${versionId})`, percent: 100 });
  return versionId;
}

/* =========================================================
 *                   OptiFine 安装
 *
 * 解析用户选择的 "HD_U_I7" / "HD_U_J7_pre1" 为
 * (type, patch)，然后从 BMCLAPI 下载到 mods/
 * ========================================================= */

function parseOptiFineVersion(optifineVersion) {
  if (!optifineVersion) return { type: 'HD_U_I7', patch: '' };
  let str = String(optifineVersion).trim();
  // 去掉前缀（如 "OptiFine_1.21.1_HD_U_J1"）
  str = str.replace(/^OptiFine[_\s-]*/i, '');
  str = str.replace(/^\d+\.\d+(\.\d+)?[_\s-]*/, '');

  // 统一分隔符为空格，便于后续处理
  const norm = str.replace(/[_\s]+/g, ' ').trim();
  const parts = norm.split(' ');

  // 判断最后一个部分是否是"补丁号"（如 J1、I7、L7，或 pre10、beta1 等）
  // 规则：最后一段以字母开头 + 数字，或以 pre/beta/alpha/rc 开头
  const isPatchLike = (p) => {
    if (!p) return false;
    return /^[A-Za-z]{1,3}\d{1,4}$/.test(p) || /^(pre|beta|alpha|rc)\d*$/i.test(p);
  };

  if (parts.length <= 1) {
    return { type: str, patch: '' };
  }

  const last = parts[parts.length - 1];
  if (isPatchLike(last)) {
    // 把最后一段视为 patch，前面全部作为 type（恢复为下划线连接）
    const typeParts = parts.slice(0, -1);
    return {
      type: typeParts.join('_'),
      patch: last
    };
  }

  // 无法识别，整个作为 type
  return { type: parts.join('_'), patch: '' };
}

// versionId: 安装目标的版本目录名（可能是 1.20.1 或 1.20.1-forge-47.0.1）
async function installOptiFine(versionId, mcVersion, optifineVersion, onProgress) {
  console.log(`[Loader] ========== 开始安装 OptiFine ${optifineVersion} for ${versionId} ==========`);
  if (!versionId || !mcVersion || !optifineVersion) throw new Error('OptiFine 安装参数错误');

  const { type, patch } = parseOptiFineVersion(optifineVersion);
  console.log(`[Loader]   解析: type=${type}, patch=${patch}`);

  // 版本隔离：OptiFine 放入 versions/<versionId>/mods/
  const modsDir = versionManager.getVersionModsDir(versionId);
  console.log(`[Loader]   mods 目录: ${modsDir}`);

  // BMCLAPI 的 URL 是 /optifine/<mcv>/<type>/<patch>
  // 但不同版本的 format 不同，需要尝试几种变体
  const urlsToTry = [];
  // 1. 标准格式
  urlsToTry.push(OPTIFINE_DOWNLOAD_URL(mcVersion, type, patch));
  // 2. 把 type+patch 合并为一个路径段（有些版本在 BMCLAPI 是这么放的）
  if (patch && patch.length > 0) {
    urlsToTry.push(`${BMCLAPI_BASE}/optifine/${encodeURIComponent(mcVersion)}/${encodeURIComponent(type)}_${encodeURIComponent(patch)}`);
    // 3. 不带下划线的拼合
    urlsToTry.push(`${BMCLAPI_BASE}/optifine/${encodeURIComponent(mcVersion)}/${encodeURIComponent(type)}${encodeURIComponent(patch)}`);
  }
  // 4. 只用 type（如果 patch 被并入 type）
  urlsToTry.push(OPTIFINE_DOWNLOAD_URL(mcVersion, type, ''));

  const fileName = `OptiFine_${mcVersion}_${type}${patch ? '_' + patch : ''}.jar`;
  const targetPath = path.join(modsDir, fileName);

  if (fs.existsSync(targetPath)) {
    console.log(`[Loader]   OptiFine 已存在，跳过下载: ${targetPath}`);
    onProgress && onProgress({ stage: 'complete', message: `OptiFine 已安装 (${fileName})`, percent: 100 });
    return { path: targetPath, fileName };
  }

  onProgress && onProgress({ stage: 'download', message: `下载 OptiFine (BMCLAPI)...`, percent: 10 });

  let lastError = null;
  for (let i = 0; i < urlsToTry.length; i++) {
    const url = urlsToTry[i];
    console.log(`[Loader]   尝试 URL (${i + 1}/${urlsToTry.length}): ${url}`);
    try {
      await downloadFile(url, targetPath, (p) => {
        onProgress && onProgress({
          stage: 'download',
          message: `下载 OptiFine ${p.percent}%`,
          percent: 10 + (p.percent || 0) * 0.85
        });
      });
      if (fs.existsSync(targetPath)) {
        const stat = fs.statSync(targetPath);
        if (stat.size > 50 * 1024) {
          console.log(`[Loader] ========== OptiFine 安装完成: ${targetPath} (${stat.size} bytes) ==========`);
          onProgress && onProgress({ stage: 'complete', message: `OptiFine 安装完成 (${fileName})`, percent: 100 });
          return { path: targetPath, fileName };
        }
        console.warn(`[Loader]   文件过小 (${stat.size} bytes)，视为下载失败`);
      }
    } catch (e) {
      lastError = e;
      console.warn(`[Loader]   URL 失败: ${e.message}`);
    }
    if (fs.existsSync(targetPath)) {
      try {
        const stat = fs.statSync(targetPath);
        if (stat.size <= 50 * 1024) fs.unlinkSync(targetPath);
      } catch (_) {}
    }
  }
  throw new Error(`OptiFine 下载失败，所有 URL 均无法获取有效文件。最后一次错误: ${lastError ? lastError.message : 'unknown'}`);
}

/* =========================================================
 *               统一安装入口
 * ========================================================= */

async function installLoaderVersion(mcVersion, selectedLoaders, onProgress) {
  console.log('[Loader] ========== installLoaderVersion 被调用 ==========');
  console.log('[Loader]   mcVersion:', mcVersion);
  console.log('[Loader]   selectedLoaders:', JSON.stringify(selectedLoaders));

  resetCancel();

  if (!mcVersion) {
    return { success: false, error: 'Minecraft 版本 ID 为空（未选择版本？）' };
  }
  if (!selectedLoaders) {
    return { success: false, error: '未选择任何模组加载器' };
  }

  // 归一化为数组
  let loaders = [];
  if (Array.isArray(selectedLoaders)) {
    loaders = selectedLoaders;
  } else if (typeof selectedLoaders === 'object') {
    loaders = Object.keys(selectedLoaders)
      .filter(k => selectedLoaders[k] && selectedLoaders[k].version)
      .map(k => ({ key: k, version: selectedLoaders[k].version }));
  }

  if (loaders.length === 0) {
    return { success: false, error: '未检测到有效的加载器选择（请先展开加载器并选择具体版本）' };
  }

  console.log(`[Loader]   归一化后: ${JSON.stringify(loaders)}`);

  const results = [];
  let mainVersionId = null;

  const mainLoader = loaders.find(l => ['forge', 'neoforge', 'fabric'].includes(l.key));
  const optifineLoader = loaders.find(l => l.key === 'optifine');

  try {
    // ============================================================
    // 关键修复（PCL 式流程）：
    // Step 1 — 先确保原版 Minecraft 已完整下载
    //   没有原版 json/jar/libraries/assets，加载器的 inheritsFrom 就等于白搭
    // ============================================================
    
    // 检查原版是否已经存在
    const vanillaVersionDir = path.join(versionManager.getVersionsDir(), mcVersion);
    const vanillaJarPath = path.join(vanillaVersionDir, `${mcVersion}.jar`);
    const vanillaJsonPath = path.join(vanillaVersionDir, `${mcVersion}.json`);
    const vanillaExists = fs.existsSync(vanillaJarPath) && fs.existsSync(vanillaJsonPath);
    
    if (vanillaExists) {
      console.log(`[Loader] Step 1: 原版 Minecraft ${mcVersion} 已存在，跳过下载`);
      onProgress && onProgress({
        stage: 'download-vanilla',
        message: `原版 Minecraft ${mcVersion} 已存在，跳过下载`,
        percent: 15
      });
    } else {
      onProgress && onProgress({
        stage: 'download-vanilla',
        message: `下载原版 Minecraft ${mcVersion} (json + jar + libraries + assets)...`,
        percent: 1
      });
      console.log(`[Loader] Step 1: 确保原版 Minecraft ${mcVersion} 已下载`);
      try {
        await downloadManager.downloadVersion(mcVersion, (p) => {
          // 原版下载占总进度的 15%
          onProgress && onProgress({
            stage: p.stage || 'download-vanilla',
            message: p.stageText || `下载原版 ${mcVersion}...`,
            percent: Math.min(15, Math.round((p.percent || 0) * 0.15))
          });
        });
        console.log(`[Loader] Step 1 完成: 原版 Minecraft 已就绪`);
      } catch (e) {
        console.warn(`[Loader] 原版下载异常但继续: ${e.message}`);
      }
    }

    // Step 2 — 安装主加载器（Forge / NeoForge / Fabric）
    if (mainLoader) {
      if (mainLoader.key === 'forge') {
        mainVersionId = await installForge(mcVersion, mainLoader.version, onProgress);
      } else if (mainLoader.key === 'neoforge') {
        mainVersionId = await installNeoForge(mcVersion, mainLoader.version, onProgress);
      } else {
        mainVersionId = await installFabric(mcVersion, mainLoader.version, onProgress);
      }
      results.push({ key: mainLoader.key, versionId: mainVersionId, success: true });
    }

    // Step 3 — 安装 OptiFine（放到对应版本的 mods/ 目录）
    if (optifineLoader) {
      const targetVersionId = mainVersionId || mcVersion;
      const ofResult = await installOptiFine(targetVersionId, mcVersion, optifineLoader.version, onProgress);
      results.push({ key: 'optifine', fileName: ofResult.fileName, path: ofResult.path, success: true });
    }
  } catch (e) {
    console.error('[Loader] 安装异常:', e.message);
    return { success: false, error: e.message, results };
  }

  let versionId = mainVersionId;
  if (optifineLoader && mainVersionId) {
    versionId = mainVersionId; // OptiFine 是 jar 放到 mods/，不需要新的版本目录
  } else if (optifineLoader && !mainVersionId) {
    versionId = mcVersion; // 纯原版 + OptiFine，版本目录就是 mcVersion
  }

  console.log(`[Loader] ========== 全部安装完成，versionId=${versionId} ==========`);
  return { success: true, versionId, results, mcVersion };
}

/* ======================= 导出 ======================= */

// 向前兼容的硬编码矩阵（供某些 UI 逻辑使用）
const OPTIFINE_STABLE_MAP = {
  '1.21.1': { version: 'HD_U_I3', minForge: null },
  '1.21': { version: 'HD_U_I1', minForge: null },
  '1.20.4': { version: 'HD_U_I7', minForge: null },
  '1.20.1': { version: 'HD_U_I7', minForge: '47.0.0' },
  '1.19.4': { version: 'HD_U_I7', minForge: null },
  '1.19.2': { version: 'HD_U_G9', minForge: '43.0.0' },
  '1.18.2': { version: 'HD_U_H7', minForge: null },
  '1.16.5': { version: 'HD_U_G8', minForge: '36.0.0' },
  '1.12.2': { version: 'HD_U_G5', minForge: '14.23.0' }
};

module.exports = {
  detectLoaders,
  detectForge,
  detectNeoForge,
  detectFabric,
  detectOptiFine,
  checkConflicts,
  installLoaderVersion,
  installForge,
  installNeoForge,
  installOptiFine,
  installFabric,
  requestCancel,
  resetCancel,
  OPTIFINE_STABLE_MAP,
  parseOptiFineVersion
};
