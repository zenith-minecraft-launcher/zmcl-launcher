const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

// 启用 HTTP Keep-Alive 连接池，大幅减少 TLS 握手开销
// 最大 64 个并发 socket，每个保持 30 秒
const KEEPALIVE_AGENT = {
  http: new http.Agent({ keepAlive: true, maxSockets: 64, keepAliveMsecs: 30000 }),
  https: new https.Agent({ keepAlive: true, maxSockets: 64, keepAliveMsecs: 30000 })
};

const downloadSources = require('./sources');
const versionManager = require('../minecraft/version');

// 全局取消标志：版本下载 / 资源文件下载 / 依赖库下载共享
let _cancelled = false;

function requestCancel() {
  _cancelled = true;
}
function resetCancel() {
  _cancelled = false;
}
function isCancelled() {
  return _cancelled === true;
}
function checkCancelled() {
  if (_cancelled) {
    const err = new Error('下载已被用户取消');
    err.cancelled = true;
    throw err;
  }
}

// ============================================================
// 极速下载配置：最大化并发和连接复用
// ============================================================

// 并发数：库文件 16，资源文件 32（充分平衡速度与稳定性）
// 过高的并发（128+）会耗尽家用路由器的 NAT 表，导致连接被丢弃
// 中国网络环境下尤其需要降低并发以避免 ISP 限速
const DEFAULT_CONCURRENCY_LIBRARIES = 16;
const DEFAULT_CONCURRENCY_ASSETS = 32;

// 顶层 IPC 回调节流间隔（毫秒）：避免浏览器端 DOM 更新过快造成卡顿
const PROGRESS_THROTTLE_MS = 150;

/* ===========================================================
 *                    工具函数
 * =========================================================== */

