const ai = {
    MAX_LENGTH: 2000,
    history: [], // [{ role, content, reasoning }]
    state: {
        customMode: false,
        apiKey: '',
        model: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com/v1',
        deepThinking: false,
        webSearch: false
    },
    activation: {
        activated: false,
        code: null,
        activatedAt: null
    },
    dev: {
        enabled: false
    },
    currentAssistantBubble: null,
    currentReasoningBubble: null,
    thinkingVisible: false,
    isStreaming: false,
    removeChunkListener: null,
    typingTimer: null,

    init() {
        if (typeof window.renderIcons === 'function') {
            try { window.renderIcons(); } catch (_) {}
        }
        this.bindEvents();
        this.loadSettings();
        this.loadHistory();
        try {
            this.dev.enabled = (localStorage.getItem('ai.dev.enabled') || '') === '1';
        } catch (_) {}
        this.refreshQuota();
        this.refreshActivation();
        this.renderAll();
        this.updateActivationUI();
        this.scheduleDailyReset();

        // 启动欢迎页标题的打字动画
        this.startTypingAnimation();

        // 监听流式 chunk
        if (window.zenith && zenith.ai && zenith.ai.onChunk) {
            this.removeChunkListener = zenith.ai.onChunk((chunk) => {
                this.handleChunk(chunk);
            });
        }
    },

    // 计算到下一个北京时间 00:00 的毫秒数，并在到时自动刷新额度
    scheduleDailyReset() {
        const refresh = () => {
            this.refreshQuota();
            // 设置下一次的定时器
            this.scheduleDailyReset();
        };

        // 用本地 Date 对象 + 偏移计算 "Asia/Shanghai (UTC+8)" 的下一个零点
        const now = new Date();
        // UTC+8 的本地"伪时间"
        const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
        const bjNow = new Date(utcMs + 8 * 3600 * 1000);
        const bjNextMidnight = new Date(
            bjNow.getFullYear(),
            bjNow.getMonth(),
            bjNow.getDate() + 1,
            0, 0, 0, 0
        );
        // 再转回本地 ms
        const deltaMs =
            bjNextMidnight.getTime() -
            8 * 3600 * 1000 -
            now.getTimezoneOffset() * 60000 -
            now.getTime();
        // 做一次防御性 clamp：至少 1 秒后，最多 25 小时后
        const delay = Math.min(Math.max(1000, deltaMs), 25 * 3600 * 1000);
        if (this._dailyResetTimer) clearTimeout(this._dailyResetTimer);
        this._dailyResetTimer = setTimeout(refresh, delay);
    },

    // 简易 Markdown 解析（适合 DeepSeek 的输出）
    // 支持：# / ## / ### / #### 标题、**粗体**、*斜体*、`code`、```代码块```、
    //       -/* 无序列表、1. 有序列表、> 引用、[txt](url) 链接、空行 -> <br>
    // 用 textContent 做底，保证流式增量渲染稳定
    escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    parseInline(text) {
        let html = this.escapeHtml(text);
        // 行内代码
        html = html.replace(/`([^`\n]+?)`/g, '<code class="ai-md-inline-code">$1</code>');
        // 链接
        html = html.replace(
            /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
            '<a class="ai-md-link" href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
        );
        // 粗体
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        // 斜体
        html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
        return html;
    },

    parseMarkdown(text) {
        const raw = String(text || '');
        const lines = raw.split('\n');
        const out = [];
        let inCodeBlock = false;
        let codeLang = '';
        let codeBuf = [];
        let inList = null; // 'ul' | 'ol' | null
        let inQuote = false;
        let quoteBuf = [];

        const closeList = () => {
            if (inList) {
                out.push(`</${inList}>`);
                inList = null;
            }
        };
        const closeQuote = () => {
            if (inQuote) {
                out.push('<div class="ai-md-quote">');
                out.push(quoteBuf.map((l) => this.parseInline(l)).join('<br>'));
                out.push('</div>');
                quoteBuf = [];
                inQuote = false;
            }
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (inCodeBlock) {
                if (/^```\s*$/.test(line)) {
                    out.push(
                        `<pre class="ai-md-code-block"><code${codeLang ? ' class="lang-' + codeLang + '"' : ''}>${
                            this.escapeHtml(codeBuf.join('\n'))
                        }</code></pre>`
                    );
                    codeBuf = [];
                    codeLang = '';
                    inCodeBlock = false;
                } else {
                    codeBuf.push(line);
                }
                continue;
            }
            if (/^```/.test(line)) {
                closeList();
                closeQuote();
                inCodeBlock = true;
                codeLang = line.replace(/^```/, '').trim();
                continue;
            }
            // 空行
            if (/^\s*$/.test(line)) {
                closeList();
                closeQuote();
                out.push('<br>');
                continue;
            }
            // 标题
            const h = /^(#{1,6})\s+(.*)$/.exec(line);
            if (h) {
                closeList();
                closeQuote();
                const level = h[1].length;
                out.push(`<h${level} class="ai-md-h${level}">${this.parseInline(h[2])}</h${level}>`);
                continue;
            }
            // 引用
            if (/^>\s?/.test(line)) {
                closeList();
                inQuote = true;
                quoteBuf.push(line.replace(/^>\s?/, ''));
                continue;
            }
            // 无序列表
            if (/^\s*[-*+]\s+/.test(line)) {
                closeQuote();
                if (inList !== 'ul') {
                    closeList();
                    out.push('<ul class="ai-md-list">');
                    inList = 'ul';
                }
                out.push(`<li>${this.parseInline(line.replace(/^\s*[-*+]\s+/, ''))}</li>`);
                continue;
            }
            // 有序列表
            if (/^\s*\d+\.\s+/.test(line)) {
                closeQuote();
                if (inList !== 'ol') {
                    closeList();
                    out.push('<ol class="ai-md-list ai-md-ol">');
                    inList = 'ol';
                }
                out.push(`<li>${this.parseInline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`);
                continue;
            }
            // 普通行
            closeList();
            closeQuote();
            out.push(`<div class="ai-md-p">${this.parseInline(line)}</div>`);
        }
        // 收尾
        if (inCodeBlock) {
            out.push(
                `<pre class="ai-md-code-block"><code>${this.escapeHtml(codeBuf.join('\n'))}</code></pre>`
            );
        }
        closeList();
        closeQuote();
        return out.join('\n');
    },

    bindEvents() {
        const input = document.getElementById('aiInput');
        const sendBtn = document.getElementById('aiSendBtn');
        const clearBtn = document.getElementById('aiClearBtn');

        if (input) {
            input.addEventListener('input', () => {
                const len = input.value.length;
                const counter = document.getElementById('aiInputCounter');
                if (counter) counter.textContent = `${len} / ${this.MAX_LENGTH}`;
                if (sendBtn) sendBtn.disabled = !this.canSend(len);

                // 自适应高度
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 180) + 'px';
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.isComposing) {
                    if (e.ctrlKey || e.metaKey) {
                        // Ctrl+Enter / Cmd+Enter：保持默认换行行为，不拦截
                        return;
                    }
                    // 仅 Enter：阻止默认换行，发送消息
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearHistory());
        }

        // === 激活相关 ===
        const showActivationBtn = document.getElementById('aiShowActivationBtn');
        const deactivateBtn = document.getElementById('aiDeactivateBtn');
        const activateBtn = document.getElementById('aiActivateBtn');
        const codeInput = document.getElementById('aiCodeInput');
        const toggleCustomFromOverlay = document.getElementById('aiToggleCustomFromOverlayBtn');

        if (showActivationBtn) {
            showActivationBtn.addEventListener('click', () => this.showActivationOverlay(true));
        }
        if (deactivateBtn) {
            deactivateBtn.addEventListener('click', () => this.deactivate());
        }
        if (activateBtn) {
            activateBtn.addEventListener('click', () => this.activate());
        }
        if (codeInput) {
            codeInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.isComposing && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    this.activate();
                }
            });
        }
        const openIfdianBtn = document.getElementById('aiOpenIfdianBtn');
        if (openIfdianBtn) {
            openIfdianBtn.addEventListener('click', () => {
                const url = 'https://www.ifdian.net/a/JasonDeng';
                if (window.zenith && window.zenith.system && typeof window.zenith.system.openExternal === 'function') {
                    window.zenith.system.openExternal(url);
                } else {
                    // 兜底：直接用浏览器打开
                    try {
                        const { shell } = require('electron');
                        shell.openExternal(url);
                    } catch (_) {
                        window.open(url, '_blank');
                    }
                }
            });
        }

        // === 开发者身份（快捷操作按钮 → 遮罩输入密码 → 激活；取消开发者身份按钮在激活状态卡片） ===
        const showDevBtn = document.getElementById('aiShowDevBtn');
        const devOverlay = document.getElementById('aiDevOverlay');
        const devOverlayBackdrop = devOverlay ? devOverlay.querySelector('.ai-activation-backdrop') : null;
        const devActivateBtnInOverlay = document.getElementById('aiDevActivateBtn');
        const devCloseBtn = document.getElementById('aiDevCloseBtn');
        const devCodeInputInOverlay = document.getElementById('aiDevCodeInput');
        const devPanelStatus = document.getElementById('aiDevPanelStatus');
        const devDeactivateBtnInActivation = document.getElementById('aiDevDeactivateBtn');

        if (showDevBtn) {
            showDevBtn.addEventListener('click', () => this.showDevOverlay(true));
        }
        if (devOverlayBackdrop) {
            devOverlayBackdrop.addEventListener('click', () => this.showDevOverlay(false));
        }
        if (devCloseBtn) {
            devCloseBtn.addEventListener('click', () => this.showDevOverlay(false));
        }
        const tryActivateDev = () => {
            const code = devCodeInputInOverlay ? devCodeInputInOverlay.value.trim() : '';
            if (code !== 'ZenithAdminPassword52323') {
                if (devPanelStatus) {
                    devPanelStatus.textContent = '开发者密码错误，请重试';
                    devPanelStatus.className = 'ai-activation-panel-status ai-activation-panel-status-error';
                } else if (typeof app !== 'undefined' && app.showToast) {
                    app.showToast('开发者密码错误', 'warning');
                } else {
                    alert('开发者密码错误');
                }
                return;
            }
            this.dev.enabled = true;
            try { localStorage.setItem('ai.dev.enabled', '1'); } catch (_) {}
            this.showDevOverlay(false);
            if (devCodeInputInOverlay) devCodeInputInOverlay.value = '';
            if (devPanelStatus) {
                devPanelStatus.textContent = '';
                devPanelStatus.className = 'ai-activation-panel-status';
            }
            this.updateActivationUI();
            if (typeof app !== 'undefined' && app.showToast) {
                app.showToast('已启用开发者身份', 'success');
            }
        };
        if (devActivateBtnInOverlay) {
            devActivateBtnInOverlay.addEventListener('click', tryActivateDev);
        }
        if (devCodeInputInOverlay) {
            devCodeInputInOverlay.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.isComposing && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    tryActivateDev();
                }
            });
        }
        if (devDeactivateBtnInActivation) {
            devDeactivateBtnInActivation.addEventListener('click', () => {
                this.dev.enabled = false;
                try { localStorage.removeItem('ai.dev.enabled'); } catch (_) {}
                this.updateActivationUI();
                if (typeof app !== 'undefined' && app.showToast) {
                    app.showToast('已取消开发者身份', 'success');
                }
            });
        }
        if (toggleCustomFromOverlay) {
            toggleCustomFromOverlay.addEventListener('click', () => {
                const toggle = document.getElementById('aiToggleCustomMode');
                if (toggle) {
                    toggle.checked = true;
                    toggle.dispatchEvent(new Event('change'));
                    this.showActivationOverlay(false);
                }
            });
        }

        // 建议点击
        document.querySelectorAll('.ai-suggestion').forEach((btn) => {
            btn.addEventListener('click', () => {
                const text = btn.getAttribute('data-suggest') || btn.textContent;
                const inputEl = document.getElementById('aiInput');
                if (inputEl) {
                    inputEl.value = text;
                    inputEl.dispatchEvent(new Event('input'));
                    inputEl.focus();
                }
            });
        });

        // 自定义模式开关
        const toggleCustom = document.getElementById('aiToggleCustomMode');
        if (toggleCustom) {
            toggleCustom.addEventListener('change', (e) => {
                this.state.customMode = e.target.checked;
                const panel = document.getElementById('aiCustomPanel');
                if (panel) panel.style.display = e.target.checked ? 'block' : 'none';
                this.updateModelHint();
                this.updateActivationUI();
                const inputEl = document.getElementById('aiInput');
                const sendBtnEl = document.getElementById('aiSendBtn');
                if (sendBtnEl && inputEl) {
                    sendBtnEl.disabled = !this.canSend(inputEl.value.length);
                }
            });
        }

        // 深度思考开关
        const toggleThinking = document.getElementById('aiToggleDeepThinking');
        if (toggleThinking) {
            toggleThinking.addEventListener('change', (e) => {
                this.state.deepThinking = e.target.checked;
            });
        }

        // 联网搜索开关
        const toggleWebSearch = document.getElementById('aiToggleWebSearch');
        if (toggleWebSearch) {
            toggleWebSearch.addEventListener('change', (e) => {
                this.state.webSearch = e.target.checked;
            });
            toggleWebSearch.checked = !!this.state.webSearch;
        }

        // 初始化深度思考开关状态
        if (toggleThinking) {
            toggleThinking.checked = !!this.state.deepThinking;
        }

        // 保存 / 恢复
        const saveBtn = document.getElementById('aiSaveSettingsBtn');
        if (saveBtn) saveBtn.addEventListener('click', () => this.saveSettings());
        const resetBtn = document.getElementById('aiResetSettingsBtn');
        if (resetBtn) resetBtn.addEventListener('click', () => this.resetSettings());
    },

    // 是否允许发送（必须同时满足：字符数 / 非流式 / 已激活 或 自定义模式 或 开发模式）
    canSend(length) {
        const len = typeof length === 'number' ? length : 0;
        if (this.isStreaming) return false;
        // 开发者身份：除了空消息都允许，绕过字符/每日消息限制
        if (this.dev.enabled) {
            return len > 0;
        }
        if (len === 0 || len > this.MAX_LENGTH) return false;
        if (this.state.customMode) return true;
        return !!this.activation.activated;
    },

    async refreshActivation() {
        try {
            if (!window.zenith || !zenith.ai || !zenith.ai.getActivation) return;
            const res = await zenith.ai.getActivation();
            this.activation.activated = !!(res && res.activated);
            this.activation.code = (res && res.code) || null;
            this.activation.activatedAt = (res && res.activatedAt) || null;
            this.updateActivationUI();
        } catch (e) {
            console.error('[AI] refreshActivation failed:', e.message);
        }
    },

    updateActivationUI() {
        const label = document.getElementById('aiActivationLabel');
        const dot = document.getElementById('aiActivationDot');
        const sub = document.getElementById('aiActivationSub');
        const actions = document.getElementById('aiActivationActions');
        const overlay = document.getElementById('aiActivationOverlay');
        const sendBtn = document.getElementById('aiSendBtn');
        const input = document.getElementById('aiInput');
        const counter = document.getElementById('aiInputCounter');
        const inputEl = document.getElementById('aiInput');

        const showActivationBtn = document.getElementById('aiShowActivationBtn');
        const deactivateBtn = document.getElementById('aiDeactivateBtn');
        const devDeactivateBtn = document.getElementById('aiDevDeactivateBtn');
        const showDevBtn = document.getElementById('aiShowDevBtn');

        const activated = !!this.activation.activated;
        const custom = !!this.state.customMode;

        // 1. 激活状态卡片按钮显示：
        //    - 「输入激活码」：未激活且不是自定义且未启用开发身份时显示
        //    - 「取消激活」：已激活（不是管理员激活码，这里统一是激活后就显示，用来撤销激活状态）
        //    - 「取消开发者身份」：仅当开发者身份已启用时显示
        if (showActivationBtn) {
            showActivationBtn.style.display = (!activated && !custom && !this.dev.enabled) ? '' : 'none';
        }
        if (deactivateBtn) {
            deactivateBtn.style.display = (activated && !this.dev.enabled) ? '' : 'none';
        }
        if (devDeactivateBtn) {
            devDeactivateBtn.style.display = this.dev.enabled ? '' : 'none';
        }
        if (actions) {
            // 如果三个按钮都隐藏，则隐藏整个 actions 容器
            const anyVisible = [showActivationBtn, deactivateBtn, devDeactivateBtn].some((el) => {
                return el && el.style.display !== 'none';
            });
            actions.style.display = anyVisible ? '' : 'none';
        }

        // 2. 快捷操作里的开发者按钮：如果已经是开发者身份，则按钮文案改为"已启用开发者身份"且不可用
        if (showDevBtn) {
            if (this.dev.enabled) {
                showDevBtn.textContent = '已启用开发者身份';
                showDevBtn.disabled = true;
                showDevBtn.style.opacity = '0.75';
            } else {
                showDevBtn.textContent = '启用开发者身份';
                showDevBtn.disabled = false;
                showDevBtn.style.opacity = '';
            }
        }

        if (label) {
            if (this.dev.enabled) label.textContent = '开发者身份';
            else if (custom) label.textContent = '自定义模型（免激活）';
            else if (activated) label.textContent = '已激活';
            else label.textContent = '未激活';
        }
        if (dot) {
            let cls = 'ai-activation-dot-off';
            if (this.dev.enabled) cls = 'ai-activation-dot-custom';
            else if (custom) cls = 'ai-activation-dot-custom';
            else if (activated) cls = 'ai-activation-dot-on';
            dot.className = 'ai-activation-dot ' + cls;
        }
        if (sub) {
            if (this.dev.enabled) sub.textContent = '开发者模式：已绕过每日消息上限与 2000 字符上限';
            else if (custom) sub.textContent = '使用你自己的 API Key / 模型，不受每日 40 条与激活门槛限制';
            else if (activated && this.activation.activatedAt) {
                const d = new Date(this.activation.activatedAt);
                sub.textContent = `激活于 ${d.toLocaleString()}`;
            } else {
                sub.textContent = '请输入激活码（爱发电订单号），或开启自定义模型后使用';
            }
        }

        // 遮罩：默认模式且未激活时显示；开发者身份或自定义或普通激活均关闭
        if (overlay) {
            const show = !custom && !activated && !this.dev.enabled;
            overlay.style.display = show ? '' : 'none';
        }

        // 开发模式下调整提示
        if (counter && inputEl) {
            const len = inputEl.value.length;
            if (this.dev.enabled) {
                counter.textContent = `${len} 字符（开发模式，无上限）`;
            } else {
                counter.textContent = `${len} / ${this.MAX_LENGTH}`;
            }
        }

        // 发送按钮
        if (sendBtn && input) {
            sendBtn.disabled = !this.canSend(input.value.length);
        }
    },

    showActivationOverlay(show) {
        const overlay = document.getElementById('aiActivationOverlay');
        if (!overlay) return;
        overlay.style.display = show ? '' : 'none';
        if (show) {
            const ci = document.getElementById('aiCodeInput');
            if (ci) ci.focus();
        }
    },

    showDevOverlay(show) {
        const overlay = document.getElementById('aiDevOverlay');
        if (!overlay) return;
        overlay.style.display = show ? '' : 'none';
        if (show) {
            const ci = document.getElementById('aiDevCodeInput');
            if (ci) ci.focus();
        } else {
            // 关闭时清空输入和状态
            const ci = document.getElementById('aiDevCodeInput');
            const status = document.getElementById('aiDevPanelStatus');
            if (ci) ci.value = '';
            if (status) {
                status.textContent = '';
                status.className = 'ai-activation-panel-status';
            }
        }
    },

    setActivationPanelStatus(text, isError) {
        const el = document.getElementById('aiActivationPanelStatus');
        if (!el) return;
        el.textContent = text || '';
        el.className = 'ai-activation-panel-status' + (isError ? ' ai-activation-panel-status-error' : '');
    },

    async activate() {
        const input = document.getElementById('aiCodeInput');
        const code = input ? input.value.trim() : '';
        if (!code) {
            this.setActivationPanelStatus('请输入激活码（爱发电订单号）', true);
            return;
        }
        if (!window.zenith || !zenith.ai) return;
        this.setActivationPanelStatus('正在验证...', false);
        try {
            const res = await zenith.ai.activate(code);
            if (res && res.ok) {
                this.activation.activated = true;
                this.activation.code = code;
                this.activation.activatedAt = res.activatedAt || Date.now();
                this.setActivationPanelStatus(res.already ? '当前已使用此激活码激活' : '激活成功！', false);
                this.updateActivationUI();
                this.refreshQuota();
                // 成功后 800ms 自动关闭遮罩
                setTimeout(() => this.showActivationOverlay(false), 800);
            } else {
                const msg = (res && res.error) || '激活失败，请检查激活码是否正确';
                this.setActivationPanelStatus(msg, true);
            }
        } catch (e) {
            console.error('[AI] activate error:', e.message);
            this.setActivationPanelStatus('激活失败：' + (e.message || '未知错误'), true);
        }
    },

    async deactivate() {
        if (!window.zenith || !zenith.ai) return;
        try {
            await zenith.ai.deactivate();
            this.activation.activated = false;
            this.activation.code = null;
            this.activation.activatedAt = null;
            this.updateActivationUI();
            app.showToast('已取消本机激活', 'success');
        } catch (e) {
            console.error('[AI] deactivate error:', e.message);
        }
    },

    async loadSettings() {
        try {
            const config = await zenith.config.getAll();
            if (config) {
                this.state.customMode = !!config.aiCustomMode;
                this.state.apiKey = config.aiApiKey || '';
                this.state.model = config.aiModel || 'deepseek-chat';
                this.state.baseUrl = config.aiBaseUrl || 'https://api.deepseek.com/v1';
                this.state.deepThinking = !!config.aiDeepThinking;
                this.state.webSearch = !!config.aiWebSearch;
            }
            this.applySettingsToUI();
        } catch (e) {
            console.error('[AI] loadSettings failed:', e.message);
        }
    },

    applySettingsToUI() {
        const toggleCustom = document.getElementById('aiToggleCustomMode');
        const toggleThinking = document.getElementById('aiToggleDeepThinking');
        const toggleWebSearch = document.getElementById('aiToggleWebSearch');
        const inputKey = document.getElementById('aiInputApiKey');
        const inputModel = document.getElementById('aiInputModel');
        const inputBase = document.getElementById('aiInputBaseUrl');

        if (toggleCustom) toggleCustom.checked = !!this.state.customMode;
        if (toggleThinking) toggleThinking.checked = !!this.state.deepThinking;
        if (toggleWebSearch) toggleWebSearch.checked = !!this.state.webSearch;
        if (panel) panel.style.display = this.state.customMode ? 'block' : 'none';
        if (inputKey) inputKey.value = this.state.apiKey;
        if (inputModel) inputModel.value = this.state.model;
        if (inputBase) inputBase.value = this.state.baseUrl;
        this.updateModelHint();
    },

    async saveSettings() {
        const inputKey = document.getElementById('aiInputApiKey');
        const inputModel = document.getElementById('aiInputModel');
        const inputBase = document.getElementById('aiInputBaseUrl');
        const toggleCustom = document.getElementById('aiToggleCustomMode');
        const toggleThinking = document.getElementById('aiToggleDeepThinking');
        const toggleWebSearch = document.getElementById('aiToggleWebSearch');

        this.state.customMode = toggleCustom ? toggleCustom.checked : false;
        this.state.deepThinking = toggleThinking ? toggleThinking.checked : false;
        this.state.webSearch = toggleWebSearch ? toggleWebSearch.checked : false;
        this.state.apiKey = inputKey ? inputKey.value.trim() : '';
        this.state.model = inputModel ? inputModel.value.trim() : 'deepseek-chat';
        this.state.baseUrl = inputBase ? inputBase.value.trim() : 'https://api.deepseek.com/v1';

        try {
            await Promise.all([
                zenith.config.set('aiCustomMode', this.state.customMode),
                zenith.config.set('aiApiKey', this.state.apiKey),
                zenith.config.set('aiModel', this.state.model),
                zenith.config.set('aiBaseUrl', this.state.baseUrl),
                zenith.config.set('aiDeepThinking', this.state.deepThinking),
                zenith.config.set('aiWebSearch', this.state.webSearch)
            ]);
            app.showToast('AI 设置已保存', 'success');
            this.updateModelHint();
            await this.refreshQuota();
        } catch (e) {
            app.showToast('保存失败: ' + e.message, 'error');
        }
    },

    async resetSettings() {
        this.state.customMode = false;
        this.state.apiKey = '';
        this.state.model = 'deepseek-chat';
        this.state.baseUrl = 'https://api.deepseek.com/v1';
        this.state.deepThinking = false;
        try {
            await Promise.all([
                zenith.config.set('aiCustomMode', false),
                zenith.config.set('aiApiKey', ''),
                zenith.config.set('aiModel', 'deepseek-chat'),
                zenith.config.set('aiBaseUrl', 'https://api.deepseek.com/v1'),
                zenith.config.set('aiDeepThinking', false)
            ]);
            this.applySettingsToUI();
            app.showToast('已恢复默认设置', 'success');
            this.refreshQuota();
        } catch (e) {
            app.showToast('重置失败: ' + e.message, 'error');
        }
    },

    updateModelHint() {
        const el = document.getElementById('aiCurrentModelInfo');
        if (!el) return;
        if (this.state.customMode) {
            el.textContent = `自定义模型 · ${this.state.model || '未设置'}`;
        } else {
            el.textContent = '使用 DeepSeek Flash';
        }
    },

    async loadHistory() {
        try {
            const history = await zenith.config.get('aiHistory', []);
            this.history = Array.isArray(history) ? history : [];
        } catch (e) {
            this.history = [];
        }
    },

    async persistHistory() {
        try {
            await zenith.config.set('aiHistory', this.history.slice(-100));
        } catch (e) {
            console.warn('[AI] persistHistory failed:', e.message);
        }
    },

    async refreshQuota() {
        try {
            if (!zenith.ai || !zenith.ai.getQuota) return;
            const info = await zenith.ai.getQuota();
            if (!info || !info.ok) return;

            const used = document.getElementById('aiQuotaUsed');
            const limit = document.getElementById('aiQuotaLimit');
            const hint = document.getElementById('aiQuotaHint');
            const bar = document.getElementById('aiQuotaBarFill');

            if (used) used.textContent = this.state.customMode ? '∞' : String(info.count);
            if (limit) limit.textContent = this.state.customMode ? '—' : String(info.dailyLimit);
            if (bar) {
                const pct = this.state.customMode ? 0 : Math.min(100, (info.count / info.dailyLimit) * 100);
                bar.style.width = pct + '%';
            }
            if (hint) {
                hint.textContent = this.state.customMode
                    ? '自定义模式：不限条数 · 单条最长 2000 字符'
                    : `默认模式：每日 ${info.dailyLimit} 条 · 单条最长 2000 字符`;
            }
        } catch (e) {
            console.warn('[AI] refreshQuota failed:', e.message);
        }
    },

    renderAll() {
        const messagesEl = document.getElementById('aiMessages');
        if (!messagesEl) return;

        // 清掉除 empty 以外的节点
        const empty = document.getElementById('aiEmpty');
        messagesEl.innerHTML = '';
        if (this.history.length === 0) {
            if (empty) messagesEl.appendChild(empty);
        } else {
            for (const msg of this.history) {
                this.appendMessage(msg.role, msg.content, msg.reasoning);
            }
            this.scrollToBottom();
        }
    },

    appendMessage(role, content, reasoning) {
        const messagesEl = document.getElementById('aiMessages');
        const empty = document.getElementById('aiEmpty');
        if (!messagesEl) return null;

        // 移除空状态
        if (empty && empty.parentElement === messagesEl) {
            empty.remove();
        }

        const wrapper = document.createElement('div');
        wrapper.className = `ai-message ai-message-${role === 'user' ? 'user' : 'assistant'}`;

        const avatar = document.createElement('div');
        avatar.className = 'ai-message-avatar';
        // 直接写入 SVG，避免依赖 renderIcons 的 DOMContentLoaded 时机
        avatar.innerHTML = typeof window.icon === 'function'
            ? (role === 'user' ? window.icon('user') : window.icon('sparkle'))
            : (role === 'user'
                ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
                : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="svg-icon"><path d="M12 2c.5 2.5 1.5 4 3 5.5 1.5 1.5 3 2.5 5.5 3-2.5.5-4 1.5-5.5 3C13.5 15 12.5 16.5 12 19c-.5-2.5-1.5-4-3-5.5C7.5 12 6 11 3.5 10.5c2.5-.5 4-1.5 5.5-3C10.5 6 11.5 4.5 12 2z"/></svg>');
        wrapper.appendChild(avatar);

        const body = document.createElement('div');
        body.className = 'ai-message-body';

        const name = document.createElement('div');
        name.className = 'ai-message-name';
        name.textContent = role === 'user' ? '你' : 'Zenith AI';
        body.appendChild(name);

        // 思考内容
        if (reasoning && String(reasoning).length > 0) {
            const reasoningEl = document.createElement('div');
            reasoningEl.className = 'ai-message-reasoning';
            reasoningEl.innerHTML = `
                <div class="ai-reasoning-header">
                    <span class="ai-reasoning-toggle">
                        <span class="ai-reasoning-icon">❯</span>
                        <span class="ai-reasoning-title">思考过程</span>
                    </span>
                </div>
                <div class="ai-reasoning-content" style="display:block;"></div>
            `;
            const contentEl = reasoningEl.querySelector('.ai-reasoning-content');
            contentEl.textContent = reasoning;

            // 点击折叠
            reasoningEl.querySelector('.ai-reasoning-toggle').addEventListener('click', () => {
                const c = reasoningEl.querySelector('.ai-reasoning-content');
                if (c.style.display === 'none') {
                    c.style.display = 'block';
                    reasoningEl.querySelector('.ai-reasoning-icon').style.transform = 'rotate(90deg)';
                } else {
                    c.style.display = 'none';
                    reasoningEl.querySelector('.ai-reasoning-icon').style.transform = 'rotate(0deg)';
                }
            });
            reasoningEl.querySelector('.ai-reasoning-icon').style.display = 'inline-block';
            reasoningEl.querySelector('.ai-reasoning-icon').style.transform = 'rotate(90deg)';
            body.appendChild(reasoningEl);
        }

        const contentEl = document.createElement('div');
        contentEl.className = 'ai-message-content';
        // 助理消息用 Markdown 渲染；用户消息保持纯文本
        if (role === 'assistant') {
            contentEl.innerHTML = this.parseMarkdown(content || '');
        } else {
            contentEl.textContent = content || '';
        }
        body.appendChild(contentEl);

        // 助理消息右下角加入操作栏：复制按钮
        if (role === 'assistant') {
            const actionsBar = document.createElement('div');
            actionsBar.className = 'ai-message-actions';
            const copyBtn = document.createElement('button');
            copyBtn.className = 'btn btn-ghost btn-small ai-message-action-btn';
            copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon-small" style="vertical-align:middle;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> <span>复制</span>`;
            copyBtn.title = '复制这条消息';
            copyBtn.addEventListener('click', () => {
                this.copyMessage(content, copyBtn);
            });
            actionsBar.appendChild(copyBtn);
            body.appendChild(actionsBar);
        }

        wrapper.appendChild(body);
        messagesEl.appendChild(wrapper);
        this.scrollToBottom();
        return wrapper;
    },

    scrollToBottom() {
        const messagesEl = document.getElementById('aiMessages');
        if (messagesEl) {
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }
    },

    copyMessage(content, btn) {
        // 优先从气泡 DOM 取 innerText，避免复制 Markdown 标签；否则用传入的 content
        let text = '';
        try {
            const wrapper = btn && btn.closest && btn.closest('.ai-message');
            const contentEl = wrapper && wrapper.querySelector('.ai-message-content');
            if (contentEl) {
                text = contentEl.innerText || contentEl.textContent || '';
            }
        } catch (_) {}
        if (!text) text = String(content || '');
        text = text.trim();

        const done = () => {
            if (!btn) return;
            const span = btn.querySelector('span');
            const originalText = span ? span.textContent : '';
            btn.classList.add('ai-message-action-btn-active');
            if (span) span.textContent = '已复制';
            setTimeout(() => {
                btn.classList.remove('ai-message-action-btn-active');
                if (span) span.textContent = originalText;
            }, 1500);
        };
        const fallback = () => {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                ta.style.top = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                done();
            } catch (_) {
                if (typeof window.app !== 'undefined' && typeof window.app.showToast === 'function') {
                    window.app.showToast('复制失败，请手动选择', 'warning');
                }
            }
        };
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(done).catch(fallback);
            } else {
                fallback();
            }
        } catch (_) {
            fallback();
        }
    },

    // 为一个已渲染的助理气泡追加"复制"操作按钮（用于流式消息）
    appendCopyButtonToAssistantBubble(wrapper) {
        if (!wrapper) return;
        const body = wrapper.querySelector('.ai-message-body');
        if (!body) return;
        // 避免重复添加
        if (body.querySelector('.ai-message-actions')) return;
        const actionsBar = document.createElement('div');
        actionsBar.className = 'ai-message-actions';
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn btn-ghost btn-small ai-message-action-btn';
        copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;vertical-align:-3px;margin-right:4px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>复制</span>`;
        copyBtn.title = '复制这条消息';
        copyBtn.addEventListener('click', () => {
            this.copyMessage(null, copyBtn);
        });
        actionsBar.appendChild(copyBtn);
        body.appendChild(actionsBar);
    },

    // 构造一个"联网搜索"徽章（可用于流式消息和 appendMessage 的助理气泡）
    // status: 'ok' | 'failed' | 'skipped' | 'disabled'
    makeWebSearchBadge(status, engine) {
        if (!status || status === 'disabled') return null;
        const badge = document.createElement('div');
        badge.className = 'ai-message-websearch-badge';
        const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;vertical-align:-2px;margin-right:4px;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
        if (status === 'ok') {
            const eng = engine ? `（${engine}）` : '';
            badge.innerHTML = `${iconSvg}联网搜索${eng} · 已注入结果`;
            badge.title = '已将网络搜索摘要注入模型上下文，回答会引用最新信息';
            badge.classList.add('ai-message-websearch-badge-ok');
        } else if (status === 'failed') {
            badge.innerHTML = `${iconSvg}联网搜索失败 · 已切换到模型自身知识`;
            badge.title = '本地网络/搜索引擎未返回有效结果，但聊天仍会继续';
            badge.classList.add('ai-message-websearch-badge-failed');
        } else if (status === 'skipped') {
            badge.innerHTML = `${iconSvg}已跳过搜索（消息无需联网）`;
            badge.classList.add('ai-message-websearch-badge-skipped');
        } else {
            return null;
        }
        return badge;
    },

    async sendMessage() {
        if (this.isStreaming) return;
        const input = document.getElementById('aiInput');
        const text = input ? input.value.trim() : '';
        if (!text) return;
        if (!this.dev.enabled && text.length > this.MAX_LENGTH) {
            app.showToast(`单条消息不能超过 ${this.MAX_LENGTH} 字符`, 'warning');
            return;
        }
        // 激活/每日额度/自定义模式合法性检查（防止绕过 UI）—— 开发模式直接跳过
        if (!this.state.customMode && !this.activation.activated && !this.dev.enabled) {
            app.showToast('请先输入激活码，或在侧边栏开启"自定义模型"', 'warning');
            this.showActivationOverlay(true);
            return;
        }

        this.isStreaming = true;
        const sendBtn = document.getElementById('aiSendBtn');
        if (sendBtn) sendBtn.disabled = true;

        // 清空输入框
        input.value = '';
        input.style.height = 'auto';
        const counter = document.getElementById('aiInputCounter');
        if (counter) counter.textContent = `0 / ${this.MAX_LENGTH}`;

        // 插入用户消息
        this.appendMessage('user', text);
        this.history.push({ role: 'user', content: text });

        // 插入一个空的助理消息（等待流式输出）
        const messagesEl = document.getElementById('aiMessages');
        const empty = document.getElementById('aiEmpty');
        if (empty && empty.parentElement === messagesEl) empty.remove();

        const wrapper = document.createElement('div');
        wrapper.className = 'ai-message ai-message-assistant ai-message-streaming';
        const placeholderText = this.state.webSearch ? '正在联网搜索中…' : '…';
        wrapper.innerHTML = `
            <div class="ai-message-avatar">${typeof window.icon === 'function' ? window.icon('sparkle') : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="svg-icon"><path d="M12 2c.5 2.5 1.5 4 3 5.5 1.5 1.5 3 2.5 5.5 3-2.5.5-4 1.5-5.5 3C13.5 15 12.5 16.5 12 19c-.5-2.5-1.5-4-3-5.5C7.5 12 6 11 3.5 10.5c2.5-.5 4-1.5 5.5-3C10.5 6 11.5 4.5 12 2z"/></svg>'}</div>
            <div class="ai-message-body">
                <div class="ai-message-name">Zenith AI</div>
                <div class="ai-message-reasoning" style="display:none;">
                    <div class="ai-reasoning-header">
                        <span class="ai-reasoning-toggle">
                            <span class="ai-reasoning-icon" style="display:inline-block;transform:rotate(90deg);">❯</span>
                            <span class="ai-reasoning-title">思考过程</span>
                        </span>
                    </div>
                    <div class="ai-reasoning-content"></div>
                </div>
                <div class="ai-message-content">${placeholderText}</div>
            </div>
        `;
        messagesEl.appendChild(wrapper);

        const reasoningEl = wrapper.querySelector('.ai-message-reasoning');
        const reasoningContent = wrapper.querySelector('.ai-reasoning-content');
        const assistantContent = wrapper.querySelector('.ai-message-content');

        // 折叠思考
        const reasoningToggle = reasoningEl.querySelector('.ai-reasoning-toggle');
        if (reasoningToggle) {
            reasoningToggle.addEventListener('click', () => {
                const c = reasoningEl.querySelector('.ai-reasoning-content');
                if (c.style.display === 'none') {
                    c.style.display = 'block';
                    reasoningEl.querySelector('.ai-reasoning-icon').style.transform = 'rotate(90deg)';
                } else {
                    c.style.display = 'none';
                    reasoningEl.querySelector('.ai-reasoning-icon').style.transform = 'rotate(0deg)';
                }
            });
        }

        this.currentAssistantBubble = assistantContent;
        this.currentReasoningBubble = reasoningContent;
        this.currentReasoningWrapper = reasoningEl;

        let finalContent = '';
        let finalReasoning = '';

        try {
            const result = await zenith.ai.chat({
                userMessage: text,
                history: this.history.slice(-30).map((h) => ({ role: h.role, content: h.content })),
                customMode: this.state.customMode,
                devMode: !!this.dev.enabled,
                apiKey: this.state.apiKey,
                model: this.state.model,
                baseUrl: this.state.baseUrl,
                deepThinking: this.state.deepThinking,
                webSearch: this.state.webSearch
            });

            if (!result || !result.ok) {
                const err = (result && result.error) || '请求失败';
                if (assistantContent) {
                    assistantContent.textContent = '';
                    const errEl = document.createElement('span');
                    errEl.className = 'ai-message-error';
                    errEl.textContent = err;
                    assistantContent.appendChild(errEl);
                }
            } else {
                // 若流式已经渲染过内容，这里不需要再替换；否则直接渲染
                // result.content / result.reasoning 是主进程返回的完整值
                if (result.reasoning && String(result.reasoning).length > 0 && (!finalReasoning || finalReasoning.length < String(result.reasoning).length)) {
                    finalReasoning = result.reasoning;
                    if (reasoningEl) {
                        reasoningEl.style.display = 'block';
                        if (reasoningContent) reasoningContent.textContent = result.reasoning;
                    }
                }
                if (result.content && (!finalContent || finalContent.length < String(result.content).length)) {
                    finalContent = result.content;
                    if (assistantContent) assistantContent.innerHTML = this.parseMarkdown(result.content);
                }

                // 在消息头部插入"联网搜索"徽章
                try {
                    if (this.state.webSearch) {
                    const status = (result && result.webSearch && result.webSearch.status) || 'disabled';
                    const badge = this.makeWebSearchBadge(status, result && result.webSearch && result.webSearch.engine);
                    if (badge && wrapper && wrapper.querySelector) {
                        const body = wrapper.querySelector('.ai-message-body');
                        if (body && !body.querySelector('.ai-message-websearch-badge')) {
                            body.insertBefore(badge, body.firstChild.nextSibling);
                        }
                    }
                }
                } catch (_) {
                    // 徽章渲染失败不影响聊天
                }

                // 保存
                this.history.push({
                    role: 'assistant',
                    content: finalContent || '',
                    reasoning: finalReasoning || undefined
                });
                await this.persistHistory();
                await this.refreshQuota();
            }
        } catch (e) {
            console.error('[AI] sendMessage failed:', e.message);
            if (assistantContent) {
                assistantContent.textContent = '';
                const errEl = document.createElement('span');
                errEl.className = 'ai-message-error';
                errEl.textContent = '出错了：' + e.message;
                assistantContent.appendChild(errEl);
            }
        } finally {
            wrapper.classList.remove('ai-message-streaming');
            this.isStreaming = false;
            this.currentAssistantBubble = null;
            this.currentReasoningBubble = null;
            this.currentReasoningWrapper = null;
            const sendBtnEl = document.getElementById('aiSendBtn');
            if (sendBtnEl) sendBtnEl.disabled = false;
            // 流式结束后给助理气泡追加"复制"按钮（避免流式过程中被替换掉）
            this.appendCopyButtonToAssistantBubble(wrapper);
            this.scrollToBottom();
        }
    },

    handleChunk(chunk) {
        if (!chunk) return;
        const type = chunk.type;
        const content = chunk.content || '';
        const fullContent = chunk.fullContent || '';
        const fullReasoning = chunk.fullReasoning || '';

        if (type === 'reasoning') {
            if (this.currentReasoningWrapper) this.currentReasoningWrapper.style.display = 'block';
            if (this.currentReasoningBubble) {
                this.currentReasoningBubble.textContent = fullReasoning;
            }
        } else if (type === 'content') {
            if (this.currentAssistantBubble) {
                // 流式渲染时也按 Markdown 解析，这样标题/代码/列表能实时显示
                this.currentAssistantBubble.innerHTML = this.parseMarkdown(fullContent);
            }
        }
        this.scrollToBottom();
    },

    // 欢迎页标题打字动画（打字 → 退格 → 循环）
    startTypingAnimation() {
        // 停止之前的动画，避免重复
        this.stopTypingAnimation();
        const titleEl = document.getElementById('aiEmptyTitle');
        if (!titleEl) return;
        // 确保标题内部结构正确
        if (!titleEl.querySelector('.ai-typing-text')) {
            titleEl.innerHTML = '<span class="ai-typing-text"></span><span class="ai-typing-caret"></span>';
        }
        const textEl = titleEl.querySelector('.ai-typing-text');
        const text = '你好，我是 Zenith AI 助手';
        let index = 0;
        let deleting = false;

        const tick = () => {
            if (!deleting) {
                // 打字
                index++;
                textEl.textContent = text.substring(0, index);
                if (index >= text.length) {
                    deleting = true;
                    this.typingTimer = setTimeout(tick, 1500); // 打完后停顿
                    return;
                }
                // 中文字符稍慢，数字字母稍快，用统一速度
                const char = text.charAt(index - 1);
                const delay = /[\u4e00-\u9fa5]/.test(char) ? 140 : 80;
                this.typingTimer = setTimeout(tick, delay);
            } else {
                // 退格
                index--;
                textEl.textContent = text.substring(0, index);
                if (index <= 0) {
                    deleting = false;
                    this.typingTimer = setTimeout(tick, 800); // 清空后停顿
                    return;
                }
                this.typingTimer = setTimeout(tick, 50);
            }
        };

        // 开始稍微延迟一点，让页面渲染完成
        this.typingTimer = setTimeout(tick, 400);
    },

    stopTypingAnimation() {
        if (this.typingTimer) {
            clearTimeout(this.typingTimer);
            this.typingTimer = null;
        }
    },

    async clearHistory() {
        this.history = [];
        try { await zenith.config.set('aiHistory', []); } catch (e) {}
        const messagesEl = document.getElementById('aiMessages');
        if (!messagesEl) return;

        // 停止之前的打字动画
        this.stopTypingAnimation();

        // 重新渲染空状态
        messagesEl.innerHTML = '';
        const empty = document.createElement('div');
        empty.className = 'ai-empty';
        empty.id = 'aiEmpty';
        empty.innerHTML = `
            <div class="ai-empty-icon"><img src="assets/logo.png" alt="Zenith" class="ai-logo-img"/></div>
            <div class="ai-empty-title" id="aiEmptyTitle"><span class="ai-typing-text"></span><span class="ai-typing-caret"></span></div>
            <div class="ai-empty-sub">我可以帮你解答 Minecraft 相关问题，也可以提供一般技术支持。</div>
            <div class="ai-empty-suggestions">
              <button class="ai-suggestion" data-suggest="如何在 Zenith 中下载 Minecraft 1.21？">如何在 Zenith 中下载 Minecraft 1.21？</button>
              <button class="ai-suggestion" data-suggest="Fabric 和 Forge 有什么区别？">Fabric 和 Forge 有什么区别？</button>
              <button class="ai-suggestion" data-suggest="推荐一些值得玩的模组整合包">推荐一些值得玩的模组整合包</button>
              <button class="ai-suggestion" data-suggest="我的启动器打不开，怎么办？">我的启动器打不开，怎么办？</button>
            </div>
        `;
        messagesEl.appendChild(empty);

        // 重新绑定建议按钮的事件
        empty.querySelectorAll('.ai-suggestion').forEach((btn) => {
            btn.addEventListener('click', () => {
                const text = btn.getAttribute('data-suggest') || btn.textContent;
                const inputEl = document.getElementById('aiInput');
                if (inputEl) {
                    inputEl.value = text;
                    inputEl.dispatchEvent(new Event('input'));
                    inputEl.focus();
                }
            });
        });
        this.startTypingAnimation();
        app.showToast('对话已清空', 'success');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // 稍微延迟，避免 icons.js 未注入导致 data-icon 未渲染
    setTimeout(() => ai.init(), 30);
});
