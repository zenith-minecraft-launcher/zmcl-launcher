// ============ 下载页逻辑 ============
const download = {
  // 运行时状态
  state: {
    selectedVersionId: null,
    selectedSource: null,
    // 选中的加载器：{ fabric: { version } }
    selectedLoaders: {},
    sources: [],
    versions: [],
    filteredVersions: [], // 筛选后的版本列表
    currentFilter: 'all', // 当前筛选类型
    availability: {}, // detectLoaders() 返回
    conflictStatus: null, // checkConflicts() 返回
    expandedLoader: null, // 当前展开的加载器类别
    // 下载卡片任务池（key: 任务ID，value: 任务状态）
    downloadTasks: {},
    nextTaskId: 1
  },

  init() {
    this.setupDownloadSource();
    this.loadVersionManifest();
    this.setupProgressListener();
    this.bindDetailActions();
    this.bindFilterActions();
    this.bindDownloadSubtabs();
    this.bindCancelButton();
    this.bindManagerActions();
    this.bindFloatingButton();
    this.updateFloatingBadge();
  },

  bindCancelButton() {
    const cancelBtn = document.getElementById('cancelDownloadBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', async () => {
        if (cancelBtn.disabled) return;
        cancelBtn.disabled = true;
        cancelBtn.textContent = '取消中...';
        this._cancelling = true;
        try {
          await Promise.all([
            (typeof zenith !== 'undefined' && zenith.download && zenith.download.cancel) ? zenith.download.cancel() : null,
            (typeof zenith !== 'undefined' && zenith.loader && zenith.loader.cancel) ? zenith.loader.cancel() : null
          ]);
        } catch (e) {
          console.warn('[Download] 取消失败:', e);
        } finally {
          if (typeof updateDownloadState === 'function') updateDownloadState({ downloading: false });
          const progressDiv = document.getElementById('downloadProgress');
          if (progressDiv) progressDiv.style.display = 'none';
          this.resetDetailView();
          if (typeof app !== 'undefined' && app.showToast) {
            app.showToast('下载已取消', 'info');
          }
          setTimeout(() => {
            if (cancelBtn) {
              cancelBtn.disabled = false;
              cancelBtn.textContent = '取消下载';
            }
            this._cancelling = false;
          }, 2000);
        }
      });
    }
  },

  bindDownloadSubtabs() {
    const subtabButtons = document.querySelectorAll('.subtab-btn[data-subtab]');
    if (subtabButtons.length === 0) return;

    subtabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.subtab;
        subtabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const panes = document.querySelectorAll('.download-subtab-pane');
        panes.forEach(p => p.classList.remove('active'));

        const activePane = document.querySelector(`.download-subtab-pane[data-subtab-pane="${target}"]`);
        if (activePane) activePane.classList.add('active');
      });
    });
  },

  bindDetailActions() {
    const backBtn = document.getElementById('detailBackBtn');
    if (backBtn) backBtn.addEventListener('click', () => this.resetDetailView());

    const cancelBtn = document.getElementById('detailCancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.resetDetailView());

    const confirmBtn = document.getElementById('detailConfirmBtn');
    if (confirmBtn) confirmBtn.addEventListener('click', () => this.confirmDownload());
  },

  // 绑定筛选按钮事件
  bindFilterActions() {
    const filterTabs = document.getElementById('versionFilterTabs');
    if (!filterTabs) return;

    const buttons = filterTabs.querySelectorAll('.version-filter-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.dataset.filter;
        this.setFilter(filter);
        
        // 更新按钮状态
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  },

  // 设置筛选类型
  setFilter(filterType) {
    this.state.currentFilter = filterType;
    this.applyFilter();
  },

  // 应用筛选
  applyFilter() {
    const filter = this.state.currentFilter;
    const allVersions = this.state.versions;

    if (filter === 'all') {
      this.state.filteredVersions = allVersions;
    } else if (filter === 'release') {
      this.state.filteredVersions = allVersions.filter(v => v.type === 'release');
    } else if (filter === 'snapshot') {
      this.state.filteredVersions = allVersions.filter(v => v.type === 'snapshot');
    } else if (filter === 'old') {
      this.state.filteredVersions = allVersions.filter(v => v.type === 'old_alpha' || v.type === 'old_beta');
    } else if (filter === 'aprilfools') {
      this.state.filteredVersions = allVersions.filter(v => this.isAprilFoolsVersion(v.id));
    }

    this.renderVersionList();
  },

  async setupDownloadSource() {
    try {
      this.state.sources = await zenith.download.getSources();
    } catch (e) {
      console.error('[Download] Failed to load sources:', e.message);
    }
  },

  async loadVersionManifest() {
    const list = document.getElementById('versionList');
    if (!list) return;

    list.innerHTML = '<div class="loading-spinner">加载版本清单...</div>';

    try {
      const manifest = await zenith.download.getManifest();
      const versions = (manifest.versions || []).filter(v => v.type !== 'demo');
      this.state.versions = versions;
      this.state.filteredVersions = versions; // 默认显示全部

      // 使用新的渲染函数
      this.renderVersionList();
    } catch (e) {
      list.innerHTML = '<div class="download-item" style="text-align: center; color: var(--error);">加载失败: ' + e.message + '</div>';
      console.error('[Download] Failed to load manifest:', e.message);
    }
  },

  getVersionInfo(versionId) {
    if (!this.state.versions) return null;
    return this.state.versions.find(v => v.id === versionId) || null;
  },

  async showVersionDetail(versionId) {
    const hintDiv = document.getElementById('downloadHint');
    const detailDiv = document.getElementById('downloadDetail');
    if (hintDiv) hintDiv.style.display = 'none';
    if (detailDiv) detailDiv.style.display = 'flex';

    const version = this.getVersionInfo(versionId);
    const typeLabel = version && version.type === 'release' ? '正式版'
                    : version && version.type === 'snapshot' ? '快照版'
                    : '其他';

    const nameEl = document.getElementById('detailVersionName');
    if (nameEl) nameEl.textContent = versionId;

    const typeEl = document.getElementById('detailVersionType');
    if (typeEl) {
      typeEl.textContent = typeLabel;
      typeEl.className = 'detail-type-label ' + (version && version.type === 'snapshot' ? 'snapshot' : '');
    }

    this.state.selectedVersionId = versionId;

    if (this.state.sources && this.state.sources.length > 0 && !this.state.selectedSource) {
      this.state.selectedSource = this.state.sources[0].key;
    }
    this.state.selectedLoaders = {};
    this.state.availability = {};
    this.state.conflictStatus = null;
    this.state.expandedLoader = null;

    // 重置确认按钮状态（没选加载器时默认可点击下载原版）
    const confirmBtn = document.getElementById('detailConfirmBtn');
    if (confirmBtn) {
      confirmBtn.disabled = false;
      const spans = confirmBtn.querySelectorAll('span');
      const textSpan = spans[spans.length - 1];
      if (textSpan) textSpan.textContent = '下载原版';
    }

    this.renderSourceList();
    this.renderLoaderListInitial();

    // 异步检测加载器可用性
    if (typeof zenith !== 'undefined' && zenith.loader && zenith.loader.detect) {
      try {
        console.log('[Download] 开始检测加载器:', versionId);
        const info = await zenith.loader.detect(versionId);
        console.log('[Download] 加载器检测结果:', info);
        this.state.availability = info || {};
      } catch (e) {
        console.error('[Download] 加载器检测失败:', e);
        this.state.availability = {};
      }
      this.renderLoaderList();
      this.recomputeConflicts();
    } else {
      console.warn('[Download] zenith.loader.detect 不可用');
      // 降级：所有加载器视为可用
      this.renderLoaderList();
    }
  },

  // 渲染下载源列表（带图标）
  renderSourceList() {
    const container = document.getElementById('sourceList');
    if (!container) return;

    const svgGlobe = icon('package');
    const svgSpeed = icon('boxDownload');

    const iconMap = { mojang: svgGlobe, official: svgGlobe, bmclapi: svgSpeed };
    const descMap = {
      mojang: 'Mojang 官方服务器，稳定但较慢',
      official: '官方下载源，稳定可靠',
      bmclapi: 'BMCLAPI 国内镜像，速度快'
    };

    let html = '';
    this.state.sources.forEach(source => {
      const isSelected = this.state.selectedSource === source.key;
      html += `
        <div class="option-item ${isSelected ? 'selected' : ''}" data-source-key="${source.key}">
          <div class="option-radio"><div class="option-radio-dot"></div></div>
          <div class="option-icon">${iconMap[source.key] || svgGlobe}</div>
          <div class="option-info">
            <div class="option-name">${source.name}</div>
            <div class="option-desc">${descMap[source.key] || source.desc || source.key}</div>
          </div>
          <div class="option-check">
            ${icon('check')}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    container.querySelectorAll('.option-item').forEach(item => {
      item.addEventListener('click', () => {
        this.state.selectedSource = item.dataset.sourceKey;
        container.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
      });
    });
  },

  // 初次渲染加载器列表（所有加载器显示"正在检测"）
  renderLoaderListInitial() {
    const container = document.getElementById('loaderList');
    if (!container) return;

    const loaders = [
      { key: 'fabric',   name: 'Fabric',   desc: '轻量级加载器，启动速度快', img: 'assets/fabric.png' },
      { key: 'forge',    name: 'Forge',    desc: '成熟稳定，兼容大量经典模组', img: 'assets/forge.png' },
      { key: 'neoforge', name: 'NeoForge', desc: 'Forge 分支，现代版本的主流', img: 'assets/neoforge.png' }
    ];

    let html = '';
    loaders.forEach(l => {
      const loaderIcon = `<img src="${l.img}" class="loader-img" alt="${l.name}" />`;
      html += `
        <div class="loader-category disabled" data-loader-key="${l.key}">
          <div class="loader-category-header">
            <div class="option-icon">${loaderIcon}</div>
            <div class="option-info">
              <div class="option-name">${l.name} <span class="loader-checking">检测中</span></div>
              <div class="option-desc">${l.desc}</div>
            </div>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  },

  // 加载器元信息（图标 + 描述）
  loaderMeta: {
    fabric: {
      label: 'Fabric',
      icon: '<img src="assets/fabric.png" class="loader-img" alt="Fabric" />',
      defaultDesc: '轻量级加载器，启动速度快，模组库增长迅速'
    },
    forge: {
      label: 'Forge',
      icon: '<img src="assets/forge.png" class="loader-img" alt="Forge" />',
      defaultDesc: '成熟稳定的模组加载器，兼容大量经典模组'
    },
    neoforge: {
      label: 'NeoForge',
      icon: '<img src="assets/neoforge.png" class="loader-img" alt="NeoForge" />',
      defaultDesc: 'Forge 分支，现代 Minecraft 版本的主流选择'
    }
  },

  renderLoaderList() {
    const container = document.getElementById('loaderList');
    if (!container) return;

    const keys = ['fabric', 'forge', 'neoforge'];
    let html = '';

    console.log('[Download] 渲染加载器列表，可用性数据:', this.state.availability);

    keys.forEach(key => {
      const meta = this.loaderMeta[key];
      const info = this.state.availability && this.state.availability[key];

      const isAvailable = info && (info.available === true || info.available === 'true');
      const isDisabled = !!(info && info.disabled);
      const disabledReason = info && info.disabledReason ? info.disabledReason : '';
      const selected = this.state.selectedLoaders && this.state.selectedLoaders[key];
      const isExpanded = this.state.expandedLoader === key;

      console.log(`[Download] ${key}:`, { info, isAvailable, isDisabled, selected, availableValue: info?.available });

      // 组装描述
      let desc = meta.defaultDesc;
      if (isDisabled) {
        desc = disabledReason || '此加载器当前不可用';
      } else if (isAvailable && info.version) {
        desc += `（推荐版本：${info.version}）`;
      } else if (!isAvailable) {
        const version = this.state.selectedVersionId || '';
        const isSnapshot = version.includes('pre') || version.includes('rc') || version.includes('snapshot') || (version.includes('w') && /\d+w\d+/.test(version));
        if (isSnapshot) {
          desc = `快照/预发布版本通常不支持 ${meta.label}，请使用正式版`;
        } else {
          desc = `此 MC 版本暂无 ${meta.label} 支持`;
        }
      }
      if (info && info.note) desc += ` — ${info.note}`;

      // 右侧标签
      let tag = '';
      if (isDisabled) {
        tag = '<span class="loader-disabled-tag">已禁用</span>';
      } else if (!isAvailable) {
        tag = '<span class="loader-unavailable">不可用</span>';
      }

      // 展开箭头图标
      const expandIcon = (isAvailable && !isDisabled) ? icon('arrowDown') : '';

      // 主加载器项
      const disabledClass = isDisabled ? 'loader-disabled' : (isAvailable ? '' : 'disabled');
      html += `
        <div class="loader-category ${selected ? 'selected' : ''} ${disabledClass}" data-loader-key="${key}">
          <div class="loader-category-header">
            <div class="option-icon">${meta.icon}</div>
            <div class="option-info">
              <div class="option-name">${meta.label} ${tag}</div>
              <div class="option-desc">${desc}</div>
            </div>
            ${expandIcon}
          </div>
      `;

      // 如果展开，显示所有版本列表（禁用的加载器不展开）
      if (isExpanded && isAvailable && !isDisabled && info.allVersions && info.allVersions.length > 0) {
        html += `<div class="loader-version-list">`;

        const latestVersion = info.latest || info.version;
        const isLatestSelected = selected && selected.version === latestVersion;
        html += `
          <div class="loader-version-item ${isLatestSelected ? 'selected' : ''}" data-loader-key="${key}" data-version="${latestVersion}">
            <div class="version-radio"><div class="version-radio-dot"></div></div>
            <div class="version-info">
              <div class="version-name">${latestVersion}</div>
              <div class="version-tag">最新版</div>
            </div>
          </div>
        `;

        info.allVersions.forEach((ver) => {
          if (ver === latestVersion) return;
          const isVerSelected = selected && selected.version === ver;
          const isRecommended = ver === info.recommended;
          html += `
            <div class="loader-version-item ${isVerSelected ? 'selected' : ''}" data-loader-key="${key}" data-version="${ver}">
              <div class="version-radio"><div class="version-radio-dot"></div></div>
              <div class="version-info">
                <div class="version-name">${ver}</div>
                ${isRecommended ? '<div class="version-tag recommended">推荐</div>' : ''}
              </div>
            </div>
          `;
        });

        html += `</div>`;
      }

      html += `</div>`;
    });

    container.innerHTML = html;

    // 绑定分类点击事件（展开/收起）
    container.querySelectorAll('.loader-category-header').forEach(header => {
      header.addEventListener('click', (e) => {
        const category = header.closest('.loader-category');
        if (!category) return;
        // 被明确禁用的加载器（Forge/NeoForge 正在修复）不可展开
        if (category.classList.contains('disabled') || category.classList.contains('loader-disabled')) return;
        const key = category.dataset.loaderKey;

        if (this.state.expandedLoader === key) {
          this.state.expandedLoader = null;
        } else {
          this.state.expandedLoader = key;
        }
        this.renderLoaderList();
      });
    });

    // 绑定版本选择事件
    container.querySelectorAll('.loader-version-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = item.dataset.loaderKey;
        const version = item.dataset.version;

        if (this.state.selectedLoaders[key] && this.state.selectedLoaders[key].version === version) {
          delete this.state.selectedLoaders[key];
          this.renderLoaderList();
          this.recomputeConflicts();
          return;
        }

        this.state.selectedLoaders[key] = { version: version };
        this.renderLoaderList();
        this.recomputeConflicts();
      });
    });
  },

  // 重新计算冲突并刷新 UI
  async recomputeConflicts() {
    const conflictBox = document.getElementById('loaderConflictBox');
    const confirmBtn = document.getElementById('detailConfirmBtn');

    // 把 this.state.selectedLoaders 转换为后端格式
    const selection = {};
    for (const k in this.state.selectedLoaders) {
      selection[k] = this.state.selectedLoaders[k];
    }

    let status = null;
    try {
      if (typeof zenith !== 'undefined' && zenith.loader && zenith.loader.checkConflicts
          && Object.keys(selection).length > 0) {
        status = await zenith.loader.checkConflicts(selection, this.state.selectedVersionId, this.state.availability || {});
      }
    } catch (e) {
      console.warn('[Download] 冲突检测异常:', e.message);
    }
    this.state.conflictStatus = status;

    if (conflictBox) {
      if (!status || (status.warnings && status.warnings.length === 0 && status.errors && status.errors.length === 0)) {
        conflictBox.style.display = 'none';
        conflictBox.innerHTML = '';
      } else {
        let html = '';
        if (status.errors && status.errors.length > 0) {
          html += `<div class="conflict-error">
            <strong>存在冲突，无法安装：</strong>
            <ul>${status.errors.map(c => `<li>${c.message}</li>`).join('')}</ul>
          </div>`;
        }
        if (status.warnings && status.warnings.length > 0) {
          html += `<div class="conflict-warning">
            <strong>注意：</strong>
            <ul>${status.warnings.map(c => `<li>${c.message}</li>`).join('')}</ul>
          </div>`;
        }
        conflictBox.innerHTML = html;
        conflictBox.style.display = 'block';
      }
    }

    // 更新确认按钮状态
    if (confirmBtn) {
      const hasSelection = Object.keys(this.state.selectedLoaders).length > 0;
      const hasErrors = status && status.errors && status.errors.length > 0;
      const spans = confirmBtn.querySelectorAll('span');
      const textSpan = spans[spans.length - 1];

      if (!hasSelection) {
        // 没选加载器：默认下载原版
        confirmBtn.disabled = false;
        if (textSpan) textSpan.textContent = '下载原版';
      } else if (hasErrors) {
        // 选了加载器但有冲突
        confirmBtn.disabled = true;
        if (textSpan) textSpan.textContent = '存在冲突';
      } else {
        // 选了加载器且无冲突
        confirmBtn.disabled = false;
        if (textSpan) textSpan.textContent = '确认下载';
      }
    }
  },

  // 安装选中的加载器版本
  async installSelectedLoaders() {
    const keys = Object.keys(this.state.selectedLoaders || {});
    if (keys.length === 0) {
      if (typeof app !== 'undefined' && app.showToast) app.showToast('请先选择至少一个模组加载器', 'warning');
      return;
    }

    const selectedLoaders = keys.map(k => ({
      key: k,
      version: (this.state.selectedLoaders[k] && this.state.selectedLoaders[k].version) || 'latest'
    }));

    const versionId = this.state.selectedVersionId || '新安装';
    const loadersSummary = keys.join(' + ');

    // 使用新卡片UI
    const progressDiv = document.getElementById('downloadProgress');
    const detailDiv = document.getElementById('downloadDetail');
    if (progressDiv) progressDiv.style.display = 'none';
    if (detailDiv) detailDiv.style.display = 'none';

    // 创建下载卡片
    const taskId = this.createDownloadCard({
      versionId: versionId,
      title: `安装 ${versionId} (${loadersSummary})`,
      type: 'loader'
    });

    // 自动切换到下载管理页查看进度
    if (typeof app !== 'undefined' && app.switchView) {
      app.switchView('downloads');
    }

    // 设置进度监听 - 新卡片
    const removeProgressListener = zenith.loader.onProgress((data) => {
      this.updateDownloadCard(taskId, data);
    });

    try {
      const result = await zenith.loader.install(this.state.selectedVersionId, selectedLoaders);
      removeProgressListener();

      if (result && result.success) {
        this.setDownloadCardStatus(taskId, 'completed', {
          percent: 100,
          subtitle: `${result.versionId} 安装完成`
        });

        if (typeof app !== 'undefined' && app.showToast) {
          app.showToast(`模组加载器安装完成: ${result.versionId}`, 'success');
        }
        if (typeof zenith !== 'undefined' && zenith.version && zenith.version.list) {
          try { await zenith.version.list(); } catch (_) {}
        }
        if (typeof app !== 'undefined' && app.loadVersions) {
          try { app.loadVersions(); } catch (_) {}
        }
        if (typeof app !== 'undefined' && result.versionId) {
          try { app.setSelectedVersion && app.setSelectedVersion(result.versionId); } catch (_) {}
        }
      } else {
        this.setDownloadCardStatus(taskId, 'error', {
          subtitle: (result && result.error) || '安装失败'
        });
        if (typeof app !== 'undefined' && app.showToast) {
          app.showToast((result && result.error) || '安装失败', 'error');
        }
      }
    } catch (e) {
      removeProgressListener();
      console.error('[Download] 模组加载器安装失败:', e);
      if (this._cancelling) return;
      const isCancelled = e && (e.cancelled === true ||
        (e.message && (e.message.includes('cancel') || e.message.includes('取消'))));
      if (isCancelled) {
        this.setDownloadCardStatus(taskId, 'cancelled', { subtitle: '已取消' });
        if (typeof app !== 'undefined' && app.showToast) app.showToast('安装已取消', 'info');
      } else {
        this.setDownloadCardStatus(taskId, 'error', { subtitle: e.message || '安装失败' });
        if (typeof app !== 'undefined' && app.showToast) app.showToast('安装失败: ' + e.message, 'error');
      }
    } finally {
      if (!this._cancelling) {
        if (typeof updateDownloadState === 'function') updateDownloadState({ downloading: false });
      }
      this.updateFloatingBadge();
    }
  },

  // 返回占位页
  resetDetailView() {
    const hintDiv = document.getElementById('downloadHint');
    const detailDiv = document.getElementById('downloadDetail');
    if (hintDiv) hintDiv.style.display = 'block';
    if (hintDiv) hintDiv.style.margin = 'auto';
    if (detailDiv) detailDiv.style.display = 'none';

    this.state.selectedVersionId = null;
    this.state.selectedLoaders = {};
    this.state.availability = {};
    this.state.conflictStatus = null;
    const items = document.querySelectorAll('.download-item');
    items.forEach(i => i.classList.remove('active'));
  },

  // 用户点击确认下载
  async confirmDownload() {
    if (!this.state.selectedVersionId) return;

    // 设置下载源
    if (this.state.selectedSource) {
      zenith.download.setSource(this.state.selectedSource).catch(e => {
        console.warn('设置下载源失败:', e.message);
      });
    }

    const hasLoader = Object.keys(this.state.selectedLoaders || {}).length > 0;

    if (hasLoader) {
      // 有加载器选择，调用安装加载器流程（自动包含原版基底）
      await this.installSelectedLoaders();
    } else {
      // 未选择加载器，默认下载原版游戏
      this.startDownload(this.state.selectedVersionId);
    }
  },

  async startDownload(versionId) {
    const hintDiv = document.getElementById('downloadHint');
    const detailDiv = document.getElementById('downloadDetail');
    const progressDiv = document.getElementById('downloadProgress');

    if (hintDiv) hintDiv.style.display = 'none';
    if (detailDiv) detailDiv.style.display = 'none';
    if (progressDiv) progressDiv.style.display = 'none'; // 隐藏旧进度面板，使用新卡片

    if (typeof updateDownloadState === 'function') updateDownloadState({ downloading: true });

    // 创建一个新的下载卡片（新UI）
    const taskId = this.createDownloadCard({
      versionId: versionId,
      title: `安装 ${versionId}`,
      type: 'version'
    });

    // 自动切换到下载管理页查看进度
    if (typeof app !== 'undefined' && app.switchView) {
      app.switchView('downloads');
    }

    const removeListener = zenith.download.onProgress((data) => {
      // 更新新卡片上的细分进度
      this.updateDownloadCard(taskId, data);

      if (typeof updateDownloadState === 'function') updateDownloadState({
        progress: data.percent || 0,
        stage: data.stage,
        speedText: data.speedText,
        etaText: data.etaText
      });
    });

    try {
      await zenith.download.version(versionId);

      // 标记卡片为完成状态
      this.setDownloadCardStatus(taskId, 'completed', {
        percent: 100,
        subtitle: '下载完成'
      });

      setTimeout(() => {
        if (typeof app !== 'undefined' && app.showToast) app.showToast(`版本 ${versionId} 下载完成`, 'success');
      }, 500);

      if (typeof app !== 'undefined' && app.loadVersions) {
        try {
          await zenith.version.list();
          await app.loadVersions();
          const newVersion = appState.versions.find(v => v.id === versionId);
          if (newVersion) {
            appState.selectedVersion = newVersion;
            appState.config.selectedVersion = versionId;
            await zenith.version.select(versionId);
            if (typeof launch !== 'undefined' && launch.renderVersionSelector) {
              launch.renderVersionSelector();
            }
            if (typeof launch !== 'undefined' && launch.renderVersionCard) {
              launch.renderVersionCard();
            }
          }
        } catch (_) {}
      }
    } catch (e) {
      if (this._cancelling) return;
      const cancelledFlag = !!(e && e.cancelled === true);
      const msgFlag = !!(e && e.message && (e.message.indexOf('cancel') >= 0 || e.message.indexOf('取消') >= 0));
      const isCancelled = cancelledFlag || msgFlag;
      if (isCancelled) {
        this.setDownloadCardStatus(taskId, 'cancelled', { subtitle: '已取消' });
        if (typeof app !== 'undefined' && app.showToast) app.showToast('下载已取消', 'info');
      } else {
        this.setDownloadCardStatus(taskId, 'error', { subtitle: e.message || '下载失败' });
        if (typeof app !== 'undefined' && app.showToast) app.showToast('下载失败: ' + e.message, 'error');
      }
      if (progressDiv) progressDiv.style.display = 'none';
    } finally {
      if (!this._cancelling) {
        if (typeof updateDownloadState === 'function') updateDownloadState({ downloading: false });
      }
      removeListener();
      this.updateFloatingBadge();
    }
  },

  setupProgressListener() {
    if (typeof zenith !== 'undefined' && zenith.download && zenith.download.onProgress) {
      const removeListener = zenith.download.onProgress(() => {});
      if (typeof window !== 'undefined') window.addEventListener('beforeunload', removeListener);
    }
  },

  // 版本分类
  versionCategories: {
    release: '正式版',
    snapshot: '快照版',
    old_beta: '远古版 (Beta)',
    old_alpha: '远古版 (Alpha)',
    aprilfools: '愚人节版'
  },

  // 愚人节版本列表
  aprilFoolsVersions: ['22w13oneblockatatime', '23w13a_or_b', '24w14potato', '20w14infinite', '23w13a_or_b'],

  isAprilFoolsVersion(versionId) {
    return this.aprilFoolsVersions.includes(versionId) || 
           (versionId.includes('w') && (versionId.includes('oneblock') || versionId.includes('potato') || versionId.includes('infinite')));
  },

  getVersionCategory(version) {
    if (this.isAprilFoolsVersion(version.id)) return 'aprilfools';
    return version.type;
  },

  renderVersionList() {
    const list = document.getElementById('versionList');
    if (!list) return;

    const versions = this.state.filteredVersions;

    if (versions.length === 0) {
      list.innerHTML = '<div class="loading-spinner">该分类下暂无版本</div>';
      return;
    }

    const svgRelease = icon('shield');
    const svgSnapshot = icon('zap');
    const svgFolder = icon('folder');
    const svgAprilFools = icon('heart');

    const typeLabelMap = {
      release: '正式版',
      snapshot: '快照版',
      old_alpha: '远古版',
      old_beta: '远古版'
    };

    let html = '';
    versions.forEach(version => {
      let typeIcon, typeClass, typeLabel;

      if (this.isAprilFoolsVersion(version.id)) {
        typeIcon = svgAprilFools;
        typeClass = 'aprilfools';
        typeLabel = '愚人节版';
      } else if (version.type === 'release') {
        typeIcon = svgRelease;
        typeClass = 'release';
        typeLabel = typeLabelMap.release;
      } else if (version.type === 'snapshot') {
        typeIcon = svgSnapshot;
        typeClass = 'snapshot';
        typeLabel = typeLabelMap.snapshot;
      } else {
        typeIcon = svgFolder;
        typeClass = 'old';
        typeLabel = typeLabelMap[version.type] || version.type;
      }

      const isActive = version.id === this.state.selectedVersionId ? ' active' : '';

      html += `
        <div class="download-item${isActive}" data-version-id="${version.id}">
          <div class="download-item-header">
            <span class="download-item-icon">${typeIcon}</span>
            <span class="download-item-name">${version.id}</span>
            <span class="download-item-type ${typeClass}">${typeLabel}</span>
          </div>
          <div class="download-item-info">${new Date(version.releaseTime).toLocaleDateString('zh-CN')}</div>
        </div>
      `;
    });

    list.innerHTML = html;

    const items = document.querySelectorAll('.download-item');
    items.forEach(item => {
      item.addEventListener('click', () => {
        const versionId = item.dataset.versionId;
        items.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        this.state.selectedVersionId = versionId;
        this.showVersionDetail(versionId);
      });
    });
  },

  // ========== 新版下载管理：卡片逻辑 ==========

  // 草方块图标（使用 origin.png）
  getGrassBlockSvg() {
    return `<img src="assets/origin.png" class="loader-img big-block-img" alt="草方块" />`;
  },

  // 绑定下载管理栏按钮
  bindManagerActions() {
    const clearBtn = document.getElementById('clearCompletedBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.clearCompletedTasks();
      });
    }

    // 下载页面内的「前往下载管理」按钮
    const gotoBtn = document.getElementById('goToDownloadMgrBtn');
    if (gotoBtn) {
      gotoBtn.addEventListener('click', () => {
        if (typeof app !== 'undefined' && app.switchView) {
          app.switchView('downloads');
        }
      });
    }

    // 初始刷新元信息
    this.updateManagerMeta();
  },

  // 更新下载管理页顶部元信息
  updateManagerMeta() {
    const meta = document.getElementById('downloadManagerMeta');
    if (!meta) return;
    const tasks = this.state.downloadTasks || {};
    const total = Object.keys(tasks).length;
    const active = Object.values(tasks).filter(t => t.status === 'downloading').length;
    if (total === 0) {
      meta.textContent = '0 个任务';
    } else if (active > 0) {
      meta.textContent = `${active} 个进行中 · 共 ${total} 个`;
    } else {
      meta.textContent = `${total} 个已完成`;
    }
  },

  // 顶部导航栏的下载管理按钮
  bindFloatingButton() {
    const btn = document.getElementById('headerDownloadBtn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      if (typeof app !== 'undefined' && app.switchView) {
        app.switchView('downloads');
      }
    });
  },

  // 更新顶部下载按钮上的徽标
  updateFloatingBadge() {
    const badge = document.getElementById('headerDownloadBadge');
    if (badge) {
      const tasks = this.state.downloadTasks || {};
      const activeCount = Object.values(tasks).filter(t => t.status === 'downloading').length;
      if (activeCount > 0) {
        badge.textContent = String(activeCount);
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
    this.updateManagerMeta();
  },

  // 创建一个下载卡片
  createDownloadCard(options) {
    const { versionId, title, type } = options;
    const taskId = `task_${this.state.nextTaskId++}_${Date.now()}`;

    // 保存任务状态
    this.state.downloadTasks[taskId] = {
      id: taskId,
      versionId,
      title,
      type,
      status: 'downloading',
      percent: 0,
      subtitle: '准备中...',
      currentFile: '',
      fileProgress: { done: 0, total: 0 },
      bytes: { done: 0, total: 0 },
      stage: '',
      speed: '',
      eta: '',
      createdAt: Date.now()
    };

    // 隐藏空状态提示
    const emptyState = document.getElementById('downloadEmptyState');
    if (emptyState) emptyState.style.display = 'none';

    // 创建卡片 DOM
    const container = document.getElementById('downloadCardsContainer');
    if (!container) return taskId;

    const card = document.createElement('div');
    card.className = 'download-card status-downloading expanded';
    card.dataset.taskId = taskId;
    card.innerHTML = this.buildCardHtml(this.state.downloadTasks[taskId]);
    container.insertBefore(card, container.firstChild);

    // 绑定卡片头部点击（展开/收起）
    const header = card.querySelector('.download-card-header');
    if (header) {
      header.addEventListener('click', () => {
        card.classList.toggle('expanded');
      });
    }

    // 绑定取消按钮
    const cancelBtn = card.querySelector('[data-action="cancel"]');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (this.state.downloadTasks[taskId] && this.state.downloadTasks[taskId].status === 'downloading') {
          // 下载中：先显示取消中状态，然后取消
          cancelBtn.disabled = true;
          cancelBtn.textContent = '取消中...';
          this._cancelling = true;
          try {
            if (typeof zenith !== 'undefined' && zenith.download && zenith.download.cancel) {
              await zenith.download.cancel();
            }
            if (typeof zenith !== 'undefined' && zenith.loader && zenith.loader.cancel) {
              await zenith.loader.cancel();
            }
          } catch (_) {}
          this.setDownloadCardStatus(taskId, 'cancelled', { subtitle: '已取消' });
          if (typeof app !== 'undefined' && app.showToast) {
            app.showToast('下载已取消', 'info');
          }
          setTimeout(() => {
            this._cancelling = false;
            const btn = document.querySelector(`.download-card[data-task-id="${taskId}"] [data-action="cancel"]`);
            if (btn) { btn.disabled = false; btn.textContent = '移除'; }
          }, 1500);
        } else {
          // 已完成/错误的任务，移除
          this.removeDownloadCard(taskId);
        }
      });
    }

    this.updateFloatingBadge();
    return taskId;
  },

  // 构建卡片HTML
  buildCardHtml(task) {
    const statusLabelMap = {
      downloading: '下载中',
      completed: '已完成',
      error: '错误',
      cancelled: '已取消'
    };

    const stageText = task.stage || task.subtitle || '下载中';
    const speedText = task.speed || '';
    const etaText = task.eta || '';

    const mainPercent = Math.min(100, Math.max(0, Number(task.percent) || 0));

    return `
      <div class="download-card-header">
        <div class="download-card-icon">${this.getGrassBlockSvg()}</div>
        <div class="download-card-title-section">
          <div class="download-card-title">${task.title}</div>
          <div class="download-card-subtitle">${task.subtitle}</div>
        </div>
        <span class="download-card-status">${statusLabelMap[task.status] || '下载中'}</span>
        <div class="download-card-main-progress">
          <div class="download-card-main-bar-wrapper">
            <div class="download-card-main-bar">
              <div class="download-card-main-bar-fill" style="width: ${mainPercent}%"></div>
            </div>
            <div class="download-card-main-percent">${Math.round(mainPercent)}%</div>
          </div>
        </div>
        ${icon('chevronDown')}
      </div>
      <div class="download-card-body">
        <div class="download-card-meta">
          <div class="download-card-meta-item">
            <div class="download-card-meta-label">下载速度</div>
            <div class="download-card-meta-value download-card-speed">${speedText || '—'}</div>
          </div>
          <div class="download-card-meta-item">
            <div class="download-card-meta-label">剩余时间</div>
            <div class="download-card-meta-value download-card-eta">${etaText || '—'}</div>
          </div>
        </div>
        <div class="download-card-actions">
          <button class="download-card-action-btn" data-action="cancel">
            ${task.status === 'downloading' ? '取消下载' : '移除'}
          </button>
        </div>
      </div>
    `;
  },

  // 格式化字节数
  formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 KB';
    const kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(0) + ' KB';
    const mb = kb / 1024;
    if (mb < 1024) return mb.toFixed(1) + ' MB';
    const gb = mb / 1024;
    return gb.toFixed(2) + ' GB';
  },

  // 更新卡片进度
  updateDownloadCard(taskId, data) {
    const task = this.state.downloadTasks[taskId];
    if (!task) return;

    // 更新数据
    task.status = 'downloading';
    if (data.percent !== undefined) task.percent = data.percent;

    const stageText = data.stageText || data.stage || data.message || '';
    if (stageText) {
      task.stage = stageText;
      task.subtitle = stageText;
    }
    if (data.speedText) task.speed = data.speedText;
    if (data.etaText) task.eta = data.etaText;

    // 文件进度
    if (data.downloaded !== undefined) {
      task.fileProgress.done = data.downloaded;
    }
    if (data.total !== undefined) {
      task.fileProgress.total = data.total;
    }

    // 字节进度
    if (data.downloadedBytes !== undefined) {
      task.bytes.done = data.downloadedBytes;
    }
    if (data.totalBytes !== undefined) {
      task.bytes.total = data.totalBytes;
    }

    // 当前文件名
    if (data.current) {
      task.currentFile = typeof data.current === 'string' ? data.current : (data.current.name || '');
    } else if (data.files && Array.isArray(data.files) && data.files.length > 0) {
      const active = data.files.find(f => f.state === 'downloading') || data.files[0];
      if (active && active.name) {
        task.currentFile = active.name.length > 50
          ? active.name.slice(0, 47) + '...'
          : active.name;
      }
    }

    // 整体百分比（如果数据没有给出percent，则基于文件或字节估算）
    if (data.percent === undefined) {
      if (task.fileProgress.total > 0) {
        task.percent = (task.fileProgress.done / task.fileProgress.total) * 100;
      } else if (task.bytes.total > 0) {
        task.percent = (task.bytes.done / task.bytes.total) * 100;
      }
    }

    // 更新DOM
    const card = document.querySelector(`.download-card[data-task-id="${taskId}"]`);
    if (!card) return;

    const mainPercent = Math.round(Math.min(100, Math.max(0, task.percent || 0)));
    const mainFill = card.querySelector('.download-card-main-bar-fill');
    if (mainFill) mainFill.style.width = mainPercent + '%';
    const mainPercentText = card.querySelector('.download-card-main-percent');
    if (mainPercentText) mainPercentText.textContent = mainPercent + '%';

    const subtitle = card.querySelector('.download-card-subtitle');
    if (subtitle) subtitle.textContent = task.subtitle;

    // 更新下载速度和剩余时间
    const speedEl = card.querySelector('.download-card-speed');
    if (speedEl) speedEl.textContent = task.speed || '—';
    const etaEl = card.querySelector('.download-card-eta');
    if (etaEl) etaEl.textContent = task.eta || '—';

    this.updateFloatingBadge();
  },

  // 更新卡片状态（完成/错误/取消）
  setDownloadCardStatus(taskId, status, options) {
    const task = this.state.downloadTasks[taskId];
    if (!task) return;

    task.status = status;
    if (options && options.percent !== undefined) task.percent = options.percent;
    if (options && options.subtitle) task.subtitle = options.subtitle;

    const card = document.querySelector(`.download-card[data-task-id="${taskId}"]`);
    if (!card) return;

    // 更新状态类
    card.classList.remove('status-downloading', 'status-completed', 'status-error', 'status-cancelled');
    card.classList.add('status-' + status);

    // 更新状态标签
    const statusLabelMap = {
      downloading: '下载中',
      completed: '已完成',
      error: '错误',
      cancelled: '已取消'
    };
    const statusEl = card.querySelector('.download-card-status');
    if (statusEl) statusEl.textContent = statusLabelMap[status] || status;

    // 更新百分比
    const mainPercent = Math.round(Math.min(100, Math.max(0, task.percent || 0)));
    const mainFill = card.querySelector('.download-card-main-bar-fill');
    if (mainFill) mainFill.style.width = mainPercent + '%';
    const mainPercentText = card.querySelector('.download-card-main-percent');
    if (mainPercentText) mainPercentText.textContent = mainPercent + '%';

    // 更新副标题
    const subtitle = card.querySelector('.download-card-subtitle');
    if (subtitle) subtitle.textContent = task.subtitle;

    // 更新速度和剩余时间（非下载中状态时清空）
    const speedEl = card.querySelector('.download-card-speed');
    const etaEl = card.querySelector('.download-card-eta');
    if (status === 'downloading') {
      if (speedEl) speedEl.textContent = task.speed || '—';
      if (etaEl) etaEl.textContent = task.eta || '—';
    } else {
      if (speedEl) speedEl.textContent = '—';
      if (etaEl) etaEl.textContent = '—';
    }

    // 更新底部按钮文字
    const actionBtn = card.querySelector('[data-action="cancel"]');
    if (actionBtn) {
      actionBtn.textContent = status === 'downloading' ? '取消下载' : '移除';
    }

    this.updateFloatingBadge();
  },

  // 移除单个卡片
  removeDownloadCard(taskId) {
    delete this.state.downloadTasks[taskId];
    const card = document.querySelector(`.download-card[data-task-id="${taskId}"]`);
    if (card) {
      card.style.opacity = '0';
      card.style.transition = 'opacity 0.3s ease, max-height 0.3s ease, margin 0.3s ease';
      setTimeout(() => card.remove(), 300);
    }
    // 如果没有任务了，重新显示空状态
    setTimeout(() => {
      if (Object.keys(this.state.downloadTasks).length === 0) {
        const emptyState = document.getElementById('downloadEmptyState');
        if (emptyState) emptyState.style.display = '';
      }
    }, 350);
    this.updateFloatingBadge();
  },

  // 清空已完成的任务
  clearCompletedTasks() {
    const tasks = this.state.downloadTasks;
    const toRemove = Object.keys(tasks).filter(id => tasks[id].status !== 'downloading');
    if (toRemove.length === 0) {
      if (typeof app !== 'undefined' && app.showToast) {
        app.showToast('没有已完成的任务', 'info');
      }
      return;
    }
    toRemove.forEach(id => this.removeDownloadCard(id));
    if (typeof app !== 'undefined' && app.showToast) {
      app.showToast(`已清除 ${toRemove.length} 个任务`, 'success');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  download.init();
});
