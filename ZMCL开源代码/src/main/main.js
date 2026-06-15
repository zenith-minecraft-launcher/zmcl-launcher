const { app, BrowserWindow, ipcMain, shell, dialog, Notification } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch (e) {
  console.warn('[Updater] electron-updater 未加载:', e.message);
}

// ============================================================
// 用户数据目录 / TLS 使用 Electron 默认配置
// 移除自定义 userData（避免打包后路径不存在）和禁用 TLS 验证的不安全设置
// ============================================================

const configStore = require('./config/store');
const microsoftAuth = require('./auth/microsoft');
const offlineAuth = require('./auth/offline');
const authlibAuth = require('./auth/authlib');
const minecraftLauncher = require('./minecraft/launcher');
const javaDetector = require('./minecraft/java');
const javaDownloader = require('./minecraft/javaDownloader');
const versionManager = require('./minecraft/version');
const assetsManager = require('./minecraft/assets');
const downloadManager = require('./download/manager');
const downloadSources = require('./download/sources');
const modrinth = require('./download/modrinth');
const curseforge = require('./download/curseforge');
const addonSearch = require('./download/addonSearch');
const mcmod = require('./download/mcmod');
const addonDownload = require('./download/addon');
const loaderManager = require('./download/loader');
const toolbox = require('./net/toolbox');
const deepseekAI = require('./ai/deepseek');
const aiActivation = require('./ai/activation');

// ============================================================
// 高 DPI 支持（解决启动器界面在高分辨率屏幕下的模糊问题）
// ============================================================
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('high-dpi-support', '1');
}

let mainWindow = null;
let isDev = process.argv.includes('--dev');

function createWindow() {
  const initTheme = configStore.get('theme', 'dark');
  const initBg = initTheme === 'dark' ? '#000000' : '#f8fafc';
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: initBg,
    title: 'Zenith Minecraft Launcher',
    frame: false,
    resizable: true,
    icon: path.join(__dirname, '..', 'renderer', 'assets', 'logo.ico'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  // 窗口控制
  ipcMain.handle('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });
  ipcMain.handle('window:toggleMaximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    } else {
      mainWindow.maximize();
      return true;
    }
  });
  ipcMain.handle('window:close', () => {
    if (mainWindow) mainWindow.close();
  });
  ipcMain.handle('window:isMaximized', () => {
    return mainWindow ? mainWindow.isMaximized() : false;
  });

  const indexPath = path.join(__dirname, '..', 'renderer', 'index.html');
  mainWindow.loadFile(indexPath);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  configStore.init();
  createWindow();

  // ===================== 静默自动更新（GitHub Release 私有仓库） =====================
  setupAutoUpdater();

  // ============= 读取文本文件（用于显示使用协议/隐私政策） =============
  ipcMain.handle('system:readTextFile', (event, filePath) => {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
      return null;
    }
  });

  // ============= 主题切换：同步更新窗口原生背景色 =============
  ipcMain.handle('theme:update', (event, theme) => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    const bg = theme === 'dark' ? '#000000' : '#f8fafc';
    mainWindow.setBackgroundColor(bg);
    return true;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ===================== IPC Handlers =====================

// Config
ipcMain.handle('config:get', (event, key, defaultValue) => {
  return configStore.get(key, defaultValue);
});

ipcMain.handle('config:set', (event, key, value) => {
  return configStore.set(key, value);
});

ipcMain.handle('config:getAll', () => {
  return configStore.getAll();
});

ipcMain.handle('accounts:getLastSelected', () => {
  return configStore.getLastSelectedAccount();
});

ipcMain.handle('accounts:clearLastSelected', () => {
  const accounts = configStore.getAccountsStore();
  accounts.lastSelected = null;
  configStore.setAccountsStore(accounts);
  return true;
});

// Microsoft Auth
ipcMain.handle('auth:microsoft:startOAuth', () => {
  return microsoftAuth.startOAuth((progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('auth:microsoft:progress', progress);
    }
  });
});

ipcMain.handle('auth:microsoft:refresh', (event, refreshToken) => {
  return microsoftAuth.refreshToken(refreshToken);
});

ipcMain.handle('auth:microsoft:getAccounts', () => {
  return microsoftAuth.getAccounts();
});

ipcMain.handle('auth:microsoft:removeAccount', (event, uuid) => {
  return microsoftAuth.removeAccount(uuid);
});

ipcMain.handle('auth:microsoft:selectAccount', (event, uuid) => {
  return microsoftAuth.selectAccount(uuid);
});

// Offline Auth
ipcMain.handle('auth:offline:login', (event, username) => {
  return offlineAuth.login(username);
});

ipcMain.handle('auth:offline:getAccounts', () => {
  return offlineAuth.getAccounts();
});

ipcMain.handle('auth:offline:removeAccount', (event, username) => {
  return offlineAuth.removeAccount(username);
});

ipcMain.handle('auth:offline:selectAccount', (event, username) => {
  return offlineAuth.selectAccount(username);
});

// Authlib Auth
ipcMain.handle('auth:authlib:login', (event, serverUrl, email, password) => {
  return authlibAuth.login(serverUrl, email, password);
});

ipcMain.handle('auth:authlib:refresh', (event, serverUrl, accessToken) => {
  return authlibAuth.refresh(serverUrl, accessToken);
});

ipcMain.handle('auth:authlib:validate', (event, serverUrl, accessToken) => {
  return authlibAuth.validate(serverUrl, accessToken);
});

ipcMain.handle('auth:authlib:getServers', () => {
  return authlibAuth.getPresetServers();
});

ipcMain.handle('auth:authlib:getAccounts', () => {
  return authlibAuth.getAccounts();
});

ipcMain.handle('auth:authlib:removeAccount', (event, uuid) => {
  return authlibAuth.removeAccount(uuid);
});

ipcMain.handle('auth:authlib:selectAccount', (event, uuid) => {
  return authlibAuth.selectAccount(uuid);
});

// Java Detection
ipcMain.handle('java:detect', () => {
  return javaDetector.detectJavaInstallations();
});

ipcMain.handle('java:getRecommended', (event, versionJson) => {
  return javaDetector.getRecommendedJava(versionJson);
});

// 扫描本地 data/java 目录中的预置 JDK
ipcMain.handle('java:scanLocal', () => {
  return javaDetector.scanLocalJavaInstallations();
});

