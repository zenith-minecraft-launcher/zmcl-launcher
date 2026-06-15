const fs = require('fs');
const path = require('path');
const versionManager = require('./version');

function getAssetsIndexDir() {
  return path.join(versionManager.getAssetsDir(), 'indexes');
}

function getAssetObjectsDir() {
  return path.join(versionManager.getAssetsDir(), 'objects');
}

function getAssetLegacyDir() {
  return path.join(versionManager.getAssetsDir(), 'virtual', 'legacy');
}

function readAssetsIndex(assetIndexId) {
  const indexPath = path.join(getAssetsIndexDir(), `${assetIndexId}.json`);
  if (!fs.existsSync(indexPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
}

function getAssetObjectPath(hash) {
  const prefix = hash.slice(0, 2);
  return path.join(getAssetObjectsDir(), prefix, hash);
}

function getAssetUrl(baseUrl, hash) {
  const prefix = hash.slice(0, 2);
  return `${baseUrl}/${prefix}/${hash}`;
}

function checkAssets(versionJson) {
  if (!versionJson.assetIndex) {
    return { total: 0, missing: 0, files: [] };
  }

  const indexId = versionJson.assetIndex.id;
  const index = readAssetsIndex(indexId);
  if (!index || !index.objects) {
    return { total: 0, missing: 0, files: [], indexMissing: true };
  }

  const objects = index.objects;
  const missingFiles = [];
  let total = 0;

  for (const [filePath, fileInfo] of Object.entries(objects)) {
    total++;
    const objectPath = getAssetObjectPath(fileInfo.hash);
    if (!fs.existsSync(objectPath)) {
      missingFiles.push({
        path: filePath,
        hash: fileInfo.hash,
        size: fileInfo.size
      });
    }
  }

  return {
    total: total,
    missing: missingFiles.length,
    files: missingFiles,
    indexMissing: false
  };
}

module.exports = {
  getAssetsIndexDir,
  getAssetObjectsDir,
  getAssetLegacyDir,
  readAssetsIndex,
  getAssetObjectPath,
  getAssetUrl,
  checkAssets
};
