const settings = {
  init() {
    this.renderSettings();
    this.setupSaveButton();
  },

  setupSaveButton() {
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!target) return;
      const onclick = target.getAttribute && target.getAttribute('onclick');
      if (!onclick) return;
    });
  },

  async renderSettings() {
    const layout = document.querySelector('.settings-layout');
    if (!layout) return;

    try {
      const config = await zenith.config.getAll();
      const javaInstallations = await zenith.java.detect();

      // 检测已安装的Java版本
      const installedVersions = new Set();
      javaInstallations.forEach(j => installedVersions.add(String(j.majorVersion)));

      let html = `
        <div class="settings-section section-feedback">
          <div class="settings-section-header">
            <h2>反馈</h2>
          </div>
          <div class="settings-section-body">
            <div class="settings-row">
              <div class="settings-label">
                <span class="settings-label-text">提交问题 / 建议</span>
                <span class="settings-label-hint">前往 GitHub Issues 反馈 bug 或功能请求</span>
              </div>
              <div class="settings-value">
                <button class="btn btn-primary" id="feedbackBtn">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon-small" style="vertical-align:middle;margin-right:4px;"><path d="M12 2a10 10 0 00-8.946 14.646L2 22l5.354-1.054A10 10 0 1012 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  <span>反馈</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-header">
            <h2>游戏设置</h2>
          </div>
          <div class="settings-section-body">
            <div class="settings-row">
              <div class="settings-label">
                <span class="settings-label-text">Minecraft 目录</span>
                <span class="settings-label-hint">游戏文件的存储位置</span>
              </div>
              <div class="settings-value section-minecraft-dir">
                <input type="text" id="mcDirInput" value="${config.minecraftDir || ''}">
                <button class="btn btn-secondary" onclick="settings.selectMinecraftDir()">浏览</button>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-label">
                <span class="settings-label-text">启动窗口大小</span>
                <span class="settings-label-hint">游戏启动时的窗口尺寸</span>
              </div>
              <div class="settings-value section-memory">
                <input type="number" id="windowWidth" value="${config.width || 854}" min="640">
                <span>×</span>
                <input type="number" id="windowHeight" value="${config.height || 480}" min="480">
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-label">
                <span class="settings-label-text">服务器地址</span>
                <span class="settings-label-hint">启动后自动连接到此服务器（留空则不自动连接）</span>
              </div>
              <div class="settings-value">
                <input type="text" id="serverIp" placeholder="服务器IP:端口" value="${config.serverIp || ''}">
              </div>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-header">
            <h2>Java 设置</h2>
          </div>
          <div class="settings-section-body">
            <div class="settings-row">
              <div class="settings-label">
                <span class="settings-label-text">内存分配</span>
                <span class="settings-label-hint">最小和最大内存（MB）</span>
              </div>
              <div class="settings-value section-memory">
                <input type="number" id="memoryMin" value="${config.memoryMin || 512}" min="256">
                <span>MB -</span>
                <input type="number" id="memoryMax" value="${config.memoryMax || 4096}" min="512">
                <span>MB</span>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-label">
                <span class="settings-label-text">自动选择 Java</span>
                <span class="settings-label-hint">根据游戏版本自动选择合适的 Java 版本</span>
              </div>
              <div class="settings-value">
                <label class="toggle-switch">
                  <input type="checkbox" id="autoSelectJava" ${config.autoSelectJava ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
            <div class="settings-row" style="align-items: flex-start;">
              <div class="settings-label">
                <span class="settings-label-text">Java 版本</span>
                <span class="settings-label-hint">选择要使用的 Java 运行时（自动选择关闭时生效）</span>
              </div>
              <div class="settings-value" style="flex-direction: column; align-items: flex-start;">
                <div class="java-detect-header">
                  <span id="javaDetectStatus" class="java-detect-status">已检测到 ${javaInstallations.length} 个 Java 安装</span>
                  <button class="btn btn-secondary btn-small" id="javaDetectBtn">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon-small" style="vertical-align:middle;margin-right:4px;"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" fill="currentColor"/></svg>
                    <span>检测</span>
                  </button>
                </div>
                <div class="section-java-select" id="javaSelect">
              `;

      if (javaInstallations.length === 0) {
        html += '<div style="color: var(--text-muted); padding: 12px;">未检测到 Java 安装，点击右侧「检测」按钮扫描全系统</div>';
      } else {
        javaInstallations.forEach((java, index) => {
          const isSelected = config.javaPath === java.path;
          html += `
            <div class="java-option-wrapper">
              <label class="java-option ${isSelected ? 'selected' : ''}">
                <input type="radio" name="javaSelect" class="java-option-radio" ${isSelected ? 'checked' : ''} value="${java.path}">
                <div class="java-option-info">
                  <div class="java-option-version">Java ${java.version} (${java.majorVersion})</div>
                  <div class="java-option-path">${java.path}</div>
                </div>
              </label>
              <button class="btn btn-danger btn-small java-option-delete" data-java-path="${java.path}" data-java-version="${java.majorVersion}" title="删除此 Java">删除</button>
            </div>
          `;
        });
      }

      html += `
                </div>
                <input type="text" id="customJavaPath" placeholder="或输入自定义路径" value="${config.javaPath || ''}" style="margin-top: 12px; width: 100%;">
              </div>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-header">
            <h2>Java 下载</h2>
          </div>
          <div class="settings-section-body">
            <div class="settings-hint-text">如果系统中没有安装对应版本的 Java，可以在此处一键下载常见版本。</div>
            <div class="java-download-grid" id="javaDownloadGrid">
              <div class="java-download-card" data-java-version="8">
                <div class="java-download-card-header">
                  <div class="java-download-version">Java 8</div>
                  <div class="java-download-badge">经典版</div>
                </div>
                <div class="java-download-desc">适用于老版本模组与整合包，兼容性最好</div>
                <div class="java-download-status" id="javaStatus-8" style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px; min-height: 18px;"></div>
                <button class="btn btn-primary btn-small java-download-btn" data-java-version="8">
                  <span>下载 Java 8</span>
                </button>
              </div>
              <div class="java-download-card" data-java-version="17">
                <div class="java-download-card-header">
                  <div class="java-download-version">Java 17</div>
                  <div class="java-download-badge java-badge-recommend">推荐</div>
                </div>
                <div class="java-download-desc">适用于 Minecraft 1.18 及以上，性能更佳</div>
                <div class="java-download-status" id="javaStatus-17" style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px; min-height: 18px;"></div>
                <button class="btn btn-primary btn-small java-download-btn" data-java-version="17">
                  <span>下载 Java 17</span>
                </button>
              </div>
              <div class="java-download-card" data-java-version="21">
                <div class="java-download-card-header">
                  <div class="java-download-version">Java 21</div>
                  <div class="java-download-badge java-badge-lts">LTS</div>
                </div>
                <div class="java-download-desc">适用于 Minecraft 1.20.5 及以上，稳定 LTS 版本</div>
                <div class="java-download-status" id="javaStatus-21" style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px; min-height: 18px;"></div>
                <button class="btn btn-primary btn-small java-download-btn" data-java-version="21">
                  <span>下载 Java 21</span>
                </button>
              </div>
              <div class="java-download-card" data-java-version="25">
                <div class="java-download-card-header">
                  <div class="java-download-version">Java 25</div>
                  <div class="java-download-badge java-badge-new">最新</div>
                </div>
                <div class="java-download-desc">适用于 Minecraft 26.x (Forge 1.21.1+)，最新版本</div>
                <div class="java-download-status" id="javaStatus-25" style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px; min-height: 18px;"></div>
                <button class="btn btn-primary btn-small java-download-btn" data-java-version="25">
                  <span>下载 Java 25</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-header">
            <h2>高级设置</h2>
          </div>
          <div class="settings-section-body">
            <div class="settings-row">
              <div class="settings-label">
                <span class="settings-label-text">额外 JVM 参数</span>
                <span class="settings-label-hint">添加自定义 JVM 参数</span>
              </div>
              <div class="settings-value">
                <input type="text" id="extraJvmArgs" value="${config.extraJvmArgs || ''}" style="width: 300px;">
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-label">
                <span class="settings-label-text">额外游戏参数</span>
                <span class="settings-label-hint">添加自定义游戏参数</span>
              </div>
              <div class="settings-value">
                <input type="text" id="extraGameArgs" value="${config.extraGameArgs || ''}" style="width: 300px;">
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-label">
                <span class="settings-label-text">模组文件命名规则</span>
                <span class="settings-label-hint">下载 Mod 时保存到本地的文件命名格式</span>
              </div>
              <div class="settings-value">
                <select id="namingMod" data-naming-type="mod">
                  <option value="[{name}] {slug}-{version}">[机械动力] create-1.21.1-6.0.4</option>
                  <option value="{slug}-{version}">create-1.21.1-6.0.4</option>
                  <option value="{name} {slug}-{version}">机械动力 create-1.21.1-6.0.4</option>
                  <option value="{slug}-{version} ({name})">create-1.21.1-6.0.4 (机械动力)</option>
                  <option value="{name}_{slug}-{version}">机械动力_create-1.21.1-6.0.4</option>
                </select>
              </div>
            </div>

          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-header">
            <h2>AI 助手 · 模型与密钥</h2>
          </div>
          <div class="settings-section-body">
            <div class="settings-row">
              <div class="settings-label">
                <span class="settings-label-text">使用自定义模型</span>
                <span class="settings-label-hint">开启后可填入自己的 API Key，不再受每日 20 条限制</span>
              </div>
              <div class="settings-value">
                <label class="toggle-switch">
                  <input type="checkbox" id="aiCustomMode" ${config.aiCustomMode ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
            <div class="settings-row" id="aiSettingsModelRow" style="display:${config.aiCustomMode ? 'flex' : 'none'};">
              <div class="settings-label">
                <span class="settings-label-text">模型名称</span>
                <span class="settings-label-hint">例如 deepseek-chat / gpt-4o / doubao-1.5-pro</span>
              </div>
              <div class="settings-value">
                <input type="text" id="aiModel" value="${config.aiModel || 'deepseek-chat'}" style="width: 300px;">
              </div>
            </div>
            <div class="settings-row" id="aiSettingsKeyRow" style="display:${config.aiCustomMode ? 'flex' : 'none'};">
              <div class="settings-label">
                <span class="settings-label-text">API Key</span>
                <span class="settings-label-hint">保存在本地，不会上传到任何第三方</span>
              </div>
              <div class="settings-value">
                <input type="password" id="aiApiKey" value="${config.aiApiKey || ''}" style="width: 300px;">
              </div>
            </div>
            <div class="settings-row" id="aiSettingsUrlRow" style="display:${config.aiCustomMode ? 'flex' : 'none'};">
              <div class="settings-label">
                <span class="settings-label-text">API BaseURL</span>
                <span class="settings-label-hint">以 /v1 结尾；留空默认 DeepSeek</span>
              </div>
              <div class="settings-value">
                <input type="text" id="aiBaseUrl" value="${config.aiBaseUrl || 'https://api.deepseek.com/v1'}" style="width: 300px;">
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-label">
                <span class="settings-label-text">启用深度思考</span>
                <span class="settings-label-hint">如模型支持将展示思考过程，可能会消耗更多 tokens</span>
              </div>
              <div class="settings-value">
                <label class="toggle-switch">
                  <input type="checkbox" id="aiDeepThinking" ${config.aiDeepThinking ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-section section-update">
          <div class="settings-section-header">
            <h2>应用更新</h2>
          </div>
          <div class="settings-section-body">
            <div class="settings-row">
              <div class="settings-label">
                <span class="settings-label-text">当前版本</span>
                <span class="settings-label-hint">后台会自动检查更新，发现新版本时将静默下载</span>
              </div>
              <div class="settings-value" style="justify-content:flex-end;">
                <span class="update-current-version" id="updateCurrentVersion">检测中...</span>
              </div>
            </div>

            <div class="settings-row">
              <div class="settings-label">
                <span class="settings-label-text">检查更新</span>
                <span class="settings-label-hint">手动检查是否有新版本可用</span>
              </div>
              <div class="settings-value">
                <button class="btn btn-primary" id="checkUpdateBtn">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon-small" style="vertical-align:middle;margin-right:4px;"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" fill="currentColor"/></svg>
                  <span>检查更新</span>
                </button>
              </div>
            </div>

            <div class="settings-row update-status-row" id="updateStatusRow" style="display:none;">
              <div class="settings-label">
                <span class="settings-label-text" id="updateStatusTitle">更新状态</span>
                <span class="settings-label-hint" id="updateStatusHint">正在检查更新...</span>
              </div>
              <div class="settings-value" style="flex-direction:column; align-items:flex-end; gap:8px; min-width:300px;">
                <div class="update-progress" id="updateProgress" style="display:none;">
                  <div class="progress-header">
                    <span class="java-progress-stage" id="updateProgressStage">下载中</span>
                    <span class="java-progress-percent" id="updateProgressPercent">0%</span>
                  </div>
                  <div class="progress-bar" style="height:6px; background:var(--bg-tertiary); border-radius:4px; overflow:hidden;">
                    <div class="progress-fill" id="updateProgressFill" style="height:100%; background:var(--accent-gradient); border-radius:4px; transition:width 0.25s ease; width:0%;"></div>
                  </div>
                  <div class="progress-info" id="updateProgressInfo" style="margin-top:6px; font-size:12px; color:var(--text-muted); text-align:right;"></div>
                </div>
                <button class="btn btn-primary" id="downloadUpdateBtn" style="display:none;">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon-small" style="vertical-align:middle;margin-right:4px;"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  <span>下载更新</span>
                </button>
                <button class="btn btn-primary" id="installUpdateBtn" style="display:none;">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon-small" style="vertical-align:middle;margin-right:4px;"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2v16z" fill="currentColor"/></svg>
                  <span>立即安装并重启</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-header">
            <h2>日志管理</h2>
          </div>
          <div class="settings-section-body">
            <div class="settings-row">
              <div class="settings-label">
                <span class="settings-label-text">清除启动器日志</span>
                <span class="settings-label-hint">删除所有过往的启动日志文件（位于 zenith-logs 目录）</span>
              </div>
              <div class="settings-value">
                <button class="btn btn-secondary" id="clearOldLogsBtn">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon-small" style="vertical-align:middle;margin-right:4px;"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" fill="currentColor"/></svg>
                  <span>清除过往日志</span>
                </button>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-label">
                <span class="settings-label-text">打开日志目录</span>
                <span class="settings-label-hint">查看所有启动日志文件</span>
              </div>
              <div class="settings-value">
                <button class="btn btn-secondary" id="openLogDirSettingsBtn">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon-small" style="vertical-align:middle;margin-right:4px;"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" fill="currentColor"/></svg>
                  <span>打开日志目录</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-footer">
          <button class="btn btn-secondary" onclick="settings.resetSettings()">重置默认</button>
          <button class="btn btn-primary" onclick="settings.saveSettings()">保存设置</button>
        </div>

        <div class="settings-easter-egg">
          <button class="btn btn-text" id="easterEggBtn" title="点我看看？">这是什么？</button>
        </div>
      `;

      layout.innerHTML = html;

      // ---- 命名规则恢复选中值 ----
      const namingEl = document.getElementById('namingMod');
      if (namingEl && config.namingRules && config.namingRules.mod) {
        namingEl.value = config.namingRules.mod;
      }

      // ---- AI 设置：自定义模型开关联动 ----
      const aiCustomMode = document.getElementById('aiCustomMode');
      if (aiCustomMode) {
        const toggleAISettings = () => {
          const show = aiCustomMode.checked;
          const rows = ['aiSettingsModelRow', 'aiSettingsKeyRow', 'aiSettingsUrlRow'];
          rows.forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.style.display = show ? 'flex' : 'none';
          });
        };
        aiCustomMode.addEventListener('change', toggleAISettings);
        toggleAISettings();
      }

      // ---- Java 检测按钮 ----
      const detectBtn = document.getElementById('javaDetectBtn');
      if (detectBtn) {
        detectBtn.addEventListener('click', () => {
          settings.detectJava();
        });
      }

      // ---- Java 单选按钮事件 ----
      const javaRadioButtons = document.querySelectorAll('input[name="javaSelect"]');
      javaRadioButtons.forEach((radio) => {
        radio.addEventListener('change', (e) => {
          if (e.target.checked) {
            const selectedPath = e.target.value;
            const customInput = document.getElementById('customJavaPath');
            if (customInput) {
              customInput.value = selectedPath;
            }
            // 更新选中样式
            document.querySelectorAll('.java-option').forEach(opt => opt.classList.remove('selected'));
            e.target.closest('.java-option').classList.add('selected');
          }
        });
      });

      // ---- Java 删除按钮事件 ----
      const javaDeleteButtons = document.querySelectorAll('.java-option-delete');
      javaDeleteButtons.forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const javaPath = btn.getAttribute('data-java-path');
          const javaVersion = btn.getAttribute('data-java-version');
          settings.deleteJavaFromList(javaPath, javaVersion);
        });
      });

      // ---- Java 下载按钮 ----
      const downloadButtons = document.querySelectorAll('.java-download-btn');
      downloadButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const version = btn.getAttribute('data-java-version');
          settings.downloadJava(version);
        });
      });

      // ---- 更新下载卡片状态（根据是否已安装） ----
      settings.updateJavaDownloadCards(installedVersions);

      // ---- 彩蛋按钮 ----
      settings.setupEasterEgg();

      // ---- 应用更新：显示当前版本 + 监听后台状态 ----
      const updateCurrentVersionEl = document.getElementById('updateCurrentVersion');
      const checkUpdateBtn = document.getElementById('checkUpdateBtn');
      const installUpdateBtn = document.getElementById('installUpdateBtn');
      const updateStatusRow = document.getElementById('updateStatusRow');
      const updateStatusTitle = document.getElementById('updateStatusTitle');
      const updateStatusHint = document.getElementById('updateStatusHint');
      const updateProgress = document.getElementById('updateProgress');
      const updateProgressFill = document.getElementById('updateProgressFill');
      const updateProgressStage = document.getElementById('updateProgressStage');
      const updateProgressPercent = document.getElementById('updateProgressPercent');
      const updateProgressInfo = document.getElementById('updateProgressInfo');

      function showUpdateStatus({ title, hint, show, showProgress, showInstall, showDownload, percent, stage, info }) {
        if (updateStatusRow) updateStatusRow.style.display = show ? 'flex' : 'none';
        if (updateStatusTitle) updateStatusTitle.textContent = title || '';
        if (updateStatusHint) updateStatusHint.textContent = hint || '';
        if (updateProgress) updateProgress.style.display = showProgress ? 'block' : 'none';
        const downloadUpdateBtn = document.getElementById('downloadUpdateBtn');
        if (downloadUpdateBtn) downloadUpdateBtn.style.display = showDownload ? 'flex' : 'none';
        if (installUpdateBtn) installUpdateBtn.style.display = showInstall ? 'flex' : 'none';
        if (updateProgressFill && typeof percent === 'number') {
          updateProgressFill.style.width = Math.max(0, Math.min(100, percent)) + '%';
        }
        if (updateProgressPercent && typeof percent === 'number') {
          updateProgressPercent.textContent = percent.toFixed(1) + '%';
        }
        if (updateProgressStage && stage) updateProgressStage.textContent = stage;
        if (updateProgressInfo) updateProgressInfo.textContent = info || '';
      }

      // 读取并显示当前版本
      try {
        const v = await zenith.app.getVersion();
        if (updateCurrentVersionEl) updateCurrentVersionEl.textContent = 'v' + (v || '0.0.0');
      } catch (err) {
        if (updateCurrentVersionEl) updateCurrentVersionEl.textContent = '未知版本';
      }

      // 监听后台推送的更新状态
      if (typeof settings._updateStateOff === 'function') {
        settings._updateStateOff();
      }
      if (zenith && zenith.app && typeof zenith.app.onUpdateState === 'function') {
        settings._updateStateOff = zenith.app.onUpdateState((state) => {
          if (!state) return;
          const s = String(state.state || '');
          switch (s) {
            case 'checking':
              showUpdateStatus({
                title: '正在检查更新',
                hint: '请稍候...',
                show: true,
                showProgress: false,
                showInstall: false
              });
              break;
            case 'available':
              showUpdateStatus({
                title: state.version ? '发现新版本 v' + state.version : '发现新版本',
                hint: state.releaseNotes || '点击下方按钮下载并更新',
                show: true,
                showProgress: false,
                showInstall: false,
                showDownload: true
              });
              break;
            case 'downloading':
              showUpdateStatus({
                title: state.version ? '发现新版本 v' + state.version : '正在下载更新',
                hint: '下载完成后将提示安装',
                show: true,
                showProgress: true,
                showInstall: false,
                percent: Number(state.percent || 0),
                stage: state.stage || '下载中',
                info: (typeof state.bytesPerSecond === 'number'
                  ? (state.bytesPerSecond / 1024 / 1024).toFixed(2) + ' MB/s'
                  : '') + (typeof state.transferred === 'number' && typeof state.total === 'number'
                  ? '  ·  ' + (state.transferred / 1024 / 1024).toFixed(2) + ' / ' + (state.total / 1024 / 1024).toFixed(2) + ' MB'
                  : '')
              });
              break;
            case 'ready':
              showUpdateStatus({
                title: state.version ? '新版本 v' + state.version + ' 已就绪' : '新版本已就绪',
                hint: '点击右侧按钮可立即安装并重启',
                show: true,
                showProgress: false,
                showInstall: true
              });
              break;
            case 'idle':
              showUpdateStatus({
                title: '当前已是最新版本',
                hint: state.version ? '本地版本 v' + state.version : '无需更新',
                show: true,
                showProgress: false,
                showInstall: false
              });
              // 3 秒后收起状态行
              setTimeout(() => {
                if (updateStatusRow) updateStatusRow.style.display = 'none';
              }, 3000);
              break;
            case 'error':
              showUpdateStatus({
                title: '检查更新失败',
                hint: state.error || '请稍后重试或检查网络连接',
                show: true,
                showProgress: false,
                showInstall: false
              });
              break;
            default:
              if (updateStatusRow) updateStatusRow.style.display = 'none';
          }
        });
      }

      // 手动检查更新
      if (checkUpdateBtn) {
        checkUpdateBtn.addEventListener('click', async () => {
          if (checkUpdateBtn.getAttribute('data-loading') === '1') return;
          checkUpdateBtn.setAttribute('data-loading', '1');
          checkUpdateBtn.disabled = true;
          const span = checkUpdateBtn.querySelector('span');
          const original = span ? span.textContent : '';
          if (span) span.textContent = '检查中...';

          try {
            const result = await zenith.app.checkUpdate();
            if (result && result.ok === false) {
              showUpdateStatus({
                title: '检查更新失败',
                hint: result.error || '请稍后再试',
                show: true,
                showProgress: false,
                showInstall: false
              });
            } else {
              showUpdateStatus({
                title: '正在检查更新',
                hint: '请稍候...',
                show: true,
                showProgress: false,
                showInstall: false
              });
            }
          } catch (err) {
            app.showToast('检查更新失败: ' + err.message, 'error');
          } finally {
            checkUpdateBtn.disabled = false;
            checkUpdateBtn.removeAttribute('data-loading');
            if (span) span.textContent = original;
          }
        });
      }

      // 立即安装并重启
      if (installUpdateBtn) {
        installUpdateBtn.addEventListener('click', async () => {
          if (!confirm('确认立即安装新版本并重启启动器吗？\n当前进度将不会丢失。')) return;
          installUpdateBtn.disabled = true;
          try {
            await zenith.app.installUpdate();
            app.showToast('即将安装并重启...', 'success');
          } catch (err) {
            app.showToast('安装失败: ' + err.message, 'error');
            installUpdateBtn.disabled = false;
          }
        });
      }

      // 下载更新
      const downloadUpdateBtn = document.getElementById('downloadUpdateBtn');
      if (downloadUpdateBtn) {
        downloadUpdateBtn.addEventListener('click', async () => {
          if (downloadUpdateBtn.getAttribute('data-loading') === '1') return;
          downloadUpdateBtn.setAttribute('data-loading', '1');
          downloadUpdateBtn.disabled = true;
          const span = downloadUpdateBtn.querySelector('span');
          const original = span ? span.textContent : '';
          if (span) span.textContent = '下载中...';

          try {
            const result = await zenith.app.downloadUpdate();
            if (result && result.ok === false) {
              app.showToast('下载失败: ' + (result.error || '未知错误'), 'error');
              showUpdateStatus({
                title: '更新下载失败',
                hint: result.error || '请稍后重试',
                show: true,
                showProgress: false,
                showInstall: false,
                showDownload: true
              });
            } else {
              app.showToast('更新下载请求已发送', 'success');
            }
          } catch (err) {
            app.showToast('下载失败: ' + err.message, 'error');
          } finally {
            downloadUpdateBtn.disabled = false;
            downloadUpdateBtn.removeAttribute('data-loading');
            if (span) span.textContent = original;
          }
        });
      }

      // ---- 清除过往日志按钮 ----
      const clearLogsBtn = document.getElementById('clearOldLogsBtn');
      if (clearLogsBtn) {
        clearLogsBtn.addEventListener('click', async () => {
          if (!confirm('确定要清除所有过往日志文件吗？\n此操作将删除 zenith-logs 目录下的所有日志文件。')) return;
          try {
            clearLogsBtn.disabled = true;
            clearLogsBtn.querySelector('span').textContent = '正在清除...';
            const result = await zenith.system.clearOldLogs();
            if (result && result.success) {
              app.showToast('已清除 ' + (result.deletedCount || 0) + ' 个日志文件，释放了 ' + (result.freedBytes || '0') + ' 空间', 'success');
            } else {
              app.showToast('清除失败: ' + (result && result.error ? result.error : '未知错误'), 'error');
            }
          } catch (e) {
            app.showToast('清除失败: ' + e.message, 'error');
          } finally {
            clearLogsBtn.disabled = false;
            clearLogsBtn.querySelector('span').textContent = '清除过往日志';
          }
        });
      }

      // ---- 打开日志目录按钮 ----
      const openLogDirBtn = document.getElementById('openLogDirSettingsBtn');
      if (openLogDirBtn) {
        openLogDirBtn.addEventListener('click', () => {
          if (zenith && zenith.system && zenith.system.openPath) {
            zenith.system.openPath('launcher-logs');
          }
        });
      }

      // ---- 反馈按钮：打开确认对话框 ----
      const feedbackBtn = document.getElementById('feedbackBtn');
      if (feedbackBtn) {
        feedbackBtn.addEventListener('click', () => {
          settings.openFeedbackDialog();
        });
      }

    } catch (e) {
      layout.innerHTML = '<div style="color: var(--error); padding: 20px;">加载设置失败: ' + e.message + '</div>';
      console.error('[Settings] Failed to render settings:', e.message);
    }
  },

  // 更新Java下载卡片状态
  updateJavaDownloadCards(installedVersions) {
    [8, 17, 21, 25].forEach((v) => {
      const vStr = String(v);
      const statusEl = document.getElementById(`javaStatus-${vStr}`);
      const btn = document.querySelector(`.java-download-btn[data-java-version="${vStr}"]`);
      if (!statusEl || !btn) return;

      if (installedVersions.has(vStr)) {
        statusEl.textContent = '您已安装过此 Java 版本';
        statusEl.style.color = 'var(--success)';
      } else {
        statusEl.textContent = '';
      }
    });
  },

  async detectJava() {
    const btn = document.getElementById('javaDetectBtn');
    const statusEl = document.getElementById('javaDetectStatus');
    const selectEl = document.getElementById('javaSelect');

    if (btn) {
      btn.disabled = true;
      btn.querySelector('span').textContent = '检测中...';
    }
    if (statusEl) statusEl.textContent = '正在扫描全系统，请稍候...';
    if (selectEl) selectEl.innerHTML = '<div style="color: var(--text-muted); padding: 12px;">正在检测中...</div>';

    // 使用 requestAnimationFrame 确保UI更新后再执行耗时操作
    await new Promise(resolve => requestAnimationFrame(resolve));
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      const installations = await zenith.java.detect();
      // 刷新界面
      const config = await zenith.config.getAll();
      if (selectEl) {
        let innerHtml = '';
        if (installations.length === 0) {
          innerHtml = '<div style="color: var(--text-muted); padding: 12px;">未检测到 Java 安装，建议在下方下载或手动指定路径</div>';
        } else {
          installations.forEach((java) => {
            const isSelected = config.javaPath === java.path;
            innerHtml += `
              <div class="java-option-wrapper">
                <label class="java-option ${isSelected ? 'selected' : ''}">
                  <input type="radio" name="javaSelect" class="java-option-radio" ${isSelected ? 'checked' : ''} value="${java.path}">
                  <div class="java-option-info">
                    <div class="java-option-version">Java ${java.version} (${java.majorVersion})</div>
                    <div class="java-option-path">${java.path}</div>
                  </div>
                </label>
                <button class="btn btn-danger btn-small java-option-delete" data-java-path="${java.path}" data-java-version="${java.majorVersion}" title="删除此 Java">删除</button>
              </div>
            `;
          });
        }
        selectEl.innerHTML = innerHtml;

        // 重新绑定单选按钮事件
        const javaRadioButtons = document.querySelectorAll('input[name="javaSelect"]');
        javaRadioButtons.forEach((radio) => {
          radio.addEventListener('change', (e) => {
            if (e.target.checked) {
              const selectedPath = e.target.value;
              const customInput = document.getElementById('customJavaPath');
              if (customInput) {
                customInput.value = selectedPath;
              }
              // 更新选中样式
              document.querySelectorAll('.java-option').forEach(opt => opt.classList.remove('selected'));
              e.target.closest('.java-option').classList.add('selected');
            }
          });
        });

        // 重新绑定删除按钮事件
        const javaDeleteButtons = document.querySelectorAll('.java-option-delete');
        javaDeleteButtons.forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const javaPath = btn.getAttribute('data-java-path');
            const javaVersion = btn.getAttribute('data-java-version');
            settings.deleteJavaFromList(javaPath, javaVersion);
          });
        });
      }

      // 更新下载卡片状态
      const installedVersions = new Set();
      installations.forEach(j => installedVersions.add(String(j.majorVersion)));
      settings.updateJavaDownloadCards(installedVersions);

      if (statusEl) statusEl.textContent = `已检测到 ${installations.length} 个 Java 安装`;
      app.showToast(installations.length > 0
        ? `检测完成，共发现 ${installations.length} 个 Java 安装`
        : '未检测到任何 Java 安装',
        installations.length > 0 ? 'success' : 'warning');
    } catch (err) {
      if (statusEl) statusEl.textContent = '检测失败';
      app.showToast('Java 检测失败: ' + err.message, 'error');
      console.error('[Settings] Java detection failed:', err);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.querySelector('span').textContent = '检测';
      }
    }
  },

  async downloadJava(javaVersion) {
    const btn = document.querySelector(`.java-download-btn[data-java-version="${javaVersion}"]`);
    if (!btn) return;

    if (btn.getAttribute('data-loading') === '1') return;
    btn.setAttribute('data-loading', '1');
    btn.disabled = true;
    btn.querySelector('span').textContent = '下载中...';

    try {
      const result = await zenith.java.download(javaVersion);

      if (result && result.success) {
        app.showToast(result.message || `Java ${javaVersion} 下载已启动`, 'success');
        // 按钮恢复
        btn.querySelector('span').textContent = `下载 Java ${javaVersion}`;
        btn.disabled = false;
        btn.removeAttribute('data-loading');
      } else {
        throw new Error(result.message || '下载失败');
      }
    } catch (err) {
      app.showToast('Java 下载失败: ' + err.message, 'error');
      btn.querySelector('span').textContent = `下载 Java ${javaVersion}`;
      btn.disabled = false;
      btn.removeAttribute('data-loading');
    }
  },

  // 从 Java 版本列表中删除（通过路径）
  async deleteJavaFromList(javaPath, javaVersion) {
    const confirmed = confirm(`确定要彻底删除 Java ${javaVersion} 吗？\n路径: ${javaPath}\n此操作将从系统中彻底删除该 Java，删除后将无法启动需要该 Java 版本的游戏。`);
    if (!confirmed) return;

    try {
      // 判断是否是启动器下载的 Java（data/java/jdk-xxx 格式）
      const isDownloadedJava = /data[\\/]java[\\/]jdk-\d+/.test(javaPath);

      if (isDownloadedJava) {
        // 启动器下载的 Java：使用版本号删除
        const match = javaPath.match(/jdk-(\d+)/);
        const versionToDelete = match ? match[1] : String(javaVersion);
        const result = await zenith.java.delete(versionToDelete);
        if (result && result.success) {
          app.showToast(`Java ${javaVersion} 已删除`, 'success');
        } else {
          throw new Error((result && result.message) || '删除失败');
        }
      } else {
        // 系统 Java：尝试直接删除目录（需要管理员权限）
        const result = await zenith.system.deleteFolder(javaPath);
        if (result && result.success) {
          app.showToast(`Java ${javaVersion} 已彻底删除`, 'success');
        } else {
          throw new Error(result.message || '删除失败');
        }
      }

      // 刷新列表
      await settings.detectJava();
    } catch (err) {
      app.showToast('Java 删除失败: ' + err.message, 'error');
    }
  },

  async deleteJava(javaVersion) {
    const vStr = String(javaVersion);
    const btn = document.querySelector(`.java-download-btn[data-java-version="${vStr}"]`);
    if (btn && btn.getAttribute('data-loading') === '1') return;

    const confirmed = confirm(`确定要删除 Java ${vStr} 吗？\n删除后将无法启动需要该 Java 版本的游戏。`);
    if (!confirmed) return;

    try {
      if (btn) {
        btn.setAttribute('data-loading', '1');
        btn.disabled = true;
        btn.querySelector('span').textContent = '删除中...';
      }

      const result = await zenith.java.delete(vStr);
      if (result && result.success) {
        app.showToast(`Java ${vStr} 已删除`, 'success');
      } else {
        throw new Error((result && result.message) || '删除失败');
      }
    } catch (err) {
      app.showToast('Java 删除失败: ' + err.message, 'error');
    }
  },

  async selectMinecraftDir() {
    const path = await zenith.system.selectFolder();
    if (path) {
      const input = document.getElementById('mcDirInput');
      if (input) {
        input.value = path;
      }
    }
  },

  async saveSettings() {
    try {
      const aiCustomModeEl = document.getElementById('aiCustomMode');
      const aiModelEl = document.getElementById('aiModel');
      const aiKeyEl = document.getElementById('aiApiKey');
      const aiBaseEl = document.getElementById('aiBaseUrl');
      const aiThinkingEl = document.getElementById('aiDeepThinking');

      const config = {
        minecraftDir: document.getElementById('mcDirInput').value,
        memoryMin: parseInt(document.getElementById('memoryMin').value) || 512,
        memoryMax: parseInt(document.getElementById('memoryMax').value) || 4096,
        javaPath: document.getElementById('customJavaPath').value,
        autoSelectJava: document.getElementById('autoSelectJava').checked,
        width: parseInt(document.getElementById('windowWidth').value) || 854,
        height: parseInt(document.getElementById('windowHeight').value) || 480,
        serverIp: document.getElementById('serverIp').value,
        extraJvmArgs: document.getElementById('extraJvmArgs').value,
        extraGameArgs: document.getElementById('extraGameArgs').value,
        namingRules: {
          mod: document.getElementById('namingMod').value
        },
        aiCustomMode: aiCustomModeEl ? aiCustomModeEl.checked : false,
        aiModel: aiModelEl ? aiModelEl.value.trim() : 'deepseek-chat',
        aiApiKey: aiKeyEl ? aiKeyEl.value.trim() : '',
        aiBaseUrl: aiBaseEl ? aiBaseEl.value.trim() : 'https://api.deepseek.com/v1',
        aiDeepThinking: aiThinkingEl ? aiThinkingEl.checked : false
      };

      await Promise.all([
        zenith.config.set('minecraftDir', config.minecraftDir),
        zenith.config.set('memoryMin', config.memoryMin),
        zenith.config.set('memoryMax', config.memoryMax),
        zenith.config.set('javaPath', config.javaPath),
        zenith.config.set('autoSelectJava', config.autoSelectJava),
        zenith.config.set('width', config.width),
        zenith.config.set('height', config.height),
        zenith.config.set('serverIp', config.serverIp),
        zenith.config.set('extraJvmArgs', config.extraJvmArgs),
        zenith.config.set('extraGameArgs', config.extraGameArgs),
        zenith.config.set('namingRules', config.namingRules),
        zenith.config.set('aiCustomMode', config.aiCustomMode),
        zenith.config.set('aiModel', config.aiModel),
        zenith.config.set('aiApiKey', config.aiApiKey),
        zenith.config.set('aiBaseUrl', config.aiBaseUrl),
        zenith.config.set('aiDeepThinking', config.aiDeepThinking)
      ]);

      await app.loadConfig();
      app.showToast('设置已保存', 'success');
    } catch (e) {
      app.showToast('保存失败: ' + e.message, 'error');
      console.error('[Settings] Failed to save:', e.message);
    }
  },

  easterEggClickCount: 0,

  setupEasterEgg() {
    const btn = document.getElementById('easterEggBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      this.easterEggClickCount++;
      if (this.easterEggClickCount >= 5) {
        this.easterEggClickCount = 0;
        app.showToast('感谢下载Zenith启动器！', 'success');
      }
    });
  },

  // 反馈对话框（带背景模糊、淡入动画、只能点「取消」关闭）
  openFeedbackDialog() {
    const FEEDBACK_URL = 'https://github.com/zenith-minecraft-launcher/zmcl-launcher/issues';
    const WATT_TOOLKIT_URL = 'https://steampp.net/download';

    const openExternal = (url) => {
      try {
        if (zenith && zenith.system && zenith.system.openExternal) {
          zenith.system.openExternal(url);
          return;
        }
      } catch (e) { /* ignore */ }
      if (typeof window !== 'undefined' && window.open) {
        window.open(url, '_blank', 'noopener');
      }
    };

    // 若已存在先移除（避免多个叠加）
    const prev = document.getElementById('feedbackDialogMask');
    if (prev) prev.remove();

    const mask = document.createElement('div');
    mask.id = 'feedbackDialogMask';
    mask.innerHTML = `
      <div class="feedback-dialog">
        <div class="feedback-dialog-header">
          <span>反馈须知</span>
        </div>
        <div class="feedback-dialog-body">
          在提交新反馈之前，请先检查该问题是否已得到解决或被其他人提交，以避免重复提交。<br/>
          如果无法打开网页，请使用加速器或者 VPN，推荐使用 Watt Toolkit。
        </div>
        <div class="feedback-dialog-actions">
          <button class="btn btn-secondary" id="feedbackCancelBtn">取消</button>
          <button class="btn btn-secondary" id="feedbackWattBtn">下载 Watt Toolkit</button>
          <button class="btn btn-primary" id="feedbackContinueBtn">继续</button>
        </div>
      </div>
    `;

    // 蒙层：背景模糊 + 禁止点击穿透
    Object.assign(mask.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      background: 'rgba(0, 0, 0, 0.35)',
      backdropFilter: 'blur(6px)',
      webkitBackdropFilter: 'blur(6px)',
      zIndex: '9999',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: '0',
      transition: 'opacity 200ms ease'
    });

    document.body.appendChild(mask);

    // 触发入场动画
    requestAnimationFrame(() => {
      mask.style.opacity = '1';
      const dialog = mask.querySelector('.feedback-dialog');
      if (dialog) {
        dialog.style.transform = 'scale(1) translateY(0)';
        dialog.style.opacity = '1';
      }
    });

    // 对话框主体样式
    const dialog = mask.querySelector('.feedback-dialog');
    if (dialog) {
      Object.assign(dialog.style, {
        width: '440px',
        maxWidth: '90%',
        background: 'var(--bg-secondary, #2a2a2a)',
        color: 'var(--text-primary, #ffffff)',
        border: '1px solid var(--border, #3a3a3a)',
        borderRadius: '10px',
        padding: '18px 20px 16px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        fontSize: '14px',
        lineHeight: '1.6',
        transform: 'scale(0.94) translateY(-6px)',
        transformOrigin: 'center',
        opacity: '0',
        transition: 'transform 220ms cubic-bezier(0.2, 0.7, 0.3, 1.2), opacity 220ms ease'
      });
    }

    const header = mask.querySelector('.feedback-dialog-header');
    if (header) {
      Object.assign(header.style, {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '10px',
        fontWeight: '600',
        fontSize: '15px'
      });
    }

    const body = mask.querySelector('.feedback-dialog-body');
    if (body) {
      Object.assign(body.style, {
        color: 'var(--text-secondary, #cccccc)',
        marginBottom: '18px'
      });
    }

    const actions = mask.querySelector('.feedback-dialog-actions');
    if (actions) {
      Object.assign(actions.style, {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '8px'
      });
    }

    // 关闭函数：带淡出动画
    const closeDialog = () => {
      const m = document.getElementById('feedbackDialogMask');
      if (!m) return;
      m.style.opacity = '0';
      const d = m.querySelector('.feedback-dialog');
      if (d) {
        d.style.transform = 'scale(0.94) translateY(-6px)';
        d.style.opacity = '0';
      }
      setTimeout(() => {
        const still = document.getElementById('feedbackDialogMask');
        if (still && still.parentNode) still.parentNode.removeChild(still);
      }, 220);
    };

    // 事件绑定
    const cancelBtn = document.getElementById('feedbackCancelBtn');
    const wattBtn = document.getElementById('feedbackWattBtn');
    const continueBtn = document.getElementById('feedbackContinueBtn');

    // 只有「取消」会关闭对话框
    if (cancelBtn) cancelBtn.addEventListener('click', closeDialog);

    if (wattBtn) wattBtn.addEventListener('click', () => {
      openExternal(WATT_TOOLKIT_URL);
    });

    if (continueBtn) continueBtn.addEventListener('click', () => {
      openExternal(FEEDBACK_URL);
    });

    // 禁止点击空白处关闭；禁止 ESC 键关闭
    // （蒙层不绑定任何关闭事件，确保只有「取消」可关闭）
  },

  async resetSettings() {
    const defaults = {
      minecraftDir: '',
      memoryMin: 512,
      memoryMax: 4096,
      javaPath: '',
      autoSelectJava: true,
      width: 854,
      height: 480,
      serverIp: '',
      extraJvmArgs: '',
      extraGameArgs: '',
      namingRules: {
        mod: '[{name}] {slug}-{version}'
      },
      aiCustomMode: false,
      aiApiKey: '',
      aiModel: 'deepseek-chat',
      aiBaseUrl: 'https://api.deepseek.com/v1',
      aiDeepThinking: false
    };

    try {
      await Promise.all(Object.entries(defaults).map(([key, value]) =>
        zenith.config.set(key, value)
      ));

      await app.loadConfig();
      this.renderSettings();
      app.showToast('已重置为默认设置', 'success');
    } catch (e) {
      app.showToast('重置失败: ' + e.message, 'error');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  settings.init();
});