function computeSha1(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

/* -----------------------------------------------------------
 * 速率 / 时间格式化
 * --------------------------------------------------------- */

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
  if (sec == null || sec <= 0 || !isFinite(sec)) return '—';
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

/* -----------------------------------------------------------
 * 通用并发任务控制器
 *   - 固定数量"槽位"并发执行，用完即取
 *   - 内部吞掉 worker 异常，统一写入 errors
 *   - 可选的 per-file 进度回调
 * --------------------------------------------------------- */

async function runWithConcurrency(items, worker, options = {}) {
  const concurrency = Number(options.concurrency) || 8;
  const onProgress = options.onProgress || null;

  const total = items.length;
  if (total === 0) {
    return { results: [], errors: [] };
  }

  const results = new Array(total);
  const errors = [];
  let nextIndex = 0;
  let doneCount = 0;

  let isStopping = false;

  async function runSlot() {
    while (true) {
      if (isStopping) return;
      checkCancelled();
      const idx = nextIndex;
      if (idx >= total) return;
      nextIndex = idx + 1;

      const item = items[idx];
      try {
        const r = await worker(item, idx);
        results[idx] = r;
      } catch (e) {
        results[idx] = null;
        errors.push({ item, error: e });
        // 如果是取消错误，立即停止所有任务
        if (e && e.cancelled) {
          isStopping = true;
          requestCancel();
          throw e;
        }
      } finally {
        doneCount += 1;
        if (onProgress) {
          try {
            onProgress(doneCount, total, results[idx]);
          } catch (_) {
            /* 回调异常不中断主流程 */
          }
        }
      }
    }
  }

  const slotCount = Math.min(concurrency, total);
  const slots = [];
  for (let i = 0; i < slotCount; i += 1) {
    slots.push(runSlot());
  }
  try {
    await Promise.all(slots);
  } catch (e) {
    // 如果是取消错误，向上抛出
    if (e && e.cancelled) {
      throw e;
    }
  }

  return { results, errors };
}

/* -----------------------------------------------------------
 * 共享的"多文件下载进度"管理器：
 *   - 每个下载任务在内部更新自己的状态
 *   - 定期把全部状态汇总推送给外层 onProgress
 *   - 完成后返回最终状态快照
 * --------------------------------------------------------- */

function createBatchTracker(files, stage, stageTitle, onProgress) {
  const totalBytes = files.reduce((s, f) => s + (Number(f.size) || 0), 0);
  const totalCount = files.length;

  // 为每个文件维护可变状态
  const perFile = files.map((f, i) => ({
    id: i,
    name: f.displayName || f.path || f.fileName || `文件 ${i + 1}`,
    state: 'pending',       // pending | downloading | done | error
    percent: 0,
    downloadedBytes: 0,
    totalBytes: Number(f.size) || 0,
    speedText: '0 B/s',
    error: null
  }));

  const batchStart = Date.now();
  let aggregatedDoneBytes = 0;   // 已完成文件的累计字节（不含正在下载中的）
  let lastProgressAt = 0;        // 上次回调时间（节流用）

  function snapshot(extra) {
    let inProgressBytes = 0;
    let inProgressTotalBytes = 0;
    let activeCount = 0;
    let doneCount = 0;
    let errorCount = 0;

    for (const pf of perFile) {
      if (pf.state === 'downloading') {
        activeCount += 1;
        inProgressBytes += pf.downloadedBytes;
        inProgressTotalBytes += pf.totalBytes;
      } else if (pf.state === 'done') {
        doneCount += 1;
      } else if (pf.state === 'error') {
        errorCount += 1;
      }
    }

    const finishedBytes = aggregatedDoneBytes + inProgressBytes;
    const elapsed = (Date.now() - batchStart) / 1000;
    const bps = elapsed > 0.1 ? finishedBytes / elapsed : 0;
    const remaining = Math.max(0, totalBytes - finishedBytes);
    const eta = bps > 0 && totalBytes > 0 ? remaining / bps : 0;
    const percent = totalBytes > 0 ? (finishedBytes / totalBytes * 100) : (totalCount > 0 ? ((doneCount + errorCount) / totalCount * 100) : 0);

    return {
      stage,
      stageText: stageTitle ? `${stageTitle} (${doneCount}/${totalCount})` : `${stage} (${doneCount}/${totalCount})`,
      current: (perFile.find(p => p.state === 'downloading') || {}).name || null,
      percent: Math.min(100, percent),
      downloaded: doneCount,
      total: totalCount,
      activeCount,
      errorCount,
      downloadedBytes: finishedBytes,
      totalBytes,
      speedBytesPerSec: bps,
      speedText: formatBytesRate(bps),
      etaSeconds: eta,
      etaText: formatEtaSeconds(eta),
      // 仅保留"下载中"与最后若干条目，避免 UI 过长
      files: perFile.map(p => ({
        name: p.name,
        state: p.state,
        percent: p.percent,
        downloadedBytes: p.downloadedBytes,
        totalBytes: p.totalBytes,
        speedText: p.speedText,
        error: p.error
      })),
      ...(extra || {})
    };
  }

  function pushIfNeeded(force, extra) {
    const now = Date.now();
    if (!force && now - lastProgressAt < PROGRESS_THROTTLE_MS) return;
    lastProgressAt = now;
    if (onProgress) {
      try { onProgress(snapshot(extra)); } catch (_) { /* 忽略回调异常 */ }
    }
  }

  // 返回每个文件可用的 updater：{onBytes, onStart, onFinish, onError}
  function perFileUpdater(i, size) {
    const pf = perFile[i];
    const fileStart = Date.now();

    return {
      onStart() {
        pf.state = 'downloading';
        pushIfNeeded(false);
      },
      onBytes(downloaded) {
        pf.downloadedBytes = downloaded;
        if (size > 0) {
          pf.percent = downloaded / size * 100;
        }
        const fileElapsed = (Date.now() - fileStart) / 1000;
        if (fileElapsed > 0.1) {
          const fileBps = downloaded / fileElapsed;
          pf.speedText = formatBytesRate(fileBps);
        }
        pushIfNeeded(false);
      },
      onFinish() {
        pf.state = 'done';
        pf.percent = 100;
        if (size > 0) pf.downloadedBytes = size;
        aggregatedDoneBytes += pf.totalBytes || size || 0;
        pf.speedText = '完成';
        pushIfNeeded(false);
      },
      onError(msg) {
        pf.state = 'error';
        pf.error = msg || '下载失败';
        pushIfNeeded(false);
      }
    };
  }

  function finish(extra) {
    pushIfNeeded(true, extra);
  }

  function markPreexisting(i) {
    // 某些文件之前已经存在（被 verifyFile 校验过），直接标记为完成
    const pf = perFile[i];
    pf.state = 'done';
    pf.percent = 100;
    pf.downloadedBytes = pf.totalBytes;
    pf.speedText = '已缓存';
    aggregatedDoneBytes += pf.totalBytes || 0;
  }

  return {
    snapshot,
    perFileUpdater,
    finish,
    markPreexisting,
    totalBytes,
    totalCount
  };
}

/* ===========================================================
 *                    流式下载核心
 * =========================================================== */

/**
 * 下载单个文件，支持字节级进度回调。
 * @param {string} url
 * @param {string} destPath
 * @param {(update:{downloadedBytes,totalBytes,percent,speedText,speedBytesPerSec})=>void} [onProgress]
 * @param {Object} [ctx]
 * @param {()=>void} [ctx.onStart]
 * @param {()=>void} [ctx.onFinish]
 * @param {(msg:string)=>void} [ctx.onError]
 */
async function downloadFile(url, destPath, onProgress, ctx) {
  const destDir = path.dirname(destPath);
  ensureDir(destDir);

  // 使用当前选中的下载源重写 URL（如 BMCLAPI / MCBBS）
  const resolvedUrl = downloadSources.rewriteUrlToActiveSource(url);

  if (ctx && ctx.onStart) ctx.onStart();

  checkCancelled();

  const cancelTokenSource = axios.CancelToken.source();

  // 选择 http/https keep-alive agent
  const isHttps = String(resolvedUrl).startsWith('https://');
  const httpAgent = isHttps ? KEEPALIVE_AGENT.https : KEEPALIVE_AGENT.http;

  const response = await axios({
    method: 'GET',
    url: resolvedUrl,
    responseType: 'stream',
    cancelToken: cancelTokenSource.token,
    httpAgent: httpAgent,
    httpsAgent: httpAgent,
    headers: {
      'User-Agent': 'ZenithLauncher/1.0 (compatible; parallel download client)',
      'Accept-Encoding': 'gzip, deflate, br'  // 启用压缩传输
    },
    maxRedirects: 5,
    // 大文件需要更长的超时
    timeout: 180000
  });

  const totalSize = parseInt(response.headers['content-length'], 10) || 0;
  let downloaded = 0;
  const startTime = Date.now();
  let lastProgressTime = 0;
  let lastChunkTime = Date.now();
  const PROGRESS_INTERVAL_MS = 100; // 每 100ms 最多更新一次进度，减少 IPC 开销
  const CHUNK_TIMEOUT_MS = 30000;    // 30秒内没有收到任何数据块则判定超时

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);

    // 流超时检测定时器：每 5 秒检查一次是否长时间未收到数据
    const chunkTimer = setInterval(() => {
      if (Date.now() - lastChunkTime > CHUNK_TIMEOUT_MS) {
        clearInterval(chunkTimer);
        try { response.data.destroy(); } catch (_) {}
        try { writer.destroy(); } catch (_) {}
        const timeoutErr = new Error(`下载超时: 30秒内未收到数据 (已下载 ${formatBytesRate(downloaded)})`);
        timeoutErr.timeout = true;
        if (ctx && ctx.onError) ctx.onError(timeoutErr.message);
        reject(timeoutErr);
      }
    }, 5000);

    response.data.on('data', (chunk) => {
      lastChunkTime = Date.now();
      if (isCancelled()) {
        clearInterval(chunkTimer);
        try { response.data.destroy(); } catch (_) {}
        try { writer.destroy(); } catch (_) {}
        const cancelErr = new Error('下载已被用户取消');
        cancelErr.cancelled = true;
        reject(cancelErr);
        return;
      }
      downloaded += chunk.length;
      if (onProgress) {
        const now = Date.now();
        // 节流：每 100ms 或下载完成时才更新进度
        if (now - lastProgressTime >= PROGRESS_INTERVAL_MS || downloaded >= totalSize) {
          lastProgressTime = now;
          const elapsed = (now - startTime) / 1000;
          const bps = elapsed > 0.1 ? downloaded / elapsed : 0;
          const remaining = Math.max(0, totalSize - downloaded);
          const eta = (bps > 0 && totalSize > 0) ? remaining / bps : 0;
          onProgress({
            downloadedBytes: downloaded,
            totalBytes: totalSize,
            percent: totalSize ? (downloaded / totalSize * 100) : 0,
            speedBytesPerSec: bps,
            speedText: formatBytesRate(bps),
            etaSeconds: eta,
            etaText: formatEtaSeconds(eta)
          });
        }
      }
    });
    response.data.on('error', (err) => {
      clearInterval(chunkTimer);
      if (ctx && ctx.onError) ctx.onError(err && err.message ? err.message : String(err));
      reject(err);
    });
    writer.on('error', (err) => {
      clearInterval(chunkTimer);
      if (ctx && ctx.onError) ctx.onError(err && err.message ? err.message : String(err));
      reject(err);
    });
    writer.on('finish', () => {
      clearInterval(chunkTimer);
      if (ctx && ctx.onFinish) ctx.onFinish();
      if (onProgress) {
        onProgress({
          downloadedBytes: totalSize || downloaded,
          totalBytes: totalSize || downloaded,
          percent: 100,
          speedBytesPerSec: 0,
          speedText: '完成',
          etaSeconds: 0,
          etaText: '已完成'
        });
      }
      resolve(destPath);
    });
    response.data.pipe(writer);
  });
}

