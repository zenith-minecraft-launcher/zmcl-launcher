const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');
const crypto = require('crypto');

const configStore = require('../config/store');
const versionManager = require('../minecraft/version');
const downloadManager = require('./manager');

// 取消标志（使用 manager.js 的共享标志）
function requestCancel() { downloadManager.requestCancel(); }
function resetCancel() { downloadManager.resetCancel(); }
function checkCancelled() { downloadManager.checkCancelled(); }

// 为 axios 创建一个专门用于下载模组的实例：
// - 不强制校验 SSL 证书（某些 CDN 证书不规范或国内网络环境下被中间人代理）
// - 30 秒超时（避免长时间挂死）
// - 跟随最多 10 次重定向
const downloadAxios = axios.create({
  timeout: 30000,
  maxRedirects: 10,
  httpsAgent: new https.Agent({
    rejectUnauthorized: false,
    secureOptions: require('constants').SSL_OP_LEGACY_SERVER_CONNECT || 0
  }),
  headers: {
    'User-Agent': 'ZenithLauncher/1.0 (+https://github.com/zenith-mc/launcher)'
  }
});

// 不同内容类型对应的安装目录（相对 .minecraft/versions/<versionId>）
const TYPE_DIR_MAP = {
  mod: 'mods',
  mods: 'mods',
  模组: 'mods',
  resourcepack: 'resourcepacks',
  resourcepacks: 'resourcepacks',
  资源包: 'resourcepacks',
  shader: 'shaderpacks',
  shaderpack: 'shaderpacks',
  shaderpacks: 'shaderpacks',
  光影: 'shaderpacks',
  datapack: 'datapacks',
  datapacks: 'datapacks',
  数据包: 'datapacks',
  world: 'saves',
  saves: 'saves',
  世界: 'saves',
  modpack: 'modpacks'
};

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

/**
 * 根据类型和版本ID返回目标安装目录
 * 版本隔离：每个版本的模组安装在 .minecraft/versions/<versionId>/<type>/ 下
 * @param {string} typeKey
 * @param {string} [versionId] - 版本ID，如果不提供则使用全局目录（向后兼容）
 */
function resolveTargetDir(typeKey, versionId) {
  const norm = String(typeKey).toLowerCase();
  const dir = TYPE_DIR_MAP[norm] || TYPE_DIR_MAP[norm + 's'] || 'mods';

  if (versionId) {
    // 版本隔离路径：.minecraft/versions/<versionId>/<type>/
    return path.join(versionManager.getMinecraftDir(), 'versions', versionId, dir);
  }

  // 向后兼容：全局路径
  return path.join(versionManager.getMinecraftDir(), dir);
}

/**
 * 获取版本隔离的实例目录（游戏实际运行的目录）
 * @param {string} versionId
 */
function getVersionInstanceDir(versionId) {
  return path.join(versionManager.getMinecraftDir(), 'versions', versionId);
}