// 为指定 MC 版本智能选择最佳 Java（核心：启动器自动选择 Java）
// 可传 versionJson 或 versionId；当不传时会读取当前选中的版本
ipcMain.handle('java:autoSelect', async (event, versionJsonOrId) => {
  let versionJson = versionJsonOrId;
  if (typeof versionJsonOrId === 'string') {
    try {
      versionJson = versionManager.getVersionJson(versionJsonOrId);
    } catch (e) {
      return { success: false, message: `无法读取版本信息: ${e.message}` };
    }
  }
  if (!versionJson) {
    const selectedVersion = configStore.get('selectedVersion');
    if (selectedVersion) {
      try {
        versionJson = versionManager.getVersionJson(selectedVersion);
      } catch (e) {
        return { success: false, message: `无法读取版本信息: ${e.message}` };
      }
    }
  }
  return javaDetector.selectBestJavaForVersion(versionJson, { allowDownload: false });
});

// Microsoft JDK 下载链接
const MS_JDK_DOWNLOAD_URLS = {
  '8': 'https://javadl.oracle.com/webapps/download/AutoDL?BundleId=253195_f7fe8e644f724108bdb54139381e29a7',
  '17': 'https://aka.ms/download-jdk/microsoft-jdk-17.0.19-windows-x64.exe',
  '21': 'https://aka.ms/download-jdk/microsoft-jdk-21.0.11-windows-x64.exe',
  '25': 'https://aka.ms/download-jdk/microsoft-jdk-25.0.3-windows-x64.exe'
};

// Java Download - 调用浏览器下载，下载完成后自动运行安装程序
ipcMain.handle('java:download', async (event, javaVersion) => {
  const vStr = String(javaVersion || '17');
  const downloadUrl = MS_JDK_DOWNLOAD_URLS[vStr];
  
  if (!downloadUrl) {
    return { success: false, message: `不支持的 Java 版本: ${vStr}` };
  }
  
  console.log('[Main] 打开浏览器下载 Java:', vStr, downloadUrl);
  
  // 1. 打开浏览器下载链接
  shell.openExternal(downloadUrl);
  
  // 2. 通知前端下载已启动
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('java:download:progress', {
      version: vStr,
      stage: '请在浏览器中完成下载...',
      percent: 50,
      done: false
    });
  }
  
  // 3. 监控下载目录，等待安装包下载完成
  const downloadsDir = path.join(os.homedir(), 'Downloads');
  const expectedFilePatterns = [
    `jdk-${vStr}*.exe`,
    `microsoft-jdk-${vStr}*.exe`,
    `jdk-*${vStr}*.exe`
  ];
  
  // 启动后台监控任务
  monitorDownloadAndInstall(vStr, downloadsDir, expectedFilePatterns);
  
  return {
    success: true,
    version: vStr,
    message: '下载已启动，请在浏览器中完成下载，安装程序将自动运行'
  };
});


// 关闭浏览器进程（Windows）
function closeBrowser() {
  try {
    // 尝试关闭常见的浏览器进程
    exec('taskkill /F /IM chrome.exe /T 2>nul', () => {});
    exec('taskkill /F /IM msedge.exe /T 2>nul', () => {});
    exec('taskkill /F /IM firefox.exe /T 2>nul', () => {});
    exec('taskkill /F /IM iexplore.exe /T 2>nul', () => {});
    console.log('[Main] 已尝试关闭浏览器');
  } catch (e) {
    console.warn('[Main] 关闭浏览器失败:', e.message);
  }
}

// 监控下载目录并自动运行安装程序
async function monitorDownloadAndInstall(javaVersion, downloadsDir, filePatterns) {
  const vStr = String(javaVersion);
  const maxWaitTime = 10 * 60 * 1000; // 最多等待10分钟
  const checkInterval = 3000; // 每3秒检查一次
  const startTime = Date.now();
  
  console.log(`[Main] 开始监控下载目录: ${downloadsDir}`);
  
  const checkDownload = () => {
    // 检查是否超时
    if (Date.now() - startTime > maxWaitTime) {
      console.log('[Main] 监控超时，停止检查');
      return;
    }
    
    try {
      if (!fs.existsSync(downloadsDir)) {
        setTimeout(checkDownload, checkInterval);
        return;
      }
      
      const files = fs.readdirSync(downloadsDir);
      
      // 查找最近修改的 .exe 文件（2分钟内）
      const recentExeFiles = files
        .filter(f => f.endsWith('.exe'))
        .map(f => {
          const filePath = path.join(downloadsDir, f);
          const stat = fs.statSync(filePath);
          return {
            name: f,
            path: filePath,
            mtime: stat.mtime.getTime(),
            size: stat.size
          };
        })
        .filter(f => (Date.now() - f.mtime) < 2 * 60 * 1000) // 2分钟内修改的
        .sort((a, b) => b.mtime - a.mtime); // 按时间倒序
      
      if (recentExeFiles.length > 0) {
        // 找到最近下载的安装包
        const installerFile = recentExeFiles[0];
        console.log(`[Main] 发现下载的安装包: ${installerFile.path}`);
        
        // 检查文件是否还在写入（大小是否稳定）
        setTimeout(() => {
          try {
            const currentStat = fs.statSync(installerFile.path);
            // 如果文件大小稳定，关闭浏览器并启动安装程序
            if (currentStat.size > 1000000) { // 至少1MB
              console.log(`[Main] 关闭浏览器并启动安装程序: ${installerFile.path}`);
              
              // 1. 先关闭浏览器
              closeBrowser();
              
              // 2. 等待1秒后启动安装程序
              setTimeout(() => {
                const { execFile } = require('child_process');
                execFile(installerFile.path, [], {
                  detached: true,
                  windowsHide: false
                }, (error) => {
                  if (error) {
                    console.error('[Main] 安装程序启动失败:', error.message);
                  }
                });
                
                // 发送系统通知
                if (Notification.isSupported()) {
                  const notification = new Notification({
                    title: 'Zenith Launcher',
                    body: 'Zenith已为您自动打开安装包',
                    icon: path.join(__dirname, '..', 'renderer', 'assets', 'logo.png')
                  });
                  notification.show();
                }
                
                // 通知前端
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('java:download:progress', {
                    version: vStr,
                    stage: '安装程序已启动',
                    percent: 100,
                    done: true
                  });
                }
              }, 1000); // 等待1秒确保浏览器关闭
              
              return; // 停止监控
            }
          } catch (e) {}
          
          // 继续监控
          setTimeout(checkDownload, checkInterval);
        }, 3000); // 等待3秒确保文件写入完成
        
        return;
      }
    } catch (e) {
      console.error('[Main] 检查下载目录出错:', e.message);
    }
    
    // 继续监控
    setTimeout(checkDownload, checkInterval);
  };
  
  // 开始监控
  setTimeout(checkDownload, checkInterval);
}

