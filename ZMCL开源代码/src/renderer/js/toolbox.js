/* ============================ 工具箱 · 前端逻辑 ============================ */

const TOOLBOX_CATEGORIES = [
  { key: 'minecraft',  label: 'Minecraft 实用工具', iconName: 'settings' },
  { key: 'links',      label: '其他工具',            iconName: 'globe' }
];

/* SVG 图标（简洁、与整体风格匹配） */
const TOOL_ICONS = {
  folder: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  save:   '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon"><path d="M5 4h11l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm0 6h12M8 4v5h5V4M9 14h6v6H9z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  trash:  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-9 0v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  info:   '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v.01M11 12h1v5h1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  globe:  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8"/><path d="M2 12h20M12 2c3 3 3 14 0 20M12 2c-3 3-3 14 0 20" stroke="currentColor" stroke-width="1.5" opacity="0.7"/></svg>',
  warning:'<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon"><path d="M12 3l10 18H2L12 3zm0 6v5m0 3v.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

function getIcon(name) { return TOOL_ICONS[name] || TOOL_ICONS.info; }

/* ============================ 状态 ============================ */

let toolboxState = {
  tools: [],
  activeCategory: 'minecraft',
  confirmQueue: null,    // 当前等待确认的工具
  results: {}            // key -> { ok, message, data }
};

/* ============================ 工具方法 ============================ */

function $(id) { return document.getElementById(id); }

function showToast(message, type) {
  if (window.app && typeof window.app.showToast === 'function') {
    window.app.showToast(message, type || 'info');
    return;
  }
  const container = $('toastContainer');
  if (!container) { console.log('[工具箱]', message); return; }
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + (type || 'info');
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('fade-in'), 10);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 400);
  }, 2800);
}

/* ============================ 渲染 ============================ */

function renderToolboxTabs() {
  const tabsEl = $('toolboxTabs');
  if (!tabsEl) return;
  tabsEl.innerHTML = '';
  TOOLBOX_CATEGORIES.forEach((cat) => {
    const btn = document.createElement('button');
    btn.className = 'toolbox-tab' + (toolboxState.activeCategory === cat.key ? ' active' : '');
    btn.innerHTML = getIcon(cat.iconName) + '<span>' + cat.label + '</span>';
    btn.addEventListener('click', () => {
      toolboxState.activeCategory = cat.key;
      renderToolboxTabs();
      renderToolboxGrid();
    });
    tabsEl.appendChild(btn);
  });
}

function renderToolboxGrid() {
  const gridEl = $('toolboxGrid');
  if (!gridEl) return;
  gridEl.innerHTML = '';

  // 其他工具：顶部感谢语
  if (toolboxState.activeCategory === 'links') {
    const banner = document.createElement('div');
    banner.className = 'toolbox-links-banner';
    banner.innerHTML = getIcon('globe') + '<span>感谢各位 MC 作者提供的工具！<br/>点击下方卡片将在系统浏览器中打开。</span>';
    gridEl.appendChild(banner);
  }

  const group = toolboxState.tools.filter(t => t.category === toolboxState.activeCategory);
  if (group.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:40px; text-align:center; color:var(--text-muted); font-size:13px;';
    empty.textContent = '该分类下暂无工具';
    gridEl.appendChild(empty);
    return;
  }

  group.forEach((tool, idx) => {
    const isLink = tool.type === 'link';
    const card = document.createElement('button');
    card.className = 'toolbox-card'
      + (tool.dangerous ? ' dangerous' : '')
      + (isLink ? ' is-link' : '');
    card.style.animationDelay = (idx * 0.04) + 's';
    card.dataset.toolKey = tool.key;

    card.innerHTML = `
      <div class="toolbox-card-header">
        <div class="toolbox-card-icon">${getIcon(isLink ? 'globe' : tool.icon)}</div>
        <div class="toolbox-card-text">
          <h3 class="toolbox-card-title">
            ${escapeHTML(tool.title)}
            ${tool.dangerous ? '<span class="toolbox-danger-badge">危险</span>' : ''}
            ${isLink ? '<span class="toolbox-link-badge">外部链接</span>' : ''}
          </h3>
          <p class="toolbox-card-desc">${escapeHTML(tool.description)}</p>
          ${isLink && tool.url ? `<p class="toolbox-card-url">${escapeHTML(tool.url)}</p>` : ''}
        </div>
      </div>
      ${isLink ? '' : `<div class="toolbox-result-slot" data-result-slot="${tool.key}"></div>`}
    `;

    card.addEventListener('click', () => handleToolClick(tool));
    gridEl.appendChild(card);

    if (!isLink && toolboxState.results[tool.key]) {
      renderToolResult(tool.key, toolboxState.results[tool.key]);
    }
  });
}

function renderToolResult(toolKey, result) {
  const slot = document.querySelector(`[data-result-slot="${toolKey}"]`);
  if (!slot) return;
  slot.innerHTML = '';
  if (!result) return;

  const panel = document.createElement('div');
  panel.className = 'toolbox-result-panel ' + (result.ok ? 'success' : 'error');

  const titleEl = document.createElement('div');
  titleEl.className = 'toolbox-result-title';
  titleEl.textContent = result.ok ? '✓ 完成' : '✗ 未完成';
  panel.appendChild(titleEl);

  const msgEl = document.createElement('div');
  msgEl.textContent = result.message || '';
  panel.appendChild(msgEl);

  // data 可视化（目前支持 diagnose-system / diagnose-network）
  const dataBlock = renderDataBlock(result);
  if (dataBlock) panel.appendChild(dataBlock);

  slot.appendChild(panel);
}

