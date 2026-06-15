/* ===========================================================
 * 下载源管理（BMCLAPI 国内镜像）
 * 
 * URL 映射规则（BMCLAPI 镜像 Mojang）:
 *   https://piston-meta.mojang.com/       ->  https://bmclapi2.bangbang93.com/
 *   https://piston-data.mojang.com/       ->  https://bmclapi2.bangbang93.com/
 *   https://resources.download.minecraft.net/  ->  https://bmclapi2.bangbang93.com/assets/
 *   https://libraries.minecraft.net/      ->  https://bmclapi2.bangbang93.com/maven/
 * ========================================================= */

const BMCLAPI_BASE = 'https://bmclapi2.bangbang93.com';

const SOURCES = {
  bmclapi: {
    key: 'bmclapi',
    name: 'BMCLAPI',
    base: BMCLAPI_BASE,
    versionManifest: `${BMCLAPI_BASE}/mc/game/version_manifest_v2.json`,
    resources: `${BMCLAPI_BASE}/assets`,
    maven: `${BMCLAPI_BASE}/maven`,
    clientUrl: (versionId) => `${BMCLAPI_BASE}/versions/${versionId}/client.jar`
  }
};

// 当前激活的源 key
let _activeSourceKey = 'bmclapi';

/**
 * 将 Mojang URL 转换为 BMCLAPI 镜像 URL。
 * 如果已经是镜像 URL 或无法识别，原样返回。
 */
function rewriteUrlToBmclapi(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.includes('bmclapi2.bangbang93.com')) return url;
  // 版本清单 / version.json 等 meta 文件
  if (url.startsWith('https://piston-meta.mojang.com/')) {
    return url.replace('https://piston-meta.mojang.com/', `${BMCLAPI_BASE}/`);
  }
  // 客户端 jar / library 二进制
  if (url.startsWith('https://piston-data.mojang.com/')) {
    return url.replace('https://piston-data.mojang.com/', `${BMCLAPI_BASE}/`);
  }
  // 资源文件
  if (url.startsWith('https://resources.download.minecraft.net/')) {
    return url.replace('https://resources.download.minecraft.net/', `${BMCLAPI_BASE}/assets/`);
  }
  // 库文件 maven
  if (url.startsWith('https://libraries.minecraft.net/')) {
    return url.replace('https://libraries.minecraft.net/', `${BMCLAPI_BASE}/maven/`);
  }
  // 旧版本可能直接走 http://（极少，但兜底）
  if (url.startsWith('http://piston-meta.mojang.com/')) {
    return url.replace('http://piston-meta.mojang.com/', `${BMCLAPI_BASE}/`);
  }
  if (url.startsWith('http://piston-data.mojang.com/')) {
    return url.replace('http://piston-data.mojang.com/', `${BMCLAPI_BASE}/`);
  }
  return url;
}

/**
 * 根据当前选中源，将 Mojang URL 转换为对应镜像 URL
 */
function rewriteUrlToActiveSource(url) {
  return rewriteUrlToBmclapi(url);
}

function getSources() {
  return [{
    key: 'bmclapi',
    name: 'BMCLAPI',
    desc: 'BMCLAPI 国内镜像，速度快'
  }];
}

function getActiveSource() {
  return SOURCES.bmclapi;
}

function setActiveSource(sourceKey) {
  // 只有一个源，始终返回 bmclapi
  return true;
}

module.exports = {
  getSources,
  getActiveSource,
  setActiveSource,
  rewriteUrlToBmclapi,
  rewriteUrlToActiveSource,
  SOURCES,
  BMCLAPI: SOURCES.bmclapi,
  BMCLAPI_BASE
};