// 查询指定 MC 版本的 Java 运行时信息
ipcMain.handle('java:downloadInfo', (event, mcVersion) => {
  const version = mcVersion || '1.20.1';
  return {
    runtimeName: javaDownloader.getJavaRuntimeName(version),
    javaVersion: javaDownloader.getJavaMajorVersion(javaDownloader.getJavaRuntimeName(version)),
    mcVersion: version
  };
});

// 列出已安装的 Java
ipcMain.handle('java:list', () => {
  return javaDownloader.listInstalledJavas();
});

// 删除指定版本的 Java
ipcMain.handle('java:delete', (event, majorVersion) => {
  return javaDownloader.deleteJava(majorVersion);
});

// 取消 Java 下载
ipcMain.handle('java:cancel', (event, javaVersion) => {
  if (typeof javaDownloader.requestCancel === 'function') {
    javaDownloader.requestCancel(javaVersion);
  }
  return { success: true };
});

// Version Management
ipcMain.handle('version:list', () => {
  return versionManager.getInstalledVersions();
});

ipcMain.handle('version:getJson', (event, versionId) => {
  return versionManager.getVersionJson(versionId);
});

ipcMain.handle('version:select', (event, versionId) => {
  return versionManager.selectVersion(versionId);
});

ipcMain.handle('version:delete', (event, versionId) => {
  return versionManager.deleteVersion(versionId);
});

// Download
ipcMain.handle('download:getSources', () => {
  return downloadSources.getSources();
});

ipcMain.handle('download:setSource', (event, sourceKey) => {
  return downloadSources.setActiveSource(sourceKey);
});

ipcMain.handle('download:getManifest', () => {
  return downloadManager.getVersionManifest();
});

ipcMain.handle('download:version', async (event, versionId) => {
  console.log('[Main] download:version called for:', versionId);
  return downloadManager.downloadVersion(versionId, (progress) => {
    console.log('[Main] download:version progress:', progress);
    if (mainWindow) {
      console.log('[Main] sending download:progress');
      mainWindow.webContents.send('download:progress', progress);
    }
  });
});

ipcMain.handle('download:checkFiles', async (event, versionId) => {
  return downloadManager.checkAndDownloadMissing(versionId, (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('download:progress', progress);
    }
  });
});

ipcMain.handle('download:assets', async (event, versionId) => {
  try {
    const versionJson = versionManager.getVersionJson(versionId);
    return downloadManager.downloadAssets(versionJson, (progress) => {
      if (mainWindow) {
        mainWindow.webContents.send('download:progress', progress);
      }
    });
  } catch (e) {
    return { total: 0, downloaded: 0, skipped: 0, error: e.message };
  }
});

// 取消版本下载
ipcMain.handle('download:cancel', () => {
  downloadManager.requestCancel();
  return { success: true };
});

// ===================== 模组加载器 =====================

// 检测某 MC 版本的所有加载器可用性
ipcMain.handle('loader:detect', async (event, mcVersion) => {
  return loaderManager.detectLoaders(mcVersion);
});

// 检查加载器组合的冲突（互斥 / 最低版本要求 / 支持情况）
ipcMain.handle('loader:checkConflicts', async (event, selection, mcVersion, availability) => {
  return loaderManager.checkConflicts(selection, mcVersion, availability);
});

// 安装模组加载器（带进度回调）
ipcMain.handle('loader:install', async (event, mcVersion, selectedLoaders) => {
  return loaderManager.installLoaderVersion(mcVersion, selectedLoaders, (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('loader:progress', progress);
    }
  });
});

// 返回 OptiFine-Forge 最低兼容版本矩阵（前端可以据此提示）
ipcMain.handle('loader:optifineMatrix', () => {
  return loaderManager.OPTIFINE_STABLE_MAP || {};
});

// 取消模组加载器下载
ipcMain.handle('loader:cancel', () => {
  if (typeof loaderManager.requestCancel === 'function') {
    loaderManager.requestCancel();
  }
  return { success: true };
});

// ===================== Addon 多源搜索 / 下载 / 翻译 =====================

// 聚合搜索：可指定 source=modrinth / curseforge / all，带中文增强 & 回退
ipcMain.handle('addon:search', async (event, options) => {
  return addonSearch.search(options || {});
});

// 聚合搜索 + 获取中文信息（从 MC百科获取模组中文名称和描述）
// options.translate = true 时会在搜索完成后从 MC百科获取前 15 条结果的中文信息
ipcMain.handle('addon:searchTranslate', async (event, options) => {
  const opts = options || {};
  if (opts.translate) {
    return addonSearch.searchWithChineseInfo(opts);
  }
  return addonSearch.search(opts);
});

// 弹出"选择模组/资源包保存文件夹"对话框
// 默认定位到 .minecraft/versions/<versionId>/<type>
// 若该目录不存在，则先递归创建，再弹出对话框
// 返回用户选择的目录路径（或 null 表示取消）
ipcMain.handle('addon:selectInstallDir', async (event, options = {}) => {
  const { type = 'mod', versionId = null, title, defaultPath = null } = options;
  let targetDir = defaultPath || addonDownload.resolveTargetDir(type, versionId);

  // 关键修复：确保目标目录存在，否则 Windows 会报错 "路径不存在"
  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
      console.log(`[Addon] 目录已创建: ${targetDir}`);
    }
  } catch (err) {
    console.warn(`[Addon] 目录创建失败，回退到上级: ${targetDir}`, err.message);
    // 回退策略：上级目录 → versions 目录 → 用户主目录
    try {
      const parentDir = path.dirname(targetDir);
      if (fs.existsSync(parentDir)) {
        targetDir = parentDir;
      } else {
        targetDir = os.homedir();
      }
    } catch (_) {
      targetDir = os.homedir();
    }
  }

  const dialogTitle = title || `选择${getTypeFriendlyName(type)}保存文件夹`;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: dialogTitle,
    defaultPath: targetDir,
    buttonLabel: '选择文件夹',
    properties: ['openDirectory', 'createDirectory']
  });

  if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// 辅助函数：类型中文名
function getTypeFriendlyName(type) {
  const t = String(type || '').toLowerCase();
  if (['mod', '模组', 'mods'].includes(t)) return '模组';
  if (['resourcepack', 'resourcepacks', '资源包'].includes(t)) return '资源包';
  if (['shader', 'shaderpack', 'shaderpacks', '光影'].includes(t)) return '光影';
  if (['datapack', 'datapacks', '数据包'].includes(t)) return '数据包';
  if (['world', 'save', 'saves', '世界'].includes(t)) return '世界';
  return '资源';
}

