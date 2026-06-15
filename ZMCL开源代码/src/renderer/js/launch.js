const launch = {
  init() {
    this.setupEventListeners();
    this.renderAccountCard();
    this.renderVersionSelector();
    this.renderVersionCard();
    this.setupLogListener();
    this.waitForInitialData();
    this.subscribeToStateChanges();
  },

  subscribeToStateChanges() {
    // 订阅状态变化，当版本列表更新时重新渲染
    if (typeof subscribe === 'function') {
      subscribe((state) => {
        // 版本列表变化时重新渲染选择器
        if (state.versions) {
          this.renderVersionSelector();
        }
        // 选中版本变化时重新渲染卡片
        if (state.selectedVersion !== undefined) {
          this.renderVersionCard();
        }
        // 账号变化时重新渲染账号卡片
        if (state.selectedAccount !== undefined) {
          this.renderAccountCard();
        }
      });
    }
  },

  waitForInitialData() {
    let attempts = 0;
    const maxAttempts = 30;
    const timer = setInterval(() => {
      attempts++;
      const hasVersions = appState.versions && appState.versions.length > 0;
      const hasAccount = !!appState.selectedAccount;
      const hasSelectedVersion = !!appState.selectedVersion;

      let needsRerender = false;

      if (hasVersions) {
        // 仅在首次加载到版本时重建选择器
        if (!this._versionsLoaded) {
          this._versionsLoaded = true;
          this.renderVersionSelector();
          needsRerender = true;
        }
        // 如果 config 中记录了选中版本但 state 未同步，补全后仅更新卡片
        if (!hasSelectedVersion && appState.config && appState.config.selectedVersion) {
          const selected = appState.versions.find(v => v.id === appState.config.selectedVersion);
          if (selected && (!appState.selectedVersion || appState.selectedVersion.id !== selected.id)) {
            appState.selectedVersion = selected;
            needsRerender = true;
          }
        }
      }

      if (hasAccount && !this._accountLoaded) {
        this._accountLoaded = true;
        needsRerender = true;
      }

      if (needsRerender) {
        this.renderVersionSelector();
        this.renderVersionCard();
        this.renderAccountCard();
      }

      if (attempts >= maxAttempts || (this._versionsLoaded && this._accountLoaded) || attempts >= 10) {
        clearInterval(timer);
        // 最后一次确认渲染
        this.renderVersionSelector();
        this.renderVersionCard();
        this.renderAccountCard();
      }
    }, 250);
  },

  setupEventListeners() {
    const launchBtn = document.getElementById('launchBtn');
    const stopBtn = document.getElementById('stopBtn');
    const manageAccountBtn = document.getElementById('manageAccountBtn');
    const downloadVersionBtn = document.getElementById('downloadVersionBtn');
    const clearLogBtn = document.getElementById('clearLogBtn');

    if (launchBtn) {
      launchBtn.addEventListener('click', () => this.handleLaunch());
    }
    if (stopBtn) {
      stopBtn.addEventListener('click', () => this.handleStop());
    }
    if (manageAccountBtn) {
      manageAccountBtn.addEventListener('click', () => app.openModal('accountModal'));
    }
    if (downloadVersionBtn) {
      downloadVersionBtn.addEventListener('click', () => app.switchView('download'));
    }
    if (clearLogBtn) {
      clearLogBtn.addEventListener('click', () => this.clearLogs());
    }

    // 复制日志
    const copyLogBtn = document.getElementById('copyLogBtn');
    if (copyLogBtn) {
      copyLogBtn.addEventListener('click', () => this.copyLogs());
    }

    // 打开日志目录
    const openLogDirBtn = document.getElementById('openLogDirBtn');
    if (openLogDirBtn) {
      openLogDirBtn.addEventListener('click', () => {
        if (zenith && zenith.system && zenith.system.openPath) {
          zenith.system.openPath('launcher-logs');
        }
      });
    }
  },

  async copyLogs() {
    try {
      const logContent = document.getElementById('logContent');
      if (!logContent) return;

      // 收集所有日志文本
      const lines = [];
      const children = logContent.children;
      if (children.length === 0 || (children.length === 1 && children[0].classList && children[0].classList.contains('log-empty'))) {
        app.showToast('日志为空，无内容可复制', 'info');
        return;
      }
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (!child.classList || !child.classList.contains('log-empty')) {
          lines.push(child.textContent || '');
        }
      }
      const text = lines.join('\n');

      // 优先使用 Clipboard API
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        app.showToast('已复制 ' + lines.length + ' 行日志到剪贴板', 'success');
        return;
      }

      // 回退方案：使用 textarea + execCommand
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      document.body.removeChild(textarea);

      if (ok) {
        app.showToast('已复制 ' + lines.length + ' 行日志到剪贴板', 'success');
      } else {
        app.showToast('复制失败，请手动选择复制', 'error');
      }
    } catch (e) {
      app.showToast('复制失败: ' + e.message, 'error');
    }
  },

  async handleStop() {
    try {
      const stopBtn = document.getElementById('stopBtn');
      if (stopBtn) {
        stopBtn.disabled = true;
        stopBtn.innerHTML = '<span class="launch-icon">' + icon('stop') + '</span><span>正在停止...</span>';
      }

      const result = await zenith.launch.stop();

      if (result) {
        addLaunchLog({ message: '已请求停止游戏', level: 'info' });
        app.showToast('已请求停止游戏', 'info');
      } else {
        app.showToast('当前没有运行中的游戏', 'warning');
      }

      // 恢复按钮状态
      this.setLaunchButtonIdle();
      updateLaunchState({ running: false });
    } catch (e) {
      app.showToast('停止失败: ' + e.message, 'error');
      this.setLaunchButtonIdle();
      updateLaunchState({ running: false });
    }
  },

  // 渲染账号卡片
  renderAccountCard() {
    const nameEl = document.getElementById('accountName');
    const typeEl = document.getElementById('accountType');
    const avatarEl = document.getElementById('accountAvatar');

    if (nameEl) nameEl.textContent = '未登录';
    if (typeEl) typeEl.textContent = '请选择登录方式';
    renderAvatarElement(avatarEl, null);

    if (appState.selectedAccount) {
      const account = appState.selectedAccount;
      const userName = account.userName || account.username || account.name || '玩家';
      if (nameEl) nameEl.textContent = userName;

      const typeNames = { microsoft: '微软账号', offline: '离线模式', authlib: '外置登录' };
      if (typeEl) typeEl.textContent = typeNames[account.type] || '已登录';

      renderAvatarElement(avatarEl, account);
    }
  },

  // 渲染左侧版本列表
  renderVersionSelector() {
    const selector = document.querySelector('.version-selector');
    if (!selector) return;

    let html = `<div class="version-selector-header">
      <h3>游戏版本</h3>
    </div>
    <div class="version-selector-list">
    `;

    if (!appState.versions || appState.versions.length === 0) {
      html += `
        <div class="version-list-empty">
          <div class="empty-icon">
            <img src="assets/origin.png" class="loader-img version-block-img" alt="版本" />
          </div>
          <p>暂无已安装的版本</p>
          <span class="empty-sub">点击下方按钮前往下载</span>
          <button class="btn btn-primary btn-full" id="emptyDownloadBtn">下载版本</button>
        </div>
      `;
    } else {
      const versionImg = '<img src="assets/origin.png" class="loader-img version-block-img" alt="版本" />';
      const svgDelete = icon('trash');

      appState.versions.forEach(version => {
        const isSelected = appState.selectedVersion && appState.selectedVersion.id === version.id;
        const typeLabel = { release: '正式版', snapshot: '快照版' }[version.type] || version.type || '版本';
        const displayName = version.name || version.id || version.version || '未知版本';

        html += `
          <div class="version-item ${isSelected ? 'selected' : ''}" data-version-id="${version.id}">
            <div class="version-item-content" data-version-id="${version.id}">
              <div class="version-item-icon">${versionImg}</div>
              <div class="version-item-info">
                <div class="version-item-name">${displayName}</div>
                <div class="version-item-type">${typeLabel}</div>
              </div>
              ${isSelected ? '<div class="version-item-check">' + icon('check') + '</div>' : ''}
            </div>
            <button class="version-item-delete" data-version-id="${version.id}" title="删除版本">
              ${svgDelete}
            </button>
          </div>
        `;
      });
    }

    html += '</div>';
    selector.innerHTML = html;

    // 绑定空态按钮
    const emptyDownloadBtn = document.getElementById('emptyDownloadBtn');
    if (emptyDownloadBtn) {
      emptyDownloadBtn.addEventListener('click', () => app.switchView('download'));
    }

    // 绑定版本点击事件（点击内容区域选择版本）
    const versionItemContents = document.querySelectorAll('.version-item-content');
    versionItemContents.forEach(item => {
      item.addEventListener('click', () => {
        const versionId = item.dataset.versionId;
        this.selectVersion(versionId);
      });
    });

    // 绑定删除按钮事件
    const deleteButtons = document.querySelectorAll('.version-item-delete');
    deleteButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const versionId = btn.dataset.versionId;
        this.deleteVersion(versionId);
      });
    });
  },

  async deleteVersion(versionId) {
    if (!versionId) return;

    // 确认对话框
    const confirmed = confirm(`确定要删除版本 "${versionId}" 吗？\n此操作将删除该版本的所有文件，包括存档、模组等数据，且无法恢复。`);
    if (!confirmed) return;

    try {
      await zenith.version.delete(versionId);
      app.showToast(`版本 ${versionId} 已删除`, 'success');

      // 如果被删除的是当前选中的版本，清除选中状态
      if (appState.selectedVersion && appState.selectedVersion.id === versionId) {
        appState.selectedVersion = null;
      }

      // 刷新版本列表
      if (typeof app !== 'undefined' && app.loadVersions) {
        await app.loadVersions();
      }
    } catch (e) {
      app.showToast('删除失败: ' + e.message, 'error');
    }
  },

  // 渲染右侧版本信息卡片
  renderVersionCard() {
    const versionName = document.getElementById('selectedVersionName');
    const versionType = document.getElementById('selectedVersionType');
    const launchBtn = document.getElementById('launchBtn');
    const stopBtn = document.getElementById('stopBtn');

    // 如果游戏正在运行，保持当前状态
    if (appState.launchState && appState.launchState.running) {
      return;
    }

    if (appState.selectedVersion) {
      if (versionName) versionName.textContent = appState.selectedVersion.name || appState.selectedVersion.id || appState.selectedVersion.version || '未选择版本';
      const typeNames = { release: '正式版', snapshot: '快照版' };
      if (versionType) {
        versionType.textContent = typeNames[appState.selectedVersion.type] || appState.selectedVersion.type || '正式版';
      }
      if (launchBtn) launchBtn.disabled = false;
      if (stopBtn) stopBtn.style.display = 'none';
    } else {
      if (versionName) versionName.textContent = '未选择版本';
      if (versionType) versionType.textContent = '请先下载一个版本';
      if (launchBtn) launchBtn.disabled = true;
      if (stopBtn) stopBtn.style.display = 'none';
    }
  },

  async selectVersion(versionId) {
    try {
      await zenith.version.select(versionId);
      const version = appState.versions.find(v => v.id === versionId);
      if (version) {
        appState.selectedVersion = version;
        this.renderVersionSelector();
        this.renderVersionCard();
      }
    } catch (e) {
      app.showToast('选择版本失败: ' + e.message, 'error');
    }
  },

  setLaunchButtonRunning(pid) {
    const launchBtn = document.getElementById('launchBtn');
    const stopBtn = document.getElementById('stopBtn');
    if (launchBtn) {
      launchBtn.style.display = 'none';
    }
    if (stopBtn) {
      stopBtn.style.display = '';
      stopBtn.disabled = false;
      const pidText = pid ? `（PID: ${pid}）` : '';
      stopBtn.innerHTML = '<span class="launch-icon">' + icon('stop') + '</span><span>停止游戏' + pidText + '</span>';
    }
  },

  setLaunchButtonIdle() {
    const launchBtn = document.getElementById('launchBtn');
    const stopBtn = document.getElementById('stopBtn');
    if (stopBtn) {
      stopBtn.style.display = 'none';
      stopBtn.disabled = false;
    }
    if (launchBtn) {
      launchBtn.style.display = '';
      launchBtn.innerHTML = '<span class="launch-icon">' + icon('playTriangle') + '</span><span>启动游戏</span>';
    }
  },

  setLaunchButtonLaunching() {
    const launchBtn = document.getElementById('launchBtn');
    const stopBtn = document.getElementById('stopBtn');
    if (launchBtn) {
      launchBtn.style.display = 'none';
    }
    if (stopBtn) {
      stopBtn.style.display = '';
      stopBtn.disabled = false;
      stopBtn.innerHTML = '<span class="launch-icon">' + icon('stop') + '</span><span>取消启动</span>';
    }
  },

  async handleLaunch() {
    if (appState.launchState.running) {
      // 向主进程确认是否真的在运行
      try {
        const realState = await zenith.launch.getState();
        if (!realState || !realState.running) {
          // 主进程说没在运行，修正本地状态
          updateLaunchState({ running: false });
          this.setLaunchButtonIdle();
        } else {
          app.showToast('游戏已在运行中', 'warning');
          return;
        }
      } catch (_) {
        app.showToast('游戏已在运行中', 'warning');
        return;
      }
    }

    if (!appState.selectedAccount) {
      app.showToast('请先登录账号', 'error');
      app.openModal('accountModal');
      return;
    }

    if (!appState.selectedVersion) {
      app.showToast('请选择游戏版本', 'error');
      return;
    }

    this.setLaunchButtonLaunching();

    const logContent = document.getElementById('logContent');
    if (logContent) {
      logContent.innerHTML = '';
    }

    updateLaunchState({ running: true });

    try {
      addLaunchLog({ message: '正在启动游戏...', level: 'info' });

      await zenith.download.checkFiles(appState.selectedVersion.id);

      addLaunchLog({ message: '文件检查完成，准备启动', level: 'info' });

      const options = {
        versionId: appState.selectedVersion.id,
        memoryMin: appState.config.memoryMin || 512,
        memoryMax: appState.config.memoryMax || 4096,
        width: appState.config.width || 854,
        height: appState.config.height || 480,
        serverIp: appState.config.serverIp || '',
        extraJvmArgs: appState.config.extraJvmArgs || '',
        extraGameArgs: appState.config.extraGameArgs || ''
      };

      const result = await zenith.launch.start(options);

      if (result && result.success) {
        if (result.earlyExit) {
          // 游戏快速退出（exit code 0），进程已结束
          addLaunchLog({ message: '游戏进程已退出（退出码: 0）', level: 'info' });
          addLaunchLog({ message: '若这是非预期的行为，请检查 Java 设置或游戏文件', level: 'info' });
        } else {
          this.setLaunchButtonRunning(result.pid);
          app.showToast(`游戏已启动 (PID: ${result.pid || 'unknown'})`, 'success');
        }
      } else {
        updateLaunchState({ running: false });
        this.setLaunchButtonIdle();
      }

    } catch (e) {
      updateLaunchState({ running: false });
      addLaunchLog({ message: '启动失败: ' + e.message, level: 'error' });
      app.showToast('启动失败: ' + e.message, 'error');
      this.setLaunchButtonIdle();
    }
  },

  setupLogListener() {
    const removeListener = zenith.launch.onLog((data) => {
      // addLaunchLog 现在会自动将日志渲染到 DOM，无需在此重复创建
      addLaunchLog(data);

      // 更新按钮状态：根据 running 和 exited/error 状态
      if (data.running && data.pid) {
        this.setLaunchButtonRunning(data.pid);
        updateLaunchState({ running: true, pid: data.pid });
      } else if (data.exited || data.level === 'error' || !data.running) {
        this.setLaunchButtonIdle();
        updateLaunchState({ running: false });
      }
    });

    // 兜底：定期（每 5 秒）向主进程查询真实运行状态，避免因 IPC 通知
    // 遗漏导致"停止游戏"按钮无法变回"启动游戏"按钮
    this._stateSyncTimer = setInterval(async () => {
      try {
        const realState = await zenith.launch.getState();
        const launchBtn = document.getElementById('launchBtn');
        const stopBtn = document.getElementById('stopBtn');
        // 前端认为在运行，但主进程说已停止 → 立即恢复
        if (appState.launchState.running && (!realState || !realState.running)) {
          updateLaunchState({ running: false });
          this.setLaunchButtonIdle();
        } else if (!appState.launchState.running && realState && realState.running) {
          // 前端认为已停止，但主进程还在运行 → 同步为停止按钮
          if (stopBtn) stopBtn.style.display = '';
          if (launchBtn) launchBtn.style.display = 'none';
          updateLaunchState({ running: true });
        }
      } catch (_) { /* 忽略轮询异常 */ }
    }, 5000);

    window.addEventListener('beforeunload', () => {
      removeListener();
      if (this._stateSyncTimer) clearInterval(this._stateSyncTimer);
    });
  },

  clearLogs() {
    const logContent = document.getElementById('logContent');
    if (logContent) {
      logContent.innerHTML = '<div class="log-empty">启动游戏后将在此显示日志</div>';
    }
    appState.launchState.logs = [];
  }
};

document.addEventListener('DOMContentLoaded', () => {
  launch.init();
});
