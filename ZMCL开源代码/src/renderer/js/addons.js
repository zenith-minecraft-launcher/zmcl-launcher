// ===================== 模组 / 资源包 / 光影 / 数据包 / 世界下载 =====================

const addons = {
  currentProject: null,
  currentType: null,
  currentSource: 'modrinth',

  // 当前搜索状态（用于分页）
  pageSize: 20,
  paginationState: {}, // { [type]: { query, source, gameVersion, loader, offset, totalHits } }

  // 是否从 MC百科获取中文信息（默认开启）
  enableChineseInfo: true,

  // IME 组合态：中文输入法输入中不立即触发搜索
  _isComposing: false,

  // 动态获取的 MC 版本列表
  commonVersions: [],

  // 后备版本列表（当无法获取动态版本时使用）
  fallbackVersions: [
    // 1.21.x 系列
    '1.21.4', '1.21.3', '1.21.1', '1.21',
    // 1.20.x 系列
    '1.20.6', '1.20.5', '1.20.4', '1.20.3', '1.20.2', '1.20.1', '1.20',
    // 1.19.x 系列
    '1.19.4', '1.19.3', '1.19.2', '1.19.1', '1.19',
    // 1.18.x 系列
    '1.18.2', '1.18.1', '1.18',
    // 1.17.x 系列
    '1.17.1', '1.17',
    // 1.16.x 系列
    '1.16.5', '1.16.4', '1.16.3', '1.16.2', '1.16.1', '1.16',
    // 1.15.x 系列
    '1.15.2', '1.15.1', '1.15',
    // 1.14.x 系列
    '1.14.4', '1.14.3', '1.14.2', '1.14.1', '1.14',
    // 1.13.x 系列
    '1.13.2', '1.13.1', '1.13',
    // 1.12.x 系列
    '1.12.2', '1.12.1', '1.12',
    // 1.11.x 系列
    '1.11.2', '1.11.1', '1.11',
    // 1.10.x 系列
    '1.10.2', '1.10.1', '1.10',
    // 1.9.x 系列
    '1.9.4', '1.9.3', '1.9.2', '1.9.1', '1.9',
    // 1.8.x 系列
    '1.8.9', '1.8.8', '1.8.7', '1.8.6', '1.8.5', '1.8.4', '1.8.3', '1.8.2', '1.8.1', '1.8',
    // 1.7.x 系列
    '1.7.10', '1.7.9', '1.7.8', '1.7.7', '1.7.6', '1.7.5', '1.7.4', '1.7.3', '1.7.2', '1.7.1', '1.7',
    // 1.6.x 系列
    '1.6.4', '1.6.3', '1.6.2', '1.6.1', '1.6',
    // 1.5.x 系列
    '1.5.2', '1.5.1', '1.5',
    // 1.4.x 系列
    '1.4.7', '1.4.6', '1.4.5', '1.4.4', '1.4.3', '1.4.2', '1.4.1', '1.4',
    // 1.3.x 系列
    '1.3.2', '1.3.1', '1.3',
    // 1.2.x 系列
    '1.2.5', '1.2.4', '1.2.3', '1.2.2', '1.2.1', '1.2',
    // 1.1.x 系列
    '1.1', '1.1.1', '1.1.2',
    // 1.0.x 系列
    '1.0', '1.0.1'
  ],

  // 从搜索页面传递的筛选条件
  incomingFilters: {
    gameVersion: '',
    loader: ''
  },

  // 当前版本列表（用于筛选）
  currentVersions: [],

  // 当前项目详情和中文信息（用于筛选后重新渲染版本列表）
  currentProjectData: null,
  currentZhInfo: null,

  /**
   * 根据命名规则模板生成文件名
   * 模板变量：{name} - 译名或项目名, {slug} - 项目英文, {version} - 版本号
   * 默认模板: "[{name}] {slug}-{version}"
   * @param {string} ruleTemplate - 命名规则模板
   * @param {Object} project - 项目对象 (含 title, slug)
   * @param {Object} ver - 版本对象 (含 versionNumber, name)
   * @param {string} defaultFileName - 默认文件名（模板无效时回退）
   * @param {Object|null} zhInfo - 可选的中文信息对象 (含 titleZh)
   */
  generateFileName(ruleTemplate, project, ver, defaultFileName, zhInfo) {
    if (!ruleTemplate) return defaultFileName;

    // 优先使用中文译名；其次使用项目 title；最后使用 slug
    const name = (zhInfo && zhInfo.titleZh)
      || (project && (project.titleZh || project.nameZh))
      || (project && project.title)
      || (project && project.name)
      || '';
    const slug = (project && project.slug) || '';
    // 优先使用干净的版本号；回退到版本名称
    const version = (ver && (ver.versionNumber || ver.version))
      || (ver && ver.name)
      || '';

    // 如果模板中没有任何变量，直接返回原始文件名（防止直接使用示例文本）
    if (!ruleTemplate.includes('{')) {
      return defaultFileName;
    }

    let result = ruleTemplate
      .replace(/\{name\}/g, name)
      .replace(/\{slug\}/g, slug)
      .replace(/\{version\}/g, version)
      .trim();

    // 去除文件名中的非法字符（Windows/macOS/Linux）
    result = result.replace(/[\\/:*?"<>|]/g, '_').trim();

    // 如果 name 和 slug 都为空，说明数据未加载好，回退到默认文件名
    if (!name && !slug) {
      return defaultFileName;
    }

    // 保留原始文件扩展名
    if (defaultFileName && defaultFileName.includes('.')) {
      const ext = defaultFileName.substring(defaultFileName.lastIndexOf('.'));
      const hasExtAlready = /\.(jar|zip|mrpack|datapack|shader)$/i.test(result);
      if (!hasExtAlready) {
        result = result + ext;
      }
    }

    return result || defaultFileName;
  },

  async init() {
    await this.populateVersionFilters();
    this.bindSubTabs();
    this.bindSearchButtons();
    this.bindAddonProgress();
    this.bindAddonModal();
    this.bindCancelButton();

    // 页面加载后，自动在模组 tab 触发一次默认搜索（展示热门模组）
    setTimeout(() => {
      const defaultLayout = document.querySelector('.addon-layout[data-addon-type="mod"]');
      if (defaultLayout) {
        this.runSearch('mod', { query: '', source: 'modrinth', gameVersion: '', loader: '' }, defaultLayout, 0);
      }
    }, 300);
  },



  // 从 Minecraft 版本清单中提取所有 release 版本
  async fetchCommonVersions() {
    try {
      // 如果已经获取过版本列表，直接返回
      if (this.commonVersions.length > 0) {
        return this.commonVersions;
      }

      // 尝试从版本清单获取
      if (typeof zenith !== 'undefined' && zenith.download && zenith.download.getManifest) {
        const manifest = await zenith.download.getManifest();
        if (manifest && Array.isArray(manifest.versions)) {
          // 提取所有 release 类型的版本
          const releaseVersions = manifest.versions
            .filter(v => v.type === 'release')
            .map(v => v.id);

          // 按版本号排序（从新到旧）
          releaseVersions.sort((a, b) => this.compareVersions(b, a));

          // 去重并保存
          this.commonVersions = [...new Set(releaseVersions)];
          console.log('[Addons] 动态获取到', this.commonVersions.length, '个 Minecraft 版本');
          return this.commonVersions;
        }
      }
    } catch (e) {
      console.warn('[Addons] 动态获取版本列表失败，使用后备列表:', e.message);
    }

    // 使用后备列表
    this.commonVersions = [...this.fallbackVersions];
    return this.commonVersions;
  },

  // 版本号比较函数（用于排序）
  compareVersions(a, b) {
    const parseVer = (v) => v.split('.').map(n => parseInt(n) || 0);
    const va = parseVer(a);
    const vb = parseVer(b);
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const diff = (va[i] || 0) - (vb[i] || 0);
      if (diff !== 0) return diff;
    }
    return 0;
  },

  async populateVersionFilters() {
    // 先获取版本列表
    await this.fetchCommonVersions();

    document.querySelectorAll('.addon-version-filter').forEach((select) => {
      if (select.dataset.populated) return;

      // 清空现有选项（保留"全部 MC 版本"选项）
      const firstOption = select.querySelector('option[value=""]');
      select.innerHTML = '';
      if (firstOption) {
        select.appendChild(firstOption);
      } else {
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '全部 MC 版本';
        select.appendChild(defaultOpt);
      }

      // 添加版本选项
      this.commonVersions.forEach((ver) => {
        const opt = document.createElement('option');
        opt.value = ver;
        opt.textContent = ver;
        select.appendChild(opt);
      });
      select.dataset.populated = '1';
    });
  },

  // 切换下载页面的子 Tab
  bindSubTabs() {
    const buttons = document.querySelectorAll('.subtab-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.subtab;
        buttons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const panes = document.querySelectorAll('.download-subtab-pane');
        panes.forEach((p) => p.classList.remove('active'));
        const activePane = document.querySelector(`.download-subtab-pane[data-subtab-pane="${target}"]`);
        if (activePane) activePane.classList.add('active');

        // 切换到某个 tab 时，如果还没搜索过，自动触发一次空搜索（展示热门）
        if (activePane) {
          const layout = activePane.querySelector('.addon-layout');
          if (layout && !layout.dataset.searched) {
            const type = layout.dataset.addonType;
            this.runSearch(type, { query: '', source: 'modrinth', gameVersion: '', loader: '' }, layout, 0);
          }
        }
      });
    });
  },

  // 绑定每个面板的搜索按钮
  bindSearchButtons() {
    const buttons = document.querySelectorAll('.btn-search-addon');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const layout = btn.closest('.addon-layout');
        if (!layout) return;
        const type = layout.dataset.addonType;
        const input = layout.querySelector('.addon-search-input');
        const sourceFilter = layout.querySelector('.addon-source-filter');
        const versionFilter = layout.querySelector('.addon-version-filter');
        const loaderFilter = layout.querySelector('.addon-loader-filter');

        const query = input ? input.value.trim() : '';
        const source = sourceFilter ? sourceFilter.value || 'modrinth' : 'modrinth';
        const gameVersion = versionFilter ? versionFilter.value : '';
        const loader = loaderFilter ? loaderFilter.value : '';

        this.runSearch(type, { query, source, gameVersion, loader }, layout, 0);
      });
    });

    // 允许回车直接搜索
    document.querySelectorAll('.addon-search-input').forEach((input) => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const layout = input.closest('.addon-layout');
          if (!layout) return;
          const btn = layout.querySelector('.btn-search-addon');
          if (btn) btn.click();
        }
      });
    });
  },

  // 统一搜索接口（带分页）
  async runSearch(type, filters, layout, offset = 0) {
    const resultsContainer = layout.querySelector('.addon-results');
    if (!resultsContainer) return;

    this.currentType = type;
    this.currentSource = filters.source || 'modrinth';

    // 记录分页状态
    this.paginationState[type] = {
      query: filters.query,
      source: filters.source,
      gameVersion: filters.gameVersion,
      loader: filters.loader,
      offset,
      totalHits: 0
    };

    layout.dataset.searched = '1';

    // 搜索中：展示加载动画，并清空分页栏
    resultsContainer.innerHTML = '<div class="loading-spinner">正在搜索，这可能需要几秒...</div>';
    // 清除所有旧的分页组件（使用 querySelectorAll 确保删除所有）
    layout.querySelectorAll('.addon-pagination').forEach(el => el.remove());

    try {
      // 使用带中文信息的搜索（从 MC百科获取模组中文名称）
      const response = await zenith.addon.searchTranslate({
        type,
        query: filters.query,
        source: filters.source,
        gameVersion: filters.gameVersion,
        loader: filters.loader,
        limit: this.pageSize,
        offset,
        translate: !!this.enableChineseInfo
      });

      const items = response && response.items ? response.items : [];
      const totalHits = Number(response.totalHits != null ? response.totalHits : (items.length >= this.pageSize ? items.length + 1 : items.length));

      // 更新分页状态的 totalHits
      if (this.paginationState[type]) {
        this.paginationState[type].totalHits = totalHits;
      }

      if (!items.length) {
        const strategies = response.strategies || {};
        const strategiesText = Object.entries(strategies).map(([k, v]) => `${k}:${v}`).join(', ');
        resultsContainer.innerHTML = `
          <div class="addon-empty">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon-hint">
              <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 10-.7.7l.27.28v.79l5 5 1.5-1.5-5-5zm-6 0A4.5 4.5 0 1114 9.5 4.5 4.5 0 019.5 14.5z" fill="currentColor"/>
            </svg>
            <h3>未找到相关内容</h3>
            <p>可尝试：更换关键词、切换到"全部源"、或移除版本/加载器过滤条件</p>
            ${strategiesText ? `<p style="color:var(--text-muted);font-size:12px;margin-top:8px;">搜索策略: ${this.escape(strategiesText)}</p>` : ''}
          </div>
        `;
        return;
      }

      // 获取当前选中的加载器筛选
      const loaderFilterEl = layout.querySelector('.addon-loader-filter');
      const selectedLoader = loaderFilterEl ? loaderFilterEl.value : '';

      // 渲染卡片列表（支持中文翻译：titleZh / descriptionZh）
      let html = '<div class="addon-list">';
      items.forEach((item) => {
        // Forge 筛选时，隐藏 Fabric API
        if (selectedLoader === 'forge' && this.isFabricApi(item)) {
          return;
        }
        const source = item.source || this.currentSource;
        const iconUrl = item.iconUrl || '';
        const iconHtml = iconUrl
          ? `<img src="${iconUrl}" alt="" onerror="this.style.display='none'"/>`
          : `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon-hint"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16z" fill="currentColor"/></svg>`;

        // 中文翻译显示：优先 titleZh/descriptionZh
        const rawTitle = item.title || item.slug || 'Unknown';
        const rawDesc = item.description || '';
        const showTitle = item.titleZh
          ? `<span class="addon-title-zh">${this.escape(item.titleZh)}</span><span class="addon-title-en">${this.escape(rawTitle)}</span>`
          : this.escape(rawTitle);
        const showDesc = item.descriptionZh
          ? `<span class="addon-desc-zh">${this.escape(item.descriptionZh)}</span>${rawDesc ? `<span class="addon-desc-en">${this.escape(rawDesc)}</span>` : ''}`
          : this.escape(rawDesc);

        const categories = (item.displayCategories || item.categories || []).slice(0, 4);
        const categoryTags = categories.map((c) => `<span class="addon-tag">${this.escape(c)}</span>`).join('');

        const gameVersions = (item.gameVersions || []).slice(0, 3);
        const gameVerTags = gameVersions.map((v) => `<span class="addon-tag addon-tag-version">${this.escape(v)}</span>`).join('');

        const loaders = (item.loaders || []).slice(0, 3);
        const loaderTags = loaders.map((l) => `<span class="addon-tag addon-tag-loader">${this.escape(l)}</span>`).join('');

        const downloadCount = item.downloads ? this.formatNumber(item.downloads) : '0';
        const sourceBadge = source
          ? `<span class="addon-tag" style="background:rgba(126,91,255,.12);color:#7e5bff;">${this.escape(source)}</span>`
          : '';

        html += `
          <div class="addon-card" data-project-id="${item.projectId || ''}" data-project-slug="${item.slug || ''}" data-source="${source}">
            <div class="addon-icon">${iconHtml}</div>
            <div class="addon-info">
              <div class="addon-title">${showTitle}</div>
              <div class="addon-desc">${showDesc}</div>
              <div class="addon-tags">
                ${sourceBadge}
                ${categoryTags}
                ${gameVerTags}
                ${loaderTags}
              </div>
            </div>
            <div class="addon-stats">
              <div class="addon-stat">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon-small">
                  <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm4.5 13.5l-3-2.2V6a1.5 1.5 0 10-3 0v6.3L7.5 16a1.4 1.4 0 00-.5 1.1c.2.7 1 1 1.6.7l3.4-2.6 3.4 2.6c.6.4 1.4.1 1.6-.7.2-.6 0-1.2-.5-1.1z" fill="currentColor"/>
                </svg>
                <span>${downloadCount}</span>
              </div>
              <button class="btn btn-primary btn-small">查看</button>
            </div>
          </div>
        `;
      });
      html += '</div>';
      resultsContainer.innerHTML = html;

      // 渲染分页控件（在结果下方）
      const paginationHtml = this.buildPaginationHtml(type, totalHits, offset);
      if (paginationHtml) {
        const paginationWrapper = document.createElement('div');
        paginationWrapper.className = 'addon-pagination';
        paginationWrapper.innerHTML = paginationHtml;
        layout.appendChild(paginationWrapper);

        // 绑定分页按钮事件
        paginationWrapper.querySelectorAll('[data-page-action]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const action = btn.dataset.pageAction;
            const state = this.paginationState[type];
            if (!state) return;

            let newOffset = offset;
            const currentPage = Math.floor(offset / this.pageSize);
            const totalPages = Math.max(1, Math.ceil(totalHits / this.pageSize));

            if (action === 'first') newOffset = 0;
            else if (action === 'prev') newOffset = Math.max(0, offset - this.pageSize);
            else if (action === 'next') newOffset = Math.min((totalPages - 1) * this.pageSize, offset + this.pageSize);
            else if (action === 'last') newOffset = (totalPages - 1) * this.pageSize;
            else if (action === 'page') {
              const pageNum = Number(btn.dataset.pageNum);
              if (!isNaN(pageNum) && pageNum >= 0 && pageNum < totalPages) {
                newOffset = pageNum * this.pageSize;
              }
            }

            if (newOffset !== offset) {
              this.runSearch(
                type,
                { query: state.query, source: state.source, gameVersion: state.gameVersion, loader: state.loader },
                layout,
                newOffset
              );
              // 滚动到搜索结果顶部
              layout.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          });
        });
      }

      // 绑定卡片点击事件
      resultsContainer.querySelectorAll('.addon-card').forEach((card) => {
        card.addEventListener('click', () => {
          const projectId = card.dataset.projectId || card.dataset.projectSlug;
          const source = card.dataset.source || this.currentSource;

          // 保存当前搜索页面的筛选条件，以便传递到下载详情页
          const layout = card.closest('.addon-layout');
          if (layout) {
            const versionFilter = layout.querySelector('.addon-version-filter');
            const loaderFilter = layout.querySelector('.addon-loader-filter');

            this.incomingFilters.gameVersion = versionFilter ? versionFilter.value : '';
            this.incomingFilters.loader = loaderFilter ? loaderFilter.value : '';
          }

          if (projectId) this.openProjectDetail(projectId, type, source);
        });
      });
    } catch (err) {
      console.error('[Addons] 搜索失败:', err);
      resultsContainer.innerHTML = `
        <div class="addon-empty">
          <h3>搜索失败</h3>
          <p>${this.escape(err.message || '未知错误')}</p>
          <p style="color:var(--text-muted);font-size:12px;margin-top:8px;">可尝试切换下载源或稍后重试</p>
        </div>
      `;
    }
  },

  // 构造分页 HTML（带页码按钮 + 上一页/下一页）
  buildPaginationHtml(type, totalHits, offset) {
    if (!totalHits || totalHits <= this.pageSize) return '';
    const currentPage = Math.floor(offset / this.pageSize);
    const totalPages = Math.max(1, Math.ceil(totalHits / this.pageSize));
    const startItem = offset + 1;
    const endItem = Math.min(offset + this.pageSize, totalHits);

    // 生成页码：当前页 ± 2，并在首尾保留边界
    const windowSize = 2;
    const pages = [];
    let start = Math.max(0, currentPage - windowSize);
    const end = Math.min(totalPages - 1, currentPage + windowSize);

    // 第一页省略号
    if (start > 1) pages.push(-1);
    if (start > 0) pages.push(0);

    for (let p = start; p <= end; p++) {
      pages.push(p);
    }

    // 最后一页省略号
    if (end < totalPages - 2) pages.push(-2);
    if (end < totalPages - 1) pages.push(totalPages - 1);

    let pageButtons = '';
    for (const page of pages) {
      if (page < 0) {
        pageButtons += `<span class="pagination-ellipsis">...</span>`;
      } else if (page === currentPage) {
        pageButtons += `<button class="pagination-btn active" disabled>${page + 1}</button>`;
      } else {
        pageButtons += `<button class="pagination-btn" data-page-action="page" data-page-num="${page}">${page + 1}</button>`;
      }
    }

    return `
      <div class="pagination-info">
        显示 <span class="pagination-highlight">${startItem}</span> - <span class="pagination-highlight">${endItem}</span>
        条，共 <span class="pagination-highlight">${totalHits}</span> 条结果
        （<span class="pagination-highlight">${currentPage + 1}</span> / ${totalPages} 页）
      </div>
      <div class="pagination-controls">
        <button class="pagination-btn" data-page-action="first" ${currentPage === 0 ? 'disabled' : ''}>« 首页</button>
        <button class="pagination-btn" data-page-action="prev" ${currentPage === 0 ? 'disabled' : ''}>‹ 上一页</button>
        ${pageButtons}
        <button class="pagination-btn" data-page-action="next" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>下一页 ›</button>
        <button class="pagination-btn" data-page-action="last" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>末页 »</button>
      </div>
    `;
  },

  // 打开项目详情弹窗
  async openProjectDetail(projectId, type, source) {
    this.currentProject = projectId;
    this.currentType = type;
    this.currentSource = source || 'modrinth';

    const modal = document.getElementById('addonDetailModal');
    if (!modal) return;

    modal.classList.remove('hidden');
    const titleEl = document.getElementById('addonDetailTitle');
    const authorEl = document.getElementById('addonDetailAuthor');
    const downloadsEl = document.getElementById('addonDetailDownloads');
    const descEl = document.getElementById('addonDetailDescription');
    const versionsEl = document.getElementById('addonVersionsList');
    const iconEl = document.getElementById('addonDetailIcon');
    const depsEl = document.getElementById('addonDependenciesList');
    const depsSection = document.getElementById('addonDependenciesSection');
    const externalRow = document.getElementById('addonExternalLinks');

    if (titleEl) titleEl.textContent = '加载中...';
    if (authorEl) authorEl.textContent = '';
    if (downloadsEl) downloadsEl.textContent = '';
    if (descEl) descEl.innerHTML = '<div class="loading-spinner">正在加载项目详情...</div>';
    if (versionsEl) versionsEl.innerHTML = '<div class="loading-spinner">加载版本列表中...</div>';
    if (iconEl) iconEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon-hint"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16z" fill="currentColor"/></svg>';
    if (depsEl) depsEl.innerHTML = '<div class="loading-spinner" style="padding:12px;">检查依赖中...</div>';
    if (depsSection) depsSection.style.display = 'none';
    if (externalRow) externalRow.innerHTML = '';

    // 重置筛选器状态
    this.currentVersions = [];

    let project = null;
    try {
      project = await zenith.addon.project(projectId, this.currentSource);
      const safeProject = project || {};

      // 获取中文信息（从本地映射表）
      let zhInfo = null;
      try {
        if (typeof zenith.addon !== 'undefined' && typeof zenith.addon.getChineseInfo === 'function') {
          zhInfo = await zenith.addon.getChineseInfo(safeProject.title, safeProject.slug);
        }
      } catch (e) {
        zhInfo = null;
      }

      // 保存项目详情和中文信息，供版本筛选后重渲染
      this.currentProjectData = safeProject;
      this.currentZhInfo = zhInfo;

      if (titleEl) {
        if (zhInfo && zhInfo.titleZh) {
          titleEl.innerHTML = `<span>${this.escape(zhInfo.titleZh)}</span> <span style="color:#888;font-weight:normal;font-size:0.85em;">(${this.escape(safeProject.title || safeProject.slug || projectId)})</span>`;
        } else {
          titleEl.textContent = safeProject.title || safeProject.slug || projectId;
        }
      }
      if (authorEl) {
        const authorName = safeProject.author || (safeProject.source ? safeProject.source.toUpperCase() : 'Modrinth');
        authorEl.textContent = authorName;
      }
      if (downloadsEl) {
        downloadsEl.textContent = `${this.formatNumber(safeProject.downloads || 0)} 次下载`;
      }
      if (descEl) {
        if (zhInfo && zhInfo.descriptionZh) {
          descEl.innerHTML = `<div style="margin-bottom:12px;line-height:1.65;">${this.escape(zhInfo.descriptionZh)}</div><div style="color:#888;font-size:0.9em;border-top:1px solid rgba(255,255,255,0.08);padding-top:12px;">${this.escape(safeProject.description || '(暂无描述)')}</div>`;
        } else {
          descEl.textContent = safeProject.description || '(暂无描述)';
        }
      }
      if (iconEl && safeProject.iconUrl) {
        iconEl.innerHTML = `<img src="${safeProject.iconUrl}" alt="" onerror="this.style.display='none'"/>`;
      }

      // 外部跳转：Modrinth / CurseForge
      if (externalRow) {
        const modrinthUrl = (safeProject.source === 'modrinth' || source === 'modrinth')
          ? (safeProject.projectUrl || (safeProject.slug ? `https://modrinth.com/${safeProject.projectType || 'mod'}/${safeProject.slug}` : null))
          : null;
        const curseforgeUrl = (safeProject.source === 'curseforge' || source === 'curseforge')
          ? (safeProject.projectUrl || (safeProject.slug ? `https://www.curseforge.com/minecraft/mc-mods/${safeProject.slug}` : null))
          : null;
        const both = (safeProject.source === 'both' || safeProject.source === 'all' || source === 'all');

        const buttons = [];
        if (modrinthUrl || both) {
          const url = modrinthUrl || (safeProject.slug ? `https://modrinth.com/mod/${safeProject.slug}` : null);
          if (url) buttons.push(`<a href="#" class="btn btn-small btn-secondary" data-open-url="${url}">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon-small"><path d="M14 3v2h3.59L8 14.59 9.41 16 19 6.41V10h2V3h-7zm-4 6.41L14.59 19H12v2H4v-2h2l-.41-1 4.41-8.59z" fill="currentColor"/></svg>
            <span>在 Modrinth 查看</span>
          </a>`);
        }
        if (curseforgeUrl || both) {
          const url = curseforgeUrl || (safeProject.slug ? `https://www.curseforge.com/minecraft/mc-mods/${safeProject.slug}` : null);
          if (url) buttons.push(`<a href="#" class="btn btn-small btn-secondary" data-open-url="${url}">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon-small"><path d="M14 3v2h3.59L8 14.59 9.41 16 19 6.41V10h2V3h-7zm-4 6.41L14.59 19H12v2H4v-2h2l-.41-1 4.41-8.59z" fill="currentColor"/></svg>
            <span>在 CurseForge 查看</span>
          </a>`);
        }
        externalRow.innerHTML = buttons.join('');
        externalRow.querySelectorAll('[data-open-url]').forEach((a) => {
          a.addEventListener('click', (ev) => {
            ev.preventDefault();
            const url = a.dataset.openUrl;
            if (url && zenith.system && zenith.system.openExternal) {
              zenith.system.openExternal(url);
            }
          });
        });
      }

      // 加载版本 + 从版本聚合依赖（依赖卡片会在版本列表前面渲染）
      let versionsForDeps = null;
      if (versionsEl) {
        try {
          const versions = await zenith.addon.versions(projectId, this.currentSource, {});
          if (!versions || versions.length === 0) {
            versionsEl.innerHTML = '<div class="addon-empty" style="padding:16px;">该项目没有可下载的版本</div>';
          } else {
            versionsForDeps = versions;
            // 保存版本列表用于筛选
            this.currentVersions = versions;

            // 初始化筛选器
            this.initVersionFilters(versions);

            // 渲染版本列表（应用筛选 + 中文信息）
            this.renderVersionList(versions, safeProject, type, projectId, zhInfo);
          }
        } catch (verErr) {
          console.error('[Addons] 加载版本列表失败:', verErr);
          versionsEl.innerHTML = `<div class="addon-empty" style="padding:16px;">加载版本列表失败: ${this.escape(verErr.message || '未知错误')}</div>`;
        }
      }

      // 聚合依赖：优先从版本层聚合（更准确），否则回退到项目本身的 dependencies
      if (depsEl && depsSection) {
        let rawDeps = null;
        if (versionsForDeps && versionsForDeps.length > 0) {
          // 从所有版本聚合依赖：每个版本可能声明不同的依赖
          const seen = new Set();
          const merged = [];
          for (const ver of versionsForDeps) {
            if (Array.isArray(ver.dependencies) && ver.dependencies.length > 0) {
              for (const dep of ver.dependencies) {
                if (!dep || !dep.projectId) continue;
                const key = String(dep.projectId) + '|' + String(dep.dependencyType || '');
                if (seen.has(key)) continue;
                seen.add(key);
                merged.push({ ...dep, source: dep.source || this.currentSource });
              }
            }
          }
          if (merged.length > 0) rawDeps = merged;
        }
        if (!rawDeps && safeProject.dependencies && safeProject.dependencies.length > 0) {
          rawDeps = safeProject.dependencies;
        }
        if (rawDeps) {
          await this.renderDependencies(rawDeps, depsEl, depsSection, type, source || this.currentSource);
        } else {
          depsSection.style.display = 'none';
        }
      }
    } catch (err) {
      console.error('[Addons] 加载项目详情失败:', err);
      if (descEl) descEl.textContent = '加载失败: ' + (err.message || '未知错误');
    }
  },

  // 渲染依赖项（必选/可选）并标记已安装状态
  async renderDependencies(rawDeps, depsEl, depsSection, type, source) {
    if (!Array.isArray(rawDeps) || rawDeps.length === 0) {
      depsSection.style.display = 'none';
      return;
    }
    depsSection.style.display = 'block';
    depsEl.innerHTML = '<div class="loading-spinner" style="padding:10px;">解析依赖信息中...</div>';

    try {
      // 给每个依赖带上 source，让后端能正确路由到对应源
      const enriched = rawDeps.map((d) => ({ ...d, source: d.source || source || 'modrinth' }));
      const details = await zenith.addon.resolveDependencies(enriched, { type });
      if (!details || details.length === 0) {
        depsEl.innerHTML = '<div class="addon-empty" style="padding:12px;">暂无依赖信息</div>';
        return;
      }

      // 获取当前选中的加载器筛选
      const loaderSelect = document.getElementById('addonFilterLoader');
      const selectedLoader = loaderSelect ? loaderSelect.value : '';

      // Forge 筛选时，过滤掉 Fabric API
      const filteredDetails = selectedLoader === 'forge'
        ? details.filter((d) => !this.isFabricApi(d))
        : details;

      const required = filteredDetails.filter((d) => String(d.dependencyType || '').toLowerCase() === 'required');
      const optional = filteredDetails.filter((d) => String(d.dependencyType || '').toLowerCase() === 'optional');
      const embedded = filteredDetails.filter((d) => String(d.dependencyType || '').toLowerCase() === 'embedded');
      const other = filteredDetails.filter((d) => !['required', 'optional', 'embedded'].includes(String(d.dependencyType || '').toLowerCase()));

      const renderGroup = (title, items, style) => {
        if (!items || items.length === 0) return '';
        const itemsHtml = items.map((d) => {
          const installed = !!d.installed;
          const enabled = !!d.enabled;
          const depSource = d.source || 'modrinth';
          const depTitle = d.title || d.projectId;
          const iconHtml = d.iconUrl
            ? `<img src="${d.iconUrl}" alt="" onerror="this.style.display='none'"/>`
            : `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon-small"><path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" fill="currentColor"/></svg>`;
          const statusBadge = installed
            ? (enabled
              ? `<span class="addon-tag addon-dep-status installed-enabled">已启用</span>`
              : `<span class="addon-tag addon-dep-status installed-disabled">已安装 · 禁用中</span>`)
            : `<span class="addon-tag addon-dep-status missing">未安装</span>`;

          const depTypeLabel = (() => {
            const t = String(d.dependencyType || '').toLowerCase();
            if (t === 'required') return '必选';
            if (t === 'optional') return '可选';
            if (t === 'embedded') return '内嵌';
            return d.dependencyType || 'unknown';
          })();

          const downloadCountBadge = d.downloads
            ? `<span class="addon-tag addon-dep-meta-tag">↓ ${this.formatNumber(d.downloads)}</span>`
            : '';

          const actionLabel = installed
            ? (enabled ? '查看详情 →' : '查看详情 →')
            : '前往下载 →';

          // 整卡可点击：data-dep-card 标记，携带 projectId 和 source
          const cardAttrs = `data-dep-card="1" data-dep-project-id="${d.projectId}" data-dep-source="${depSource}" data-dep-title="${this.escape(depTitle)}"`;

          return `
            <div class="addon-dep-card ${installed ? (enabled ? 'dep-installed' : 'dep-disabled') : 'dep-missing'}" ${cardAttrs}>
              <div class="addon-dep-card-icon">${iconHtml}</div>
              <div class="addon-dep-card-body">
                <div class="addon-dep-card-title">
                  ${this.escape(depTitle)}
                  <span class="addon-dep-type-tag">${this.escape(depTypeLabel)}</span>
                </div>
                <div class="addon-dep-card-meta">
                  ${statusBadge}
                  ${downloadCountBadge}
                </div>
              </div>
              <div class="addon-dep-card-action">
                <span class="addon-dep-card-action-label">${actionLabel}</span>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon-small addon-dep-card-chevron"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
            </div>
          `;
        }).join('');
        return `<div class="addon-dep-group"><div class="addon-dep-group-title" style="${style || ''}">${this.escape(title)}</div><div class="addon-dep-cards-wrapper">${itemsHtml}</div></div>`;
      };

      let html = '';
      html += renderGroup('必选依赖（必须安装，否则下载将被阻断）', required, 'color:#ff8080;');
      html += renderGroup('可选依赖（非必须，提供额外功能）', optional, 'color:#7ec7ff;');
      html += renderGroup('内嵌 / 捆绑', embedded, 'color:#b78bff;');
      html += renderGroup('其他依赖', other, 'color:#e0e0e0;');

      if (required.length === 0 && optional.length === 0 && embedded.length === 0 && other.length === 0) {
        depsEl.innerHTML = '<div class="addon-empty" style="padding:12px;">该项目未声明任何依赖</div>';
      } else {
        depsEl.innerHTML = html;

        // 整张依赖卡片点击：跳转到依赖项的下载界面
        depsEl.querySelectorAll('[data-dep-card]').forEach((card) => {
          card.addEventListener('click', (ev) => {
            const pid = card.dataset.depProjectId;
            const src = card.dataset.depSource || 'modrinth';
            const title = card.dataset.depTitle || '';
            if (!pid) return;
            // 显示提示并跳转
            if (typeof app !== 'undefined' && app.showToast) {
              app.showToast(`即将打开「${title}」的下载页面`, 'info');
            }
            this.openProjectDetail(pid, type, src);
          });
        });
      }
    } catch (e) {
      console.error('[Addons] 解析依赖失败:', e);
      depsEl.innerHTML = `<div class="addon-empty" style="padding:12px;">解析依赖失败: ${this.escape(e.message || '未知错误')}</div>`;
    }
  },

  // 下载并安装一个项目版本（含必选依赖检测）
  async downloadVersion(options, buttonEl) {
    const progressEl = document.getElementById('addonDownloadProgress');
    const progressStageEl = document.getElementById('addonProgressStage');
    const progressPercentEl = document.getElementById('addonProgressPercent');
    const progressFillEl = document.getElementById('addonProgressFill');

    // --- 依赖检测（如声明了 dependencies）---
    const rawDeps = options.dependencies;
    if (Array.isArray(rawDeps) && rawDeps.length > 0) {
      try {
        const enriched = rawDeps.map((d) => ({ ...d, source: d.source || options.source || this.currentSource }));
        const details = await zenith.addon.resolveDependencies(enriched, { type: options.type });
        const required = (details || []).filter((d) =>
          String(d.dependencyType || '').toLowerCase() === 'required'
        );
        const missing = required.filter((d) => !d.installed);
        if (missing.length > 0) {
          const list = missing.map((d) => `• ${d.title || d.projectId}`).join('\n');
          const message =
            `安装「${options.projectTitle}」前，必须先安装以下依赖：\n\n${list}\n\n` +
            `是否立即跳转到第一个缺失的依赖并安装？（安装完后再返回此项目下载）`;
          if (window.confirm(message)) {
            const first = missing[0];
            this.openProjectDetail(first.projectId, options.type, first.source || this.currentSource);
            if (typeof app !== 'undefined' && app.showToast) {
              app.showToast('请先下载前置依赖，完成后再返回下载本模组', 'warning');
            }
          } else {
            if (typeof app !== 'undefined' && app.showToast) {
              app.showToast('已取消：缺少必选前置依赖', 'warning');
            }
          }
          return;
        }
      } catch (depErr) {
        console.warn('[Addons] 依赖检测失败，继续直接下载:', depErr);
      }
    }

    if (buttonEl) {
      buttonEl.disabled = true;
      buttonEl.textContent = '下载中...';
    }
    if (progressEl) {
      progressEl.style.display = 'block';
      if (progressStageEl) progressStageEl.textContent = '正在下载...';
      if (progressPercentEl) progressPercentEl.textContent = '0%';
      if (progressFillEl) progressFillEl.style.width = '0%';
      const infoEl = document.getElementById('addonProgressInfo');
      if (infoEl) infoEl.textContent = '';
    }

    try {
      // 版本选择优先级：① 详情页的版本筛选 ② appState 选中版本 ③ 本地已安装版本第一个
      const versionSelect = document.getElementById('addonFilterVersion');
      let versionId = versionSelect && versionSelect.value ? versionSelect.value : null;
      if (!versionId && appState && appState.selectedVersion && appState.selectedVersion.id) {
        versionId = appState.selectedVersion.id;
      }
      if (!versionId && appState && Array.isArray(appState.versions) && appState.versions.length > 0) {
        versionId = appState.versions[0].id;
      }
      if (!versionId) {
        if (typeof app !== 'undefined' && app.showToast) {
          app.showToast('请先在"启动"页下载并选择一个 Minecraft 版本，再回到这里下载模组', 'warning');
        }
        if (buttonEl) {
          buttonEl.disabled = false;
          buttonEl.textContent = '重试';
        }
        if (progressStageEl) progressStageEl.textContent = '错误：未选择 Minecraft 版本';
        return;
      }

      console.log('[Addons] 开始下载:', options.projectTitle, '→ 版本', versionId);

      // 先弹出"选择保存文件夹"对话框，默认定位到对应类型目录（mods/resourcepacks/...）
      const selectedDir = await zenith.addon.selectInstallDir({
        type: options.type,
        versionId: versionId
      });
      if (!selectedDir) {
        // 用户取消了选择
        if (buttonEl) {
          buttonEl.disabled = false;
          buttonEl.textContent = '下载';
        }
        if (progressEl) progressEl.style.display = 'none';
        if (typeof app !== 'undefined' && app.showToast) {
          app.showToast('已取消下载', 'info');
        }
        return;
      }

      const result = await zenith.addon.download({
        type: options.type,
        projectTitle: options.projectTitle,
        source: options.source,
        versionId: versionId,
        file: options.file,
        targetDir: selectedDir
      });

      if (buttonEl) {
        buttonEl.textContent = '已完成';
        buttonEl.classList.remove('btn-primary');
        buttonEl.classList.add('btn-success');
      }

      if (progressEl && progressStageEl) {
        progressStageEl.textContent = `安装完成！已保存至 ${result.installDir || '相应目录'}`;
        if (progressPercentEl) progressPercentEl.textContent = '100%';
        if (progressFillEl) progressFillEl.style.width = '100%';
        const infoEl = document.getElementById('addonProgressInfo');
        if (infoEl) infoEl.textContent = '';
      }

      if (typeof app !== 'undefined' && app.showToast) {
        app.showToast(`${options.projectTitle} 安装成功`, 'success');
      }

      setTimeout(() => {
        if (buttonEl) {
          buttonEl.disabled = false;
          buttonEl.textContent = '下载';
          buttonEl.classList.remove('btn-success');
          buttonEl.classList.add('btn-primary');
        }
        if (progressEl) progressEl.style.display = 'none';
      }, 3000);
    } catch (err) {
      console.error('[Addons] 下载失败:', err);
      const isCancelled = err && (err.cancelled === true ||
        (err.message && (err.message.includes('cancel') || err.message.includes('取消'))));
      if (buttonEl) {
        buttonEl.disabled = false;
        buttonEl.textContent = isCancelled ? '下载' : '重试';
      }
      if (progressStageEl) progressStageEl.textContent = isCancelled ? '下载已取消' : '下载失败';
      if (typeof app !== 'undefined' && app.showToast) {
        if (isCancelled) {
          app.showToast('下载已取消', 'info');
        } else {
          app.showToast(`下载失败: ${err.message || '未知错误'}`, 'error');
        }
      }
      if (isCancelled && progressEl) {
        progressEl.style.display = 'none';
      }
    }
  },

  // 监听下载进度（主进程 -> 渲染进程）
  bindAddonProgress() {
    if (!window.zenith || !zenith.addon || !zenith.addon.onProgress) return;
    const remove = zenith.addon.onProgress((data) => {
      const progressFillEl = document.getElementById('addonProgressFill');
      const progressPercentEl = document.getElementById('addonProgressPercent');
      const progressStageEl = document.getElementById('addonProgressStage');
      const progressInfoEl = document.getElementById('addonProgressInfo');
      if (typeof data.percent === 'number' && progressFillEl) {
        progressFillEl.style.width = `${data.percent}%`;
        if (progressPercentEl) progressPercentEl.textContent = `${Math.round(data.percent)}%`;
      }
      if (progressStageEl && data.stage) {
        progressStageEl.textContent = data.stage;
      }
      if (progressInfoEl) {
        const parts = [];
        if (data.speedText) parts.push(`速度: ${data.speedText}`);
        if (data.etaText) parts.push(`剩余: ${data.etaText}`);
        if (data.total && data.total > 0) {
          const totalMB = (data.total / (1024 * 1024)).toFixed(1);
          const doneMB = (data.downloaded !== undefined
            ? (data.downloaded / (1024 * 1024)).toFixed(1)
            : '-');
          parts.push(`${doneMB} / ${totalMB} MB`);
        } else if (data.totalBytes !== undefined && data.totalBytes > 0) {
          const totalMB = (data.totalBytes / (1024 * 1024)).toFixed(1);
          const doneMB = (data.downloadedBytes !== undefined
            ? (data.downloadedBytes / (1024 * 1024)).toFixed(1)
            : '-');
          parts.push(`${doneMB} / ${totalMB} MB`);
        }
        progressInfoEl.textContent = parts.join(' · ');
      }
    });
    window.addEventListener('beforeunload', remove);
  },

  // 弹窗通用逻辑
  bindAddonModal() {
    const modal = document.getElementById('addonDetailModal');
    if (!modal) return;
    const overlay = modal.querySelector('.modal-overlay');
    const closeBtn = modal.querySelector('.modal-close');
    if (overlay) overlay.addEventListener('click', () => modal.classList.add('hidden'));
    if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
  },

  // 绑定取消下载按钮
  bindCancelButton() {
    const cancelBtn = document.getElementById('cancelAddonDownloadBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', async () => {
        if (cancelBtn.disabled) return;
        cancelBtn.disabled = true;
        cancelBtn.textContent = '取消中...';
        try {
          await zenith.addon.cancel();
        } catch (e) {
          console.warn('[Addons] 取消失败:', e);
        } finally {
          const progressEl = document.getElementById('addonDownloadProgress');
          if (progressEl) progressEl.style.display = 'none';
          if (typeof app !== 'undefined' && app.showToast) {
            app.showToast('下载已取消', 'info');
          }
          setTimeout(() => {
            if (cancelBtn) {
              cancelBtn.disabled = false;
              cancelBtn.textContent = '取消下载';
            }
          }, 2000);
        }
      });
    }
  },

  // 初始化版本筛选器
  initVersionFilters(versions) {
    const versionSelect = document.getElementById('addonFilterVersion');
    const loaderSelect = document.getElementById('addonFilterLoader');
    const resetBtn = document.getElementById('addonFilterReset');

    if (!versionSelect || !loaderSelect) return;

    // 提取所有唯一的 MC 版本
    const allGameVersions = new Set();
    versions.forEach(v => {
      if (v.gameVersions && Array.isArray(v.gameVersions)) {
        v.gameVersions.forEach(gv => allGameVersions.add(gv));
      }
    });

    // 排序版本（从新到旧）
    const sortedVersions = Array.from(allGameVersions).sort((a, b) => {
      // 简单的版本号比较
      const parseVer = (v) => v.split('.').map(n => parseInt(n) || 0);
      const va = parseVer(a);
      const vb = parseVer(b);
      for (let i = 0; i < Math.max(va.length, vb.length); i++) {
        const diff = (vb[i] || 0) - (va[i] || 0);
        if (diff !== 0) return diff;
      }
      return 0;
    });

    // 填充版本下拉框
    versionSelect.innerHTML = '<option value="">全部 MC 版本</option>';
    sortedVersions.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      versionSelect.appendChild(opt);
    });

    // 应用从搜索页面传递的筛选条件
    if (this.incomingFilters.gameVersion) {
      // 检查该版本是否存在于列表中
      if (sortedVersions.includes(this.incomingFilters.gameVersion)) {
        versionSelect.value = this.incomingFilters.gameVersion;
      }
    }
    if (this.incomingFilters.loader) {
      loaderSelect.value = this.incomingFilters.loader;
    }

    // 绑定筛选器事件
    const applyFilters = () => {
      this.applyVersionFilters();
    };

    versionSelect.onchange = applyFilters;
    loaderSelect.onchange = applyFilters;

    if (resetBtn) {
      resetBtn.onclick = () => {
        versionSelect.value = '';
        loaderSelect.value = '';
        this.incomingFilters.gameVersion = '';
        this.incomingFilters.loader = '';
        this.applyVersionFilters();
      };
    }

    // 如果有传入的筛选条件，立即应用
    if (this.incomingFilters.gameVersion || this.incomingFilters.loader) {
      setTimeout(() => this.applyVersionFilters(), 0);
    }
  },

  // 应用版本筛选
  applyVersionFilters() {
    const versionSelect = document.getElementById('addonFilterVersion');
    const loaderSelect = document.getElementById('addonFilterLoader');

    const selectedVersion = versionSelect ? versionSelect.value : '';
    const selectedLoader = loaderSelect ? loaderSelect.value : '';

    // 筛选版本列表
    let filtered = this.currentVersions;

    if (selectedVersion) {
      filtered = filtered.filter(v =>
        v.gameVersions && v.gameVersions.includes(selectedVersion)
      );
    }

    if (selectedLoader) {
      filtered = filtered.filter(v =>
        v.loaders && v.loaders.some(l =>
          l.toLowerCase() === selectedLoader.toLowerCase()
        )
      );
    }

    // 重新渲染版本列表
    this.renderVersionList(filtered, this.currentProjectData, this.currentType, this.currentProject, this.currentZhInfo);
  },

  // 检查是否为 Fabric API（用于过滤）
  isFabricApi(item) {
    if (!item) return false;
    const title = (item.title || item.slug || '').toLowerCase();
    const slug = (item.slug || '').toLowerCase();
    // 匹配 Fabric API 的各种变体
    return title === 'fabric api' ||
           title === 'fabric-api' ||
           slug === 'fabric-api' ||
           slug === 'fabric-api-1' ||
           (title.includes('fabric') && title.includes('api') && !title.includes('forge'));
  },

  // 渲染版本列表
  async renderVersionList(versions, safeProject, type, projectId, zhInfo) {
    const versionsEl = document.getElementById('addonVersionsList');
    if (!versionsEl) return;

    if (!versions || versions.length === 0) {
      versionsEl.innerHTML = '<div class="addon-empty" style="padding:16px;">没有符合筛选条件的版本</div>';
      return;
    }

    // 获取当前选中的加载器筛选
    const loaderSelect = document.getElementById('addonFilterLoader');
    const selectedLoader = loaderSelect ? loaderSelect.value : '';

    // 获取命名规则配置（仅对 mod 类型生效）
    let namingRule = null;
    try {
      const cfg = await zenith.config.getAll();
      if (cfg && cfg.namingRules && cfg.namingRules.mod) {
        namingRule = cfg.namingRules.mod;
      }
    } catch (e) {
      // 忽略配置错误，使用默认文件名
    }

    // 检查每个版本的依赖状态（用于禁用安装按钮）
    const versionDepStatus = await Promise.all(
      versions.slice(0, 30).map(async (ver) => {
        const deps = ver.dependencies || [];
        if (deps.length === 0) return { hasMissingRequired: false, missingDeps: [] };

        try {
          const enriched = deps.map((d) => ({ ...d, source: d.source || this.currentSource }));
          const details = await zenith.addon.resolveDependencies(enriched, { type });
          const required = details.filter((d) =>
            String(d.dependencyType || '').toLowerCase() === 'required'
          );
          const missing = required.filter((d) => !d.installed);
          return { hasMissingRequired: missing.length > 0, missingDeps: missing };
        } catch (e) {
          return { hasMissingRequired: false, missingDeps: [] };
        }
      })
    );

    let html = '';
    versions.slice(0, 30).forEach((ver, idx) => {
      const primaryFile = ver.primaryFile || (ver.files && ver.files[0]) || null;
      if (!primaryFile) return;

      const gameVerTags = (ver.gameVersions || []).slice(0, 5).map((v) => `<span class="addon-tag addon-tag-version">${this.escape(v)}</span>`).join('');
      const loaderTags = (ver.loaders || []).slice(0, 5).map((l) => `<span class="addon-tag addon-tag-loader">${this.escape(l)}</span>`).join('');
      const fileSize = primaryFile.size ? this.formatBytes(primaryFile.size) : '';
      const projectTitle = (safeProject && (safeProject.title || safeProject.slug)) || projectId;

      // 依赖信息：将 version 的 dependencies 序列化到 data-* 中
      const depsJson = Array.isArray(ver.dependencies) && ver.dependencies.length > 0
        ? this.escape(JSON.stringify(ver.dependencies))
        : '';

      // 根据命名规则生成文件名（仅 mod 类型）
      let displayFileName = primaryFile.fileName || 'file';
      let downloadFileName = primaryFile.fileName || '';
      if (type === 'mod' && namingRule) {
        const generated = this.generateFileName(namingRule, safeProject, ver, primaryFile.fileName || '', zhInfo);
        if (generated) {
          displayFileName = generated;
          downloadFileName = generated;
        }
      }

      // 检查是否有未安装的必选前置
      const depStatus = versionDepStatus[idx] || { hasMissingRequired: false, missingDeps: [] };
      const isDisabled = depStatus.hasMissingRequired;
      const disabledAttr = isDisabled ? 'disabled' : '';
      const buttonClass = isDisabled ? 'btn btn-secondary btn-small btn-download-version' : 'btn btn-primary btn-small btn-download-version';
      const buttonText = isDisabled ? '缺少前置' : '下载';
      const missingDepsTitle = isDisabled
        ? `title="缺少必选前置: ${depStatus.missingDeps.map(d => d.title || d.projectId).join(', ')}"`
        : '';

      html += `
        <div class="addon-version-item">
          <div class="addon-version-info">
            <div class="addon-version-name">${this.escape(ver.name || ver.versionNumber || 'Unknown')}</div>
            <div class="addon-version-meta">
              ${gameVerTags}
              ${loaderTags}
              <span class="addon-version-file">${this.escape(displayFileName)}</span>
              ${fileSize ? `<span class="addon-version-size">${fileSize}</span>` : ''}
              ${depsJson ? `<span class="addon-tag addon-tag-deps" title="该版本声明了依赖">⚠ 含依赖</span>` : ''}
            </div>
          </div>
          <button class="${buttonClass}"
                  ${disabledAttr}
                  ${missingDepsTitle}
                  data-type="${type}"
                  data-source="${this.currentSource}"
                  data-title="${this.escape(projectTitle)}"
                  data-url="${primaryFile.url}"
                  data-filename="${this.escape(downloadFileName)}"
                  data-size="${primaryFile.size || 0}"
                  data-sha1="${primaryFile.sha1 || ''}"
                  data-dependencies="${depsJson}">
            ${buttonText}
          </button>
        </div>
      `;
    });

    if (!html) html = '<div class="addon-empty" style="padding:16px;">没有可用的文件</div>';
    versionsEl.innerHTML = html;

    // 绑定下载按钮事件（带依赖检测）
    versionsEl.querySelectorAll('.btn-download-version:not([disabled])').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.downloadVersion(
          {
            type: btn.dataset.type,
            projectTitle: btn.dataset.title,
            source: btn.dataset.source,
            file: {
              url: btn.dataset.url,
              fileName: btn.dataset.filename,
              size: Number(btn.dataset.size) || 0,
              sha1: btn.dataset.sha1 || ''
            },
            dependencies: btn.dataset.dependencies ? JSON.parse(btn.dataset.dependencies) : null
          },
          btn
        );
      });
    });
  },

  // ---------- 工具函数 ----------
  formatNumber(n) {
    if (n == null) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
  },

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let v = bytes;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i += 1;
    }
    return `${v.toFixed(1)} ${units[i]}`;
  },

  escape(text) {
    if (text == null) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  addons.init();
});