// 列出可用的内容源
ipcMain.handle('addon:sources', () => addonSearch.getAvailableSources());

// 按源获取项目详情（向后兼容：若不传 source 默认为 modrinth）
ipcMain.handle('addon:project', async (event, projectId, source) => {
  return addonSearch.getProject(projectId, source);
});

// 按源获取项目版本
ipcMain.handle('addon:versions', async (event, projectId, source, filters) => {
  return addonSearch.getProjectVersions(projectId, source, filters || {});
});

// 从本地映射表获取中文信息（用于详情弹窗显示中文名称/描述）
ipcMain.handle('addon:getChineseInfo', async (event, englishName, slug) => {
  return mcmod.getChineseInfo(englishName, slug);
});

// 批量解析依赖详情（{projectId, versionId, dependencyType, source} -> {title, projectUrl, installed, enabled, ...}）
ipcMain.handle('addon:resolveDependencies', async (event, dependencies, opts) => {
  return addonSearch.getDependencyDetails(dependencies || [], opts || {});
});

// —— 保持向后兼容的旧 API ——
ipcMain.handle('modrinth:search', async (event, options) => {
  return modrinth.searchProjects(options || {});
});

ipcMain.handle('modrinth:project', async (event, projectId) => {
  return modrinth.getProject(projectId);
});

ipcMain.handle('modrinth:versions', async (event, projectId, filters) => {
  return modrinth.getProjectVersions(projectId, filters || {});
});

ipcMain.handle('modrinth:version', async (event, versionId) => {
  return modrinth.getVersion(versionId);
});

// 下载并安装 addon（mod / resourcepack / shader / datapack / world）
ipcMain.handle('addon:download', async (event, options) => {
  return addonDownload.downloadAndInstall(options || {}, (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('addon:progress', progress);
    }
  });
});

ipcMain.handle('addon:listInstalled', (event, type, versionId) => {
  return addonDownload.listInstalled(type, versionId);
});

ipcMain.handle('addon:getInstallDir', (event, type, versionId) => {
  return addonDownload.getInstallDir(type, versionId);
});

ipcMain.handle('addon:remove', (event, type, fileName, versionId) => {
  return addonDownload.removeInstalled(type, fileName, versionId);
});

ipcMain.handle('addon:toggle', (event, type, fileName, versionId) => {
  return addonDownload.toggleEnabled(type, fileName, versionId);
});

// 取消 addon 下载
ipcMain.handle('addon:cancel', () => {
  if (typeof addonDownload.requestCancel === 'function') {
    addonDownload.requestCancel();
  }
  return { success: true };
});

// Launch
ipcMain.handle('launch:start', async (event, options) => {
  return minecraftLauncher.launch(options, (log) => {
    if (mainWindow) {
      mainWindow.webContents.send('launch:log', log);
    }
  });
});

ipcMain.handle('launch:getState', () => {
  return minecraftLauncher.getState();
});

ipcMain.handle('launch:stop', () => {
  return minecraftLauncher.stop();
});

// System
ipcMain.handle('system:openPath', (event, folderType, versionId) => {
  let targetPath;
  const baseDir = configStore.get('minecraftDir') || path.join(os.homedir(), '.minecraft');
  switch (folderType) {
    case 'minecraft':
      targetPath = baseDir;
      break;
    case 'versions':
      targetPath = path.join(baseDir, 'versions');
      break;
    case 'logs':
      if (versionId) {
        targetPath = path.join(baseDir, 'versions', versionId, 'logs');
      } else {
        targetPath = path.join(baseDir, 'logs');
      }
      break;
    case 'launcher-logs':
      targetPath = path.join(app.getPath('userData'), 'logs');
      break;
    case 'mods':
    case 'resourcepacks':
    case 'shaderpacks':
    case 'datapacks': {
      if (versionId) {
        targetPath = path.join(baseDir, 'versions', versionId, folderType);
      } else {
        targetPath = path.join(baseDir, folderType);
      }
      break;
    }
    default:
      targetPath = baseDir;
  }
  if (!fs.existsSync(targetPath)) {
    try { fs.mkdirSync(targetPath, { recursive: true }); } catch (e) {}
  }
  shell.openPath(targetPath);
  return true;
});