async function verifyFile(filePath, expectedHash) {
  if (!fs.existsSync(filePath)) return false;
  if (!expectedHash) return true;
  try {
    const actualHash = await computeSha1(filePath);
    return actualHash.toLowerCase() === expectedHash.toLowerCase();
  } catch (e) {
    return false;
  }
}

/* ===========================================================
 *                 版本清单 / JSON 元数据
 * =========================================================== */

async function getVersionManifest() {
  const MOJANG_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
  const BMCLAPI_URL = "https://bmclapi2.bangbang93.com/mc/game/version_manifest_v2.json";
  const BMCLAPI_V1_URL = "https://bmclapi.bangbang93.com/mc/game/version_manifest_v2.json";
  const RETRY_COUNT = 1;

  console.log('[Download] 开始获取版本清单...');

  // 并行请求，取第一个成功的
  const urlEntries = [
    { url: BMCLAPI_URL, name: 'BMCLAPI 镜像' },
    { url: MOJANG_URL, name: 'Mojang 官方' },
    { url: BMCLAPI_V1_URL, name: 'BMCLAPI v1 镜像' }
  ];

  let lastError = null;

  // 为每个 URL 创建一个带重试的请求 promise
  const promises = urlEntries.map(({ url, name }) =>
    (async () => {
      for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
        try {
          console.log('[Download] 尝试从 ' + name + ' 加载 (attempt ' + (attempt + 1) + '): ' + url);
          const response = await axios.get(url, {
            timeout: 15000,
            headers: {
              'User-Agent': 'ZenithLauncher/1.0',
              'Accept': 'application/json'
            }
          });
          const data = response.data;
          if (data && Array.isArray(data.versions)) {
            data.versions = data.versions.filter(v => v.type !== 'demo');
          }
          if (!data || !Array.isArray(data.versions) || data.versions.length === 0) {
            throw new Error('版本清单为空或格式无效');
          }
          console.log('[Download] 版本清单加载成功 (源: ' + name + ', 共' + data.versions.length + ' 个版本)');
          return data;
        } catch (e) {
          lastError = e;
          const msg = e && e.message ? e.message : (e && e.code ? e.code : 'unknown');
          console.warn('[Download] 从 ' + name + ' 加载失败 (attempt ' + (attempt + 1) + '): ' + msg);
          if (attempt < RETRY_COUNT) {
            await new Promise(r => setTimeout(r, 500));
          }
        }
      }
      throw lastError;
    })()
  );

  // 真正并行竞赛：谁先成功就返回谁，全部失败才抛错
  const errors = [];
  const result = await new Promise((resolve, reject) => {
    let settled = 0;
    const total = promises.length;
    for (const p of promises) {
      p.then((val) => {
        resolve(val);
      }).catch((err) => {
        errors.push(err);
        settled++;
        if (settled >= total) {
          reject(errors[errors.length - 1]);
        }
      });
    }
  });

  return result;
}

