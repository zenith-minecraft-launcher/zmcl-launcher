const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const axios = require('axios');

let app;
try {
  app = require('electron').app;
} catch (e) {
  app = null;
}

const downloadManager = require('../download/manager');

// 取消标志（使用 manager.js 的共享标志）
function requestCancel(javaVersion) { downloadManager.requestCancel(); }
function resetCancel() { downloadManager.resetCancel(); }
function checkCancelled() { downloadManager.checkCancelled(); }

// ========== 配置（参考 https://bmclapidoc.bangbang93.com ==========
//
// BMCLAPI 的 Java runtime 的 URL 替换规则:
//   https://launchermeta.mojang.com/        ->  https://bmclapi2.bangbang93.com/
//   https://piston-meta.mojang.com/     ->  https://bmclapi2.bangbang93.com/
//   https://piston-data.mojang.com/     ->  https://bmclapi2.bangbang93.com/
//   https://launcher.mojang.com/         ->  https://bmclapi2.bangbang93.com/
//   https://resources.download.minecraft.net/  ->  https://bmclapi2.bangbang93.com/assets/
//   https://libraries.minecraft.net/  ->  https://bmclapi2.bangbang93.com/maven/

const BMCLAPI_BASE = 'https://bmclapi2.bangbang93.com';
const MOJANG_PISTON_META = 'https://piston-meta.mojang.com';
const MOJANG_PISTON_DATA = 'https://piston-data.mojang.com';
const JAVA_RUNTIME_HASH = '2ec0cc96c44e5a76b9c8b7c39df7210883d12871';

// 并发下载数
const DOWNLOAD_CONCURRENCY = 8;

// ========== URL 替换工具：把任意 Mojang URL 转为 BMCLAPI 镜像 URL
function toBmclapi(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.includes('bmclapi2.bangbang93.com')) return url;

  // 官方源前缀列表（高优先级）
  const mappings = [
    ['https://launchermeta.mojang.com/', BMCLAPI_BASE + '/'],
    ['https://piston-meta.mojang.com/', BMCLAPI_BASE + '/'],
    ['https://piston-data.mojang.com/', BMCLAPI_BASE + '/'],
    ['https://launcher.mojang.com/', BMCLAPI_BASE + '/'],
    ['http://launchermeta.mojang.com/', BMCLAPI_BASE + '/'],
    ['http://piston-meta.mojang.com/', BMCLAPI_BASE + '/'],
    ['http://piston-data.mojang.com/', BMCLAPI_BASE + '/'],
    ['http://launcher.mojang.com/', BMCLAPI_BASE + '/'],
    ['https://resources.download.minecraft.net/', BMCLAPI_BASE + '/assets/'],
    ['https://libraries.minecraft.net/', BMCLAPI_BASE + '/maven/'],
  ];
  for (const [prefix, replacement] of mappings) {
    if (url.startsWith(prefix)) {
      return url.replace(prefix, replacement);
    }
  }
  return url;
}

// ========== 工具函数 ==========

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

// 获取 Java 安装根目录
// - 开发模式：项目根目录下的 data/java
// - 打包后：用户数据目录下的 java（resources/java 不再随包分发，避免安装包过大）
function getJavaBaseDir() {
  let parent;
  if (__dirname.includes('app.asar')) {
    // 打包后：使用用户数据目录（可写、可随卸载清理）
    const base = app && typeof app.getPath === 'function'
      ? app.getPath('userData')
      : path.join(os.homedir(), '.zenith-launcher');
    parent = path.join(base, 'java');
  } else {
    // 开发路径：../../data/java （相对于本文件 src/main/minecraft/）
    parent = path.join(__dirname, '..', '..', '..', 'data', 'java');
  }
  return ensureDir(parent);
}

// 根据版本号生成安装目录
function getInstallDirForVersion(version) {
  return path.join(getJavaBaseDir(), `jdk-${version}`);
}

// 根据平台/架构确定 OS 字符串
function resolvePlatform() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'win32') {
    return arch === 'x64' ? 'windows-x64' : 'windows-x86';
  } else if (platform === 'darwin') {
    return arch === 'arm64' ? 'mac-os-arm64' : 'mac-os';
  } else {
    return arch === 'arm64' ? 'linux-arm64' : 'linux';
  }
}