function computeSha1(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
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

/**
 * 流式下载文件到目标目录。支持进度回调（含速度 / 剩余时间）+ 自动重试。
 * @param {string} url
 * @param {string} destDir
 * @param {string} [preferredName]
 * @param {Function} [onProgress] - (percent, downloaded, total, fileName, extras) => void
 * @returns {Promise<string>}
 */
async function downloadFile(url, destDir, preferredName, onProgress) {
  ensureDir(destDir);

  if (!url) throw new Error('下载链接为空');

  checkCancelled();

  // 最多重试 3 次，不同错误有不同处理策略
  const MAX_RETRIES = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Addon] 下载尝试 ${attempt}/${MAX_RETRIES}: ${url}`);

      checkCancelled();

      const response = await downloadAxios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        validateStatus: (status) => status >= 200 && status < 400
      });

      if (!response || !response.data || typeof response.data.pipe !== 'function') {
        throw new Error('服务器返回了非流式响应或响应为空');
      }

      // 尝试从 Content-Disposition 或 URL 获取文件名
      let fileName = preferredName;
      if (!fileName) {
        const contentDisposition = response.headers && response.headers['content-disposition'];
        if (contentDisposition) {
          const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]+)/);
          if (match && match[1]) {
            fileName = match[1].replace(/['"]/g, '');
          }
        }
      }
      if (!fileName) {
        try {
          const u = new URL(url);
          fileName = path.basename(decodeURIComponent(u.pathname)) || `download-${Date.now()}.bin`;
        } catch (e) {
          fileName = `download-${Date.now()}.bin`;
        }
      }

      // 清理文件名中不合法的字符（Windows/Linux 都要）
      fileName = fileName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || `file-${Date.now()}.bin`;

      const destPath = path.join(destDir, fileName);
      const totalSize = parseInt(response.headers && response.headers['content-length'], 10) || 0;
      let downloaded = 0;
      const startTime = Date.now();

      console.log(`[Addon] 保存到: ${destPath} (${totalSize ? formatBytes(totalSize) : '未知大小'})`);

      const finalPath = await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(destPath);
        let streamError = null;

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
            const percent = totalSize ? (downloaded / totalSize * 100) : 0;
            const elapsed = (Date.now() - startTime) / 1000;
            const bps = elapsed > 0.1 ? downloaded / elapsed : 0;
            const remaining = Math.max(0, totalSize - downloaded);
            const eta = (bps > 0 && totalSize > 0) ? remaining / bps : 0;
            onProgress(percent, downloaded, totalSize, fileName, {
              speedBytesPerSec: bps,
              speedText: formatBytesRate(bps),
              etaSeconds: eta,
              etaText: formatEtaSeconds(eta)
            });
          }
        });

        response.data.on('error', (err) => {
          streamError = err;
          try { writer.destroy(); } catch (_) {}
          reject(new Error(`下载流错误: ${err.message}`));
        });

        writer.on('error', (err) => {
          streamError = err;
          try { response.data.destroy(); } catch (_) {}
          reject(new Error(`写入文件失败: ${err.message}`));
        });

        writer.on('finish', () => {
          if (!streamError) resolve(destPath);
        });

        response.data.pipe(writer);
      });

      // 下载完成后校验文件是否真的存在并且非空
      if (!fs.existsSync(finalPath)) {
        throw new Error('下载完成但文件不存在');
      }
      const stat = fs.statSync(finalPath);
      if (stat.size === 0) {
        try { fs.unlinkSync(finalPath); } catch (_) {}
        throw new Error('下载得到空文件');
      }

      console.log(`[Addon] 下载完成: ${finalPath} (${formatBytes(stat.size)})`);
      return finalPath;
    } catch (err) {
      lastError = err;
      const msg = (err && err.message) ? err.message : String(err);
      console.warn(`[Addon] 下载第 ${attempt} 次失败: ${msg}`);

      if (attempt >= MAX_RETRIES) break;

      // 对明显不可恢复的错误立即终止
      if (/404|not found|invalid|签名|401|403/i.test(msg)) {
        console.warn('[Addon] 该错误不可重试，直接终止');
        break;
      }

      // 指数退避等待
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }

  throw lastError || new Error('未知下载错误');
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return v.toFixed(i === 0 ? 0 : 2) + ' ' + units[i];
}

/**
 * 根据项目类型+版本信息，下载并安装到正确的版本隔离目录
 * @param {Object} options
 * @param {string} options.type - 类型 mod | resourcepack | shader | datapack | world | modpack
 * @param {string} options.projectTitle - 项目名（用于展示）
 * @param {string} [options.projectId]
 * @param {Object} options.file - { url, fileName, size, sha1 }
 * @param {string} [options.targetDir] - 自定义安装目录；未设置则按类型推断
 * @param {string} [options.versionId] - 目标版本ID，用于版本隔离
 * @param {Function} [onProgress]
 */
async function downloadAndInstall(options, onProgress) {
  resetCancel();

  const { type, file, projectTitle, targetDir, versionId } = options || {};
  if (!file || !file.url) {
    throw new Error('缺少下载链接信息，请确认该项目版本可以被下载');
  }

  // 强制版本隔离：必须有 versionId
  if (!versionId) {
    throw new Error('必须先选择游戏版本才能安装模组');
  }

  const installDir = targetDir || resolveTargetDir(type, versionId);
  ensureDir(installDir);
  console.log(`[Addon] 安装目录: ${installDir} (项目: ${projectTitle || '未命名'})`);

  const finalPath = await downloadFile(file.url, installDir, file.fileName, (p, d, t, n, extras) => {
    if (onProgress) onProgress({
      stage: 'downloading',
      percent: p,
      downloaded: d,
      total: t,
      fileName: n,
      installDir,
      projectTitle,
      speedBytesPerSec: extras && extras.speedBytesPerSec,
      speedText: extras && extras.speedText,
      etaSeconds: extras && extras.etaSeconds,
      etaText: extras && extras.etaText
    });
  });

  // 简单校验（如果有 sha1）
  if (file.sha1) {
    try {
      const actual = await computeSha1(finalPath);
      if (actual.toLowerCase() !== String(file.sha1).toLowerCase()) {
        console.warn('[Addon] 文件校验不通过，但继续保留:', finalPath);
      }
    } catch (e) {
      console.warn('[Addon] 校验失败:', e.message);
    }
  }

  if (onProgress) {
    onProgress({
      stage: 'complete',
      percent: 100,
      fileName: path.basename(finalPath),
      installDir,
      projectTitle
    });
  }

  return {
    file: finalPath,
    fileName: path.basename(finalPath),
    installDir,
    type,
    versionId
  };
}

/**
 * 获取已安装的内容（列出对应版本目录的文件）
 * @param {string} type
 * @param {string} [versionId] - 版本ID，用于版本隔离
 */
function listInstalled(type, versionId) {
  const dir = resolveTargetDir(type, versionId);
  if (!fs.existsSync(dir)) {
    return [];
  }
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries
      .filter(e => e.isFile() || e.isDirectory())
      .map(e => {
        const fullPath = path.join(dir, e.name);
        let size = 0;
        let mtime = null;
        try {
          const stat = fs.statSync(fullPath);
          size = stat.size;
          mtime = stat.mtime ? stat.mtime.getTime() : null;
        } catch (statErr) {
          // 忽略
        }
        const disabled = e.isFile() && isDisabled(e.name);
        const displayName = disabled ? e.name.slice(0, -'.disabled'.length) : e.name;
        return {
          name: e.name,
          displayName,
          isDir: e.isDirectory(),
          isFile: e.isFile(),
          enabled: e.isDirectory() ? true : !disabled,
          size,
          mtime,
          path: fullPath
        };
      });
  } catch (e) {
    console.error('[Addon] 无法列出目录:', dir, e.message);
    return [];
  }
}

/**
 * 获取指定类型的安装目录
 * @param {string} type
 * @param {string} [versionId] - 版本ID，用于版本隔离
 */
function getInstallDir(type, versionId) {
  return resolveTargetDir(type, versionId);
}

/**
 * 删除指定文件（安装的内容）
 * @param {string} type
 * @param {string} fileName
 * @param {string} [versionId] - 版本ID，用于版本隔离
 */
function removeInstalled(type, fileName, versionId) {
  const dir = resolveTargetDir(type, versionId);
  const target = path.join(dir, fileName);
  if (!fs.existsSync(target)) {
    return { success: false, message: '文件不存在' };
  }
  try {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      fs.rmSync(target, { recursive: true, force: true });
    } else {
      fs.unlinkSync(target);
    }
    return { success: true, path: target };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * 判断文件是否被禁用（名称以 .disabled 结尾）
 */
function isDisabled(fileName) {
  return fileName.toLowerCase().endsWith('.disabled');
}

/**
 * 切换启用/禁用状态（通过重命名添加或移除 .disabled 后缀）
 * @param {string} type
 * @param {string} fileName - 当前文件名
 * @param {string} [versionId] - 版本ID，用于版本隔离
 */
function toggleEnabled(type, fileName, versionId) {
  const dir = resolveTargetDir(type, versionId);
  const currentPath = path.join(dir, fileName);
  if (!fs.existsSync(currentPath)) {
    return { success: false, message: '文件不存在' };
  }

  let newName;
  let nowEnabled;
  if (isDisabled(fileName)) {
    // 已禁用 -> 启用：移除 .disabled 后缀
    newName = fileName.slice(0, -'.disabled'.length);
    nowEnabled = true;
  } else {
    // 已启用 -> 禁用：添加 .disabled 后缀
    newName = fileName + '.disabled';
    nowEnabled = false;
  }

  const newPath = path.join(dir, newName);

  // 如果目标路径已存在，添加时间戳避免冲突
  let finalPath = newPath;
  let counter = 0;
  while (fs.existsSync(finalPath)) {
    counter++;
    const ext = path.extname(newName);
    const base = path.basename(newName, ext);
    finalPath = path.join(dir, `${base}_${counter}${ext}`);
  }

  try {
    fs.renameSync(currentPath, finalPath);
    return {
      success: true,
      enabled: nowEnabled,
      oldName: fileName,
      newName: path.basename(finalPath)
    };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

module.exports = {
  downloadFile,
  downloadAndInstall,
  listInstalled,
  getInstallDir,
  removeInstalled,
  toggleEnabled,
  isDisabled,
  resolveTargetDir,
  getVersionInstanceDir,
  TYPE_DIR_MAP,
  requestCancel
};