async function downloadVersionJson(versionId, versionManifest) {
  const versionDir = path.join(versionManager.getVersionsDir(), versionId);
  const jsonPath = path.join(versionDir, `${versionId}.json`);
  
  // 如果 version.json 已经存在，直接读取并返回
  if (fs.existsSync(jsonPath)) {
    try {
      const existingData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      console.log(`[Download] 使用已缓存的 version.json: ${versionId}`);
      return existingData;
    } catch (e) {
      console.warn(`[Download] 读取已缓存的 version.json 失败，重新下载: ${e.message}`);
    }
  }
  
  let manifest = versionManifest;
  if (!manifest) {
    manifest = await getVersionManifest();
  }

  const versionInfo = manifest.versions.find(v => v.id === versionId);
  if (!versionInfo) {
    throw new Error(`未找到版本: ${versionId}`);
  }

  const resolvedUrl = downloadSources.rewriteUrlToActiveSource(versionInfo.url);

  let response;
  // 先尝试 BMCLAPI 镜像
  try {
    response = await axios.get(resolvedUrl, {
      timeout: 15000,
      headers: { 'User-Agent': 'ZenithLauncher/1.0' },
      validateStatus: (status) => status < 500 // 只有 5xx 才算失败，4xx 不抛异常
    });
  } catch (e) {
    console.warn(`[Download] BMCLAPI 版本 JSON 请求失败: ${e.message}`);
  }

  // 如果 BMCLAPI 返回 404 或请求失败，回退到 Mojang 原始 URL
  if (!response || response.status === 404 || response.status === 403) {
    console.log(`[Download] BMCLAPI 无此版本 JSON，回退到 Mojang: ${versionInfo.url}`);
    response = await axios.get(versionInfo.url, {
      timeout: 30000,
      headers: { 'User-Agent': 'ZenithLauncher/1.0' }
    });
    // 如果是 404 且是原版 URL，那版本真的不存在
    if (response.status === 404) {
      throw new Error(`版本 ${versionId} 的元数据不存在（404）`);
    }
  }

  ensureDir(versionDir);

  fs.writeFileSync(jsonPath, JSON.stringify(response.data, null, 2));

  return response.data;
}

/* ===========================================================
 *                  依赖库并行下载
 * =========================================================== */