// 查找 java 可执行文件路径
function getJavaExePath(installDir) {
  const osPlatform = process.platform;
  if (osPlatform === 'win32') {
    const direct = path.join(installDir, 'bin', 'java.exe');
    if (fs.existsSync(direct)) return direct;

    try {
      const entries = fs.readdirSync(installDir);
      for (const entry of entries) {
        const candidate = path.join(installDir, entry, 'bin', 'java.exe');
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch (e) {}
    return direct;
  } else if (osPlatform === 'darwin') {
    const direct = path.join(installDir, 'Contents', 'Home', 'bin', 'java');
    if (fs.existsSync(direct)) return direct;
    const alt = path.join(installDir, 'bin', 'java');
    return fs.existsSync(alt) ? alt : direct;
  } else {
    const direct = path.join(installDir, 'bin', 'java');
    if (fs.existsSync(direct)) return direct;
    try {
      const entries = fs.readdirSync(installDir);
      for (const entry of entries) {
        const candidate = path.join(installDir, entry, 'bin', 'java');
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch (e) {}
    return direct;
  }
}

// SHA1 校验
function verifySha1(filePath, expectedSha1) {
  if (!expectedSha1) return true;
  try {
    const hash = crypto.createHash('sha1');
    const buf = fs.readFileSync(filePath);
    hash.update(buf);
    return hash.digest('hex') === expectedSha1;
  } catch (e) {
    return false;
  }
}

// 计算文件大小
function getFileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch (e) {
    return -1;
  }
}

// ========== MC 版本 / Java 主版本号 到 Java 运行时名称的映射
/**
 * 将 MC 版本（如 "1.20.1"）或 Java 主版本号（如 "8", "17", "21"）映射为 Mojang runtime 名称
 * @param {string} version - MC 版本号 或 Java 主版本号
 */
function getJavaRuntimeName(version) {
  if (!version) return 'java-runtime-gamma';

  // 情况1：纯数字（Java 主版本号），如 "8"、"17"、"21"
  const pureNum = String(version).trim();
  if (/^\d+$/.test(pureNum)) {
    const n = parseInt(pureNum, 10);
    if (n >= 21) return 'java-runtime-delta';
    if (n >= 18) return 'java-runtime-gamma';
    if (n === 17) return 'java-runtime-gamma';
    if (n === 16) return 'java-runtime-alpha';
    return 'jre-legacy'; // Java 8 及以下
  }

  // 情况2：MC 版本号格式，如 "1.20.1" 或 "26.1"
  const match = String(version).match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) return 'java-runtime-gamma';

  const rawMajor = parseInt(match[1]);
  const rawMinor = parseInt(match[2]);
  const patch = match[3] ? parseInt(match[3]) : 0;

  // 新版 MC (2.0+, 如 26.1) 需要 Java 21+
  const isModernMC = rawMajor > 1;

  if (isModernMC) {
    // MC 2.0+ (如 26.1): 需要 Java 21 runtime
    return 'java-runtime-delta';
  } else if (rawMajor >= 1 && rawMinor >= 21) {
    return 'java-runtime-delta';
  } else if (rawMajor >= 1 && rawMinor === 20 && patch >= 5) {
    return 'java-runtime-delta';
  } else if (rawMajor >= 1 && rawMinor >= 18) {
    return 'java-runtime-gamma';
  } else if (rawMajor >= 1 && rawMinor === 17) {
    return 'java-runtime-alpha';
  } else {
    return 'jre-legacy';
  }
}

function getJavaMajorVersion(runtimeName) {
  switch (runtimeName) {
    case 'java-runtime-delta': return 21;
    case 'java-runtime-gamma':
    case 'java-runtime-beta': return 17;
    case 'java-runtime-alpha': return 16;
    case 'jre-legacy': return 8;
    default: return 17;
  }
}

// ========== BMCLAPI Java 运行时 API ==========

// 1) 获取 Java 运行时列表
// 官方: https://launchermeta.mojang.com/v1/products/java-runtime/{hash}/all.json
// BMCLAPI 镜像: https://bmclapi2.bangbang93.com/v1/products/java-runtime/{hash}/all.json
async function fetchJavaRuntimes() {
  const bmclUrl = `${BMCLAPI_BASE}/v1/products/java-runtime/${JAVA_RUNTIME_HASH}/all.json`;
  const mojangUrl = `${MOJANG_PISTON_META}/v1/products/java-runtime/${JAVA_RUNTIME_HASH}/all.json`;

  // 优先 BMCLAPI
  try {
    const { data } = await axios.get(bmclUrl, {
      timeout: 15000,
      headers: { 'User-Agent': 'ZenithLauncher/1.0' }
    });
    return data;
  } catch (e) {
    console.warn('[JavaDownloader] BMCLAPI 运行时列表获取失败，回退 Mojang：', e.message);
  }

  // 回退 Mojang
  const { data } = await axios.get(mojangUrl, {
    timeout: 15000,
    headers: { 'User-Agent': 'ZenithLauncher/1.0' }
  });
  return data;
}

// 2) 获取特定运行时的 manifest URL
async function fetchRuntimeManifest(runtimeName, platform) {
  const runtimes = await fetchJavaRuntimes();

  if (!runtimes || !runtimes[platform]) {
    throw new Error(`不支持的平台: ${platform}`);
  }

  const platformRuntimes = runtimes[platform];
  if (!platformRuntimes[runtimeName] || platformRuntimes[runtimeName].length === 0) {
    throw new Error(`该平台没有 ${runtimeName} 运行时`);
  }

  const runtime = platformRuntimes[runtimeName][0];
  return runtime.manifest ? runtime.manifest.url : null;
}

// 3) 下载 manifest（BMCLAPI 优先，失败回退 Mojang）
async function downloadManifest(manifestUrl) {
  const bmclUrl = toBmclapi(manifestUrl);
  const urlsToTry = [];
  if (bmclUrl !== manifestUrl) {
    urlsToTry.push(bmclUrl);
  }
  urlsToTry.push(manifestUrl);

  let lastErr;
  for (const url of urlsToTry) {
    try {
      const { data } = await axios.get(url, {
        timeout: 15000,
        headers: { 'User-Agent': 'ZenithLauncher/1.0' }
      });
      return data;
    } catch (e) {
      lastErr = e;
      console.warn(`[JavaDownloader] manifest 下载失败 (${url}):`, e.message);
    }
  }
  throw lastErr || new Error('无法下载 manifest');
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

// ========== 单文件流式下载（BMCLAPI 优先，失败回退 Mojang），支持进度回调
/**
 * @param {string} originalUrl
 * @param {string} destPath
 * @param {string} expectedSha1
 * @param {number} expectedSize
 * @param {Function} [onProgress] - ({downloaded, total, speedBytesPerSec, speedText, etaSeconds, etaText}) => void
 * @returns {Promise<{path:string, skipped:boolean}>}
 */
async function downloadSingleFile(originalUrl, destPath, expectedSha1, expectedSize, onProgress) {
  checkCancelled();

  // 已存在且校验通过则跳过
  if (fs.existsSync(destPath)) {
    const actualSize = getFileSize(destPath);
    if (actualSize === expectedSize && verifySha1(destPath, expectedSha1)) {
      if (onProgress) onProgress({ downloaded: expectedSize, total: expectedSize, speedText: '已存在', etaText: '已完成' });
      return { path: destPath, skipped: true };
    }
    try { fs.unlinkSync(destPath); } catch (e) {}
  }

  ensureDir(path.dirname(destPath));

  const bmclUrl = toBmclapi(originalUrl);
  const urlsToTry = [];
  if (bmclUrl !== originalUrl) {
    urlsToTry.push(bmclUrl);
  }
  urlsToTry.push(originalUrl);

  let lastErr;
  for (const url of urlsToTry) {
    try {
      checkCancelled();

      const response = await axios({
        method: 'GET',
        url,
        responseType: 'stream',
        timeout: 60000,
        headers: {
          'User-Agent': 'ZenithLauncher/1.0',
          'Accept': 'application/octet-stream'
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      const total = parseInt(response.headers['content-length'], 10) || Number(expectedSize) || 0;
      let downloaded = 0;
      const startTime = Date.now();

      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(destPath);
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
          if (onProgress) {
            const elapsed = (Date.now() - startTime) / 1000;
            const bps = elapsed > 0.1 ? downloaded / elapsed : 0;
            const remaining = Math.max(0, total - downloaded);
            const eta = (bps > 0 && total > 0) ? remaining / bps : 0;
            onProgress({
              downloaded,
              total,
              speedBytesPerSec: bps,
              speedText: formatBytesRate(bps),
              etaSeconds: eta,
              etaText: formatEtaSeconds(eta)
            });
          }
        });
        response.data.on('error', reject);
        writer.on('error', reject);
        writer.on('finish', () => resolve());
        response.data.pipe(writer);
      });

      const actualSize = getFileSize(destPath);
      if (expectedSize && actualSize !== expectedSize) {
        throw new Error(`文件大小不匹配: ${actualSize} != ${expectedSize}`);
      }
      if (expectedSha1 && !verifySha1(destPath, expectedSha1)) {
        throw new Error('SHA1 校验失败');
      }
      return { path: destPath, skipped: false };
    } catch (e) {
      lastErr = e;
      console.warn(`[JavaDownloader] 文件下载失败 (${url}):`, e.message);
      if (fs.existsSync(destPath)) {
        try { fs.unlinkSync(destPath); } catch (_) {}
      }
    }
  }
  throw lastErr || new Error('文件下载失败');
}

// ========== 主入口：基于 MC 版本下载并安装 Java
async function downloadAndInstallJava(mcVersion, onProgress) {
  resetCancel();

  const runtimeName = getJavaRuntimeName(mcVersion);
  const javaMajorVersion = getJavaMajorVersion(runtimeName);
  const platform = resolvePlatform();
  const installDir = getInstallDirForVersion(javaMajorVersion);

  const cachedExe = getJavaExePath(installDir);
  if (fs.existsSync(cachedExe)) {
    if (onProgress) onProgress({
      stage: `Java ${javaMajorVersion} 已安装`,
      percent: 100,
      version: javaMajorVersion,
      done: true
    });
    return {
      success: true,
      version: String(javaMajorVersion),
      path: cachedExe,
      cached: true
    };
  }

  try {
    checkCancelled();

    // 1. 获取 Java 运行时列表
    if (onProgress) onProgress({
      stage: `获取 Java ${javaMajorVersion} 运行时信息...`,
      percent: 3,
      version: javaMajorVersion
    });

    const manifestUrl = await fetchRuntimeManifest(runtimeName, platform);
    if (!manifestUrl) {
      throw new Error('无法获取 Java 运行时清单 URL');
    }

    // 2. 下载 manifest
    if (onProgress) onProgress({
      stage: `解析 Java ${javaMajorVersion} 清单...`,
      percent: 6,
      version: javaMajorVersion
    });

    const manifest = await downloadManifest(manifestUrl);
    if (!manifest || !manifest.files) {
      throw new Error('无法获取 Java 运行时清单');
    }

    // 3. 解析 manifest：分离目录与文件
    const allKeys = Object.keys(manifest.files);
    const dirEntries = [];
    const fileEntries = [];

    for (const key of allKeys) {
      const entry = manifest.files[key];
      if (!entry) continue;

      if (entry.type === 'directory') {
        dirEntries.push(key);
      } else if (entry.type === 'file' && entry.downloads && entry.downloads.raw) {
        fileEntries.push({
          relativePath: key,
          raw: entry.downloads.raw,
          executable: !!entry.executable
        });
      }
    }

    console.log(`[JavaDownloader] 共 ${dirEntries.length} 个目录, ${fileEntries.length} 个文件`);

    // 4. 创建目录结构
    if (onProgress) onProgress({
      stage: `创建目录结构...`,
      percent: 8,
      version: javaMajorVersion
    });

    ensureDir(installDir);
    for (const dirKey of dirEntries) {
      ensureDir(path.join(installDir, dirKey));
    }

    // 5. 并发下载所有文件
    const totalFiles = fileEntries.length;
    const totalBytes = fileEntries.reduce((s, e) => s + (Number(e.raw && e.raw.size) || 0), 0);
    let completedFiles = 0;
    let failedFiles = 0;
    let bytesFinished = 0;
    const batchStart = Date.now();

    if (onProgress) onProgress({
      stage: `下载 Java ${javaMajorVersion} 文件 (0/${totalFiles})...`,
      percent: 10,
      downloaded: 0,
      total: totalFiles,
      totalBytes,
      downloadedBytes: 0,
      speedText: formatBytesRate(0),
      etaText: formatEtaSeconds(0),
      version: javaMajorVersion
    });

    const queue = [...fileEntries];

    async function worker() {
      while (queue.length > 0) {
        const entry = queue.shift();
        try {
          const destPath = path.join(installDir, entry.relativePath);
          await downloadSingleFile(
            entry.raw.url,
            destPath,
            entry.raw.sha1,
            entry.raw.size,
            // 细粒度：单文件下载过程中，把已下载字节数累加进去
            (p) => {
              if (!onProgress || !p || p.downloaded === undefined) return;
              const currentFileDownloaded = Number(p.downloaded) || 0;
              const elapsed = (Date.now() - batchStart) / 1000;
              // 累计 = 已完成文件总字节 + 当前文件已下载字节
              const currentTotal = bytesFinished + currentFileDownloaded;
              const bps = elapsed > 0.1 ? currentTotal / elapsed : (p.speedBytesPerSec || 0);
              const remaining = Math.max(0, totalBytes - currentTotal);
              const eta = bps > 0 ? remaining / bps : 0;
              onProgress({
                stage: `下载 Java ${javaMajorVersion} (${completedFiles}/${totalFiles})...`,
                percent: Math.floor(10 + ((completedFiles + (currentFileDownloaded > 0 ? 0.5 : 0)) / totalFiles) * 85),
                downloaded: completedFiles,
                total: totalFiles,
                downloadedBytes: currentTotal,
                totalBytes,
                speedBytesPerSec: bps,
                speedText: formatBytesRate(bps),
                etaSeconds: eta,
                etaText: formatEtaSeconds(eta),
                version: javaMajorVersion
              });
            }
          );

          if (entry.executable && process.platform !== 'win32') {
            try {
              fs.chmodSync(destPath, 0o755);
            } catch (e) {}
          }

          completedFiles++;
          bytesFinished += Number(entry.raw && entry.raw.size) || 0;
          if (onProgress) {
            const elapsed = (Date.now() - batchStart) / 1000;
            const bps = elapsed > 0.1 ? bytesFinished / elapsed : 0;
            const remaining = Math.max(0, totalBytes - bytesFinished);
            const eta = bps > 0 ? remaining / bps : 0;
            const filePercent = (completedFiles / totalFiles) * 85;
            onProgress({
              stage: `下载 Java ${javaMajorVersion} (${completedFiles}/${totalFiles})...`,
              percent: Math.floor(10 + filePercent),
              downloaded: completedFiles,
              total: totalFiles,
              downloadedBytes: bytesFinished,
              totalBytes,
              speedBytesPerSec: bps,
              speedText: formatBytesRate(bps),
              etaSeconds: eta,
              etaText: formatEtaSeconds(eta),
              version: javaMajorVersion
            });
          }
        } catch (err) {
          failedFiles++;
          console.warn(`[JavaDownloader] 下载失败: ${entry.relativePath} - ${err.message}`);
        }
      }
    }

    const workers = [];
    for (let i = 0; i < Math.min(DOWNLOAD_CONCURRENCY, totalFiles); i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    if (failedFiles > totalFiles * 0.1) {
      throw new Error(`过多文件下载失败 (${failedFiles}/${totalFiles})`);
    }

    // 6. 查找 java.exe
    if (onProgress) onProgress({
      stage: '验证安装...',
      percent: 97,
      version: javaMajorVersion
    });

    let javaExe = getJavaExePath(installDir);
    if (!fs.existsSync(javaExe)) {
      try {
        const walk = (dir) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const e of entries) {
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
              const found = walk(full);
              if (found) return found;
            } else if (e.isFile() && e.name.toLowerCase() === 'java.exe') {
              return full;
            }
          }
          return null;
        };
        const found = walk(installDir);
        if (found) javaExe = found;
      } catch (e) {}
    }

    if (!javaExe || !fs.existsSync(javaExe)) {
      throw new Error(`未找到 java 可执行文件: ${javaExe}`);
    }

    // 验证下载的 Java 版本是否匹配预期
    const actualVersion = await getJavaVersionNumber(javaExe);
    console.log(`[JavaDownloader] 预期 Java ${javaMajorVersion}, 实际下载 Java ${actualVersion}`);

    if (actualVersion !== javaMajorVersion) {
      console.warn(`[JavaDownloader] Java 版本不匹配！预期 ${javaMajorVersion}，实际 ${actualVersion}`);
      console.warn(`[JavaDownloader] 删除不匹配的 Java，改用 Adoptium 下载...`);

      // 删除不匹配的安装
      try { removeDirRecursive(installDir); } catch (e) {}
      ensureDir(installDir);

      throw new Error(`VERSION_MISMATCH:${actualVersion}`);
    }

    if (onProgress) onProgress({
      stage: '完成',
      percent: 100,
      version: javaMajorVersion,
      done: true
    });

    return {
      success: true,
      version: String(javaMajorVersion),
      path: javaExe,
      cached: false
    };

  } catch (err) {
    // 版本不匹配，回退到 Adoptium 下载
    if (err.message && err.message.startsWith('VERSION_MISMATCH:')) {
      const actualVer = err.message.split(':')[1];
      console.log(`[JavaDownloader] Mojang runtime 版本是 ${actualVer}，回退到 Adoptium 下载 Java ${javaMajorVersion}`);
      
      if (onProgress) onProgress({
        stage: `从 Adoptium 下载 Java ${javaMajorVersion}...`,
        percent: 10,
        version: javaMajorVersion
      });

      try {
        return await downloadFromAdoptiumApi(javaMajorVersion, onProgress);
      } catch (adoptiumErr) {
        console.error('[JavaDownloader] Adoptium 下载也失败:', adoptiumErr.message);
        return {
          success: false,
          version: String(javaMajorVersion),
          path: '',
          message: `无法下载 Java ${javaMajorVersion}: Mojang 提供的是 Java ${actualVer}，Adoptium 下载也失败: ${adoptiumErr.message}`
        };
      }
    }

    console.error('[JavaDownloader] 下载 Java 失败:', err.message);
    return {
      success: false,
      version: String(javaMajorVersion),
      path: '',
      message: err.message || String(err)
    };
  }
}