ipcMain.handle('system:selectFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择 .minecraft 目录',
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// 清除启动器旧日志
ipcMain.handle('system:clearOldLogs', () => {
  try {
    const logDir = path.join(os.homedir(), 'zenith-logs');
    if (!fs.existsSync(logDir)) {
      return { success: true, deletedCount: 0, freedBytes: '0 B' };
    }
    let deletedCount = 0;
    let totalSize = 0;
    const files = fs.readdirSync(logDir);
    for (const file of files) {
      const filePath = path.join(logDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          totalSize += stat.size;
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch (_) {}
    }
    const sizeStr = totalSize < 1024 ? totalSize + ' B' :
      totalSize < 1048576 ? (totalSize / 1024).toFixed(1) + ' KB' :
      (totalSize / 1048576).toFixed(2) + ' MB';
    return { success: true, deletedCount, freedBytes: sizeStr };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('system:info', () => {
  return {
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    homedir: os.homedir(),
    totalMem: os.totalmem(),
    freeMem: os.freemem()
  };
});

ipcMain.handle('system:openExternal', (event, url) => {
  shell.openExternal(url);
  return true;
});

// 删除系统 Java 目录（需要管理员权限，尝试用 PowerShell 删除）
ipcMain.handle('system:deleteFolder', async (event, folderPath) => {
  if (!folderPath || typeof folderPath !== 'string') {
    return { success: false, message: '无效的路径' };
  }
  
  // 安全检查：只允许删除包含 java/jdk/jre 的目录
  const lowerPath = folderPath.toLowerCase();
  const isJavaPath = lowerPath.includes('java') || lowerPath.includes('jdk') || lowerPath.includes('jre');
  if (!isJavaPath) {
    return { success: false, message: '只能删除 Java 相关目录' };
  }
  
  // 如果传入的是文件路径（如 java.exe），向上找到安装根目录
  let dirToDelete = folderPath;
  try {
    const stat = fs.statSync(folderPath);
    if (stat.isFile()) {
      // 向上查找：java.exe -> bin -> jdk-xxx
      let current = path.dirname(folderPath); // bin
      if (path.basename(current).toLowerCase() === 'bin') {
        current = path.dirname(current); // jdk-xxx 或 jre-xxx
      }
      dirToDelete = current;
    }
  } catch (e) {}
  
  if (!fs.existsSync(dirToDelete)) {
    return { success: false, message: '目录不存在' };
  }
  
  try {
    // 尝试直接删除（可能因权限失败）
    const { execFile } = require('child_process');
    
    await new Promise((resolve, reject) => {
      // 使用 PowerShell 的 Remove-Item 尝试删除，可能需要管理员权限
      const psCommand = `Remove-Item -LiteralPath '${dirToDelete.replace(/'/g, "''")}' -Recurse -Force -ErrorAction Stop`;
      execFile('powershell', ['-NoProfile', '-Command', psCommand], { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`删除失败: ${error.message}`));
        } else {
          resolve();
        }
      });
    });
    
    console.log(`[System] 已删除目录: ${dirToDelete}`);
    return { success: true, path: dirToDelete };
  } catch (e) {
    console.error(`[System] 删除目录失败: ${dirToDelete}`, e.message);
    return { success: false, message: `删除失败: ${e.message}\n请手动删除该目录，或以管理员身份运行启动器。` };
  }
});

/* ============================ 陶瓦联机（基于 EasyTier） ============================ */

/* 懒加载 taowa 模块，避免在未使用时触发 electron app 读取 */
let _taowaModule = null;
function getTaowa() {
  if (_taowaModule) return _taowaModule;
  _taowaModule = require('./net/taowa');
  return _taowaModule;
}

ipcMain.handle('taowa:getNodes', () => {
  return getTaowa().TAOWA_NODES;
});

ipcMain.handle('taowa:info', () => {
  const taowa = getTaowa();
  const path = require('path');
  const fs = require('fs');
  const binPath = taowa.resolveBinPath();
  let size = 0;
  try {
    if (binPath && fs.existsSync(binPath)) {
      size = fs.statSync(binPath).size;
    }
  } catch (_) {}

  /* 区分内置和下载两种来源 */
  let fromBundled = false;
  let hasDownloaded = false;

  /* 判断是否有本地下载的核心 */
  try {
    const electronApp = require('electron').app;
    let userDataHome;
    try { userDataHome = electronApp.getPath('userData'); } catch (_) {
      userDataHome = path.join(require('os').homedir(), '.zenith_launcher');
    }
    const downloadedPath = path.join(userDataHome, 'taowa', 'bin',
      process.platform === 'win32' ? 'easytier-core.exe' : 'easytier-core');
    if (fs.existsSync(downloadedPath) && fs.statSync(downloadedPath).size > 0) {
      hasDownloaded = true;
    }
  } catch (_) {}

  /* 判断当前 binPath 是否指向内置位置 */
  try {
    const appPaths = [
      path.join(process.cwd(), 'resources', 'assets', 'easytier', 'win64'),
      path.join(__dirname, 'assets', 'easytier', 'win64'),
      path.join(__dirname, '..', 'assets', 'easytier', 'win64')
    ];
    for (const p of appPaths) {
      const cand = path.join(p, process.platform === 'win32' ? 'easytier-core.exe' : 'easytier-core');
      if (fs.existsSync(cand) && cand === binPath) { fromBundled = true; break; }
    }
  } catch (_) {}

  return {
    binPath,
    size,
    fromBundled,
    hasDownloaded,
    hostVip: taowa.HOST_VIP,
    ready: !!binPath
  };
});

/* 房主：生成邀请码并启动 EasyTier */
ipcMain.handle('taowa:startHost', async (event) => {
  try {
    const taowa = getTaowa();
    const result = await taowa.startHost(
      (p) => { try { event.sender.send('taowa:progress', p); } catch (_) {} },
      (e) => { try { event.sender.send('taowa:event', e); } catch (_) {} }
    );
    return { ok: true, ...result };
  } catch (err) {
    console.error('[陶瓦联机] 创建房间失败:', err && err.message || err);
    return { ok: false, error: err && err.message || String(err) };
  }
});

/* 房客：输入邀请码加入 */
ipcMain.handle('taowa:startGuest', async (event, options) => {
  try {
    const taowa = getTaowa();
    const result = await taowa.startGuest(
      options?.code,
      (p) => { try { event.sender.send('taowa:progress', p); } catch (_) {} },
      (e) => { try { event.sender.send('taowa:event', e); } catch (_) {} }
    );
    return { ok: true, ...result };
  } catch (err) {
    console.error('[陶瓦联机] 加入房间失败:', err && err.message || err);
    return { ok: false, error: err && err.message || String(err) };
  }
});

/* 停止联机 */
ipcMain.handle('taowa:stop', () => {
  try {
    return getTaowa().stop();
  } catch (err) {
    console.error('[陶瓦联机] 停止失败:', err && err.message || err);
    return { ok: false, error: err && err.message || String(err) };
  }
});

/* 查询状态 */
ipcMain.handle('taowa:status', () => {
  try {
    return getTaowa().getStatus();
  } catch (err) {
    return { state: 'error', error: err && err.message || String(err) };
  }
});

/* 可选：检查是否已安装（允许前端提前准备） */
ipcMain.handle('taowa:download', async (event) => {
  try {
    const taowa = getTaowa();
    const bin = await taowa.downloadEasyTier((p) => {
      try { event.sender.send('taowa:progress', p); } catch (_) {}
    });
    return { ok: true, binPath: bin };
  } catch (err) {
    console.error('[陶瓦联机] 下载 EasyTier 失败:', err && err.message || err);
    return { ok: false, error: err && err.message || String(err) };
  }
});

/* 卸载陶瓦联机核心（停止子进程 + 清理 userData 下的二进制） */
ipcMain.handle('taowa:uninstall', () => {
  try {
    const taowa = getTaowa();
    return taowa.uninstallEasyTier();
  } catch (err) {
    console.error('[陶瓦联机] 卸载 EasyTier 失败:', err && err.message || err);
    return {
      ok: false,
      error: err && err.message || String(err),
      removed: null,
      hasBundled: false
    };
  }
});

/* ==================== 工具箱 (系统 / 备份 / 清理 / 诊断) ==================== */

// 延迟初始化工具箱：等 Electron app 起来后再注入上下文（用户目录 / minecraftDir）
if (typeof toolbox.init === 'function') {
  try {
    toolbox.init({
      launcherDataDir: app && app.getPath ? app.getPath('userData') : null,
      minecraftDir: path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft')
    });
  } catch (_) {}
}

ipcMain.handle('toolbox:listTools', () => {
  try { return toolbox.listTools(); }
  catch (err) {
    console.error('[工具箱] listTools 异常:', err);
    return [];
  }
});

ipcMain.handle('toolbox:exec', async (event, toolKey, payload) => {
  try {
    const result = await toolbox.exec(toolKey, payload || {});
    return result || { ok: false, message: '工具无返回' };
  } catch (err) {
    console.error('[工具箱] exec 异常:', err);
    return { ok: false, message: (err && err.message) ? err.message : String(err) };
  }
});

ipcMain.handle('shell:openExternal', (event, url) => {
  if (typeof url !== 'string' || !url) return false;
  try {
    shell.openExternal(url);
    return true;
  } catch (err) {
    console.error('[shell] openExternal 异常:', err);
    return false;
  }
});

/* ==================== 爱发电 (ifdian/afdian) API ==================== */

const AFD_API_URL = 'https://ifdian.net/api/open/query-sponsor';
const AFD_USER_ID = 'YOUR_AFDIAN_USER_ID';
const AFD_API_TOKEN = 'YOUR_AFDIAN_API_TOKEN';

/**
 * 返回硬编码的 ifdian 凭据
 */
function getAfdianCredentials() {
  return { userId: AFD_USER_ID, token: AFD_API_TOKEN };
}

/**
 * 计算当前自然月（本地时区）第一天 00:00 的 Unix 秒级时间戳
 * 用于筛选"当月"赞助者
 */
function currentMonthStartTs() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return Math.floor(start.getTime() / 1000);
}

/**
 * 调用爱发电 API 拉取赞助者列表
 * 仅保留当月（当前自然月）有赞助记录的赞助者
 * @param {Object} options - { page }
 * @returns {Promise<Object>} - { ok, sponsors, totalCount, error }
 */
async function fetchAfdianSponsors({ page = 1 }) {
  const { userId, token } = getAfdianCredentials();
  if (!userId || !token) {
    return { ok: false, error: '缺少凭据' };
  }

  const ts = Math.floor(Date.now() / 1000);
  const params = { page: page };
  const paramsJson = JSON.stringify(params);
  const kvString = `params${paramsJson}ts${ts}user_id${userId}`;
  const rawSign = token + kvString;
  const sign = crypto.createHash('md5').update(rawSign).digest('hex');

  const payload = {
    user_id: userId,
    params: paramsJson,
    ts: ts,
    sign: sign
  };

  try {
    const response = await axios.post(AFD_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Zenith-Launcher/1.0'
      },
      timeout: 10000
    });

    const body = response.data;

    if (!body || typeof body.ec === 'undefined') {
      return { ok: false, error: '响应格式异常' };
    }

    if (body.ec !== 200) {
      return {
        ok: false,
        error: body.em || `API 返回错误码 ${body.ec}`
      };
    }

    const list = (body.data && body.data.list) || [];
    const monthStart = currentMonthStartTs();

    // 仅保留在当前自然月内有 last_pay_time 的赞助者
    const sponsors = list
      .filter(item => (item.last_pay_time || 0) >= monthStart)
      .map(item => {
        const user = item.user || {};
        const currentPlan = item.current_plan || {};
        return {
          name: user.name || '匿名用户',
          avatar: user.avatar || '',
          totalAmount: Number(item.all_sum_amount || 0),
          planName: currentPlan.name || '',
          lastPayTime: item.last_pay_time || 0,
          createTime: item.create_time || 0
        };
      });

    return {
      ok: true,
      sponsors: sponsors,
      totalCount: sponsors.length,
      totalPage: body.data.total_page || 1
    };
  } catch (err) {
    console.error('[ifdian] 请求失败:', err.message);
    return { ok: false, error: err.message || '网络请求失败' };
  }
}

