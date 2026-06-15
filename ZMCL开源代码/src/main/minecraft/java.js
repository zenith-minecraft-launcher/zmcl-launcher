const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const configStore = require('../config/store');
const javaDownloader = require('./javaDownloader');

// ---------- 版本检测 ----------
function getJavaVersion(javaPath) {
  return new Promise((resolve, reject) => {
    const cmd = `"${javaPath}" -version`;
    exec(cmd, { timeout: 5000 }, (error, stdout, stderr) => {
      const output = stderr || stdout;
      if (output) {
        const versionMatch = output.match(/version\s+"?([^"\s]+)/);
        if (versionMatch) {
          const versionStr = versionMatch[1];
          const parts = versionStr.split('.');
          let majorVersion = parseInt(parts[0]);
          if (majorVersion === 1 && parts[1]) {
            majorVersion = parseInt(parts[1]);
          }
          resolve({
            path: javaPath,
            version: versionStr,
            majorVersion: majorVersion,
            raw: output
          });
          return;
        }
      }
      if (error) {
        reject(error);
      } else {
        resolve(null);
      }
    });
  });
}

// ---------- 获取系统所有可用驱动器（Windows） ----------
function getAllDrives() {
  const drives = [];
  if (process.platform !== 'win32') return drives;

  // 方法 1：使用 PowerShell 获取逻辑磁盘（推荐，wmic 已弃用）
  try {
    const out = execSync('powershell -NoProfile -Command "Get-CimInstance Win32_LogicalDisk | Select-Object -ExpandProperty DeviceID"', 
      { encoding: 'utf8', timeout: 5000 }).toString();
    const matches = out.match(/([A-Za-z]):/g);
    if (matches) {
      matches.forEach(m => {
        const d = m.charAt(0).toUpperCase();
        const drive = `${d}:${path.sep}`;
        if (drives.indexOf(drive) === -1) drives.push(drive);
      });
    }
  } catch (e) {
    // PowerShell 失败，尝试 wmic 作为回退
    try {
      const out = execSync('wmic logicaldisk get name', { encoding: 'utf8', timeout: 3000 }).toString();
      const matches = out.match(/([A-Za-z]):\\?/g);
      if (matches) {
        matches.forEach(m => {
          const d = m.charAt(0).toUpperCase();
          const drive = `${d}:${path.sep}`;
          if (drives.indexOf(drive) === -1) drives.push(drive);
        });
      }
    } catch (e2) {}
  }

  if (drives.length === 0) {
    // 方法 3：回退到直接枚举常见盘符 A-Z
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < letters.length; i++) {
      const drive = `${letters[i]}:${path.sep}`;
      try {
        if (fs.existsSync(drive)) drives.push(drive);
      } catch (e) {}
    }
  }

  // 确保 C 盘存在
  if (drives.indexOf('C:\\') === -1 && fs.existsSync('C:\\')) drives.push('C:\\');

  return drives;
}

