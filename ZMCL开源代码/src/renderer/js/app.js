const EULA_FILE = './使用协议.txt';
const PRIVACY_FILE = './隐私政策.txt';

const SUN_SVG = '<span data-icon="sun"></span>';
const MOON_SVG = '<span data-icon="moon"></span>';

// 全局错误处理：避免未捕获异常导致启动/加载流程中断
(function setupGlobalErrorHandlers() {
  try {
    window.addEventListener('error', (event) => {
      console.error('[App] Uncaught error:', event.message, event.filename, event.lineno, event.colno);
      event.preventDefault();
    });
    window.addEventListener('unhandledrejection', (event) => {
      console.error('[App] Uncaught promise rejection:', event.reason);
      event.preventDefault();
    });
  } catch (e) {
    console.warn('[App] 无法设置错误处理器:', e.message);
  }
})();

// 在 app 初始化前尽早应用存储的主题，避免 splash 期间主题闪烁
(function applyInitialTheme() {
  try {
    const stored = localStorage.getItem('zenith_theme');
    if (stored === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();

const app = {
  init() {
    // 尽早渲染图标，让动画期间图标可见
    if (typeof renderIcons === 'function') {
      renderIcons();
    }
    this.setupTheme();
    this.setupTitleBar();
    this.setupNavigation();
    this.setupModals();
    this.setupToast();
    this.setupVersionBadge(); // 填充启动器版本号
    this.loadInitialDataWithProgress();

    // 延迟加载非关键 UI（不影响首屏）
    setTimeout(() => {
      this.setupSponsors();
      this.setupRippleEffect();
      this.setupMicroInteractions();
    }, 1000);
  },

  // ============================================================
  // 启动器版本号填充
  // ============================================================
  setupVersionBadge() {
    if (!window.zenith || !window.zenith.app || typeof window.zenith.app.getVersion !== 'function') {
      return;
    }
    window.zenith.app.getVersion().then((ver) => {
      const text = `启动器 v${ver || '未知'}`;
      const badge = document.getElementById('appVersionBadge');
      if (badge) badge.textContent = text;
    }).catch(() => {
      const badge = document.getElementById('appVersionBadge');
      if (badge) badge.textContent = '启动器 v未知';
    });
  },

  // ============================================================
  // 水波纹效果 - 为按钮 / tab / 列表项添加点击涟漪
  // ============================================================
  setupRippleEffect() {
    const selectors = [
      '.btn',
      '.nav-tab',
      '.version-item',
      '.loader-version-item',
      '.account-item'
    ];

    const selector = selectors.join(',');
    const targets = document.querySelectorAll(selector);

    targets.forEach((el) => {
      // 确保元素可容纳绝对定位的 ripple
      const computed = window.getComputedStyle(el);
      if (computed.position === 'static') {
        el.style.position = 'relative';
      }
      el.style.overflow = 'hidden';

      el.addEventListener('click', (e) => {
        // 避免重复创建：若已有 ripple 动画未结束，跳过
        if (el.querySelector('.ripple')) return;

        const rect = el.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = (e.clientX || rect.left + rect.width / 2) - rect.left - size / 2;
        const y = (e.clientY || rect.top + rect.height / 2) - rect.top - size / 2;

        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        ripple.style.width = size + 'px';
        ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';

        el.appendChild(ripple);

        // 动画结束后移除
        ripple.addEventListener('animationend', () => {
          if (ripple && ripple.parentNode) {
            ripple.parentNode.removeChild(ripple);
          }
        });
      });
    });
  },

  // ============================================================
  // 视图切换 - 带 leaving/entering 动画
  // ============================================================
  switchView(viewId) {
    const views = document.querySelectorAll('.view');
    let oldActive = null;
    views.forEach((view) => {
      if (view.classList.contains('active') && view.id !== `view-${viewId}`) {
        oldActive = view;
      }
    });

    const targetView = document.getElementById(`view-${viewId}`);
    if (!targetView) return;

    // 若已是当前视图，不重复切换动画，但仍可能需要检测陶瓦核心状态
    if (targetView.classList.contains('active') && !targetView.classList.contains('view-leaving')) {
      if (viewId === 'taowa' && typeof ensureTaowaCore === 'function') {
        try { ensureTaowaCore(); } catch (e) { console.error('[陶瓦联机] ensureTaowaCore 失败:', e); }
      }
      return;
    }

    // 清理已有动画类
    targetView.classList.remove('view-leaving');

    // 先播放 leaving 动画
    if (oldActive) {
      oldActive.classList.add('view-leaving');
      const leavingEl = oldActive;
      setTimeout(() => {
        leavingEl.classList.remove('active', 'view-leaving');
      }, 260);
    } else {
      // 没有旧视图，直接将其他所有非目标视图置为 inactive
      views.forEach((view) => {
        if (view !== targetView) view.classList.remove('active');
      });
    }

    // 激活新视图 + entering 动画
    targetView.classList.add('active', 'view-entering');
    setTimeout(() => {
      targetView.classList.remove('view-entering');
    }, 360);

    // 更新导航高亮
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach((tab) => {
      if (tab.dataset.view === viewId) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    // 进入陶瓦联机页面时，若核心缺失自动弹出下载模态框
    if (viewId === 'taowa') {
      if (typeof refreshCoreInfo === 'function') {
        try { refreshCoreInfo(); } catch (e) { console.error('[陶瓦联机] refreshCoreInfo 失败:', e); }
      }
      if (typeof ensureTaowaCore === 'function') {
        try { ensureTaowaCore(); } catch (e) { console.error('[陶瓦联机] ensureTaowaCore 失败:', e); }
      }
    }
  },

  // ============================================================
  // 按钮微交互 - pressed / 赞助按钮 wobble
  // ============================================================
  setupMicroInteractions() {
    // .btn-primary / .btn-launch 按下状态
    const pressables = document.querySelectorAll('.btn-primary, .btn-launch');
    pressables.forEach((btn) => {
      btn.addEventListener('mousedown', () => btn.classList.add('is-pressed'));
      const release = () => btn.classList.remove('is-pressed');
      btn.addEventListener('mouseup', release);
      btn.addEventListener('mouseleave', release);
      btn.addEventListener('blur', release);
    });

    // .sponsor-btn hover wobble - 重置动画以便每次 hover 都触发
    const sponsors = document.querySelectorAll('.sponsor-btn');
    sponsors.forEach((btn) => {
      btn.addEventListener('mouseenter', () => {
        btn.style.animation = 'none';
        // 触发重排以重启动画
        void btn.offsetWidth;
        btn.style.animation = '';
      });
    });
  },

  // ============================================================
  // 通用交错入场动画工具
  // container: 容器 DOM
  // itemSelector: 子项选择器
  // delay: 每项间隔毫秒 (默认 60)
  // ============================================================
  setupStaggeredAnimation(container, itemSelector, delay = 60) {
    if (!container) return;
    const items = container.querySelectorAll(itemSelector);
    items.forEach((item, index) => {
      // 移除已有同类动画，允许再次触发
      item.classList.remove('animate-slide-up');
      // 触发重排
      void item.offsetWidth;
      item.style.animationDelay = `${index * delay}ms`;
      item.classList.add('animate-slide-up');
    });
  },

  setupTheme() {
    const themeToggle = document.getElementById('themeToggle');

    // 同步 UI 图标和按钮状态（主题已在初始化前应用）
    this.syncThemeUI();

    if (themeToggle) {
      themeToggle.addEventListener('click', async () => {
        const root = document.documentElement;
        const current = root.getAttribute('data-theme') || 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        this.syncThemeUI();
        try {
          localStorage.setItem('zenith_theme', next);
        } catch (e) {}
        try {
          if (zenith && zenith.theme && zenith.theme.update) {
            await zenith.theme.update(next);
          }
          if (zenith && zenith.config && zenith.config.set) {
            await zenith.config.set('theme', next);
          }
          if (appState && appState.config) {
            appState.config.theme = next;
          }
        } catch (e) {
          console.warn('[Theme] 保存主题失败:', e.message);
        }
      });
    }
  },

  syncThemeUI() {
    const root = document.documentElement;
    const current = root.getAttribute('data-theme') || 'light';
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
      themeIcon.innerHTML = current === 'dark' ? MOON_SVG : SUN_SVG;
      if (typeof renderIcons === 'function') {
        renderIcons();
      }
    }
    const toggle = document.getElementById('themeToggle');
    if (toggle) {
      toggle.title = current === 'dark' ? '切换到浅色模式' : '切换到深色模式';
    }
  },

  setupTitleBar() {
    const minBtn = document.getElementById('minBtn');
    const maxBtn = document.getElementById('maxBtn');
    const closeBtn = document.getElementById('closeBtn');

    if (minBtn && zenith && zenith.window) {
      minBtn.addEventListener('click', () => zenith.window.minimize());
    }
    if (maxBtn && zenith && zenith.window) {
      maxBtn.addEventListener('click', async () => {
        await zenith.window.toggleMaximize();
      });
    }
    if (closeBtn && zenith && zenith.window) {
      closeBtn.addEventListener('click', () => zenith.window.close());
    }
  },

  setupNavigation() {
    // 主导航 Tab
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const viewId = tab.dataset.view;
        this.switchView(viewId);
      });
    });

    // "更多" 下拉菜单
    const navMore = document.getElementById('navMore');
    const navMoreTrigger = document.getElementById('navMoreTrigger');
    const navMoreMenu = document.getElementById('navMoreMenu');

    if (navMoreTrigger) {
      navMoreTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = navMore && navMore.classList.contains('open');
        if (isOpen) {
          navMore.classList.remove('open');
          navMoreTrigger.setAttribute('aria-expanded', 'false');
        } else {
          navMore.classList.add('open');
          navMoreTrigger.setAttribute('aria-expanded', 'true');
        }
      });
    }

    // 下拉菜单项：点击后切换视图并关闭菜单
    const navMoreItems = document.querySelectorAll('.nav-more-item');
    navMoreItems.forEach(item => {
      item.addEventListener('click', () => {
        const viewId = item.dataset.view;
        if (navMore) navMore.classList.remove('open');
        if (navMoreTrigger) navMoreTrigger.setAttribute('aria-expanded', 'false');
        if (viewId) this.switchView(viewId);
      });
    });

    // 点击外部区域关闭下拉
    document.addEventListener('click', (e) => {
      if (!navMore) return;
      if (!navMore.contains(e.target) && navMore.classList.contains('open')) {
        navMore.classList.remove('open');
        if (navMoreTrigger) navMoreTrigger.setAttribute('aria-expanded', 'false');
      }
    });

    // ESC 关闭下拉
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navMore && navMore.classList.contains('open')) {
        navMore.classList.remove('open');
        if (navMoreTrigger) navMoreTrigger.setAttribute('aria-expanded', 'false');
      }
    });
  },

  switchView(viewId) {
    const views = document.querySelectorAll('.view');
    views.forEach(view => view.classList.remove('active'));
    const targetView = document.getElementById(`view-${viewId}`);
    if (targetView) targetView.classList.add('active');

    // 同步高亮：主导航 + 下拉菜单项
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach(tab => {
      if (tab.dataset.view === viewId) tab.classList.add('active');
      else tab.classList.remove('active');
    });
    const navMoreItems = document.querySelectorAll('.nav-more-item');
    navMoreItems.forEach(item => {
      if (item.dataset.view === viewId) item.classList.add('active');
      else item.classList.remove('active');
    });
  },

  // 赞助者名单 - 凭据已在主进程硬编码，启动时自动从 ifdian.net 拉取
  setupSponsors() {
    const openExternal = (url) => {
      if (zenith && zenith.system && zenith.system.openExternal) {
        zenith.system.openExternal(url);
      } else {
        if (typeof window !== 'undefined' && window.open) {
          window.open(url, '_blank');
        }
      }
    };

    // 顶部赞助按钮 - 打开 ifdian.net/a/JasonDeng
    const sponsorBtn = document.getElementById('sponsorBtn');
    if (sponsorBtn) {
      sponsorBtn.addEventListener('click', () => {
        openExternal('https://www.ifdian.net/a/JasonDeng');
      });
    }

    // Banner 赞助按钮
    const sponsorBannerBtn = document.getElementById('sponsorBannerBtn');
    if (sponsorBannerBtn) {
      sponsorBannerBtn.addEventListener('click', () => {
        openExternal('https://www.ifdian.net/a/JasonDeng');
      });
    }

    // 赞助方式卡片中的"前往"按钮
    document.querySelectorAll('.sponsors-open-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.sponsorUrl || 'https://www.ifdian.net/a/JasonDeng';
        openExternal(url);
      });
    });

    // 刷新按钮
    const refreshBtn = document.getElementById('sponsorsRefreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.loadAndRenderSponsors();
      });
    }

    // 启动时自动拉取
    this.loadAndRenderSponsors();
  },

  /**
   * 从主进程 IPC 拉取赞助者列表并渲染
   * 仅显示当月内有赞助记录的赞助者
   */
  async loadAndRenderSponsors() {
    const statusEl = document.getElementById('sponsorsStatus');
    const listEl = document.getElementById('sponsorsList');
    const emptyEl = document.getElementById('sponsorsEmpty');
    const countEl = document.getElementById('sponsorsCount');

    if (!listEl || !emptyEl) return;

    if (statusEl) statusEl.textContent = '正在从 ifdian.net 拉取本月赞助者名单...';
    if (countEl) countEl.textContent = '加载中...';

    try {
      if (!zenith || !zenith.ifdian) {
        throw new Error('API 不可用');
      }

      const result = await zenith.ifdian.fetchSponsors(1);

      if (!result || !result.ok) {
        const err = (result && result.error) || '未知错误';
        if (statusEl) statusEl.textContent = '拉取失败：' + err;
        listEl.style.display = 'none';
        emptyEl.style.display = 'block';
        if (countEl) countEl.textContent = '共 0 位';
        return;
      }

      this.renderSponsorList(result.sponsors || [], result.totalCount || 0);

      if (statusEl) {
        const total = result.totalCount || ((result.sponsors || []).length);
        statusEl.textContent = `本月共 ${total} 位赞助者（数据来自 ifdian.net）`;
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = '拉取失败：' + (err.message || '网络错误');
    }
  },

  renderSponsorList(list, totalCount) {
    const listEl = document.getElementById('sponsorsList');
    const emptyEl = document.getElementById('sponsorsEmpty');
    const countEl = document.getElementById('sponsorsCount');

    if (!listEl || !emptyEl) return;

    if (countEl) countEl.textContent = `共 ${totalCount || list.length} 位`;

    if (!list || list.length === 0) {
      listEl.style.display = 'none';
      emptyEl.style.display = 'block';
      return;
    }

    listEl.style.display = 'grid';
    emptyEl.style.display = 'none';

    listEl.innerHTML = list.map(sponsor => {
      const name = sponsor.name || '匿名用户';
      const initial = name.trim().charAt(0).toUpperCase();
      const avatarUrl = sponsor.avatar || '';
      const amount = sponsor.amount || sponsor.totalAmount || '';
      const date = sponsor.date || sponsor.lastPayTime || '';
      const tier = sponsor.tier || sponsor.planName || '';
      const message = sponsor.message || '';

      const avatarHtml = avatarUrl
        ? `<div class="sponsor-avatar sponsor-avatar-img" style="background-image:url('${avatarUrl}')"></div>`
        : `<div class="sponsor-avatar">${initial}</div>`;

      const amountHtml = amount ? `<span class="sponsor-amount">${amount}</span>` : '';
      const dateHtml = date ? `<span>${date}</span>` : '';
      const tierHtml = tier ? `<span class="sponsor-tier">${tier}</span>` : '';
      const messageHtml = message ? `<div class="sponsor-message">"${message}"</div>` : '';

      return `
        <div class="sponsor-item">
          ${avatarHtml}
          <div class="sponsor-info">
            <h4 class="sponsor-name">${this.escapeHtml(name)}</h4>
            <div class="sponsor-meta">
              ${tierHtml}
              ${amountHtml}
              ${dateHtml}
            </div>
            ${messageHtml}
          </div>
        </div>
      `;
    }).join('');
  },

  escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  setupModals() {
    const closeButtons = document.querySelectorAll('[data-close-modal]');
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.dataset.closeModal;
        document.getElementById(modalId).classList.add('hidden');
      });
    });
  },

  setupToast() {
    this.toastContainer = document.getElementById('toastContainer');
  },

  showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    // 确保容器存在
    if (!this.toastContainer) {
      this.toastContainer = document.getElementById('toastContainer');
    }
    if (this.toastContainer) {
      this.toastContainer.appendChild(toast);
    } else {
      document.body.appendChild(toast);
    }

    // 消失前先播放 leaving 动画，再移除
    setTimeout(() => {
      toast.classList.add('toast-leaving');
      const onEnd = () => {
        if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
      };
      toast.addEventListener('animationend', onEnd, { once: true });
      setTimeout(onEnd, 400);
    }, duration - 400 > 0 ? duration - 400 : 0);
  },

  // 首次启动检查使用协议和隐私政策
  async checkUserAgreements() {
    try {
      const eulaAccepted = await zenith.config.get('eulaAccepted', false);
      const privacyAccepted = await zenith.config.get('privacyAccepted', false);

      if (eulaAccepted && privacyAccepted) return;

      // 从文件读取协议文本
      const eulaText = await zenith.system.readTextFile(EULA_FILE);
      const privacyText = await zenith.system.readTextFile(PRIVACY_FILE);

      return new Promise((resolve) => {
        const eulaBody = document.getElementById('eulaBody');
        if (eulaBody) eulaBody.textContent = eulaText || '（无法读取使用协议文件）';

        const eulaModal = document.getElementById('eulaModal');
        eulaModal.classList.remove('hidden');

        document.getElementById('eulaAgreeBtn').onclick = async () => {
          eulaModal.classList.add('hidden');
          await zenith.config.set('eulaAccepted', true);

          const privacyBody = document.getElementById('privacyBody');
          if (privacyBody) privacyBody.textContent = privacyText || '（无法读取隐私政策文件）';

          const privacyModal = document.getElementById('privacyModal');
          privacyModal.classList.remove('hidden');

          document.getElementById('privacyAgreeBtn').onclick = async () => {
            privacyModal.classList.add('hidden');
            await zenith.config.set('privacyAccepted', true);
            resolve();
          };

          document.getElementById('privacyDisagreeBtn').onclick = () => {
            if (zenith.window) zenith.window.close();
          };
        };

        document.getElementById('eulaDisagreeBtn').onclick = () => {
          if (zenith.window) zenith.window.close();
        };
      });
    } catch (e) {
      console.error('[App] 协议检查失败:', e);
    }
  },

  async loadInitialData() {
    try {
      // 并行加载主要数据，Java 检测稍慢，也并行执行
      await Promise.all([
        this.loadConfig(),
        this.loadVersions(),
        this.loadAccounts(),
        this.loadJavaInstallations()
      ]);
    } catch (e) {
      console.error('[App] Failed to load initial data:', e.message);
    }
  },

  // 带进度追踪的初始化加载（并行加速），含超时兜底
  async loadInitialDataWithProgress() {
    const MAX_LOAD_TIME = 8000; // 最多等待 8 秒，超时强制进入主界面
    const forceHideTimer = setTimeout(() => {
      console.warn('[App] 初始化加载超时，强制进入主界面');
      this._forceShowMainApp = true;
      this.hideSplash(true);
    }, MAX_LOAD_TIME);

    try {
      // 先并行加载关键数据（配置 + 版本 + 账号）
      this.updateSplashProgress(10, '正在加载...');

      const [configResult] = await Promise.allSettled([
        this.loadConfig().catch(e => console.error('[App] 配置加载失败:', e.message)),
        this.updateSplashProgress(30, '配置已加载')
      ]);

      // 版本和账号并行加载（每项加超时保护）
      const loadVersionsWithTimeout = async () => {
        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            console.warn('[App] 版本列表加载超时');
            resolve(null);
          }, 5000);
          this.loadVersions().then(r => { clearTimeout(timeout); resolve(r); })
            .catch(e => { clearTimeout(timeout); console.error('[App] 版本加载失败:', e.message); resolve(null); });
        });
      };
      const loadAccountsWithTimeout = async () => {
        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            console.warn('[App] 账号加载超时');
            resolve(null);
          }, 5000);
          this.loadAccounts().then(r => { clearTimeout(timeout); resolve(r); })
            .catch(e => { clearTimeout(timeout); console.error('[App] 账号加载失败:', e.message); resolve(null); });
        });
      };

      await Promise.allSettled([
        loadVersionsWithTimeout().then(() => this.updateSplashProgress(55, '版本列表已加载')),
        loadAccountsWithTimeout().then(() => this.updateSplashProgress(70, '账号已加载'))
      ]);

      // 完成
      this.updateSplashProgress(100, '加载完成');

      clearTimeout(forceHideTimer);

      // 触发启动画面关闭（延迟让用户看到 100%）
      setTimeout(() => {
        this.hideSplash();
      }, 300);

      // 启动画面关闭后，后台异步加载非关键数据
      setTimeout(() => {
        this.loadJavaInstallations().then(() => {
          console.log('[App] Java 后台检测完成');
        }).catch(e => console.warn('[App] Java 后台检测失败:', e.message));
      }, 500);
    } catch (e) {
      clearTimeout(forceHideTimer);
      console.error('[App] 加载流程异常:', e.message);
      this.hideSplash(true);
    }
  },

  // 更新启动画面进度
  updateSplashProgress(percent, label) {
    const splashPercentEl = document.getElementById('splashPercent');
    const splashRingProgress = document.querySelector('.splash-ring-progress');

    if (splashPercentEl) {
      splashPercentEl.textContent = percent + '%';
    }

    if (splashRingProgress) {
      // 圆环周长约为 326.73 (2 * PI * 52)
      const circumference = 326.73;
      const offset = circumference - (percent / 100) * circumference;
      splashRingProgress.style.strokeDashoffset = offset;
    }

    // 更新标签
    const splashLabel = document.querySelector('.splash-ring-label');
    if (splashLabel && label) {
      splashLabel.textContent = label;
    }
  },

  // 隐藏启动画面并触发主应用入场动画（force=true 表示强制隐藏，跳过动画等待）
  hideSplash(force = false) {
    const splash = document.getElementById('splash');
    const app = document.getElementById('app');

    // 无论如何都要确保 #app 可见
    if (app) {
      app.classList.remove('splash-hidden');
      app.style.visibility = 'visible';
    }

    if (splash) {
      if (force) {
        // 强制模式：直接隐藏 + 移除 splash
        try { splash.style.display = 'none'; } catch (e) {}
        try {
          if (splash && splash.parentNode) {
            splash.parentNode.removeChild(splash);
          }
        } catch (e) {}
        this.checkUserAgreements();
        return;
      }

      // 触发 splash 退出动画
      try {
        splash.classList.remove('splash-exit');
        void splash.offsetWidth;
        splash.classList.add('splash-exit');

        // 同时触发主应用入场动画
        if (app) {
          app.classList.add('app-reveal');
        }

        // 动画结束后从 DOM 中移除 splash
        setTimeout(() => {
          try {
            if (splash && splash.parentNode) {
              splash.parentNode.removeChild(splash);
            }
          } catch (e) {}

          // splash 完全消失后检查用户协议
          this.checkUserAgreements();

          // 主应用动画结束后清理动画类
          setTimeout(() => {
            try {
              if (app) {
                app.classList.remove('app-reveal');
              }
            } catch (e) {}
          }, 900);
        }, 800);
      } catch (e) {
        // 动画失败兜底：直接移除
        try {
          if (splash && splash.parentNode) {
            splash.parentNode.removeChild(splash);
          }
        } catch (e2) {}
        this.checkUserAgreements();
      }
    } else {
      // splash 已不存在，直接让应用显示
      if (app) {
        app.classList.remove('splash-hidden');
      }
      this.checkUserAgreements();
    }
  },

  async loadJavaInstallations() {
    try {
      const installations = await zenith.java.detect();
      appState.javaInstallations = installations;
      if (installations && installations.length > 0 && appState.config) {
        // 如果还没有选择 javaPath，则自动选择第一个（版本最高）
        if (!appState.config.javaPath) {
          appState.config.javaPath = installations[0].path;
          try {
            await zenith.config.set('javaPath', installations[0].path);
          } catch (e) {}
        }
        console.log(`[App] Auto-detected ${installations.length} Java installations`);
      } else {
        console.log('[App] No Java installations detected on startup');
      }
    } catch (e) {
      console.error('[App] Failed to detect Java on startup:', e.message);
    }
  },

  async loadConfig() {
    try {
      const config = await zenith.config.getAll();
      appState.config = config;
      if (config && config.theme) {
        // 以持久化配置为准，与 localStorage 同步
        const root = document.documentElement;
        if (root.getAttribute('data-theme') !== config.theme) {
          root.setAttribute('data-theme', config.theme);
        }
        try {
          localStorage.setItem('zenith_theme', config.theme);
        } catch (e) {}
        this.syncThemeUI();
        if (zenith && zenith.theme && zenith.theme.update) {
          try {
            await zenith.theme.update(config.theme);
          } catch (err) {
            console.warn('[Theme] 更新窗口背景失败:', err.message);
          }
        }
      }
    } catch (e) {
      console.error('[App] Failed to load config:', e.message);
    }
  },

  async loadVersions() {
    try {
      const versions = await zenith.version.list();
      // 使用 updateVersions 通知订阅者，触发 UI 重新渲染
      updateVersions(versions);
      if (versions && versions.length > 0) {
        const selectedVersionId = appState.config.selectedVersion;
        if (selectedVersionId) {
          const selected = versions.find(v => v.id === selectedVersionId);
          if (selected) {
            appState.selectedVersion = selected;
          }
        }
      }
    } catch (e) {
      console.error('[App] Failed to load versions:', e.message);
      // 即使失败也更新为空数组，避免 UI 保持加载状态
      updateVersions([]);
    }
  },

  async loadAccounts() {
    try {
      const [microsoftAccounts, offlineAccounts, authlibAccounts, lastSelected] = await Promise.all([
        zenith.auth.microsoft.getAccounts(),
        zenith.auth.offline.getAccounts(),
        zenith.auth.authlib.getAccounts(),
        zenith.accounts.getLastSelected()
      ]);
      appState.accounts.microsoft = microsoftAccounts;
      appState.accounts.offline = offlineAccounts;
      appState.accounts.authlib = authlibAccounts;

      // 优先使用存储中记录的 lastSelected，否则退化为第一个存在的账户
      if (lastSelected) {
        appState.selectedAccount = lastSelected;
      } else if (microsoftAccounts.length > 0) {
        appState.selectedAccount = { type: 'microsoft', ...microsoftAccounts[0] };
      } else if (offlineAccounts.length > 0) {
        appState.selectedAccount = { type: 'offline', ...offlineAccounts[0] };
      } else if (authlibAccounts.length > 0) {
        appState.selectedAccount = { type: 'authlib', ...authlibAccounts[0] };
      } else {
        appState.selectedAccount = null;
      }
    } catch (e) {
      console.error('[App] Failed to load accounts:', e.message);
    }
  },

  openModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
  },

  closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
  },

  // ==================================================================
  // 新版本常驻提示框（右下角）
  // 收到主进程 update-available 事件后显示，点击"关闭该提示"隐藏，
  // 点击"立即更新"调用 zenith.app.downloadUpdate 触发下载与安装
  // ==================================================================
  setupUpdateToast() {
    if (!window.zenith || !window.zenith.app || typeof window.zenith.app.onUpdateState !== 'function') {
      return;
    }

    const toast = document.getElementById('updateToast');
    const versionEl = document.getElementById('toastVersion');
    const bodyEl = document.getElementById('toastBody');
    const closeBtn = document.getElementById('closeToastBtn');
    const laterBtn = document.getElementById('laterUpdateBtn');
    const installBtn = document.getElementById('installUpdateBtn');
    const progressWrap = document.getElementById('updateToastProgress');
    const progressFill = document.getElementById('updateToastProgressFill');
    const progressText = document.getElementById('updateToastProgressText');

    if (!toast || !versionEl || !bodyEl || !closeBtn || !laterBtn || !installBtn) {
      return;
    }

    const hideToast = () => {
      try { toast.style.display = 'none'; } catch (_) {}
    };

    closeBtn.addEventListener('click', hideToast);
    laterBtn.addEventListener('click', hideToast);

    installBtn.addEventListener('click', async () => {
      try {
        installBtn.disabled = true;
        if (progressWrap) progressWrap.style.display = 'block';
        if (progressText) progressText.textContent = '正在启动更新…';
        if (progressFill) progressFill.style.width = '5%';

        if (typeof window.zenith.app.downloadUpdate === 'function') {
          await window.zenith.app.downloadUpdate();
        } else if (typeof window.zenith.app.checkUpdate === 'function') {
          await window.zenith.app.checkUpdate();
        }

        if (progressText) progressText.textContent = '更新包下载中，完成后将自动安装重启…';
        if (progressFill) progressFill.style.width = '100%';
      } catch (err) {
        console.error('[Update Toast] 触发更新失败:', err);
        if (progressText) progressText.textContent = '更新失败，请稍后再试';
        if (progressFill) progressFill.style.width = '0%';
        installBtn.disabled = false;
        if (app && typeof app.showToast === 'function') {
          app.showToast('更新失败：' + (err && err.message ? err.message : '未知错误'), 'error');
        }
      }
    });

    window.zenith.app.onUpdateState((state) => {
      if (!state || !state.state) return;

      if (state.state === 'available') {
        const version = (state.version || '').toString().trim();
        const body = state.releaseNotes
          ? (typeof state.releaseNotes === 'string'
              ? state.releaseNotes
              : '新版本已发布，点击更新获得最新功能与修复')
          : '新版本已发布，点击更新获得最新功能与修复';

        if (version) versionEl.textContent = version;
        if (bodyEl) bodyEl.textContent = body;

        try { toast.style.display = 'block'; } catch (_) {}
        return;
      }

      if (state.state === 'downloading') {
        const pct = Number(state.percent || 0);
        const transferred = state.transferred;
        const total = state.total;
        const bytesPerSecond = state.bytesPerSecond;
        let label = '下载中…';
        if (typeof transferred === 'number' && typeof total === 'number' && total > 0) {
          const toMB = (b) => (b / (1024 * 1024)).toFixed(1) + ' MB';
          const speed = typeof bytesPerSecond === 'number' && bytesPerSecond > 0
            ? ' (' + toMB(bytesPerSecond) + '/s)'
            : '';
          label = '下载中 ' + Math.round(pct) + '%' + speed;
        } else if (pct > 0) {
          label = '下载中 ' + Math.round(pct) + '%';
        }
        if (progressWrap) progressWrap.style.display = 'block';
        if (progressFill) progressFill.style.width = Math.max(0, Math.min(100, pct)) + '%';
        if (progressText) progressText.textContent = label;
        try { toast.style.display = 'block'; } catch (_) {}
        return;
      }

      if (state.state === 'ready') {
        if (progressWrap) progressWrap.style.display = 'block';
        if (progressFill) progressFill.style.width = '100%';
        if (progressText) progressText.textContent = '更新包已下载完成，即将自动安装重启…';
        if (installBtn) installBtn.disabled = true;
        try { toast.style.display = 'block'; } catch (_) {}
        return;
      }

      if (state.state === 'error') {
        if (progressWrap) progressWrap.style.display = 'block';
        if (progressText) progressText.textContent = '更新失败，请稍后再试';
        if (installBtn) installBtn.disabled = false;
        try { toast.style.display = 'block'; } catch (_) {}
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  app.init();

  // 初始化右下角更新提示框（事件绑定为一次性，不会重复）
  try { if (typeof app.setupUpdateToast === 'function') app.setupUpdateToast(); } catch (e) {}

  // 终极兜底：15 秒后如果 splash 仍存在，强制移除并显示主应用
  setTimeout(() => {
    const splash = document.getElementById('splash');
    const app = document.getElementById('app');
    if (splash && splash.parentNode) {
      console.warn('[App] 兜底：强制移除启动画面');
      try {
        splash.style.display = 'none';
        splash.style.visibility = 'hidden';
      } catch (e) {}
      try {
        splash.parentNode.removeChild(splash);
      } catch (e) {}
    }
    if (app) {
      app.classList.remove('splash-hidden');
      app.style.visibility = 'visible';
      app.style.display = '';
    }
  }, 15000);
});