/**
 * 将 Unix 秒级时间戳格式化为 YYYY-MM-DD
 */
function formatTs(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ===== IPC 暴露给渲染进程 =====
ipcMain.handle('ifdian:fetchSponsors', async (event, page) => {
  const result = await fetchAfdianSponsors({ page: page || 1 });

  if (!result.ok) return result;

  return {
    ok: true,
    sponsors: result.sponsors.map(s => ({
      name: s.name,
      avatar: s.avatar,
      totalAmount: '¥' + Number(s.totalAmount || 0).toFixed(2),
      planName: s.planName,
      lastPayTime: formatTs(s.lastPayTime),
      createTime: formatTs(s.createTime)
    })),
    totalCount: result.totalCount,
    totalPage: result.totalPage
  };
});

/* ==================== AI 聊天（DeepSeek / 自定义 OpenAI 兼容模型） ==================== */

/**
 * 查询 AI 使用额度（今日剩余条数、单条消息最大长度等）
 */
ipcMain.handle('ai:getQuota', () => {
    const info = deepseekAI.getQuotaInfo();
    const activation = aiActivation.getStatus();
    return {
        ok: true,
        date: info.date,
        count: info.count,
        dailyLimit: info.dailyLimit,
        remaining: info.remaining,
        maxMessageLength: deepseekAI.MAX_MESSAGE_LENGTH,
        defaultModel: deepseekAI.DEFAULT_MODEL,
        activation
    };
});

/**
 * 获取 AI 激活状态
 */
ipcMain.handle('ai:activation:get', () => {
    return aiActivation.getStatus();
});

/**
 * 激活 AI（调用爱发电 query-random-reply 校验用户提供的订单号）
 * payload: { code }
 * 爱发电 user_id / token 通常由作者侧预置；也可从配置中读取（方便调试）
 */
ipcMain.handle('ai:activation:activate', async (_event, payload) => {
    const code = (payload && payload.code) || '';
  const trimmed = String(code).trim();
  if (!trimmed) {
    return { ok: false, error: '激活码不能为空' };
  }
  // 订单号格式限制：仅允许 6-32 位数字/小写字母/下划线/横杠，避免用户随便输几个数字
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(trimmed)) {
    return { ok: false, error: '激活码格式不正确，请填写正确的订单号（out_trade_no）' };
  }
  // 作者侧爱发电凭据：从配置读取（若为空则返回友好提示）
  const userId = configStore.get('aiIfdianUserId', '') || '';
  const token = configStore.get('aiIfdianToken', '') || '';
  const allowedPlanIds = configStore.get('aiIfdianPlanIds', []) || [];
  try {
    const result = await aiActivation.activate(trimmed, { userId, token, allowedPlanIds });
    return result;
  } catch (err) {
    console.error('[Main][activation] activate error:', err.message);
    return { ok: false, error: err.message || '未知错误' };
  }
});

/**
 * 取消本机激活（不影响爱发电订单）
 */
ipcMain.handle('ai:activation:deactivate', () => {
    return aiActivation.deactivate();
});