// ========== Microsoft JDK 下载链接
const JDK_DOWNLOAD_URLS = {
  '8': 'https://javadl.oracle.com/webapps/download/AutoDL?BundleId=253195_f7fe8e644f724108bdb54139381e29a7',
  '17': 'https://aka.ms/download-jdk/microsoft-jdk-17.0.19-windows-x64.exe',
  '21': 'https://aka.ms/download-jdk/microsoft-jdk-21.0.11-windows-x64.exe',
  '25': 'https://aka.ms/download-jdk/microsoft-jdk-25.0.3-windows-x64.exe'
};

// ========== 兼容旧接口：根据主版本号下载 Java（下载 Microsoft JDK 安装包并自动运行）
async function downloadAndInstallJavaByVersion(majorVersion, onProgress) {
  const vStr = String(majorVersion);
  const downloadUrl = JDK_DOWNLOAD_URLS[vStr];
  
  if (!downloadUrl) {
    return { success: false, message: `不支持的 Java 版本: ${vStr}` };
  }
  
  resetCancel();
  
  // 下载到启动器临时目录
  const tempDir = path.join(os.tmpdir(), 'zenith-java-download');
  const fileName = `jdk-${vStr}-installer.exe`;
  const destPath = path.join(tempDir, fileName);
  
  console.log(`[JavaDownloader] 下载 JDK ${vStr}: ${downloadUrl}`);
  console.log(`[JavaDownloader] 保存到: ${destPath}`);
  
  onProgress && onProgress({ stage: `准备下载 JDK ${vStr}...`, percent: 0, version: majorVersion });
  
  try {
    // 确保下载目录存在
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // 清理之前的下载
    try { fs.unlinkSync(destPath); } catch (e) {}
    
    // 使用 axios 流式下载，跟随重定向
    const response = await axios({
      method: 'GET',
      url: downloadUrl,
      responseType: 'stream',
      timeout: 300000,
      maxRedirects: 10,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/octet-stream,application/x-msdownload,*/*'
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    
    // 从响应URL获取实际文件名（处理重定向后的URL）
    const finalUrl = response.request.res.responseUrl || downloadUrl;
    let actualFileName = fileName;
    
    // 尝试从 Content-Disposition 获取文件名
    const contentDisposition = response.headers['content-disposition'];
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (filenameMatch) {
        actualFileName = filenameMatch[1].replace(/['"]/g, '').trim();
      }
    } else if (finalUrl && !finalUrl.includes('?')) {
      // 从URL路径获取文件名
      const urlPath = new URL(finalUrl).pathname;
      actualFileName = path.basename(urlPath) || fileName;
    }
    
    // 如果文件名变化了，更新路径
    const finalDestPath = path.join(tempDir, actualFileName);
    
    const total = parseInt(response.headers['content-length'], 10) || 0;
    let downloaded = 0;
    const startTime = Date.now();
    
    const writer = fs.createWriteStream(finalDestPath);
    
    await new Promise((resolve, reject) => {
      response.data.on('data', (chunk) => {
        if (downloadManager.isCancelled()) {
          writer.destroy();
          reject(new Error('下载已取消'));
          return;
        }
        downloaded += chunk.length;
        
        const elapsed = (Date.now() - startTime) / 1000;
        const bps = elapsed > 0.1 ? downloaded / elapsed : 0;
        const remaining = Math.max(0, total - downloaded);
        const eta = (bps > 0 && total > 0) ? remaining / bps : 0;
        const percent = total > 0 ? Math.floor((downloaded / total) * 100) : 0;
        
        onProgress && onProgress({
          stage: `下载 JDK ${vStr}...`,
          percent: percent,
          version: majorVersion,
          downloadedBytes: downloaded,
          totalBytes: total,
          speedText: formatBytesRate(bps),
          etaText: formatEtaSeconds(eta)
        });
      });
      
      response.data.on('error', reject);
      writer.on('error', reject);
      writer.on('finish', () => resolve());
      response.data.pipe(writer);
    });
    
    onProgress && onProgress({
      stage: '下载完成，正在启动安装程序...',
      percent: 100,
      version: majorVersion,
      done: true
    });
    
    // 下载完成后，自动运行安装程序
    console.log(`[JavaDownloader] 启动安装程序: ${finalDestPath}`);
    const { execFile } = require('child_process');
    
    // 使用 execFile 启动安装程序（非阻塞，让用户自己完成安装向导）
    const installerProcess = execFile(finalDestPath, [], { 
      detached: true,
      windowsHide: false
    }, (error) => {
      if (error) {
        console.error(`[JavaDownloader] 安装程序启动失败:`, error.message);
      } else {
        console.log(`[JavaDownloader] 安装程序已关闭`);
      }
    });
    
    // 忽略错误，让安装程序独立运行
    if (installerProcess) {
      installerProcess.unref();
    }
    
    return {
      success: true,
      version: vStr,
      path: finalDestPath,
      message: `JDK ${vStr} 安装程序已启动，请按向导完成安装`,
      cached: false
    };
    
  } catch (err) {
    console.error(`[JavaDownloader] 下载 JDK ${vStr} 失败:`, err.message);
    // 清理失败的下载
    try { fs.unlinkSync(destPath); } catch (e) {}
    return {
      success: false,
      version: vStr,
      path: '',
      message: err.message || String(err)
    };
  }
}

// ========== 检测已安装 Java 的实际主版本号
async function getJavaVersionNumber(javaExePath) {
  const { execFile } = require('child_process');
  return new Promise((resolve) => {
    execFile(javaExePath, ['-version'], { timeout: 10000 }, (error, stdout, stderr) => {
      const output = stderr || stdout || '';
      let match = output.match(/version\s+"?(\d+)(?:\.(\d+))?/i);
      if (match) {
        let major = parseInt(match[1], 10);
        if (major === 1 && match[2]) major = parseInt(match[2], 10);
        resolve(major);
      } else {
        resolve(0);
      }
    });
  });
}

// ========== 从 Adoptium API 下载指定版本的 Java（ZIP 格式）
async function downloadFromAdoptiumApi(majorVersion, onProgress) {
  resetCancel();
  
  const platform = resolvePlatform();
  const ext = process.platform === 'win32' ? '.zip' : '.tar.gz';
  const installDir = getInstallDirForVersion(majorVersion);
  
  // Adoptium API v3: 直接获取指定版本的 JDK
  // https://api.adoptium.net/v3/binary/latest/{version}/ga/{os}/{arch}/jdk/hotspot/normal/eclipse
  const adoptiumUrl = `https://api.adoptium.net/v3/binary/latest/${majorVersion}/ga/${platform}/jdk/hotspot/normal/eclipse?project=jdk`;
  
  console.log(`[JavaDownloader] 从 Adoptium 下载 Java ${majorVersion}: ${adoptiumUrl}`);
  
  const zipPath = path.join(os.tmpdir(), `jdk-${majorVersion}-adoptium${ext}`);
  const extractDir = path.join(os.tmpdir(), `jdk-${majorVersion}-extract`);
  
  try {
    // 下载 ZIP
    if (onProgress) onProgress({
      stage: `从 Adoptium 下载 Java ${majorVersion}...`,
      percent: 15,
      version: majorVersion
    });
    
    await downloadSingleFileWithProgress(adoptiumUrl, zipPath, null, null, (p) => {
      if (onProgress && p) {
        onProgress({
          stage: `下载 Java ${majorVersion} (${p.speedText || ''})...`,
          percent: Math.floor(15 + (p.downloaded / (p.total || 1)) * 60),
          version: majorVersion,
          downloadedBytes: p.downloaded || 0,
          totalBytes: p.total || 0,
          speedText: p.speedText || '',
          etaText: p.etaText || ''
        });
      }
    });
    
    // 解压
    if (onProgress) onProgress({
      stage: `解压 Java ${majorVersion}...`,
      percent: 78,
      version: majorVersion
    });
    
    await extractArchive(zipPath, extractDir);
    
    // 找到解压后的实际 JDK 目录
    let jdkDir = extractDir;
    try {
      const entries = fs.readdirSync(extractDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.toLowerCase().includes('jdk')) {
          jdkDir = path.join(extractDir, entry.name);
          break;
        }
      }
    } catch (e) {}
    
    // 复制到安装目录
    if (onProgress) onProgress({
      stage: `安装 Java ${majorVersion}...`,
      percent: 85,
      version: majorVersion
    });
    
    // 清空目标目录
    if (fs.existsSync(installDir)) {
      try { removeDirRecursive(installDir); } catch (e) {}
    }
    
    copyDirRecursive(jdkDir, installDir);
    
    // 查找 java.exe
    const javaExe = getJavaExePath(installDir);
    if (!javaExe || !fs.existsSync(javaExe)) {
      throw new Error('Adoptium 安装后未找到 java 可执行文件');
    }
    
    // 最终验证
    const actualVer = await getJavaVersionNumber(javaExe);
    console.log(`[JavaDownloader] Adoptium Java 版本: ${actualVer}`);
    
    if (actualVer !== parseInt(String(majorVersion), 10)) {
      throw new Error(`Adoptium 下载的版本不匹配: 预期 ${majorVersion}, 实际 ${actualVer}`);
    }
    
    // 清理临时文件
    try { fs.unlinkSync(zipPath); } catch (e) {}
    try { removeDirRecursive(extractDir); } catch (e) {}
    
    if (onProgress) onProgress({
      stage: '完成',
      percent: 100,
      version: majorVersion,
      done: true
    });
    
    return {
      success: true,
      version: String(majorVersion),
      path: javaExe,
      cached: false
    };
    
  } catch (err) {
    // 清理
    try { fs.unlinkSync(zipPath); } catch (e) {}
    try { removeDirRecursive(extractDir); } catch (e) {}
    throw err;
  }
}

// 辅助：单文件流式下载（无 SHA1 校验）
async function downloadSingleFileWithProgress(url, destPath, expectedSha1, expectedSize, onProgress) {
  checkCancelled();
  
  if (fs.existsSync(destPath)) {
    try { fs.unlinkSync(destPath); } catch (e) {}
  }
  
  ensureDir(path.dirname(destPath));
  
  const response = await axios({
    method: 'GET',
    url,
    responseType: 'stream',
    timeout: 300000,
    headers: {
      'User-Agent': 'ZenithLauncher/1.0',
      'Accept': 'application/octet-stream'
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });
  
  const total = parseInt(response.headers['content-length'], 10) || Number(expectedSize) || 0;
  let downloaded = 0;
  const startTime = Date.now();
  
  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);
    response.data.on('data', (chunk) => {
      if (downloadManager.isCancelled()) {
        try { response.data.destroy(); } catch (_) {}
        try { writer.destroy(); } catch (_) {}
        reject(new Error('下载已被用户取消'));
        return;
      }
      downloaded += chunk.length;
      if (onProgress) {
        const elapsed = (Date.now() - startTime) / 1000;
        const bps = elapsed > 0.1 ? downloaded / elapsed : 0;
        const remaining = Math.max(0, total - downloaded);
        const eta = (bps > 0 && total > 0) ? remaining / bps : 0;
        onProgress({
          downloaded,
          total,
          speedBytesPerSec: bps,
          speedText: formatBytesRate(bps),
          etaSeconds: eta,
          etaText: formatEtaSeconds(eta)
        });
      }
    });
    response.data.on('error', reject);
    writer.on('error', reject);
    writer.on('finish', () => resolve());
    response.data.pipe(writer);
  });
  
  return { path: destPath, skipped: false };
}

// 辅助：解压 ZIP/TAR.GZ 归档
async function extractArchive(archivePath, destDir) {
  ensureDir(destDir);
  
  const ext = path.extname(archivePath).toLowerCase();
  
  if (ext === '.zip') {
    // Windows 上使用 PowerShell 解压（避免额外依赖）
    if (process.platform === 'win32') {
      const { execFile } = require('child_process');
      return new Promise((resolve, reject) => {
        execFile('powershell', [
          '-NoProfile', '-Command',
          `Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force`
        ], { timeout: 120000 }, (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`解压失败: ${error.message}`));
          } else {
            resolve();
          }
        });
      });
    } else {
      const { execFile } = require('child_process');
      return new Promise((resolve, reject) => {
        execFile('unzip', ['-o', archivePath, '-d', destDir], { timeout: 120000 }, (error) => {
          if (error) reject(new Error(`解压失败: ${error.message}`));
          else resolve();
        });
      });
    }
  } else if (ext === '.gz' || archivePath.endsWith('.tar.gz')) {
    const { execFile } = require('child_process');
    return new Promise((resolve, reject) => {
      execFile('tar', ['-xzf', archivePath, '-C', destDir], { timeout: 120000 }, (error) => {
        if (error) reject(new Error(`解压失败: ${error.message}`));
        else resolve();
      });
    });
  }
  
  throw new Error(`不支持的归档格式: ${ext}`);
}

// 辅助：递归复制目录
function copyDirRecursive(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ========== 递归删除目录（处理 Windows 锁定等问题）
function removeDirRecursive(targetPath) {
  if (!fs.existsSync(targetPath)) return true;
  const stat = fs.lstatSync(targetPath);
  if (stat.isDirectory()) {
    const entries = fs.readdirSync(targetPath);
    for (const entry of entries) {
      const entryPath = path.join(targetPath, entry);
      try {
        removeDirRecursive(entryPath);
      } catch (e) {
        console.warn(`[JavaDownloader] 删除项失败: ${entryPath} - ${e.message}`);
      }
    }
    try {
      fs.rmdirSync(targetPath);
    } catch (e) {
      throw new Error(`无法删除目录 ${targetPath}: ${e.message}`);
    }
  } else {
    try {
      fs.unlinkSync(targetPath);
    } catch (e) {
      // Windows 上有时文件被锁定，先尝试重命名
      try {
        const tempPath = targetPath + '.tmp-delete';
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        fs.renameSync(targetPath, tempPath);
        fs.unlinkSync(tempPath);
      } catch (e2) {
        throw new Error(`无法删除文件 ${targetPath}: ${e.message}`);
      }
    }
  }
  return true;
}

// ========== 列出已安装的 Java
function listInstalledJavas() {
  const baseDir = getJavaBaseDir();
  const result = [];
  try {
    const entries = fs.readdirSync(baseDir);
    for (const entry of entries) {
      const match = entry.match(/^jdk-(\d+)$/);
      if (!match) continue;
      const majorVersion = match[1];
      const installDir = path.join(baseDir, entry);
      const javaExe = getJavaExePath(installDir);
      const hasJava = fs.existsSync(javaExe);

      // 计算目录总大小
      let totalSize = 0;
      try {
        const walkSize = (dir) => {
          const items = fs.readdirSync(dir, { withFileTypes: true });
          for (const item of items) {
            const full = path.join(dir, item.name);
            if (item.isDirectory()) walkSize(full);
            else if (item.isFile()) {
              try { totalSize += fs.statSync(full).size; } catch (_) {}
            }
          }
        };
        walkSize(installDir);
      } catch (e) {}

      result.push({
        majorVersion,
        installDir,
        javaExePath: hasJava ? javaExe : null,
        sizeBytes: totalSize,
        installed: hasJava
      });
    }
    result.sort((a, b) => parseInt(b.majorVersion) - parseInt(a.majorVersion));
  } catch (e) {
    console.error('[JavaDownloader] 列出 Java 失败:', e.message);
  }
  return result;
}

// ========== 删除指定主版本号的 Java
function deleteJava(majorVersion) {
  if (!majorVersion) {
    return { success: false, message: '未指定版本' };
  }
  const installDir = getInstallDirForVersion(majorVersion);
  if (!fs.existsSync(installDir)) {
    return { success: false, message: `Java ${majorVersion} 未安装` };
  }
  try {
    removeDirRecursive(installDir);
    console.log(`[JavaDownloader] 已删除 Java ${majorVersion} (${installDir})`);
    return { success: true, version: String(majorVersion), path: installDir };
  } catch (e) {
    console.error(`[JavaDownloader] 删除 Java ${majorVersion} 失败:`, e.message);
    return { success: false, message: e.message || String(e), version: String(majorVersion) };
  }
}

// ========== 导出
module.exports = {
  downloadAndInstallJava,
  downloadAndInstallJavaByVersion,
  getJavaBaseDir,
  getInstallDirForVersion,
  getJavaExePath,
  getJavaRuntimeName,
  getJavaMajorVersion,
  getJavaVersionNumber,
  fetchJavaRuntimes,
  toBmclapi,
  listInstalledJavas,
  deleteJava,
  requestCancel
};