async function downloadLibraries(versionJson, onProgress) {
  if (!versionJson.libraries || versionJson.libraries.length === 0) {
    if (onProgress) onProgress({
      stage: 'libraries',
      stageText: '依赖库检查 (0/0)',
      percent: 100,
      downloaded: 0,
      total: 0,
      files: [],
      skipped: true
    });
    return { total: 0, downloaded: 0, skipped: 0 };
  }

  checkCancelled();

  const source = downloadSources.getActiveSource();
  const librariesDir = versionManager.getLibrariesDir();

  // 先收集所有需要检查的库（不阻塞）
  const toCheck = [];

  for (const library of versionJson.libraries) {
    checkCancelled();
    // 跳过 natives（有 classifiers 单独处理）
    if (library.natives) {
      // 原生 classifier（Windows / macOS / Linux）
      if (library.downloads && library.downloads.classifiers) {
        const osName = process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'osx' : 'linux');
        const nativeKey = library.natives ? library.natives[osName] : null;
        if (nativeKey && library.downloads.classifiers[nativeKey]) {
          const na = library.downloads.classifiers[nativeKey];
          const nativePath = path.join(librariesDir, na.path);
          toCheck.push({
            url: na.url,
            path: na.path,
            sha1: na.sha1,
            size: Number(na.size) || 0,
            displayName: path.basename(na.path),
            destPath: nativePath
          });
        }
      }
      // 不 continue：native 库也可能有主 artifact（如 lwjgl.jar），需要一并下载
    }
    // 普通 artifact
    if (library.downloads && library.downloads.artifact) {
      const artifact = library.downloads.artifact;
      const libPath = path.join(librariesDir, artifact.path);
      toCheck.push({
        url: artifact.url,
        path: artifact.path,
        sha1: artifact.sha1,
        size: Number(artifact.size) || 0,
        displayName: path.basename(artifact.path),
        destPath: libPath
      });
      continue;
    }
    // Maven 风格库（只有 lib.url 和 lib.name，没有 downloads.artifact）
    // 例如 Fabric loader、Forge 某些库
    if (library.name) {
      const parts = library.name.split(':');
      if (parts.length >= 3) {
        const [group, artifact, ver] = parts;
        const classifier = parts[3] || null;
        const mavenRelPath = group.replace(/\./g, '/') + '/' + artifact + '/' + ver + '/' +
          (classifier ? artifact + '-' + ver + '-' + classifier + '.jar' : artifact + '-' + ver + '.jar');
        const mavenDestPath = path.join(librariesDir, mavenRelPath);
        // Maven 库通常没有 sha1/size，只做存在性检查
        toCheck.push({
          url: null, // 稍后根据 lib.url + path 构造
          path: mavenRelPath,
          sha1: null,
          size: 0,
          displayName: path.basename(mavenRelPath),
          destPath: mavenDestPath,
          mavenBase: library.url || null,
          noSha1: true
        });
      }
    }
  }

  // 并行校验文件（32 并发，避免磁盘 IO 过载）
  if (onProgress) onProgress({
    stage: 'libraries',
    stageText: `正在检查 ${toCheck.length} 个依赖库...`,
    percent: 0,
    files: []
  });

  const checkResults = await runWithConcurrency(
    toCheck.map(item => ({ item })),
    async ({ item }) => {
      // 1. 快速大小校验（如果有 size）
      if (item.size && item.size > 0 && fs.existsSync(item.destPath)) {
        try {
          const actualSize = fs.statSync(item.destPath).size;
          // 允许 10 字节的容差，严格匹配 Forge 的 shim.jar
          if (Math.abs(actualSize - item.size) > 10) {
            console.log(`[Download] 大小不匹配: ${item.displayName} expected=${item.size} actual=${actualSize}`);
            return { ...item, needsDownload: true };
          }
        } catch (_) {}
      }
      // 2. SHA1 校验
      const exists = await verifyFile(item.destPath, item.sha1);
      return { ...item, needsDownload: !exists };
    },
    { concurrency: 32 }
  );

  const pending = checkResults.results.filter(r => r !== null);
  const librariesToDownload = pending.filter(p => p.needsDownload);
  const skipped = pending.length - librariesToDownload.length;

  const tracker = createBatchTracker(librariesToDownload, 'libraries', '下载依赖库', onProgress);

  if (librariesToDownload.length === 0) {
    tracker.finish({ allCached: true });
    return { total: 0, downloaded: 0, skipped };
  }

  const LIB_RETRY_COUNT = 3;
  const worker = async (lib, idx) => {
    // 1. 如果是 Maven 风格库（有 mavenBase），优先使用其提供的 URL
    let url = lib.url;
    if (!url || !url.startsWith('http')) {
      if (lib.mavenBase && lib.mavenBase.startsWith('http')) {
        // 确保 mavenBase 以 / 结尾，path 不以 / 开头
        const base = lib.mavenBase.endsWith('/') ? lib.mavenBase : (lib.mavenBase + '/');
        const rel = lib.path.startsWith('/') ? lib.path.substring(1) : lib.path;
        url = base + rel;
      } else {
        // 回退到当前源（BMCLAPI）
        url = `${source.libraries || source.maven || source.base}/${lib.path}`;
      }
    }
    // 备选 URL（如果 url 不是 BMCLAPI，则构建 BMCLAPI 回退）
    const fallbackUrl = (lib.mavenBase && !lib.mavenBase.includes('bangbang93'))
      ? `${source.libraries || source.maven || source.base}/${lib.path}`
      : null;

    const updater = tracker.perFileUpdater(idx, lib.size);
    let lastError = null;

    for (let attempt = 1; attempt <= LIB_RETRY_COUNT; attempt++) {
      try {
        await downloadFile(url, lib.destPath, (update) => {
          updater.onBytes(update.downloadedBytes);
        }, {
          onStart: () => updater.onStart(),
          onFinish: () => updater.onFinish(),
          onError: (msg) => updater.onError(msg)
        });
        return { path: lib.path, size: lib.size };
      } catch (e) {
        lastError = e;
        if (e && e.cancelled) throw e;
        // 如果主 URL 失败且存在备选 URL，尝试备选
        if (fallbackUrl && attempt === 1) {
          console.log(`[Download] 回退到 BMCLAPI: ${fallbackUrl}`);
          url = fallbackUrl;
          try { if (fs.existsSync(lib.destPath)) fs.unlinkSync(lib.destPath); } catch (_) {}
          continue;
        }
        if (attempt < LIB_RETRY_COUNT) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
          console.warn(`[Download] 库文件重试 ${attempt}/${LIB_RETRY_COUNT}: ${lib.path} (${delay}ms 后重试)`);
          try { if (fs.existsSync(lib.destPath)) fs.unlinkSync(lib.destPath); } catch (_) {}
          await new Promise(r => setTimeout(r, delay));
        } else {
          console.error(`[Download] 库文件下载失败 (已重试 ${LIB_RETRY_COUNT} 次): ${lib.path}:`, e.message);
          updater.onError(e.message);
        }
      }
    }
    return null;
  };

  const { errors } = await runWithConcurrency(
    librariesToDownload,
    worker,
    { concurrency: DEFAULT_CONCURRENCY_LIBRARIES }
  );

  tracker.finish({});

  const downloaded = librariesToDownload.length - errors.length;
  return { total: librariesToDownload.length, downloaded, skipped };
}