/**
 * 发送一条聊天消息。默认流式，便于前端实时显示内容（包括思考内容）。
 * 发送事件 `ai:chat:chunk` 给渲染进程，最终返回完整结果。
 * payload: { history, apiKey, model, baseUrl, deepThinking, customMode, userMessage }
 *
 * 门槛：非自定义模式必须先激活；自定义模式无激活要求。
 */
ipcMain.handle('ai:chat', async (event, payload) => {
    const p = payload || {};
    const customMode = !!p.customMode;
    const devMode = !!p.devMode;

    // 开发模式绕过激活门槛
    if (!customMode && !devMode) {
        const status = aiActivation.getStatus();
        if (!status.activated) {
            return {
                ok: false,
                error: '未激活：请先在 AI 助手页面输入激活码（爱发电订单号），或开启"自定义模型"后自行接入模型',
                code: 'NOT_ACTIVATED'
            };
        }
    }

    // 发送流式回调的桥接
    const onStream = (chunk) => {
        try {
            event.sender.send('ai:chat:chunk', {
                type: chunk.type,
                content: chunk.content,
                fullContent: chunk.fullContent,
                fullReasoning: chunk.fullReasoning
            });
        } catch (_) {}
    };

    const options = {
        userMessage: p.userMessage,
        history: Array.isArray(p.history) ? p.history : [],
        customMode,
        devMode,
        apiKey: customMode || devMode ? (p.apiKey || '') : undefined,
        model: customMode || devMode ? (p.model || '') : undefined,
        baseUrl: customMode || devMode ? (p.baseUrl || '') : undefined,
        deepThinking: !!p.deepThinking,
        webSearch: !!p.webSearch
    };

    try {
        const result = await deepseekAI.chatCompletion(options, onStream);
        return result;
    } catch (err) {
        console.error('[Main] ai:chat unexpected error:', err.message);
        return { ok: false, error: err.message || '未知错误' };
    }
});

console.log('[Zenith] Main process started');

/* =====================================================================
 * 静默自动更新（electron-updater + GitHub Release 私有仓库）
 *
 * 工作原理：
 *   1) electron-builder 在打包时会生成 latest.yml 放到 dist 目录
 *   2) 发布到 GitHub Release 时同时上传 .exe 和 latest.yml
 *   3) 程序启动时调用 autoUpdater.checkForUpdates() 读取 Release 的 latest.yml
 *   4) 若本地版本号小于远程，则后台无感知下载；下载完成后右下角系统通知
 *
 * 访问私有仓库：
 *   - 打包/发布阶段：设置环境变量 GH_TOKEN（PAT，需有 repo 权限）
 *   - 运行时自动更新阶段：通过 autoUpdater.requestHeaders 注入 Authorization: token <PAT>
 *     注意：把 Token 写进客户端只是"通过模糊性隐藏"，严格安全场景请用 generic 自建服务。
 * ===================================================================== */

// 阿里云 OSS / 自建 CDN：更新文件公开可读，不再需要 Token
const GITHUB_UPDATE_TOKEN = '';
const GITHUB_UPDATE_INTERVAL = 6 * 60 * 60 * 1000; // 6 小时检查一次

function setupAutoUpdater() {
  if (!autoUpdater) {
    console.warn('[Updater] 跳过：electron-updater 未加载');
    return;
  }

  // 开发环境不触发更新逻辑，避免没打包时报错 & 把本地目录覆盖掉
  if (!app.isPackaged) {
    console.log('[Updater] 开发模式，跳过自动更新');
    return;
  }

  // 允许下载完成后在用户下次关闭应用时自动安装
  autoUpdater.autoInstallOnAppQuit = true;
  // 不自动下载：检测到新版本时先询问用户，由用户决定是否下载
  autoUpdater.autoDownload = false;
  // 允许版本号不一致时降级（设为 false 更安全）
  autoUpdater.allowDowngrade = false;
  // 允许预发布版本（prerelease=true 的 release）
  autoUpdater.allowPrerelease = false;

  // 显式设置更新源地址（避免依赖 app-update.yml 自动解析失败）
  // 策略：固定使用 "latest" tag 作为"最新版"入口
  //     发布新版本时，除了把文件挂到对应版本号的 tag（如 v1.0.4）之外，
  //     还需把相同的 latest.yml / Zenith-Setup-*.exe / *.nsis.7z 再挂到 tag "latest" 下，
  //     这样所有历史版本客户端（v1.0.3、v1.0.4…）都能从同一个入口检测到最新版
  try {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: 'https://gitee.com/zenithzmcl/zenith-update/releases/download/latest/',
      useMultipleRangeRequest: false
    });
    console.log('[Updater] 更新源已设置（latest 固定入口）');
  } catch (e) {
    console.warn('[Updater] setFeedURL 失败，使用默认配置:', e.message);
  }

  // 标记窗口是否已完成首次加载，避免在启动动画期间弹对话框
  let _windowReadyForDialog = false;
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => { _windowReadyForDialog = true; }, 3000);
    });
  }

  // 解析图标路径（打包后资源在 app.asar 里，需兼容）
  function getIconPath() { return getUpdateIconPath(); }

  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] 正在检查更新...');
    broadcastUpdateState({ state: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] 发现新版本:', info.version, info.releaseName);
    broadcastUpdateState({
      state: 'available',
      version: info.version,
      releaseName: info.releaseName,
      releaseNotes: info.releaseNotes
    });

    // 只弹系统通知，不在启动动画期间强迫弹对话框
    try {
      if (Notification.isSupported()) {
        const icon = getIconPath();
        const notif = new Notification({
          title: 'Zenith 有新版本可用',
          body: `新版本 v${info.version} 已发布，点击查看并更新`,
          icon: icon
        });
        notif.on('click', () => {
          promptDownloadUpdate(info);
        });
        notif.show();
      } else {
        // 如果系统通知不可用，延迟弹对话框（等窗口就绪后）
        const tryPrompt = () => {
          if (_windowReadyForDialog && mainWindow && !mainWindow.isDestroyed()) {
            promptDownloadUpdate(info);
          } else {
            setTimeout(tryPrompt, 1500);
          }
        };
        tryPrompt();
      }
    } catch (e) {
      console.warn('[Updater] 通知弹框异常：', e.message);
      const tryPrompt = () => {
        if (_windowReadyForDialog && mainWindow && !mainWindow.isDestroyed()) {
          promptDownloadUpdate(info);
        } else {
          setTimeout(tryPrompt, 1500);
        }
      };
      tryPrompt();
    }
    // 注意：不再自动弹对话框（之前 600ms 弹框会打断启动动画）
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[Updater] 当前已是最新版本 v' + (info && info.version));
    broadcastUpdateState({ state: 'idle', version: info && info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    broadcastUpdateState({
      state: 'downloading',
      percent: Number(progress.percent || 0),
      bytesPerSecond: progress.bytesPerSecond,
      total: progress.total,
      transferred: progress.transferred
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] 更新包下载完成:', info.version);
    broadcastUpdateState({ state: 'ready', version: info.version });

    // 下载完成后弹出确认：是否立即安装（确保窗口就绪）
    const tryPrompt = () => {
      if (_windowReadyForDialog && mainWindow && !mainWindow.isDestroyed()) {
        promptInstallUpdate(info);
      } else if (mainWindow && !mainWindow.isDestroyed()) {
        setTimeout(tryPrompt, 1500);
      } else {
        // 窗口不可见时至少弹一个通知
        try {
          if (Notification.isSupported()) {
            const icon = getIconPath();
            new Notification({
              title: 'Zenith 更新就绪',
              body: `v${info.version} 已下载完毕，下次启动时将自动安装`,
              icon: icon
            }).show();
          }
        } catch (_) {}
      }
    };
    tryPrompt();
  });

  autoUpdater.on('error', (err) => {
    const msg = (err && err.message) || String(err);
    console.error('[Updater] 更新出错:', msg);
    if (err && err.stack) {
      console.error('[Updater] 错误堆栈:', err.stack);
    }
    broadcastUpdateState({
      state: 'error',
      error: msg
    });
  });

  // 启动时不立即检查，等窗口完全加载后延迟检查，避免打断启动动画
  function scheduleFirstCheck() {
    try {
      if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isLoading()) {
        setTimeout(() => {
          _windowReadyForDialog = true;
          try { autoUpdater.checkForUpdates(); } catch (e) {
            console.warn('[Updater] 首次检查更新异常:', e.message);
          }
        }, 5000);
      } else if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.once('did-finish-load', () => {
          setTimeout(() => {
            _windowReadyForDialog = true;
            try { autoUpdater.checkForUpdates(); } catch (e) {
              console.warn('[Updater] 首次检查更新异常:', e.message);
            }
          }, 5000);
        });
      }
    } catch (e) {
      console.warn('[Updater] 调度首次检查异常:', e.message);
    }
  }
  scheduleFirstCheck();

  // 每隔一段时间再检查一次（避免用户长时间开着程序错过更新）
  setInterval(() => {
    try {
      autoUpdater.checkForUpdates();
    } catch (e) {}
  }, GITHUB_UPDATE_INTERVAL);
}

