const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zenith', {
  config: {
    get: (key, defaultValue) => ipcRenderer.invoke('config:get', key, defaultValue),
    set: (key, value) => ipcRenderer.invoke('config:set', key, value),
    getAll: () => ipcRenderer.invoke('config:getAll')
  },

  accounts: {
    getLastSelected: () => ipcRenderer.invoke('accounts:getLastSelected'),
    clearLastSelected: () => ipcRenderer.invoke('accounts:clearLastSelected')
  },

  auth: {
    microsoft: {
      startOAuth: () => ipcRenderer.invoke('auth:microsoft:startOAuth'),
      refresh: (token) => ipcRenderer.invoke('auth:microsoft:refresh', token),
      getAccounts: () => ipcRenderer.invoke('auth:microsoft:getAccounts'),
      removeAccount: (uuid) => ipcRenderer.invoke('auth:microsoft:removeAccount', uuid),
      selectAccount: (uuid) => ipcRenderer.invoke('auth:microsoft:selectAccount', uuid)
    },
    offline: {
      login: (username) => ipcRenderer.invoke('auth:offline:login', username),
      getAccounts: () => ipcRenderer.invoke('auth:offline:getAccounts'),
      removeAccount: (username) => ipcRenderer.invoke('auth:offline:removeAccount', username),
      selectAccount: (username) => ipcRenderer.invoke('auth:offline:selectAccount', username)
    },
    authlib: {
      login: (serverUrl, email, password) => ipcRenderer.invoke('auth:authlib:login', serverUrl, email, password),
      refresh: (serverUrl, accessToken) => ipcRenderer.invoke('auth:authlib:refresh', serverUrl, accessToken),
      validate: (serverUrl, accessToken) => ipcRenderer.invoke('auth:authlib:validate', serverUrl, accessToken),
      getServers: () => ipcRenderer.invoke('auth:authlib:getServers'),
      getAccounts: () => ipcRenderer.invoke('auth:authlib:getAccounts'),
      removeAccount: (uuid) => ipcRenderer.invoke('auth:authlib:removeAccount', uuid),
      selectAccount: (uuid) => ipcRenderer.invoke('auth:authlib:selectAccount', uuid)
    }
  },

  java: {
    detect: () => ipcRenderer.invoke('java:detect'),
    getRecommended: (versionJson) => ipcRenderer.invoke('java:getRecommended', versionJson),
    scanLocal: () => ipcRenderer.invoke('java:scanLocal'),
    autoSelect: (versionJsonOrId) => ipcRenderer.invoke('java:autoSelect', versionJsonOrId),
    download: (javaVersion, onProgress) => {
      // 在本次下载期间统一监听 java:download:progress 事件
      // 由于用户一次只会点击一个 Java 下载按钮，因此不做严格版本过滤，
      // 只要传来的 version 字段和请求的 version 相同（或没有 version 字段）就放行
      const requestedVersion = String(javaVersion);
      console.log('[Preload] java.download called with version:', javaVersion, 'requestedVersion:', requestedVersion);
      const handler = (event, data) => {
        console.log('[Preload] java:download:progress received:', data);
        if (typeof onProgress !== 'function' || !data) return;
        if (data.version !== undefined) {
          if (String(data.version) !== requestedVersion) {
            console.log('[Preload] version mismatch, skipping. data.version:', data.version, 'requested:', requestedVersion);
            return;
          }
        }
        console.log('[Preload] calling onProgress with data');
        onProgress(data);
      };
      ipcRenderer.on('java:download:progress', handler);
      return ipcRenderer.invoke('java:download', javaVersion).then((result) => {
        ipcRenderer.removeListener('java:download:progress', handler);
        return result;
      }).catch((err) => {
        ipcRenderer.removeListener('java:download:progress', handler);
        throw err;
      });
    },
    list: () => ipcRenderer.invoke('java:list'),
    delete: (majorVersion) => ipcRenderer.invoke('java:delete', majorVersion),
    cancelDownload: (javaVersion) => ipcRenderer.invoke('java:cancel', javaVersion)
  },

  version: {
    list: () => ipcRenderer.invoke('version:list'),
    getJson: (versionId) => ipcRenderer.invoke('version:getJson', versionId),
    select: (versionId) => ipcRenderer.invoke('version:select', versionId),
    delete: (versionId) => ipcRenderer.invoke('version:delete', versionId)
  },

  download: {
    getSources: () => ipcRenderer.invoke('download:getSources'),
    setSource: (sourceKey) => ipcRenderer.invoke('download:setSource', sourceKey),
    getManifest: () => ipcRenderer.invoke('download:getManifest'),
    version: (versionId) => ipcRenderer.invoke('download:version', versionId),
    checkFiles: (versionId) => ipcRenderer.invoke('download:checkFiles', versionId),
    assets: (versionId) => ipcRenderer.invoke('download:assets', versionId),
    cancel: () => ipcRenderer.invoke('download:cancel'),
    onProgress: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('download:progress', handler);
      return () => ipcRenderer.removeListener('download:progress', handler);
    }
  },

  // 模组加载器管理（检测 / 冲突检测 / 安装）
  loader: {
    detect: (mcVersion) => ipcRenderer.invoke('loader:detect', mcVersion),
    checkConflicts: (selection, mcVersion, availability) =>
      ipcRenderer.invoke('loader:checkConflicts', selection, mcVersion, availability),
    install: (mcVersion, selectedLoaders) =>
      ipcRenderer.invoke('loader:install', mcVersion, selectedLoaders),
    cancel: () => ipcRenderer.invoke('loader:cancel'),
    getOptifineMatrix: () => ipcRenderer.invoke('loader:optifineMatrix'),
    onProgress: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('loader:progress', handler);
      return () => ipcRenderer.removeListener('loader:progress', handler);
    }
  },

  // Addon 下载与安装（模组/资源包/光影/数据包/世界）
  // 支持多源搜索：source=modrinth|curseforge|all
  // 支持中文搜索 + MC百科中文信息
  addon: {
    search: (options) => ipcRenderer.invoke('addon:search', options),
    searchTranslate: (options) => ipcRenderer.invoke('addon:searchTranslate', options),
    sources: () => ipcRenderer.invoke('addon:sources'),
    project: (projectId, source) => ipcRenderer.invoke('addon:project', projectId, source),
    getChineseInfo: (englishName, slug) => ipcRenderer.invoke('addon:getChineseInfo', englishName, slug),
    versions: (projectId, source, filters) => ipcRenderer.invoke('addon:versions', projectId, source, filters),
    resolveDependencies: (dependencies, opts) => ipcRenderer.invoke('addon:resolveDependencies', dependencies, opts),
    selectInstallDir: (options) => ipcRenderer.invoke('addon:selectInstallDir', options),
    download: (options) => ipcRenderer.invoke('addon:download', options),
    cancel: () => ipcRenderer.invoke('addon:cancel'),
    listInstalled: (type, versionId) => ipcRenderer.invoke('addon:listInstalled', type, versionId),
    getInstallDir: (type, versionId) => ipcRenderer.invoke('addon:getInstallDir', type, versionId),
    remove: (type, fileName, versionId) => ipcRenderer.invoke('addon:remove', type, fileName, versionId),
    toggle: (type, fileName, versionId) => ipcRenderer.invoke('addon:toggle', type, fileName, versionId),
    onProgress: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('addon:progress', handler);
      return () => ipcRenderer.removeListener('addon:progress', handler);
    }
  },

  launch: {
    start: (options) => ipcRenderer.invoke('launch:start', options),
    getState: () => ipcRenderer.invoke('launch:getState'),
    stop: () => ipcRenderer.invoke('launch:stop'),
    onLog: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('launch:log', handler);
      return () => ipcRenderer.removeListener('launch:log', handler);
    }
  },

  system: {
    openPath: (pathType, versionId) => ipcRenderer.invoke('system:openPath', pathType, versionId),
    selectFolder: () => ipcRenderer.invoke('system:selectFolder'),
    info: () => ipcRenderer.invoke('system:info'),
    readTextFile: (filePath) => ipcRenderer.invoke('system:readTextFile', filePath),
    openExternal: (url) => ipcRenderer.invoke('system:openExternal', url),
    deleteFolder: (folderPath) => ipcRenderer.invoke('system:deleteFolder', folderPath),
    clearOldLogs: () => ipcRenderer.invoke('system:clearOldLogs')
  },

  theme: {
    update: (theme) => ipcRenderer.invoke('theme:update', theme)
  },

  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized')
  },

  taowa: {
    startHost: () => ipcRenderer.invoke('taowa:startHost'),
    startGuest: (options) => ipcRenderer.invoke('taowa:startGuest', options),
    stop: () => ipcRenderer.invoke('taowa:stop'),
    status: () => ipcRenderer.invoke('taowa:status'),
    info: () => ipcRenderer.invoke('taowa:info'),
    getNodes: () => ipcRenderer.invoke('taowa:getNodes'),
    download: () => ipcRenderer.invoke('taowa:download'),
    uninstall: () => ipcRenderer.invoke('taowa:uninstall'),
    onProgress: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('taowa:progress', handler);
      return () => ipcRenderer.removeListener('taowa:progress', handler);
    },
    onEvent: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('taowa:event', handler);
      return () => ipcRenderer.removeListener('taowa:event', handler);
    }
  },

  // 工具箱（Minecraft 实用工具 / 其他工具）
  toolbox: {
    listTools: () => ipcRenderer.invoke('toolbox:listTools'),
    exec: (toolKey, payload) => ipcRenderer.invoke('toolbox:exec', toolKey, payload || {}),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
  },

  // 爱发电（ifdian / afdian）赞助者 API
  ifdian: {
    fetchSponsors: (page) => ipcRenderer.invoke('ifdian:fetchSponsors', page)
  },

  // AI 聊天 / DeepSeek / OpenAI 兼容模型
  ai: {
    getQuota: () => ipcRenderer.invoke('ai:getQuota'),
    chat: (payload) => ipcRenderer.invoke('ai:chat', payload),
    getActivation: () => ipcRenderer.invoke('ai:activation:get'),
    activate: (code) => ipcRenderer.invoke('ai:activation:activate', { code }),
    deactivate: () => ipcRenderer.invoke('ai:activation:deactivate'),
    onChunk: (callback) => {
      const handler = (event, data) => callback(data);
      ipcRenderer.on('ai:chat:chunk', handler);
      return () => ipcRenderer.removeListener('ai:chat:chunk', handler);
    }
  },

  // 应用自动更新（electron-updater）
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    checkUpdate: () => ipcRenderer.invoke('app:checkUpdate'),
    downloadUpdate: () => ipcRenderer.invoke('app:downloadUpdate'),
    installUpdate: () => ipcRenderer.invoke('app:installUpdate'),
    onUpdateState: (callback) => {
      // 移除上一个订阅（保证整个应用只有一个 onUpdateState 监听器）
      if (typeof module._updateStateHandler === 'function') {
        ipcRenderer.removeListener('app:updateState', module._updateStateHandler);
      }
      const handler = (event, data) => callback(data);
      module._updateStateHandler = handler;
      ipcRenderer.on('app:updateState', handler);
      return () => {
        ipcRenderer.removeListener('app:updateState', handler);
        if (module._updateStateHandler === handler) {
          module._updateStateHandler = null;
        }
      };
    }
  }
});