/* ===========================================================
 *                   资源文件并行下载
 * =========================================================== */

async function downloadAssets(versionJson, onProgress) {
  if (!versionJson.assetIndex) {
    if (onProgress) onProgress({
      stage: 'assets',
      stageText: '无资源文件需要下载',
      percent: 100,
      downloaded: 0,
      total: 0,
      files: [],
      skipped: true
    });
    return { total: 0, downloaded: 0, skipped: 0 };
  }

  checkCancelled();

  const source = downloadSources.getActiveSource();
  const assetsDir = versionManager.getAssetsDir();
  const indexId = versionJson.assetIndex.id;

  const indexDir = path.join(assetsDir, 'indexes');
  ensureDir(indexDir);

  const indexUrl = versionJson.assetIndex.url;
  const indexPath = path.join(indexDir, `${indexId}.json`);
  if (!await verifyFile(indexPath, versionJson.assetIndex.sha1)) {
    try {
      // 使用当前选中下载源下载 index.json
      const mirroredUrl = downloadSources.rewriteUrlToActiveSource(indexUrl);
      const resp = await axios.get(mirroredUrl, {
        timeout: 30000,
        responseType: 'stream'
      });
      await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(indexPath);
        resp.data.on('error', reject);
        writer.on('error', reject);
        writer.on('finish', resolve);
        resp.data.pipe(writer);
      });
    } catch (e) {
      console.error('[Download] Failed to download assets index:', e.message);
    }
  }

  let assetsIndex;
  try {
    assetsIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  } catch (e) {
    throw new Error('无法解析资源索引文件');
  }

  const objects = assetsIndex.objects || {};
  const objectsDir = path.join(assetsDir, 'objects');
  ensureDir(objectsDir);

  // 收集所有需要检查的资源文件
  const toCheck = Object.entries(objects).map(([originalPath, fileInfo]) => {
    const prefix = fileInfo.hash.slice(0, 2);
    const destPath = path.join(objectsDir, prefix, fileInfo.hash);
    return {
      originalPath,
      hash: fileInfo.hash,
      size: Number(fileInfo.size) || 0,
      displayName: originalPath,
      destPath,
      url: `${source.resources}/${prefix}/${fileInfo.hash}`
    };
  });

  // 并行校验文件（64 并发，资源文件小且多）
  if (onProgress) onProgress({
    stage: 'assets',
    stageText: `正在检查 ${toCheck.length} 个资源文件...`,
    percent: 0,
    files: []
  });

  const checkResults = await runWithConcurrency(
    toCheck.map(item => ({ item })),
    async ({ item }) => {
      const exists = await verifyFile(item.destPath, item.hash);
      return { ...item, needsDownload: !exists };
    },
    { concurrency: 64 }
  );

  const filesToDownload = checkResults.results
    .filter(r => r !== null && r.needsDownload);

  const totalObjects = toCheck.length;
  const skipped = totalObjects - filesToDownload.length;

  const tracker = createBatchTracker(filesToDownload, 'assets', '下载资源文件', onProgress);

  if (filesToDownload.length === 0) {
    tracker.finish({ allCached: true });
    return { total: 0, downloaded: 0, skipped };
  }

  /**
   * 带重试的下载 worker，最多重试 RETRY_COUNT 次
   */
  const ASSET_RETRY_COUNT = 3;
  const worker = async (file, idx) => {
    const updater = tracker.perFileUpdater(idx, file.size);
    let lastError = null;
    for (let attempt = 1; attempt <= ASSET_RETRY_COUNT; attempt++) {
      try {
        await downloadFile(file.url, file.destPath, (update) => {
          updater.onBytes(update.downloadedBytes);
        }, {
          onStart: () => updater.onStart(),
          onFinish: () => updater.onFinish(),
          onError: (msg) => updater.onError(msg)
        });
        return { path: file.originalPath, size: file.size };
      } catch (e) {
        lastError = e;
        if (e && e.cancelled) throw e; // 取消不重试
        if (attempt < ASSET_RETRY_COUNT) {
          // 指数退避：1s, 2s, 4s
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
          console.warn(`[Download] 资源文件重试 ${attempt}/${ASSET_RETRY_COUNT}: ${file.originalPath} (${delay}ms 后重试)`);
          // 重试前删除可能不完整的临时文件
          try { if (fs.existsSync(file.destPath)) fs.unlinkSync(file.destPath); } catch (_) {}
          await new Promise(r => setTimeout(r, delay));
        } else {
          console.error(`[Download] 资源文件下载失败 (已重试 ${ASSET_RETRY_COUNT} 次): ${file.originalPath}:`, e.message);
          updater.onError(e.message);
        }
      }
    }
    // 所有重试都失败后，不再 throw，允许其他文件继续下载
    return null;
  };

  const { errors } = await runWithConcurrency(
    filesToDownload,
    worker,
    { concurrency: DEFAULT_CONCURRENCY_ASSETS }
  );

  tracker.finish({});

  const downloaded = filesToDownload.length - errors.length;
  return { total: filesToDownload.length, downloaded, skipped };
}

