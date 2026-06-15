const mods = {
  currentType: 'mod',
  cachedItems: {}, // { versionId: { mod: [...], resourcepack: [...], ... } }
  searchQuery: '',
  selectedVersion: null,

  typeLabels: {
    mod: '模组',
    resourcepack: '资源包',
    shaderpack: '光影',
    datapack: '数据包'
  },

  init() {
    this.bindTabs();
    this.bindToolbar();
    this.bindHeaderActions();
    this.setupVersionSelector();
    this.subscribeToStateChanges();
    // 等待版本列表加载后渲染
    this.waitForVersions();
    // 初始化标签页状态
    this.updateTabsState();
  },

  subscribeToStateChanges() {
    if (typeof subscribe === 'function') {
      subscribe((state) => {
        if (state.versions) {
          this.renderVersionSelector();
        }
        if (state.selectedVersion !== undefined) {
          this.selectedVersion = state.selectedVersion;
          this.updateVersionTag();
          this.updateTabsState();
          this.refreshCurrent(true);
        }
      });
    }
  },

  waitForVersions() {
    let attempts = 0;
    const maxAttempts = 30;
    const timer = setInterval(() => {
      attempts++;
      const hasVersions = appState.versions && appState.versions.length > 0;

      if (hasVersions) {
        this.renderVersionSelector();
        // 如果有全局选中的版本，同步到本地
        if (appState.selectedVersion) {
          this.selectedVersion = appState.selectedVersion;
          this.updateVersionTag();
          this.updateTabsState();
          this.refreshCurrent(true);
        }
        clearInterval(timer);
        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(timer);
        this.renderVersionSelector();
      }
    }, 250);
  },

  setupVersionSelector() {
    // 版本选择器事件委托
    const versionList = document.getElementById('modsVersionList');
    if (versionList) {
      versionList.addEventListener('click', (e) => {
        const item = e.target.closest('.mods-version-item');
        if (item) {
          const versionId = item.dataset.versionId;
          this.selectVersion(versionId);
        }
      });
    }
  },

  renderVersionSelector() {
    const listEl = document.getElementById('modsVersionList');
    if (!listEl) return;

    if (!appState.versions || appState.versions.length === 0) {
      listEl.innerHTML = `
        <div class="mods-version-empty">
          <div class="empty-icon">
            ${icon('puzzle')}
          </div>
          <p>暂无已安装的版本</p>
          <span class="empty-sub">请先下载游戏版本</span>
        </div>
      `;
      return;
    }

    const svgRelease = icon('shield');
    const svgSnapshot = icon('zap');
    const svgFolder = icon('folder');

    const html = appState.versions.map(version => {
      const isSelected = this.selectedVersion && this.selectedVersion.id === version.id;
      const versionIcon = version.type === 'release' ? svgRelease : version.type === 'snapshot' ? svgSnapshot : svgFolder;
      const typeLabel = { release: '正式版', snapshot: '快照版' }[version.type] || version.type || '版本';
      const displayName = version.name || version.id || version.version || '未知版本';

      return `
        <button class="mods-version-item ${isSelected ? 'selected' : ''}" data-version-id="${version.id}">
          <div class="mods-version-icon">${versionIcon}</div>
          <div class="mods-version-info">
            <div class="mods-version-name">${this.escape(displayName)}</div>
            <div class="mods-version-type">${typeLabel}</div>
          </div>
          ${isSelected ? '<div class="mods-version-check">' + icon('check') + '</div>' : ''}
        </button>
      `;
    }).join('');

    listEl.innerHTML = html;
  },

  async selectVersion(versionId) {
    try {
      // 同步到全局状态
      if (typeof zenith !== 'undefined' && zenith.version && zenith.version.select) {
        await zenith.version.select(versionId);
      }

      const version = appState.versions.find(v => v.id === versionId);
      if (version) {
        this.selectedVersion = version;
        appState.selectedVersion = version;
        this.renderVersionSelector();
        this.updateVersionTag();
        this.updateTabsState();
        // 清空缓存并刷新当前类型
        this.cachedItems = {};
        this.refreshCurrent(true);
      }
    } catch (e) {
      console.error('[Mods] 选择版本失败:', e);
      if (typeof app !== 'undefined' && app.showToast) {
        app.showToast('选择版本失败: ' + e.message, 'error');
      }
    }
  },

  updateVersionTag() {
    const tag = document.getElementById('modsVersionTag');
    if (tag) {
      if (this.selectedVersion) {
        tag.textContent = this.selectedVersion.name || this.selectedVersion.id || '当前版本';
        tag.classList.add('has-version');
      } else {
        tag.textContent = '未选择版本';
        tag.classList.remove('has-version');
      }
    }
  },

  // 检测版本是否为原版（无 Forge/Fabric/NeoForge 加载器）
  isVanillaVersion(version) {
    if (!version) return true;
    const id = String(version.id || '');
    if (/forge|fabric|neoforge|quilt/i.test(id)) return false;
    if (version.jsonData) {
      const mainClass = String(version.jsonData.mainClass || '');
      if (/modlauncher|fml|forge|fabricmc|knot|quilt|neoforge|bootstraplauncher|cpw\.mods/i.test(mainClass)) return false;
      const inheritsFrom = String(version.jsonData.inheritsFrom || '');
      if (/forge|fabric|neoforge/i.test(inheritsFrom)) return false;
      const libs = version.jsonData.libraries || [];
      for (const lib of libs) {
        if (lib && lib.name && /net\.(minecraftforge|neoforged)|net\.fabricmc/i.test(lib.name)) return false;
      }
    }
    return true;
  },

  // 更新标签页状态：原版禁用"模组"和"光影"
  updateTabsState() {
    const isVanilla = this.isVanillaVersion(this.selectedVersion);
    document.querySelectorAll('.mods-tab').forEach(tab => {
      const type = tab.dataset.modsTab;
      if (type === 'mod' || type === 'shaderpack') {
        if (isVanilla) {
          tab.classList.add('disabled');
          tab.title = '原版游戏不支持此类内容，请安装模组加载器';
        } else {
          tab.classList.remove('disabled');
          tab.title = '';
        }
      } else {
        tab.classList.remove('disabled');
        tab.title = '';
      }
    });
    // 如果当前选中的是被禁用的标签，切到第一个可用的标签
    if (isVanilla && (this.currentType === 'mod' || this.currentType === 'shaderpack')) {
      const firstEnabled = document.querySelector('.mods-tab:not(.disabled)');
      if (firstEnabled) {
        this.switchTab(firstEnabled.dataset.modsTab);
      }
    }
  },

  switchTab(type) {
    if (!type) return;
    this.currentType = type;
    document.querySelectorAll('.mods-tab').forEach(t => t.classList.remove('active'));
    const activeTab = document.querySelector(`.mods-tab[data-mods-tab="${type}"]`);
    if (activeTab) activeTab.classList.add('active');
    this.searchQuery = '';
    const searchInput = document.getElementById('modsSearchInput');
    if (searchInput) searchInput.value = '';
    this.refreshCurrent();
  },

  bindHeaderActions() {
    const browserBtn = document.getElementById('openModBrowserBtn');
    if (browserBtn) {
      browserBtn.addEventListener('click', () => {
        if (!this.selectedVersion) {
          if (typeof app !== 'undefined' && app.showToast) {
            app.showToast('请先选择游戏版本', 'warning');
          }
          return;
        }

        // 检测当前版本的加载器类型
        const versionId = this.selectedVersion.id || '';
        let detectedLoader = '';
        if (versionId.toLowerCase().includes('forge')) {
          detectedLoader = 'forge';
        } else if (versionId.toLowerCase().includes('fabric')) {
          detectedLoader = 'fabric';
        } else if (versionId.toLowerCase().includes('neoforge')) {
          detectedLoader = 'neoforge';
        }

        // 提取 MC 版本号
        let detectedGameVersion = '';
        const mcVersionMatch = versionId.match(/(\d+\.\d+(?:\.\d+)?)/);
        if (mcVersionMatch) {
          detectedGameVersion = mcVersionMatch[1];
        }

        // 传递筛选条件到 addons 模块
        if (typeof addons !== 'undefined') {
          addons.incomingFilters = {
            gameVersion: detectedGameVersion,
            loader: detectedLoader
          };
        }

        if (app && typeof app.switchView === 'function') {
          app.switchView('download');
          document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
          const downloadTab = document.querySelector('.nav-tab[data-view="download"]');
          if (downloadTab) downloadTab.classList.add('active');
        }
        const subtab = document.querySelector(`.subtab-btn[data-subtab="${this.currentType}s"]`)
          || document.querySelector('.subtab-btn[data-subtab="mods"]');
        if (subtab) subtab.click();
      });
    }
  },

  bindTabs() {
    const tabs = document.querySelectorAll('.mods-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        if (!this.selectedVersion) {
          if (typeof app !== 'undefined' && app.showToast) {
            app.showToast('请先选择游戏版本', 'warning');
          }
          return;
        }
        if (tab.classList.contains('disabled')) {
          if (typeof app !== 'undefined' && app.showToast) {
            app.showToast('原版游戏不支持此功能，请安装模组加载器', 'warning');
          }
          return;
        }
        const type = tab.dataset.modsTab;
        if (!type) return;
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentType = type;
        this.searchQuery = '';
        const searchInput = document.getElementById('modsSearchInput');
        if (searchInput) searchInput.value = '';
        this.refreshCurrent();
      });
    });
  },

  bindToolbar() {
    const refreshBtn = document.getElementById('modsRefreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        if (!this.selectedVersion) {
          if (typeof app !== 'undefined' && app.showToast) {
            app.showToast('请先选择游戏版本', 'warning');
          }
          return;
        }
        this.refreshCurrent(true);
      });
    }

    const openFolderBtn = document.getElementById('modsOpenFolderBtn');
    if (openFolderBtn) {
      openFolderBtn.addEventListener('click', () => this.openCurrentFolder());
    }

    const searchInput = document.getElementById('modsSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        this.render();
      });
    }
  },

  async refreshCurrent(force = false) {
    if (!this.selectedVersion) {
      this.render();
      return;
    }

    const versionId = this.selectedVersion.id;
    const type = this.currentType;

    if (!this.cachedItems[versionId]) {
      this.cachedItems[versionId] = {};
    }

    if (!this.cachedItems[versionId][type] || force) {
      try {
        const items = await zenith.addon.listInstalled(type, versionId);
        this.cachedItems[versionId][type] = items || [];
      } catch (e) {
        console.error('[Mods] 获取列表失败:', e);
        this.cachedItems[versionId][type] = [];
        if (typeof app !== 'undefined' && app.showToast) {
          app.showToast('获取列表失败: ' + e.message, 'error');
        }
      }
    }
    this.render();
  },

  async openCurrentFolder() {
    if (!this.selectedVersion) {
      if (typeof app !== 'undefined' && app.showToast) {
        app.showToast('请先选择游戏版本', 'warning');
      }
      return;
    }

    const typeMap = {
      mod: 'mods',
      resourcepack: 'resourcepacks',
      shaderpack: 'shaderpacks',
      datapack: 'datapacks'
    };
    try {
      const dir = typeMap[this.currentType];
      const versionId = this.selectedVersion.id;
      if (zenith.system && zenith.system.openPath) {
        zenith.system.openPath(dir, versionId);
      } else {
        app.showToast('无法打开文件夹', 'warning');
      }
    } catch (e) {
      console.error('[Mods] 打开文件夹失败:', e);
    }
  },

  getItemsForCurrent() {
    if (!this.selectedVersion) return [];

    const versionId = this.selectedVersion.id;
    let items = (this.cachedItems[versionId] && this.cachedItems[versionId][this.currentType]) || [];
    items = items.filter(it => it.isFile || this.isArchiveFolder(it));

    if (this.searchQuery) {
      const q = this.normalizeSearchQuery(this.searchQuery);
      items = items.filter(it => {
        const haystack = [it.displayName, it.name].filter(Boolean).join(' ');
        return this.matchesSearch(haystack, q);
      });
    }

    items.sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      return (a.displayName || '').localeCompare(b.displayName || '');
    });
    return items;
  },

  normalizeSearchQuery(q) {
    if (!q) return [];
    const tokens = new Set();
    const parts = String(q).split(/[\s\-_\.\[\]\(\)\[\]\/\\,，。！!？?~@#\$%\^&\*\+=]+/).filter(Boolean);
    parts.forEach(p => tokens.add(p.toLowerCase()));
    tokens.add(String(q).toLowerCase());
    return Array.from(tokens);
  },

  matchesSearch(haystack, queryTokens) {
    if (!haystack || !queryTokens || queryTokens.length === 0) return true;
    const s = String(haystack).toLowerCase();
    return queryTokens.every(tok => s.includes(tok));
  },

  buildSearchUrlsForFile(fileName, displayName) {
    const raw = displayName || fileName || '';
    let name = raw
      .replace(/\.(jar|zip|disabled|mcpack|mrpack)$/i, '')
      .replace(/[\-_]/g, ' ')
      .replace(/\b\d+\.\d+(\.\d+)?\S*/g, '')
      .replace(/\b(fabric|forge|neoforge|quilt|paper|bukkit|spigot|mod|mods|client|server|release|beta|alpha|build|snapshot|optifine|iris)\b/gi, ' ')
      .replace(/\s+/g, ' ').trim();
    if (!name) name = displayName || fileName || '';

    const encode = (s) => encodeURIComponent(s).replace(/%20/g, '+');
    return {
      modrinth: `https://modrinth.com/${this.currentType === 'resourcepack' ? 'resourcepack' : this.currentType === 'datapack' ? 'datapack' : this.currentType === 'shaderpack' ? 'shader' : 'mod'}?query=${encode(name)}`,
      curseforge: `https://www.curseforge.com/minecraft/search?search=${encode(name)}&class=${this.currentType === 'resourcepack' ? 12 : this.currentType === 'datapack' ? 6552 : this.currentType === 'shaderpack' ? 6552 : 6}`
    };
  },

  isArchiveFolder(item) {
    return false;
  },

  updateCounts() {
    if (!this.selectedVersion) return;

    const versionId = this.selectedVersion.id;
    Object.keys(this.typeLabels).forEach(async (type) => {
      let items;
      if (this.cachedItems[versionId] && this.cachedItems[versionId][type]) {
        items = this.cachedItems[versionId][type];
      } else {
        try {
          items = await zenith.addon.listInstalled(type, versionId);
          if (!this.cachedItems[versionId]) this.cachedItems[versionId] = {};
          this.cachedItems[versionId][type] = items || [];
        } catch (e) {
          items = [];
        }
      }
      const fileItems = (items || []).filter(it => it.isFile);
      const el = document.querySelector(`.mods-tab-count[data-count-type="${type}"]`);
      if (el) {
        const enabledCount = fileItems.filter(it => it.enabled).length;
        el.textContent = enabledCount + '/' + fileItems.length;
      }
    });
  },

  render() {
    const listEl = document.getElementById('modsList');
    const emptyEl = document.getElementById('modsEmpty');
    if (!listEl) return;

    // 未选择版本时的提示
    if (!this.selectedVersion) {
      listEl.innerHTML = '';
      if (emptyEl) {
        emptyEl.style.display = 'flex';
        emptyEl.querySelector('h3').textContent = '请先选择游戏版本';
        emptyEl.querySelector('p').textContent = '在左侧列表中选择一个版本以管理其模组与资源';
      }
      return;
    }

    const items = this.getItemsForCurrent();
    this.updateCounts();

    if (!items || items.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) {
        emptyEl.style.display = 'flex';
        if (this.searchQuery) {
          emptyEl.querySelector('h3').textContent = '未找到匹配项';
          emptyEl.querySelector('p').textContent = '试试修改搜索词';
        } else {
          emptyEl.querySelector('h3').textContent = '暂无' + (this.typeLabels[this.currentType] || '内容');
          emptyEl.querySelector('p').textContent = '点击上方「浏览下载」前往下载页面搜索并安装';
        }
      }
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    const html = items.map((item, idx) => {
      const enabled = item.enabled !== false;
      const sizeText = this.formatBytes(item.size || 0);
      const dateText = item.mtime ? new Date(item.mtime).toLocaleString() : '';
      const ext = this.getExtension(item.displayName || item.name);
      const urls = this.buildSearchUrlsForFile(item.name, item.displayName);

      return `
        <div class="mod-item ${enabled ? 'enabled' : 'disabled'}" data-name="${this.escape(item.name)}" data-index="${idx}">
          <div class="mod-item-icon">
            ${enabled
              ? icon('download')
              : icon('check')
            }
          </div>
          <div class="mod-item-info">
            <div class="mod-item-name" title="${this.escape(item.displayName)}">${this.escape(item.displayName)}</div>
            <div class="mod-item-meta">
              ${ext ? `<span class="mod-meta-tag">${this.escape(ext.toUpperCase())}</span>` : ''}
              <span>${sizeText}</span>
              ${dateText ? `<span>· ${dateText}</span>` : ''}
              ${!enabled ? `<span class="mod-disabled-label">已禁用</span>` : ''}
            </div>
          </div>
          <div class="mod-item-actions">
            <button class="btn btn-small ${enabled ? 'btn-secondary' : 'btn-success'}" data-mod-action="toggle" title="${enabled ? '禁用（重命名为 .disabled）' : '启用'}">
              ${icon('boxDownload')}
              <span>${enabled ? '禁用' : '启用'}</span>
            </button>
            <button class="btn btn-small btn-secondary" data-mod-action="open" title="在文件夹中显示">
              ${icon('folder')}
              <span>打开</span>
            </button>
            <button class="btn btn-small btn-secondary" data-mod-action="modrinth" data-url="${this.escape(urls.modrinth)}" title="在 Modrinth 搜索此模组">
              ${icon('arrowRight')}
              <span>Modrinth</span>
            </button>
            <button class="btn btn-small btn-secondary" data-mod-action="curseforge" data-url="${this.escape(urls.curseforge)}" title="在 CurseForge 搜索此模组">
              ${icon('box')}
              <span>CurseForge</span>
            </button>
            <button class="btn btn-small btn-danger-ghost" data-mod-action="delete" title="删除文件">
              ${icon('trash')}
              <span>删除</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    listEl.innerHTML = html;

    listEl.querySelectorAll('[data-mod-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.modAction;
        const itemEl = btn.closest('.mod-item');
        if (!itemEl) return;
        const name = itemEl.dataset.name;

        if (action === 'toggle') this.toggleItem(name, btn);
        else if (action === 'delete') this.deleteItem(name);
        else if (action === 'open') this.openItem(name);
        else if (action === 'modrinth' || action === 'curseforge') {
          const url = btn.dataset.url;
          if (url && zenith.system && zenith.system.openExternal) {
            zenith.system.openExternal(url);
          } else if (url) {
            window.open(url, '_blank');
          }
        }
      });
    });
  },

  async toggleItem(name, btnEl) {
    if (!this.selectedVersion) {
      if (typeof app !== 'undefined' && app.showToast) {
        app.showToast('请先选择游戏版本', 'warning');
      }
      return;
    }

    try {
      if (btnEl) btnEl.disabled = true;
      const result = await zenith.addon.toggle(this.currentType, name, this.selectedVersion.id);
      if (result && result.success) {
        const versionId = this.selectedVersion.id;
        delete this.cachedItems[versionId][this.currentType];
        this.refreshCurrent(true);
        if (typeof app !== 'undefined' && app.showToast) {
          app.showToast(result.enabled ? '已启用' : '已禁用', 'success');
        }
      } else {
        if (typeof app !== 'undefined' && app.showToast) {
          app.showToast('操作失败: ' + (result.message || '未知错误'), 'error');
        }
      }
    } catch (e) {
      console.error('[Mods] 切换状态失败:', e);
      if (typeof app !== 'undefined' && app.showToast) {
        app.showToast('操作失败: ' + e.message, 'error');
      }
    } finally {
      if (btnEl) btnEl.disabled = false;
    }
  },

  async deleteItem(name) {
    if (!this.selectedVersion) {
      if (typeof app !== 'undefined' && app.showToast) {
        app.showToast('请先选择游戏版本', 'warning');
      }
      return;
    }

    const displayName = name.toLowerCase().endsWith('.disabled')
      ? name.slice(0, -'.disabled'.length)
      : name;
    if (!window.confirm(`确定要删除「${displayName}」吗？\n此操作不可撤销。`)) return;

    try {
      const result = await zenith.addon.remove(this.currentType, name, this.selectedVersion.id);
      if (result && result.success) {
        const versionId = this.selectedVersion.id;
        delete this.cachedItems[versionId][this.currentType];
        this.refreshCurrent(true);
        if (typeof app !== 'undefined' && app.showToast) {
          app.showToast('已删除', 'success');
        }
      } else {
        if (typeof app !== 'undefined' && app.showToast) {
          app.showToast('删除失败: ' + (result.message || '未知错误'), 'error');
        }
      }
    } catch (e) {
      console.error('[Mods] 删除失败:', e);
      if (typeof app !== 'undefined' && app.showToast) {
        app.showToast('删除失败: ' + e.message, 'error');
      }
    }
  },

  async openItem(name) {
    if (!this.selectedVersion) {
      if (typeof app !== 'undefined' && app.showToast) {
        app.showToast('请先选择游戏版本', 'warning');
      }
      return;
    }

    const typeMap = {
      mod: 'mods',
      resourcepack: 'resourcepacks',
      shaderpack: 'shaderpacks',
      datapack: 'datapacks'
    };
    try {
      const dir = typeMap[this.currentType];
      const versionId = this.selectedVersion.id;
      if (zenith.system && zenith.system.openPath) {
        zenith.system.openPath(dir, versionId);
      }
    } catch (e) {
      console.error('[Mods] 打开文件夹失败:', e);
    }
  },

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let v = bytes;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i += 1;
    }
    return v.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
  },

  getExtension(filename) {
    if (!filename) return '';
    const idx = filename.lastIndexOf('.');
    if (idx < 0 || idx === filename.length - 1) return '';
    const ext = filename.substring(idx + 1).toLowerCase();
    if (['jar', 'zip', 'png', 'mcpack', 'mcworld', 'json'].includes(ext)) return ext;
    return '';
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
  mods.init();
});
