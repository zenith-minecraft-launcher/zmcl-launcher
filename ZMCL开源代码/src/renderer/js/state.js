const appState = {
  config: {},
  versions: [],
  selectedVersion: null,
  accounts: {
    microsoft: [],
    offline: [],
    authlib: []
  },
  selectedAccount: null,
  launchState: {
    running: false,
    logs: []
  },
  downloadState: {
    downloading: false,
    progress: 0,
    stage: ''
  },
  javaInstallations: []
};

const stateListeners = [];

function subscribe(callback) {
  stateListeners.push(callback);
}

function notify() {
  stateListeners.forEach(callback => callback({ ...appState }));
}

function updateConfig(key, value) {
  appState.config[key] = value;
  notify();
}

function updateVersions(versions) {
  appState.versions = versions;
  notify();
}

function selectVersion(version) {
  appState.selectedVersion = version;
  notify();
}

function updateAccounts(type, accounts) {
  appState.accounts[type] = accounts;
  notify();
}

function selectAccount(account) {
  appState.selectedAccount = account;
  notify();
}

function updateLaunchState(state) {
  appState.launchState = { ...appState.launchState, ...state };
  notify();
}

function addLaunchLog(log) {
  appState.launchState.logs.push(log);
  if (appState.launchState.logs.length > 500) {
    appState.launchState.logs.shift();
  }
  notify();

  // 同步更新 DOM 中的日志显示区域
  const logContent = document.getElementById('logContent');
  if (!logContent) return;

  // 如果当前只有空状态占位符，先移除它
  const emptyEl = logContent.querySelector('.log-empty');
  if (emptyEl) {
    emptyEl.remove();
  }

  const logLine = document.createElement('div');
  logLine.className = 'log-line ' + (log.level || 'info');
  logLine.textContent = '[' + new Date().toLocaleTimeString() + '] ' + (log.message || '');
  logContent.appendChild(logLine);
  logContent.scrollTop = logContent.scrollHeight;
}

function updateDownloadState(state) {
  appState.downloadState = { ...appState.downloadState, ...state };
  notify();
}

function updateJavaInstallations(installations) {
  appState.javaInstallations = installations;
  notify();
}

function buildAvatarUrl(account) {
  if (!account) return '';
  const uuid = account.uuid;
  const name = account.userName || account.username || account.name;
  if (account.type === 'microsoft' && uuid) {
    return `https://mc-heads.net/avatar/${uuid}/128`;
  }
  if (name) {
    return `https://mc-heads.net/avatar/${name}/128`;
  }
  return '';
}

function renderAvatarElement(avatarEl, account) {
  if (!avatarEl) return;
  const url = buildAvatarUrl(account);
  if (url) {
    avatarEl.innerHTML = '';
    const img = document.createElement('img');
    img.src = url;
    img.alt = account ? (account.userName || account.username || account.name || 'avatar') : 'avatar';
    img.classList.add('skin-avatar');
    img.onerror = () => {
      const fallbackName = account ? (account.userName || account.username || account.name || '') : '';
      avatarEl.innerHTML = '';
      avatarEl.textContent = fallbackName.charAt(0).toUpperCase() || '?';
    };
    avatarEl.appendChild(img);
  } else if (account) {
    const userName = account.userName || account.username || account.name || '';
    avatarEl.textContent = userName.charAt(0).toUpperCase() || '?';
  } else {
    avatarEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon"><circle cx="12" cy="8" r="4" fill="currentColor" opacity="0.9"/><path d="M12 14c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6z" fill="currentColor"/></svg>';
  }
}

subscribe((state) => {
  // 账号卡片
  const accountName = document.getElementById('accountName');
  const accountType = document.getElementById('accountType');
  const accountAvatar = document.getElementById('accountAvatar');

  if (state.selectedAccount) {
    const userName = state.selectedAccount.userName || state.selectedAccount.username || '玩家';
    if (accountName) {
      accountName.textContent = userName;
    }
    if (accountType) {
      const typeNames = {
        microsoft: '微软账号',
        offline: '离线模式',
        authlib: '外置登录'
      };
      accountType.textContent = typeNames[state.selectedAccount.type] || '已登录';
    }
    renderAvatarElement(accountAvatar, state.selectedAccount);
  } else {
    if (accountName) accountName.textContent = '未登录';
    if (accountType) accountType.textContent = '请选择登录方式';
    renderAvatarElement(accountAvatar, null);
  }

  // 版本卡片
  const versionName = document.getElementById('selectedVersionName');
  const versionType = document.getElementById('selectedVersionType');
  const launchBtn = document.getElementById('launchBtn');

  if (state.selectedVersion) {
    if (versionName) {
      versionName.textContent = state.selectedVersion.name || state.selectedVersion.id;
    }
    if (versionType) {
      const typeNames = {
        release: '正式版',
        snapshot: '快照版',
        alpha: 'Alpha',
        beta: 'Beta'
      };
      versionType.textContent = typeNames[state.selectedVersion.type] || state.selectedVersion.type || '正式版';
    }
    if (launchBtn) launchBtn.disabled = false;
  } else {
    if (versionName) versionName.textContent = '未选择版本';
    if (versionType) versionType.textContent = '请先下载一个版本';
    if (launchBtn) launchBtn.disabled = true;
  }
});