// ---------- 在指定目录下递归查找 Java 可执行文件（深度受限，避免无限扫描） ----------
function findJavaExecutablesInDir(rootDir, maxDepth) {
  const found = [];
  const isWin = process.platform === 'win32';
  const javaName = isWin ? 'java.exe' : 'java';

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    try {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (e) {
        return;
      }
      for (const entry of entries) {
        const name = entry.name;
        const fullPath = path.join(dir, name);
        try {
          if (entry.isDirectory()) {
            // 跳过一些明显不包含 Java 的大型目录，加快扫描速度
            const lower = name.toLowerCase();
            if (depth === 1) {
              const skipDirs = ['$recycle.bin', 'system volume information', 'windows',
                'programdata', 'appdata', 'users', 'program files (x86)\\windowsapps',
                'node_modules', '.git'];
              if (skipDirs.indexOf(lower) !== -1) continue;
            }
            // 一些典型的 Java 安装标识目录，命中时直接检查 bin
            const javaMarkers = ['java', 'jdk', 'jre', 'adoptium', 'microsoft', 'eclipse foundation',
              'zulu', 'liberica', 'corretto', 'dragonwell', 'oracle'];
            let isJavaDir = false;
            for (const m of javaMarkers) {
              if (lower.indexOf(m) !== -1) { isJavaDir = true; break; }
            }
            if (isJavaDir) {
              const binDir = path.join(fullPath, 'bin');
              const candidate = path.join(binDir, javaName);
              try {
                if (fs.existsSync(candidate)) {
                  const stat = fs.statSync(candidate);
                  if (stat.isFile()) {
                    found.push(candidate);
                    continue;
                  }
                }
              } catch (e) {}
              // 目录内还可能有子版本目录，继续往深层扫描
              walk(fullPath, depth + 1);
            } else {
              // 普通目录：继续扫描，但深度受限
              walk(fullPath, depth + 1);
            }
          } else if (entry.isFile() && name.toLowerCase() === javaName) {
            found.push(fullPath);
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  try {
    if (fs.existsSync(rootDir)) walk(rootDir, 0);
  } catch (e) {}

  return found;
}

// ---------- 构造搜索路径（包括所有盘的常见目录） ----------
function buildSearchPaths() {
  const paths = [];

  if (process.platform === 'win32') {
    // 所有盘
    const drives = getAllDrives();

    // 常见搜索目录（每个驱动器都尝试）
    const commonSubDirs = [
      'Program Files\\Java',
      'Program Files\\Eclipse Foundation',
      'Program Files\\Eclipse Adoptium',
      'Program Files\\Microsoft',
      'Program Files\\Amazon Corretto',
      'Program Files (x86)\\Java',
      'Program Files (x86)\\Eclipse Foundation',
      'Program Files (x86)\\Eclipse Adoptium',
      'ProgramData\\Oracle\\Java',
      'Java',
      'jdk',
      'jre',
      'Program Files\\Zulu',
      'Program Files\\BellSoft',
      'Program Files\\Alibaba\\Dragonwell'
    ];

    // 环境变量中 Java_HOME
    if (process.env.JAVA_HOME) {
      paths.push(path.join(process.env.JAVA_HOME, 'bin', 'java.exe'));
      paths.push(process.env.JAVA_HOME);
    }

    // ProgramFiles 环境变量
    if (process.env.ProgramFiles) {
      paths.push(path.join(process.env.ProgramFiles, 'Java'));
    }
    if (process.env['ProgramFiles(x86)']) {
      paths.push(path.join(process.env['ProgramFiles(x86)'], 'Java'));
    }

    // PATH 中明显的 Java 路径
    if (process.env.PATH) {
      const envPaths = process.env.PATH.split(';');
      envPaths.forEach(p => {
        if (!p) return;
        const lower = p.toLowerCase();
        if (lower.indexOf('java') !== -1 || lower.indexOf('jdk') !== -1 || lower.indexOf('jre') !== -1) {
          const candidate = path.join(p, 'java.exe');
          paths.push(candidate);
        }
      });
    }

    // 系统默认 java（PATH 命令）
    paths.push('java');

    // 每个驱动器的常见子目录
    for (const drive of drives) {
      paths.push(drive); // 顶层驱动器（由 findJavaInDirectory 智能处理）
      for (const sub of commonSubDirs) {
        paths.push(path.join(drive, sub));
      }
    }
  } else if (process.platform === 'darwin') {
    paths.push('java');
    paths.push('/usr/bin/java');
    paths.push('/Library/Java/JavaVirtualMachines/');
    paths.push('/opt/homebrew/opt/');
    paths.push('/opt/');
    if (process.env.JAVA_HOME) {
      paths.push(path.join(process.env.JAVA_HOME, 'bin', 'java'));
      paths.push(process.env.JAVA_HOME);
    }
  } else {
    paths.push('java');
    paths.push('/usr/bin/java');
    paths.push('/usr/lib/jvm/');
    paths.push('/opt/java/');
    paths.push('/opt/');
    paths.push('/usr/local/');
    if (process.env.JAVA_HOME) {
      paths.push(path.join(process.env.JAVA_HOME, 'bin', 'java'));
      paths.push(process.env.JAVA_HOME);
    }
  }

  // 去重
  const unique = [];
  const seen = new Set();
  for (const p of paths) {
    if (!p) continue;
    const key = p.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(p);
    }
  }
  return unique;
}

// ---------- 在单个目录里寻找 Java ----------
function findJavaInDirectory(dirPath) {
  const results = [];
  if (!fs.existsSync(dirPath)) return results;

  try {
    const items = fs.readdirSync(dirPath);
    items.forEach(item => {
      const fullPath = path.join(dirPath, item);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          if (process.platform === 'win32') {
            const javaExe = path.join(fullPath, 'bin', 'java.exe');
            if (fs.existsSync(javaExe)) results.push(javaExe);
          } else {
            const javaBin = path.join(fullPath, 'bin', 'java');
            if (fs.existsSync(javaBin)) results.push(javaBin);
          }
        }
      } catch (e) {}
    });
  } catch (e) {}

  return results;
}

// ---------- 主检测入口：全系统所有盘 + 常用路径扫描 ----------
async function detectJavaInstallations() {
  const results = [];
  const checkedPaths = new Set();
  const candidatePaths = [];

  const searchPaths = buildSearchPaths();

  // ===== 阶段 1：收集所有候选 java 路径 =====
  for (const p of searchPaths) {
    if (!p) continue;
    try {
      if (p === 'java' || p.toLowerCase().endsWith('java.exe') || p.toLowerCase().endsWith(path.sep + 'java')) {
        // 命令形式或具体可执行文件，直接作为候选
        const key = p.toLowerCase();
        if (!checkedPaths.has(key)) {
          checkedPaths.add(key);
          candidatePaths.push(p);
        }
      } else if (fs.existsSync(p)) {
        const stat = fs.statSync(p);
        if (stat.isDirectory()) {
          // 这是一个目录
          // 首先尝试简单的子目录检查（速度快）
          const simpleFound = findJavaInDirectory(p);
          for (const fp of simpleFound) {
            const key = fp.toLowerCase();
            if (!checkedPaths.has(key)) {
              checkedPaths.add(key);
              candidatePaths.push(fp);
            }
          }

          // 如果是盘符根目录或已知包含 Java 的常见目录，则进行深度扫描
          const isDriveRoot = process.platform === 'win32' && /^[A-Za-z]:\\?$/.test(p);
          const isCommonJavaDir = /(java|jdk|jre|eclipse|microsoft|adoptium|zulu|corretto|dragonwell|liberica|oracle)/i.test(p);

          if (isDriveRoot || isCommonJavaDir) {
            const maxDepth = isDriveRoot ? 6 : 4;
            const deepFound = findJavaExecutablesInDir(p, maxDepth);
            for (const fp of deepFound) {
              const key = fp.toLowerCase();
              if (!checkedPaths.has(key)) {
                checkedPaths.add(key);
                candidatePaths.push(fp);
              }
            }
          }
        } else {
          // 这是一个文件，假设它就是 java
          const key = p.toLowerCase();
          if (!checkedPaths.has(key)) {
            checkedPaths.add(key);
            candidatePaths.push(p);
          }
        }
      }
    } catch (e) {}
  }

  // ===== 阶段 2：对所有候选路径执行版本检测（并发限制，避免过多子进程） =====
  const concurrency = Math.min(8, Math.max(2, Math.ceil(candidatePaths.length / 3)));
  let cursor = 0;

  async function worker() {
    while (cursor < candidatePaths.length) {
      const idx = cursor++;
      const candidate = candidatePaths[idx];
      try {
        const versionInfo = await getJavaVersion(candidate);
        if (versionInfo && !results.find(r => r.path === versionInfo.path)) {
          results.push(versionInfo);
        }
      } catch (e) {}
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);

  // 按主版本号降序排序
  results.sort((a, b) => b.majorVersion - a.majorVersion);

  // 过滤掉用户选择忽略的 Java
  const ignoredPaths = configStore.get('ignoredJavaPaths', []);
  const filteredResults = results.filter(r => !ignoredPaths.includes(r.path));

  console.log(`[Java] Found ${results.length} Java installations, ${filteredResults.length} after filtering`);
  return filteredResults;
}

function getRecommendedJava(versionJson) {
  if (!versionJson) {
    return { minVersion: 8, recommendedVersion: 17 };
  }

  let minVersion = 8;
  let recommendedVersion = 17;

  if (versionJson.javaVersion) {
    if (typeof versionJson.javaVersion === 'string') {
      const match = versionJson.javaVersion.match(/(\d+)/);
      if (match) {
        minVersion = parseInt(match[1]);
        recommendedVersion = minVersion;
      }
    } else if (versionJson.javaVersion.majorVersion) {
      minVersion = versionJson.javaVersion.majorVersion;
      recommendedVersion = minVersion;
    }
  }

  const id = versionJson.id || '';
  const idMatch = id.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (idMatch) {
    const rawMajor = parseInt(idMatch[1]);
    const rawMinor = parseInt(idMatch[2]);
    const patch = idMatch[3] ? parseInt(idMatch[3]) : 0;

    // 新版 MC (major > 1, 如 26.1) 与传统版本 (1.x.y) 的处理方式不同
    // 新版 MC (2.0+) 需要 Java 21+，这里统一用 rawMajor 和 rawMinor 判断
    const isModernMC = rawMajor > 1; // MC 2.0+

    // Minecraft 版本与 Java 版本对应关系
    // 旧版 (1.x.y): 1.21+/1.20.5+ 需要 Java 21, 1.18-1.20.4 需要 Java 17, ...
    // 新版 (2.0+): 需要 Java 21+

    if (isModernMC) {
      // MC 2.0+ (如 26.1) — 渐进式映射：
      // MC 26.x → Java 25, MC 25.x → Java 23, MC 24.x → Java 21, ...
      // 对于 >= 24 的版本，按 (rawMajor - 1) 估算最低 Java
      if (rawMajor >= 26) {
        recommendedVersion = Math.max(recommendedVersion, 25);
        minVersion = Math.max(minVersion, 25);
      } else if (rawMajor >= 24) {
        recommendedVersion = Math.max(recommendedVersion, 21);
        minVersion = Math.max(minVersion, 21);
      } else if (rawMajor >= 21) {
        recommendedVersion = Math.max(recommendedVersion, 21);
        minVersion = Math.max(minVersion, 21);
      } else if (rawMajor >= 17) {
        recommendedVersion = Math.max(recommendedVersion, 17);
        minVersion = Math.max(minVersion, 17);
      } else {
        recommendedVersion = Math.max(recommendedVersion, 17);
        minVersion = Math.max(minVersion, 8);
      }
    } else if (rawMajor >= 1 && rawMinor >= 21) {
      // 1.21+ 需要 Java 21
      recommendedVersion = Math.max(recommendedVersion, 21);
      minVersion = Math.max(minVersion, 21);
    } else if (rawMajor >= 1 && rawMinor === 20 && patch >= 5) {
      // 1.20.5+ 需要 Java 21
      recommendedVersion = Math.max(recommendedVersion, 21);
      minVersion = Math.max(minVersion, 21);
    } else if (rawMajor >= 1 && rawMinor >= 18) {
      // 1.18 - 1.20.4 需要 Java 17
      recommendedVersion = Math.max(recommendedVersion, 17);
      minVersion = Math.max(minVersion, 17);
    } else if (rawMajor >= 1 && rawMinor === 17) {
      // 1.17.x 需要 Java 16
      recommendedVersion = Math.max(recommendedVersion, 16);
      minVersion = Math.max(minVersion, 16);
    } else if (rawMajor >= 1 && rawMinor >= 13) {
      // 1.13 - 1.16.5 推荐 Java 17，最低 Java 8
      recommendedVersion = Math.max(recommendedVersion, 17);
      minVersion = Math.max(minVersion, 8);
    } else if (rawMajor >= 1 && rawMinor >= 11) {
      // 1.11 - 1.12.2 推荐 Java 17，最低 Java 8
      recommendedVersion = Math.max(recommendedVersion, 17);
      minVersion = Math.max(minVersion, 8);
    }
  }

  return { minVersion, recommendedVersion };
}

// ---------- 扫描本地 data/java 目录中的预置 JDK ----------
function scanLocalJavaInstallations() {
  const results = [];
  const javaBaseDir = javaDownloader.getJavaBaseDir();
  if (!fs.existsSync(javaBaseDir)) return results;

  try {
    const entries = fs.readdirSync(javaBaseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirPath = path.join(javaBaseDir, entry.name);
      const javaExe = javaDownloader.getJavaExePath(dirPath);
      if (javaExe && fs.existsSync(javaExe)) {
        // 从目录名解析主版本号（例如 jdk-17 -> 17）
        let majorVersion = 0;
        const m = entry.name.match(/jdk-(\d+)/);
        if (m) majorVersion = parseInt(m[1]);

        results.push({
          path: javaExe,
          version: String(majorVersion || 'unknown'),
          majorVersion: majorVersion || 0,
          isLocal: true,
          raw: entry.name
        });
      }
    }
  } catch (e) {
    console.warn('[Java] 扫描本地 Java 目录失败:', e.message);
  }

  // 按主版本号降序排序
  results.sort((a, b) => b.majorVersion - a.majorVersion);
  console.log(`[Java] 本地扫描到 ${results.length} 个预置 JDK`);
  return results;
}

// ---------- 为指定 Minecraft 版本智能选择最佳 Java ----------
// 优先级：
// 1. 本地 data/java 中与推荐主版本精确匹配的 JDK
// 2. 本地中满足要求的 Java（越接近推荐版本越好，不超出最大安全版本）
// 3. 系统中安装的 JDK：优先精确匹配推荐版本
// 4. 系统中安装的 JDK：满足要求且不超出安全上限
// 5. 若允许自动下载，返回建议下载的版本
async function selectBestJavaForVersion(versionJson, opts = {}) {
  if (!versionJson) {
    return { success: false, message: '未提供版本信息' };
  }

  const recommended = getRecommendedJava(versionJson);
  const { minVersion, recommendedVersion } = recommended;
  const allowDownload = opts.allowDownload !== false;

  // 设置最大安全版本：Forge 等加载器通常不兼容过新的 Java（如 Java 24+）
  // 一般允许推荐版本 + 2 作为安全上限
  const maxVersion = Math.max(recommendedVersion + 2, minVersion + 2);

  console.log(`[Java] 为 MC ${versionJson.id || 'unknown'} 选择 Java: 推荐=${recommendedVersion}, 最低=${minVersion}, 最大=${maxVersion}`);

  // 检查 Java 版本是否在安全范围内
  function isVersionSafe(j) {
    return j.majorVersion >= minVersion && j.majorVersion <= maxVersion;
  }

  // 排序函数：优先选择最接近推荐版本的
  function sortByProximity(a, b) {
    const aDiff = Math.abs(a.majorVersion - recommendedVersion);
    const bDiff = Math.abs(b.majorVersion - recommendedVersion);
    return aDiff - bDiff;
  }

  // ---- 1) 本地预置 JDK 精确匹配推荐版本 ----
  const localJdks = scanLocalJavaInstallations();
  const exactLocal = localJdks.find(j => j.majorVersion === recommendedVersion);
  if (exactLocal) {
    console.log(`[Java] 找到本地精确匹配: Java ${exactLocal.majorVersion} -> ${exactLocal.path}`);
    return {
      success: true,
      path: exactLocal.path,
      version: exactLocal.version,
      majorVersion: exactLocal.majorVersion,
      source: 'local',
      matchLevel: 'exact',
      recommended: recommended
    };
  }

  // ---- 2) 本地中满足安全要求的最佳候选 ----
  const validLocal = localJdks
    .filter(j => isVersionSafe(j))
    .sort(sortByProximity);
  if (validLocal.length > 0) {
    const pick = validLocal[0];
    console.log(`[Java] 选择本地 Java ${pick.majorVersion} (安全范围: ${minVersion}-${maxVersion})`);
    return {
      success: true,
      path: pick.path,
      version: pick.version,
      majorVersion: pick.majorVersion,
      source: 'local',
      matchLevel: 'compatible',
      recommended: recommended
    };
  }

  // ---- 3) 系统全局扫描：精确匹配推荐版本 ----
  let systemJdks = [];
  try {
    systemJdks = await detectJavaInstallations();
  } catch (e) {
    console.warn('[Java] 系统 Java 扫描失败:', e.message);
  }

  const exactSystem = systemJdks.find(j => j.majorVersion === recommendedVersion);
  if (exactSystem) {
    console.log(`[Java] 找到系统 Java ${exactSystem.majorVersion} -> ${exactSystem.path}`);
    return {
      success: true,
      path: exactSystem.path,
      version: exactSystem.version,
      majorVersion: exactSystem.majorVersion,
      source: 'system',
      matchLevel: 'exact',
      recommended: recommended
    };
  }

  // ---- 4) 系统中满足安全要求的最佳候选 ----
  const validSystem = systemJdks
    .filter(j => isVersionSafe(j))
    .sort(sortByProximity);
  if (validSystem.length > 0) {
    const pick = validSystem[0];
    console.log(`[Java] 选择系统 Java ${pick.majorVersion} (安全范围: ${minVersion}-${maxVersion})`);
    return {
      success: true,
      path: pick.path,
      version: pick.version,
      majorVersion: pick.majorVersion,
      source: 'system',
      matchLevel: 'compatible',
      recommended: recommended
    };
  }

  // ---- 5) 系统中有 Java 但版本过高（可能不兼容）----
  const tooNew = systemJdks
    .filter(j => j.majorVersion > maxVersion)
    .sort((a, b) => a.majorVersion - b.majorVersion); // 选择最低的过高版本
  if (tooNew.length > 0) {
    const pick = tooNew[0];
    console.warn(`[Java] 系统 Java ${pick.majorVersion} 超出安全范围 (${minVersion}-${maxVersion})，可能不兼容`);
    return {
      success: true,
      path: pick.path,
      version: pick.version,
      majorVersion: pick.majorVersion,
      source: 'system',
      matchLevel: 'warning',
      warning: `当前系统 Java 版本 (${pick.majorVersion}) 可能过新，建议安装 Java ${recommendedVersion}。游戏可能无法正常启动。`,
      recommended: recommended
    };
  }

  // ---- 6) 系统中即使不满足最低要求的最佳候选（警告使用）----
  if (systemJdks.length > 0) {
    const pick = systemJdks[0];
    console.log(`[Java] 系统中仅找到 Java ${pick.majorVersion}，不满足 ${minVersion}+ 的最低要求`);
    return {
      success: true,
      path: pick.path,
      version: pick.version,
      majorVersion: pick.majorVersion,
      source: 'system',
      matchLevel: 'insufficient',
      warning: `当前系统 Java 版本 (${pick.majorVersion}) 低于推荐的最低版本 (${minVersion})，游戏可能无法启动`,
      recommended: recommended
    };
  }

  // ---- 7) 没有任何 Java，建议自动下载 ----
  console.log(`[Java] 系统未找到可用 Java，建议下载 Java ${recommendedVersion}`);
  return {
    success: false,
    needDownload: allowDownload,
    message: `未找到可用的 Java 运行环境（需要 Java ${minVersion}+）`,
    recommendedVersion: recommendedVersion,
    recommended: recommended
  };
}

module.exports = {
  detectJavaInstallations,
  getRecommendedJava,
  getJavaVersion,
  scanLocalJavaInstallations,
  selectBestJavaForVersion
};