/**
 * 检测到新版本后询问用户是否下载
 */
let _updatePromptShown = false;

// 共享的图标路径解析（供多个函数使用）
function getUpdateIconPath() {
  try {
    const p1 = path.join(__dirname, '..', 'renderer', 'assets', 'logo.png');
    if (fs.existsSync(p1)) return p1;
  } catch (_) {}
  try {
    const p2 = path.join(app.getAppPath(), 'src', 'renderer', 'assets', 'logo.png');
    if (fs.existsSync(p2)) return p2;
  } catch (_) {}
  return undefined;
}

function promptDownloadUpdate(info) {
  if (_updatePromptShown) return;
  _updatePromptShown = true;

  if (!mainWindow || mainWindow.isDestroyed()) return;

  const icon = getUpdateIconPath();
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Zenith 更新',
    message: `检测到新版本 v${info.version}`,
    detail: (info.releaseNotes || info.releaseName || '有新版本已发布，是否现在下载并安装？'),
    buttons: ['下载并更新', '稍后再说'],
    defaultId: 0,
    cancelId: 1,
    icon: icon
  }).then((res) => {
    if (res.response === 0) {
      try {
        broadcastUpdateState({ state: 'downloading', version: info.version });
        autoUpdater.downloadUpdate();
      } catch (e) {
        console.error('[Updater] downloadUpdate 失败:', e.message);
        _updatePromptShown = false;
      }
    } else {
      _updatePromptShown = false;
    }
  }).catch((e) => {
    console.warn('[Updater] promptDownloadUpdate 对话框异常:', e.message);
    _updatePromptShown = false;
  });
}

/**
 * 下载完成后询问用户是否立即安装
 */
function promptInstallUpdate(info) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (Notification.isSupported()) {
      const icon = getUpdateIconPath();
      new Notification({
        title: 'Zenith 更新就绪',
        body: `v${info.version} 已下载完毕，下次启动时将自动安装`,
        icon: icon
      }).show();
    }
    return;
  }

  const icon = getUpdateIconPath();
  dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: '更新已就绪',
    message: `新版本 v${info.version} 已下载完毕`,
    detail: '是否立即安装并重启启动器？',
    buttons: ['立即安装并重启', '稍后手动安装'],
    defaultId: 0,
    cancelId: 1,
    icon: icon
  }).then((res) => {
    if (res.response === 0) {
      try {
        autoUpdater.quitAndInstall(true, true);
      } catch (e) {
        console.error('[Updater] quitAndInstall 失败:', e.message);
      }
    } else {
      console.log('[Updater] 用户选择稍后安装，下次关闭应用时自动安装');
    }
  }).catch((e) => {
    console.warn('[Updater] promptInstallUpdate 对话框异常:', e.message);
  });
}

// 把更新状态广播给渲染进程（方便 UI 展示）
function broadcastUpdateState(payload) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:updateState', payload);
    }
  } catch (_) {}
}

// ---------------- 渲染进程可以主动调用的更新相关 IPC ----------------

// 读取当前版本号
ipcMain.handle('app:getVersion', () => {
  try {
    return app.getVersion();
  } catch (_) {
    try {
      return require('../package.json').version;
    } catch (__) {
      return '0.0.0';
    }
  }
});

// 手动检查更新
ipcMain.handle('app:checkUpdate', () => {
  if (!autoUpdater) return { ok: false, error: 'electron-updater 未加载' };
  if (!app.isPackaged) return { ok: false, error: '开发模式不检查更新' };
  try {
    autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 手动触发下载更新
ipcMain.handle('app:downloadUpdate', () => {
  if (!autoUpdater) return { ok: false, error: 'electron-updater 未加载' };
  if (!app.isPackaged) return { ok: false, error: '开发模式不更新' };
  try {
    autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// 手动触发"下载完成后立即安装并重启"
ipcMain.handle('app:installUpdate', () => {
  if (!autoUpdater) return { ok: false, error: 'electron-updater 未加载' };
  try {
    // isSilent=true, isForceRunAfter=true：静默安装且安装完成后自动重启
    autoUpdater.quitAndInstall(true, true);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