/* ===========================================================
 *                  客户端 JAR 下载
 * =========================================================== */

async function downloadClientJar(versionJson, onProgress) {
  if (!versionJson.downloads || !versionJson.downloads.client) {
    return null;
  }

  const client = versionJson.downloads.client;
  // 对于有 inheritsFrom 的版本（Fabric/Forge），客户端 JAR 属于父版本
  const baseVersionId = versionJson.inheritsFrom || versionJson.jar || versionJson.id;
  const versionDir = path.join(versionManager.getVersionsDir(), baseVersionId);
  ensureDir(versionDir);

  const jarPath = path.join(versionDir, `${baseVersionId}.jar`);

  if (await verifyFile(jarPath, client.sha1)) {
    if (onProgress) onProgress({
      stage: 'client_jar',
      stageText: '客户端 JAR 已存在',
      current: `${baseVersionId}.jar`,
      percent: 100,
      downloaded: 1,
      total: 1,
      downloadedBytes: Number(client.size) || 0,
      totalBytes: Number(client.size) || 0,
      speedText: '已缓存',
      files: [{
        name: `${baseVersionId}.jar`,
        state: 'done',
        percent: 100,
        downloadedBytes: Number(client.size) || 0,
        totalBytes: Number(client.size) || 0,
        speedText: '已缓存'
      }],
      skipped: true
    });
    return jarPath;
  }

  // 构造"单文件"的进度跟踪
  const singleFile = [{
    url: client.url,
    path: `${baseVersionId}.jar`,
    size: Number(client.size) || 0,
    displayName: `${baseVersionId}.jar`,
    destPath: jarPath,
    needsDownload: true
  }];
  const tracker = createBatchTracker(singleFile, 'client_jar', '下载客户端 JAR', onProgress);

  const updater = tracker.perFileUpdater(0, singleFile[0].size);
  try {
    await downloadFile(client.url, jarPath, (update) => {
      updater.onBytes(update.downloadedBytes);
    }, {
      onStart: () => updater.onStart(),
      onFinish: () => updater.onFinish(),
      onError: (msg) => updater.onError(msg)
    });
  } catch (e) {
    tracker.finish({});
    throw e;
  }

  tracker.finish({});

  if (!await verifyFile(jarPath, client.sha1)) {
    throw new Error('客户端 JAR 校验失败');
  }

  return jarPath;
}

/* ===========================================================
 *                上层入口：补全 / 完整下载
 * =========================================================== */