function renderDataBlock(result) {
  if (!result || !result.data || typeof result.data !== 'object') return null;
  const data = result.data;

  // network 结果
  if (Array.isArray(data) && data.length && typeof data[0] === 'object' && 'reachable' in data[0]) {
    const ul = document.createElement('ul');
    ul.className = 'toolbox-result-list';
    data.forEach(item => {
      const li = document.createElement('li');
      let right;
      if (item.reachable) {
        const cls = item.ping < 200 ? 'toolbox-ping-good' : (item.ping < 500 ? 'toolbox-ping-warn' : 'toolbox-ping-bad');
        right = '<span class="' + cls + '">' + item.ping + ' ms</span>';
      } else {
        right = '<span class="toolbox-ping-bad">不可达</span>';
      }
      li.innerHTML = '<span>' + escapeHTML(item.name || item.host || '') + '</span>' + right;
      ul.appendChild(li);
    });
    return ul;
  }

  // system / 其他对象：扁平化为列表
  const keys = Object.keys(data);
  if (keys.length === 0) return null;
  const ul = document.createElement('ul');
  ul.className = 'toolbox-result-list';
  keys.forEach((k) => {
    const v = data[k];
    const li = document.createElement('li');
    let val = v;
    if (typeof v === 'object' && v !== null) val = JSON.stringify(v);
    li.innerHTML = '<span>' + escapeHTML(k) + '</span><span>' + escapeHTML(String(val)) + '</span>';
    ul.appendChild(li);
  });
  return ul;
}

function escapeHTML(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ============================ 执行逻辑 ============================ */

function handleToolClick(tool) {
  // 外部链接：直接调用系统浏览器打开
  if (tool.type === 'link') {
    openExternal(tool.url);
    return;
  }
  // 危险操作：二次确认
  if (tool.dangerous) {
    showConfirm(tool);
    return;
  }
  runTool(tool);
}

function openExternal(url) {
  if (!url) {
    showToast('无效链接', 'error');
    return;
  }
  // 优先使用 Electron shell（由 toolbox 模块暴露）
  const api = window.zenith && window.zenith.toolbox;
  if (api && typeof api.openExternal === 'function') {
    try {
      api.openExternal(url);
      showToast('已在浏览器中打开：' + url, 'info');
      return;
    } catch (err) {
      console.error('[工具箱] openExternal 失败：', err);
    }
  }
  // 回退：直接在新窗口打开
  try { window.open(url, '_blank'); } catch (_) {}
}

function showConfirm(tool) {
  // 避免重复弹窗
  if ($('toolboxConfirmOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'toolboxConfirmOverlay';
  overlay.className = 'toolbox-confirm-overlay';

  overlay.innerHTML = `
    <div class="toolbox-confirm-box">
      <div class="toolbox-confirm-icon">${getIcon('warning')}</div>
      <h3>${escapeHTML(tool.title)}</h3>
      <p>${escapeHTML(tool.description)}<br/><br/>请确认你要执行此操作，此操作不可撤销。</p>
      <div class="toolbox-confirm-actions">
        <button class="toolbox-confirm-btn" data-act="cancel">取消</button>
        <button class="toolbox-confirm-btn primary" data-act="ok">确认执行</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeConfirm();
  });
  overlay.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      closeConfirm();
      if (act === 'ok') runTool(tool);
    });
  });
}

function closeConfirm() {
  const o = $('toolboxConfirmOverlay');
  if (o) o.remove();
}

async function runTool(tool) {
  const api = window.zenith && window.zenith.toolbox;
  if (!api) {
    showToast('运行环境异常（未在 Electron 内运行）', 'error');
    return;
  }

  // 卡片加 loading
  const card = document.querySelector(`[data-tool-key="${tool.key}"]`);
  if (card) card.classList.add('is-loading');

  try {
    const result = await api.exec(tool.key, {});
    toolboxState.results[tool.key] = result;
    renderToolResult(tool.key, result);

    if (result && result.ok) {
      showToast(result.message || '操作完成', 'success');
    } else {
      showToast(result && result.message ? result.message : '操作未完成', 'error');
    }
  } catch (err) {
    const r = { ok: false, message: String(err && err.message || err) };
    toolboxState.results[tool.key] = r;
    renderToolResult(tool.key, r);
    showToast('执行失败：' + (err && err.message || err), 'error');
  } finally {
    if (card) card.classList.remove('is-loading');
  }
}

/* ============================ 初始化 ============================ */

async function initToolboxView() {
  if (!$('view-toolbox')) return;

  const api = window.zenith && window.zenith.toolbox;
  if (api && typeof api.listTools === 'function') {
    try {
      toolboxState.tools = await api.listTools() || [];
    } catch (err) {
      console.error('[工具箱] 获取工具列表失败：', err);
      showToast('加载工具列表失败', 'error');
    }
  }

  renderToolboxTabs();
  renderToolboxGrid();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initToolboxView);
} else {
  setTimeout(initToolboxView, 0);
}
