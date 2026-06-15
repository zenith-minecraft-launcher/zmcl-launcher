const login = {
  init() {
    this.setupLoginTabs();
    this.setupMicrosoftLogin();
    this.setupOfflineLogin();
    this.setupAuthlibLogin();
    this.loadAccounts();
  },

  setupLoginTabs() {
    const tabs = document.querySelectorAll('.login-tab');
    const panels = document.querySelectorAll('.login-panel');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.loginTab;
        
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        
        tab.classList.add('active');
        document.querySelector(`[data-login-panel="${tabId}"]`).classList.add('active');
        
        if (tabId === 'microsoft') {
          this.loadMicrosoftAccounts();
        } else if (tabId === 'offline') {
          this.loadOfflineAccounts();
        } else if (tabId === 'authlib') {
          this.loadAuthlibAccounts();
          this.loadAuthlibServers();
        }
      });
    });
  },

  async loadAccounts() {
    await Promise.all([
      this.loadMicrosoftAccounts(),
      this.loadOfflineAccounts(),
      this.loadAuthlibAccounts()
    ]);
  },

  async loadMicrosoftAccounts() {
    const container = document.getElementById('microsoftAccounts');
    if (!container) return;

    try {
      const accounts = await zenith.auth.microsoft.getAccounts();
      updateAccounts('microsoft', accounts);

      if (accounts.length === 0) {
        container.innerHTML = '<div class="accounts-empty">暂无微软账号</div>';
        return;
      }

      let html = '';
      accounts.forEach(account => {
        const isSelected = appState.selectedAccount && appState.selectedAccount.type === 'microsoft' && appState.selectedAccount.uuid === account.uuid;
        const avatarUrl = account.uuid ? `https://mc-heads.net/avatar/${account.uuid}/64` : '';
        const avatarHtml = avatarUrl
          ? `<img src="${avatarUrl}" alt="${account.userName}" class="skin-avatar" onerror="this.outerHTML='${account.userName.charAt(0).toUpperCase()}'">`
          : account.userName.charAt(0).toUpperCase();
        html += `
          <div class="account-item ${isSelected ? 'selected' : ''}">
            <div class="account-avatar" style="font-size: 18px;">${avatarHtml}</div>
            <div class="account-item-info">
              <div class="account-item-name">${account.userName}</div>
              <div class="account-item-type">微软账号</div>
            </div>
            <div class="account-item-actions">
              <button class="btn btn-select ${isSelected ? 'active' : ''}" onclick="login.selectMicrosoftAccount('${account.uuid}')">
                ${isSelected ? '已选择' : '选择'}
              </button>
              <button class="btn btn-remove" onclick="login.removeMicrosoftAccount('${account.uuid}')">删除</button>
            </div>
          </div>
        `;
      });
      container.innerHTML = html;
    } catch (e) {
      container.innerHTML = '<div class="accounts-empty">加载失败</div>';
      console.error('[Login] Failed to load Microsoft accounts:', e.message);
    }
  },

  async setupMicrosoftLogin() {
    const addBtn = document.getElementById('addMicrosoftAccountBtn');
    if (!addBtn) return;

    addBtn.addEventListener('click', async () => {
      const accountsDiv = document.getElementById('microsoftAccounts');

      if (!accountsDiv) return;

      addBtn.disabled = true;
      const originalText = addBtn.querySelector('span')?.textContent || '添加微软账号';
      addBtn.querySelector('span').textContent = '登录中，请在弹出窗口完成...';

      try {
        const account = await zenith.auth.microsoft.startOAuth();

        await this.loadMicrosoftAccounts();
        selectAccount({ type: 'microsoft', ...account });
        app.showToast('登录成功', 'success');
        app.closeModal('accountModal');
      } catch (e) {
        app.showToast('登录失败: ' + e.message, 'error');
      } finally {
        addBtn.disabled = false;
        addBtn.querySelector('span').textContent = originalText;
      }
    });
  },

  async selectMicrosoftAccount(uuid) {
    try {
      const account = await zenith.auth.microsoft.selectAccount(uuid);
      selectAccount({ type: 'microsoft', ...account });
      await this.loadMicrosoftAccounts();
      app.showToast('已选择账号: ' + account.userName, 'success');
    } catch (e) {
      app.showToast('选择账号失败: ' + e.message, 'error');
    }
  },

  async removeMicrosoftAccount(uuid) {
    try {
      const account = (await zenith.auth.microsoft.getAccounts()).find(a => a.uuid === uuid);
      const accountName = account ? account.userName : '该账号';
      const confirmed = window.confirm(`确定要删除微软账号「${accountName}」吗？此操作无法撤销。`);
      if (!confirmed) return;

      await zenith.auth.microsoft.removeAccount(uuid);
      // 如果被删除的是当前选中账号，清除选中状态
      if (appState.selectedAccount && appState.selectedAccount.type === 'microsoft' && appState.selectedAccount.uuid === uuid) {
        selectAccount(null);
      }
      await this.loadMicrosoftAccounts();
      app.showToast('账号已删除', 'success');
    } catch (e) {
      app.showToast('删除失败: ' + e.message, 'error');
    }
  },

  async loadOfflineAccounts() {
    const container = document.getElementById('offlineAccounts');
    if (!container) return;

    try {
      const accounts = await zenith.auth.offline.getAccounts();
      updateAccounts('offline', accounts);

      if (accounts.length === 0) {
        container.innerHTML = '<div class="accounts-empty">暂无离线账号</div>';
        return;
      }

      let html = '';
      accounts.forEach(account => {
        const isSelected = appState.selectedAccount && appState.selectedAccount.type === 'offline' && appState.selectedAccount.userName === account.userName;
        const avatarUrl = `https://mc-heads.net/avatar/${account.userName}/64`;
        const avatarHtml = `<img src="${avatarUrl}" alt="${account.userName}" class="skin-avatar" onerror="this.outerHTML='${account.userName.charAt(0).toUpperCase()}'">`;
        html += `
          <div class="account-item ${isSelected ? 'selected' : ''}">
            <div class="account-avatar" style="font-size: 18px;">${avatarHtml}</div>
            <div class="account-item-info">
              <div class="account-item-name">${account.userName}</div>
              <div class="account-item-type">离线模式</div>
            </div>
            <div class="account-item-actions">
              <button class="btn btn-select ${isSelected ? 'active' : ''}" onclick="login.selectOfflineAccount('${account.userName}')">
                ${isSelected ? '已选择' : '选择'}
              </button>
              <button class="btn btn-remove" onclick="login.removeOfflineAccount('${account.userName}')">删除</button>
            </div>
          </div>
        `;
      });
      container.innerHTML = html;
    } catch (e) {
      container.innerHTML = '<div class="accounts-empty">加载失败</div>';
      console.error('[Login] Failed to load offline accounts:', e.message);
    }
  },

  async setupOfflineLogin() {
    const addBtn = document.getElementById('addOfflineAccountBtn');
    if (!addBtn) return;

    addBtn.addEventListener('click', async () => {
      const usernameInput = document.getElementById('offlineUsername');
      const username = usernameInput.value.trim();

      if (!username) {
        app.showToast('请输入玩家名', 'error');
        return;
      }

      if (!/^[0-9A-Za-z_]+$/.test(username)) {
        app.showToast('玩家名只能包含字母、数字和下划线', 'error');
        return;
      }

      if (username.length > 16) {
        app.showToast('玩家名最多 16 个字符', 'error');
        return;
      }

      try {
        const account = await zenith.auth.offline.login(username);
        selectAccount({ type: 'offline', ...account });
        await this.loadOfflineAccounts();
        usernameInput.value = '';
        app.showToast('登录成功', 'success');
        app.closeModal('accountModal');
      } catch (e) {
        app.showToast('登录失败: ' + e.message, 'error');
      }
    });
  },

  async selectOfflineAccount(userName) {
    try {
      const account = await zenith.auth.offline.selectAccount(userName);
      selectAccount({ type: 'offline', ...account });
      await this.loadOfflineAccounts();
      app.showToast('已选择账号: ' + account.userName, 'success');
    } catch (e) {
      app.showToast('选择账号失败: ' + e.message, 'error');
    }
  },

  async removeOfflineAccount(userName) {
    try {
      const confirmed = window.confirm(`确定要删除离线账号「${userName}」吗？此操作无法撤销。`);
      if (!confirmed) return;

      await zenith.auth.offline.removeAccount(userName);
      // 如果被删除的是当前选中账号，清除选中状态
      if (appState.selectedAccount && appState.selectedAccount.type === 'offline' && appState.selectedAccount.userName === userName) {
        selectAccount(null);
      }
      await this.loadOfflineAccounts();
      app.showToast('账号已删除', 'success');
    } catch (e) {
      app.showToast('删除失败: ' + e.message, 'error');
    }
  },

  async loadAuthlibServers() {
    const select = document.getElementById('authlibServerSelect');
    if (!select) return;

    try {
      const servers = await zenith.auth.authlib.getServers();
      let html = '';
      servers.forEach(server => {
        html += `<option value="${server.id}" ${server.editable ? 'data-editable="true"' : ''}>${server.name}</option>`;
      });
      select.innerHTML = html;

      select.addEventListener('change', () => {
        const urlInput = document.getElementById('authlibServerUrl');
        const selectedServer = servers.find(s => s.id === select.value);
        urlInput.disabled = !selectedServer.editable;
        if (!selectedServer.editable) {
          urlInput.value = selectedServer.baseUrl;
        }
      });

      select.dispatchEvent(new Event('change'));
    } catch (e) {
      console.error('[Login] Failed to load authlib servers:', e.message);
    }
  },

  async loadAuthlibAccounts() {
    const container = document.getElementById('authlibAccounts');
    if (!container) return;

    try {
      const accounts = await zenith.auth.authlib.getAccounts();
      updateAccounts('authlib', accounts);

      if (accounts.length === 0) {
        container.innerHTML = '<div class="accounts-empty">暂无外置账号</div>';
        return;
      }

      let html = '';
      accounts.forEach(account => {
        const isSelected = appState.selectedAccount && appState.selectedAccount.type === 'authlib' && appState.selectedAccount.uuid === account.uuid;
        const avatarUrl = account.uuid ? `https://mc-heads.net/avatar/${account.uuid}/64` : `https://mc-heads.net/avatar/${account.userName}/64`;
        const avatarHtml = `<img src="${avatarUrl}" alt="${account.userName}" class="skin-avatar" onerror="this.outerHTML='${account.userName.charAt(0).toUpperCase()}'">`;
        html += `
          <div class="account-item ${isSelected ? 'selected' : ''}">
            <div class="account-avatar" style="font-size: 18px;">${avatarHtml}</div>
            <div class="account-item-info">
              <div class="account-item-name">${account.userName}</div>
              <div class="account-item-type">外置登录</div>
            </div>
            <div class="account-item-actions">
              <button class="btn btn-select ${isSelected ? 'active' : ''}" onclick="login.selectAuthlibAccount('${account.uuid}')">
                ${isSelected ? '已选择' : '选择'}
              </button>
              <button class="btn btn-remove" onclick="login.removeAuthlibAccount('${account.uuid}')">删除</button>
            </div>
          </div>
        `;
      });
      container.innerHTML = html;
    } catch (e) {
      container.innerHTML = '<div class="accounts-empty">加载失败</div>';
      console.error('[Login] Failed to load authlib accounts:', e.message);
    }
  },

  async setupAuthlibLogin() {
    const addBtn = document.getElementById('addAuthlibAccountBtn');
    if (!addBtn) return;

    addBtn.addEventListener('click', async () => {
      const serverSelect = document.getElementById('authlibServerSelect');
      const serverUrlInput = document.getElementById('authlibServerUrl');
      const emailInput = document.getElementById('authlibEmail');
      const passwordInput = document.getElementById('authlibPassword');

      let serverUrl = serverUrlInput.value.trim();
      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!serverUrl) {
        app.showToast('请输入服务器地址', 'error');
        return;
      }

      if (!email || !password) {
        app.showToast('请输入账号和密码', 'error');
        return;
      }

      try {
        const account = await zenith.auth.authlib.login(serverUrl, email, password);
        selectAccount({ type: 'authlib', ...account });
        await this.loadAuthlibAccounts();
        emailInput.value = '';
        passwordInput.value = '';
        app.showToast('登录成功', 'success');
        app.closeModal('accountModal');
      } catch (e) {
        app.showToast('登录失败: ' + e.message, 'error');
      }
    });
  },

  async selectAuthlibAccount(uuid) {
    try {
      const account = await zenith.auth.authlib.selectAccount(uuid);
      selectAccount({ type: 'authlib', ...account });
      await this.loadAuthlibAccounts();
      app.showToast('已选择账号: ' + account.userName, 'success');
    } catch (e) {
      app.showToast('选择账号失败: ' + e.message, 'error');
    }
  },

  async removeAuthlibAccount(uuid) {
    try {
      const account = (await zenith.auth.authlib.getAccounts()).find(a => a.uuid === uuid);
      const accountName = account ? account.userName : '该账号';
      const confirmed = window.confirm(`确定要删除外置登录账号「${accountName}」吗？此操作无法撤销。`);
      if (!confirmed) return;

      await zenith.auth.authlib.removeAccount(uuid);
      // 如果被删除的是当前选中账号，清除选中状态
      if (appState.selectedAccount && appState.selectedAccount.type === 'authlib' && appState.selectedAccount.uuid === uuid) {
        selectAccount(null);
      }
      await this.loadAuthlibAccounts();
      app.showToast('账号已删除', 'success');
    } catch (e) {
      app.showToast('删除失败: ' + e.message, 'error');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  login.init();
});