async function checkAndDownloadMissing(versionId, onProgress) {
  resetCancel();

  let versionJson;
  try {
    versionJson = versionManager.getVersionJson(versionId);
  } catch (e) {
    throw new Error(`无法读取版本 ${versionId} 的配置，请先下载该版本`);
  }

  const results = {
    libraries: null,
    assets: null,
    clientJar: null
  };

  if (onProgress) onProgress({
    stage: 'checking',
    stageText: '检查依赖库...',
    percent: 0,
    files: []
  });

  checkCancelled();
  results.libraries = await downloadLibraries(versionJson, onProgress);

  if (onProgress) onProgress({
    stage: 'checking',
    stageText: '检查资源文件...',
    percent: 50,
    files: []
  });

  checkCancelled();
  results.assets = await downloadAssets(versionJson, onProgress);

  if (onProgress) onProgress({
    stage: 'checking',
    stageText: '检查客户端 JAR...',
    percent: 90,
    files: []
  });

  checkCancelled();
  results.clientJar = await downloadClientJar(versionJson, onProgress);

  // 关键修复：如果客户端 JAR 未能下载，且版本有 inheritsFrom（Fabric/Forge），
  // 说明父版本的 JSON 可能缺失，此时从网络下载父版本元数据来获取 downloads.client
  if (!results.clientJar && versionJson.inheritsFrom) {
    if (onProgress) onProgress({
      stage: 'client_jar',
      stageText: '尝试从父版本获取客户端 JAR...',
      percent: 90,
      files: []
    });
    try {
      const manifest = await getVersionManifest();
      const parentVersionId = versionJson.inheritsFrom;
      const parentJson = await downloadVersionJson(parentVersionId, manifest);
      if (parentJson && parentJson.downloads && parentJson.downloads.client) {
        // 也下载缺少的原版库和资源
        if (parentJson.libraries && parentJson.libraries.length > 0) {
          await downloadLibraries(parentJson, onProgress);
        }
        if (parentJson.assetIndex) {
          await downloadAssets(parentJson, onProgress);
        }
        results.clientJar = await downloadClientJar(parentJson, onProgress);
      }
    } catch (e) {
      console.warn('[Download] 尝试从父版本 ' + versionJson.inheritsFrom + ' 下载客户端 JAR 失败: ' + e.message);
    }
  }

  if (onProgress) onProgress({
    stage: 'complete',
    stageText: '版本文件已就绪',
    current: versionId,
    percent: 100,
    downloaded: 1,
    total: 1,
    files: []
  });

  return results;
}

async function downloadVersion(versionId, onProgress) {
  resetCancel();

  if (onProgress) onProgress({
    stage: 'fetching_manifest',
    stageText: '获取版本清单...',
    percent: 0,
    files: []
  });

  checkCancelled();
  const manifest = await getVersionManifest();

  if (onProgress) onProgress({
    stage: 'downloading_json',
    stageText: `下载 ${versionId} 的版本信息...`,
    percent: 2,
    files: []
  });

  checkCancelled();
  const versionJson = await downloadVersionJson(versionId, manifest);

  // 关键修复：对于有 inheritsFrom 的版本（Fabric/Forge），必须先确保父版本的 JSON 和客户端 JAR 已下载
  let jarPath = null;
  if (versionJson.inheritsFrom) {
    try {
      const parentVersionId = versionJson.inheritsFrom;
      // 下载父版本的 JSON（如果不存在）
      const parentJson = await downloadVersionJson(parentVersionId, manifest);
      // 下载父版本的客户端 JAR（即原版 Minecraft 客户端 JAR）
      jarPath = await downloadClientJar(parentJson, onProgress);
      // 下载父版本的依赖库
      if (parentJson.libraries && parentJson.libraries.length > 0) {
        await downloadLibraries(parentJson, onProgress);
      }
      // 下载父版本的资源文件
      if (parentJson.assetIndex) {
        await downloadAssets(parentJson, onProgress);
      }
    } catch (e) {
      console.warn('[Download] 父版本 ' + versionJson.inheritsFrom + ' 下载失败: ' + e.message);
    }
  }

  checkCancelled();
  const libResults = await downloadLibraries(versionJson, onProgress);

  checkCancelled();
  const assetResults = await downloadAssets(versionJson, onProgress);

  checkCancelled();
  // 如果父版本已有 JAR，则跳过；否则尝试当前版本的下载
  if (!jarPath) {
    jarPath = await downloadClientJar(versionJson, onProgress);
  }

  if (onProgress) onProgress({
    stage: 'complete',
    stageText: '下载完成！',
    current: versionId,
    percent: 100,
    downloaded: 1,
    total: 1,
    speedText: '完成',
    files: []
  });

  return {
    success: true,
    versionId,
    libraries: libResults,
    assets: assetResults,
    jarPath
  };
}

module.exports = {
  getVersionManifest,
  downloadVersion,
  checkAndDownloadMissing,
  downloadLibraries,
  downloadAssets,
  downloadClientJar,
  downloadFile,
  verifyFile,
  runWithConcurrency,
  formatBytesRate,
  formatEtaSeconds,
  DEFAULT_CONCURRENCY_LIBRARIES,
  DEFAULT_CONCURRENCY_ASSETS,
  requestCancel,
  isCancelled,
  resetCancel,
  checkCancelled
};
