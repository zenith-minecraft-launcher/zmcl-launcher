/* ============================ 陶瓦联机 - 前端逻辑（基于 EasyTier） ============================ */

/* 16 位邀请码展示为 4+4+4+4，便于记忆与分享 */
function formatInviteCode(code) {
  if (!code) return code;
  const clean = String(code).replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (clean.length !== 16) return code;
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}`;
}

const TAOWA_NODES_PREVIEW = [
  { name: '陶瓦节点 1 (上海)', addr: 'tcp://cn1.easytier.taowa.club:11010' },
  { name: '陶瓦节点 2 (上海)', addr: 'tcp://cn2.easytier.taowa.club:11010' },
  { name: '陶瓦节点 3 (广州)', addr: 'tcp://cn3.easytier.taowa.club:11010' },
  { name: '陶瓦节点 4 (香港)', addr: 'tcp://hk1.easytier.taowa.club:11010' }
];

/* ============================ UI 工具 ============================ */

function $(id) { return document.getElementById(id); }

function showToast(message, type = 'info') {
  if (window.app && typeof window.app.showToast === 'function') {
    window.app.showToast(message, type);
    return;
  }
  const container = document.getElementById('toastContainer');
  if (!container) { console.log('[陶瓦联机]', message); return; }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('fade-in'), 10);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 400);
  }, 2600);
}

function setStatus(title, desc, className) {
  const el = $('taowaStatusTitle');
  const descEl = $('taowaStatusDesc');
  if (el) el.textContent = title;
  if (descEl) descEl.textContent = desc;
  if (className) el.className = className;
}

function setNodeInfo(node) {
  const nodeNameEl = $('taowaNodeName');
  if (nodeNameEl) nodeNameEl.textContent = node && node.name ? node.name : '—';
}

function setResultCard({ show, title, inviteCode, address, node, ping, port }) {
  const card = $('taowaResultCard');
  if (!card) return;
  if (!show) { card.style.display = 'none'; return; }
  card.style.display = 'block';

  const titleEl = $('taowaResultTitle');
  const codeEl = $('taowaResultCode');
  const addrEl = $('taowaResultAddress');
  const nodeEl = $('taowaResultNode');
  const pingEl = $('taowaResultPing');
  const portEl = $('taowaResultPort');

  if (titleEl && title) titleEl.textContent = title;
  if (codeEl) codeEl.textContent = formatInviteCode(inviteCode) || '—';
  if (addrEl) addrEl.textContent = address || '—';
  if (nodeEl) nodeEl.textContent = (node && (node.name || node.addr)) || '—';
  if (pingEl) pingEl.textContent = typeof ping === 'number' ? `${ping} ms` : (ping || '— ms');
  if (portEl) portEl.textContent = port || '—';
}

/* ============================ 核心下载模态框 ============================ */

let _taowaDownloading = false;
let _taowaReady = false; /* 是否已安装核心 */

/* ============== 模态框背景滚动锁定 ============== */
function lockBackgroundScroll(lock) {
  const viewEl = document.getElementById('view-taowa');
  if (viewEl) {
    viewEl.style.overflow = lock ? 'hidden' : '';
  }
  /* 同时阻止 window 的滚动事件冒泡（滚轮 / 触控板 / 键盘）*/
  document.body.classList.toggle('taowa-modal-open', !!lock);
}

/* 模态框显示时，在 overlay 上拦截所有滚动/触摸事件，防止冒泡到背景 */
function bindModalEventBlock() {
  const modals = [
    document.getElementById('taowaDownloadModal'),
    document.getElementById('taowaUninstallModal')
  ].filter(Boolean);
  modals.forEach((modal) => {
    /* 拦截滚轮与触控板滚动 */
    modal.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });
    /* 拦截触摸滑动 */
    modal.addEventListener('touchmove', (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });
    /* 拦截可能滚动页面的按键：方向键 / PageUp/Down / 空格 */
    modal.addEventListener('keydown', (e) => {
      if (['PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
    }, { passive: false });
    /* 把 overlay 上的点击拦截掉，避免冒泡到背景元素 */
    const overlay = modal.querySelector('.taowa-download-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    }
  });
}

/** 显示模态框 */
function showDownloadModal() {
  const modal = $('taowaDownloadModal');
  if (modal) modal.classList.remove('hidden');
  lockBackgroundScroll(true);
}
/** 隐藏模态框 */
function hideDownloadModal() {
  const modal = $('taowaDownloadModal');
  if (modal) modal.classList.add('hidden');
  lockBackgroundScroll(false);
}
/** 更新下载进度 */
function updateDownloadProgress(percent, text) {
  const fill = $('taowaDownloadFill');
  const t = $('taowaDownloadText');
  if (fill) fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  if (t) t.textContent = text || `${Math.round(percent)}%`;
}

/** 检查核心是否已安装，如果未安装则自动弹出下载模态框
 * @param {boolean} force - 强制触发下载（即使用户之前已取消）
 */
async function ensureTaowaCore(force) {
  if (!window.zenith || !window.zenith.taowa) {
    showToast('运行环境异常（未在 Electron 内运行）', 'error');
    return false;
  }

  /* 每次进入都重新检测（因为用户可能在页面卸载了核心）*/
  let needDownload = false;
  try {
    const info = await window.zenith.taowa.info();
    if (info && info.ready) {
      _taowaReady = true;
      return true;
    }
    needDownload = true;
  } catch (e) {
    needDownload = true;
  }

  if (!needDownload) return true;

  /* 显示模态框并下载（防止重复触发）*/
  if (_taowaDownloading) return false;
  _taowaDownloading = true;
  showDownloadModal();
  disableInteractive();
  updateDownloadProgress(0, '正在准备下载 EasyTier 核心…');

  try {
    const res = await window.zenith.taowa.download();
    if (res && res.ok) {
      updateDownloadProgress(100, '下载完成，请再次点击按钮开始使用');
      _taowaReady = true;
      _taowaDownloading = false;
      disableInteractive(false);
      setTimeout(() => {
        hideDownloadModal();
        /* 下载完成后刷新核心信息，确保卸载按钮可用（问题3修复）*/
        if (typeof refreshCoreInfo === 'function') {
          try { refreshCoreInfo(); } catch (e) { console.error('[陶瓦联机] 刷新核心信息失败:', e); }
        }
        showToast('核心下载完成，请再次点击按钮开始使用', 'success');
      }, 600);
      return false;
    } else {
      updateDownloadProgress(0, `下载失败：${(res && res.error) || '未知错误'}`);
      showToast(`核心下载失败：${(res && res.error) || '请检查网络'}`, 'error');
      _taowaDownloading = false;
      disableInteractive(false);
      setTimeout(() => {
        hideDownloadModal();
      }, 2500);
      return false;
    }
  } catch (err) {
    console.error('[陶瓦联机] 下载核心失败:', err);
    updateDownloadProgress(0, `下载失败：${(err && err.message) || err}`);
    showToast(`核心下载失败：${(err && err.message) || err}`, 'error');
    _taowaDownloading = false;
    disableInteractive(false);
    setTimeout(() => {
      hideDownloadModal();
    }, 2500);
    return false;
  }
}

/* ============================ 交互控制 ============================ */

function disableInteractive(disabled) {
  /* 关键修复：
     - disableInteractive(true)  → 明确阻塞（例如正在创建/加入房间）
     - disableInteractive(false) → 明确解除（例如 finally 中恢复）
     - 不传参数              → 仅在 _taowaDownloading 为 true 时阻塞
     之前的逻辑是 disabled || _taowaDownloading，导致"显式传入 false"也可能
     因为 _taowaDownloading 还在 600ms 延迟内残留 true 而无法解除阻塞 */
  let isBlocked;
  if (disabled === true) isBlocked = true;
  else if (disabled === false) isBlocked = false;
  else isBlocked = _taowaDownloading;

  ['taowaCreateBtn', 'taowaJoinBtn', 'taowaJoinPanelBtn', 'taowaPortInput', 'taowaRoomCode', 'taowaRoomCodeInput'].forEach(id => {
    const el = $(id);
    if (!el) return;
    if (isBlocked) el.setAttribute('disabled', 'true'); else el.removeAttribute('disabled');
  });
  const stop = $('taowaStopBtn');
  if (stop) {
    if (isBlocked) { stop.textContent = '操作进行中…'; stop.setAttribute('disabled', 'true'); }
    else { stop.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="svg-icon-small" style="display:inline-block; vertical-align:middle; margin-right:4px;"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg> 断开连接'; stop.removeAttribute('disabled'); }
  }
}

/* ============================ 节点列表 ============================ */

function renderNodes(nodes) {
  const listEl = $('taowaNodesList');
  if (!listEl) return;
  listEl.innerHTML = '';
  (nodes || TAOWA_NODES_PREVIEW).forEach(node => {
    const item = document.createElement('div');
    item.className = 'taowa-node-item';
    item.innerHTML = `
      <div class="taowa-node-info">
        <span class="taowa-node-dot"></span>
        <div>
          <div class="taowa-node-name">${node.name}</div>
          <div class="taowa-node-addr">${node.addr}</div>
        </div>
      </div>
      <span class="taowa-node-ping">待连接</span>
    `;
    listEl.appendChild(item);
  });
}

/* ============================ Tab 切换 ============================ */

function switchTab(tabName) {
  document.querySelectorAll('.taowa-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.taowaTab === tabName);
  });
  document.querySelectorAll('.taowa-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.taowaPanel === tabName);
  });
}

/* ============================ 复制 ============================ */

function copyTextFromElement(id, label) {
  const el = $(id);
  if (!el) return;
  const text = el.textContent && el.textContent.trim();
  if (!text || text === '—') { showToast('暂无可复制的内容', 'warning'); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast(`已复制${label}`, 'success')).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); showToast(`已复制${label}`, 'success'); } catch (_) { showToast('复制失败，请手动选择复制', 'error'); }
      document.body.removeChild(ta);
    });
  } else {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); showToast(`已复制${label}`, 'success'); } catch (_) { showToast('复制失败，请手动选择复制', 'error'); }
    document.body.removeChild(ta);
  }
}

/* ============================ 进度事件监听（下载 EasyTier） ============================ */

function bindTaowaEvents() {
  if (!window.zenith || !window.zenith.taowa) return;
  const api = window.zenith.taowa;
  if (typeof api.onProgress === 'function') {
    api.onProgress((p) => {
      if (!p) return;
      /* 如果正在显示核心下载模态框，更新进度条 */
      if (_taowaDownloading && p.phase !== 'ready') {
        const percent = typeof p.percent === 'number' ? p.percent : 0;
        let text = p.message || '下载中…';
        if (p.phase === 'download') text = text.replace(/^下载中…/, '下载中');
        updateDownloadProgress(percent, text);
      } else if (_taowaDownloading && p.phase === 'ready') {
        updateDownloadProgress(100, p.message || '下载完成');
      } else if (p.message) {
        /* 其他状态更新到状态栏 */
        setStatus(p.message, `阶段：${p.phase || ''}`);
      }
    });
  }
  if (typeof api.onEvent === 'function') {
    api.onEvent((e) => {
      if (e && e.type === 'log' && e.line) console.log('[EasyTier]', e.line);
    });
  }
}

/* ============================ 核心连接逻辑 ============================ */

async function createRoom() {
  if (!window.zenith || !window.zenith.taowa) {
    showToast('运行环境异常（未在 Electron 内运行）', 'error');
    return;
  }

  /* 先确保核心已下载 */
  const coreReady = await ensureTaowaCore();
  if (!coreReady) {
    showToast('请先完成核心下载后再创建房间', 'warning');
    return;
  }

  disableInteractive(true);
  setStatus('正在准备 EasyTier…', '首次使用会自动下载并安装 EasyTier 核心（约 14 MB）');

  try {
    const api = window.zenith.taowa;
    const res = await api.startHost();
    if (!res || !res.ok) {
      showToast((res && res.error) || '创建房间失败', 'error');
      setStatus('未连接', (res && res.error) || '创建房间失败');
      return;
    }

    setStatus('已连接（房主）', `虚拟 IP：${res.vip}   端口：25565（Minecraft 对局域网开放后自动使用）`);
    setNodeInfo(res.peer);

    setResultCard({
      show: true,
      title: '房间已创建（房主）',
      inviteCode: res.inviteCode,
      address: `${res.vip}:25565`,
      node: res.peer,
      ping: '—',
      port: '25565'
    });

    showToast('房间创建成功，请把邀请码分享给朋友', 'success');
  } catch (err) {
    console.error('[陶瓦联机] 创建房间失败:', err);
    showToast('创建房间失败: ' + (err && err.message || err), 'error');
    setStatus('未连接', '创建失败，请重试或检查网络');
  } finally {
    disableInteractive(false);
  }
}

async function joinRoom(code) {
  if (!window.zenith || !window.zenith.taowa) {
    showToast('运行环境异常（未在 Electron 内运行）', 'error');
    return;
  }

  const clean = (code || '').trim();
  if (!clean) {
    showToast('请输入邀请码', 'error');
    return;
  }

  /* 先确保核心已下载 */
  const coreReady = await ensureTaowaCore();
  if (!coreReady) {
    showToast('请先完成核心下载后再加入房间', 'warning');
    return;
  }

  disableInteractive(true);
  setStatus('正在准备 EasyTier…', '首次使用会自动下载并安装 EasyTier 核心');

  try {
    const api = window.zenith.taowa;
    const res = await api.startGuest({ code: clean });
    if (!res || !res.ok) {
      showToast((res && res.error) || '加入房间失败', 'error');
      setStatus('未连接', (res && res.error) || '加入房间失败');
      return;
    }

    setStatus('已连接（成员）', `虚拟 IP：${res.vip}   房主：${res.hostVip || '10.144.144.1'}`);
    setNodeInfo(res.peer);

    setResultCard({
      show: true,
      title: '已加入房间',
      inviteCode: res.inviteCode,
      address: `${res.hostVip || '10.144.144.1'}:25565`,
      node: res.peer,
      ping: '—',
      port: '25565'
    });

    showToast('加入成功，请在 Minecraft 多人游戏中直接访问房主地址', 'success');
  } catch (err) {
    console.error('[陶瓦联机] 加入房间失败:', err);
    showToast('加入房间失败: ' + (err && err.message || err), 'error');
    setStatus('未连接', '加入失败，请检查邀请码或网络');
  } finally {
    disableInteractive(false);
  }
}

async function disconnect() {
  if (!window.zenith || !window.zenith.taowa) return;
  if (_taowaDownloading) {
    showToast('核心下载中，请等待完成', 'info');
    return;
  }
  disableInteractive(true);
  try {
    const res = await window.zenith.taowa.stop();
    if (res && res.ok) {
      showToast('已断开连接', 'info');
      setStatus('未连接', '创建房间或输入邀请码加入');
      setNodeInfo(null);
      setResultCard({ show: false });
    } else {
      showToast((res && res.error) || '断开失败', 'error');
    }
  } catch (err) {
    showToast('断开失败: ' + (err && err.message || err), 'error');
  } finally {
    disableInteractive(false);
  }
}

/* ============================ 初始化 ============================ */

/** 更新核心管理卡片的信息（路径 / 是否内置）和核心未下载时的提示卡片 */
async function refreshCoreInfo() {
  const infoEl = document.getElementById('taowaCoreInfo');
  const uninstallBtn = document.getElementById('taowaUninstallBtn');
  const coreAlert = document.getElementById('taowaCoreAlert');
  const downloadBtn = document.getElementById('taowaDownloadCoreBtn');

  try {
    if (!window.zenith || !window.zenith.taowa) return;
    const info = await window.zenith.taowa.info();
    if (!info) return;

    /* 关键逻辑：
       - hasDownloaded=true → 用户主动下载了核心，可以卸载
       - fromBundled=true && !hasDownloaded → 使用内置核心，无需下载也无需卸载
       - !ready → 需要下载核心
    */
    if (info.ready) {
      if (info.hasDownloaded) {
        // 有本地下载的核心，用户可以卸载
        if (coreAlert) coreAlert.style.display = 'none';
        let msg = '已安装（本地下载）';
        if (info.binPath) msg += `\n路径：${info.binPath}`;
        if (typeof info.size === 'number' && info.size > 0) {
          msg += `\n大小：${(info.size / 1024 / 1024).toFixed(2)} MB`;
        }
        if (infoEl) {
          infoEl.textContent = msg;
          infoEl.title = msg;
          infoEl.style.whiteSpace = 'pre-line';
        }
        if (uninstallBtn) uninstallBtn.disabled = false;
      } else if (info.fromBundled) {
        // 只有内置核心，不允许卸载也不提示下载
        if (coreAlert) coreAlert.style.display = 'none';
        if (infoEl) {
          infoEl.textContent = '使用内置核心，无需下载';
          infoEl.style.whiteSpace = 'normal';
        }
        if (uninstallBtn) {
          uninstallBtn.disabled = true;
          uninstallBtn.textContent = '无需卸载';
        }
      } else {
        // 有核心但来源未知
        if (coreAlert) coreAlert.style.display = 'none';
        if (infoEl) infoEl.textContent = '已安装';
        if (uninstallBtn) uninstallBtn.disabled = true;
      }
    } else {
      // 核心未就绪：显示核心未下载提示卡
      if (coreAlert) coreAlert.style.display = 'flex';
      if (infoEl) {
        infoEl.textContent = '尚未安装核心，点击上方按钮下载';
        infoEl.style.whiteSpace = 'normal';
      }
      if (uninstallBtn) uninstallBtn.disabled = true;
    }

    // 绑定下载核心按钮
    if (downloadBtn) {
      downloadBtn.onclick = function() {
        if (typeof ensureTaowaCore === 'function') {
          ensureTaowaCore(true);
        }
      };
    }
  } catch (e) {
    if (infoEl) infoEl.textContent = '获取核心信息失败：' + String(e && e.message || e);
  }
}

/** 显示/隐藏卸载确认弹窗 */
function showUninstallModal() {
  const m = document.getElementById('taowaUninstallModal');
  if (m) m.classList.remove('hidden');
  lockBackgroundScroll(true);
}
function hideUninstallModal() {
  const m = document.getElementById('taowaUninstallModal');
  if (m) m.classList.add('hidden');
  lockBackgroundScroll(false);
}

/** 执行卸载逻辑 */
async function doUninstall() {
  if (!window.zenith || !window.zenith.taowa) return;
  const btn = document.getElementById('taowaUninstallConfirm');
  if (btn) { btn.disabled = true; btn.textContent = '正在卸载…'; }
  try {
    const r = await window.zenith.taowa.uninstall();
    if (r && r.ok) {
      /* 卸载完成，重置 ready 标志，刷新核心信息
       * 下次进入陶瓦联机页面时 ensureTaowaCore 会检测到缺失，自动弹出下载模态框
       */
      _taowaReady = false;
      showToast('已卸载陶瓦联机核心', 'success');
    } else {
      showToast('卸载失败：' + (r && r.error || '未知错误'), 'error');
    }
  } catch (e) {
    showToast('卸载失败：' + String(e && e.message || e), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '确认卸载'; }
    hideUninstallModal();
    refreshCoreInfo();
  }
}

function initTaowaView() {
  if (!document.getElementById('view-taowa')) return;

  /* 绑定模态框事件拦截（在页面进入时准备好） */
  bindModalEventBlock();

  /* 绑定卸载相关按钮 */
  const uninstallBtn = document.getElementById('taowaUninstallBtn');
  const uninstallCancel = document.getElementById('taowaUninstallCancel');
  const uninstallConfirm = document.getElementById('taowaUninstallConfirm');
  if (uninstallBtn) uninstallBtn.addEventListener('click', showUninstallModal);
  if (uninstallCancel) uninstallCancel.addEventListener('click', hideUninstallModal);
  if (uninstallConfirm) uninstallConfirm.addEventListener('click', doUninstall);

  /* 仅刷新核心管理卡片信息（进入陶瓦联机页面时才触发 ensureTaowaCore） */
  refreshCoreInfo();

  setStatus('未连接', '创建房间或输入邀请码加入');
  renderNodes(TAOWA_NODES_PREVIEW);

  /* Tab */
  document.querySelectorAll('.taowa-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.taowaTab));
  });

  /* 创建房间 */
  const createBtn = $('taowaCreateBtn');
  if (createBtn) createBtn.addEventListener('click', createRoom);

  /* 加入房间（顶部快捷卡） */
  const joinBtn = $('taowaJoinBtn');
  if (joinBtn) joinBtn.addEventListener('click', () => {
    const codeEl = $('taowaRoomCode');
    joinRoom(codeEl ? codeEl.value : '');
  });

  /* 加入房间（Tab 内的按钮） */
  const joinPanelBtn = $('taowaJoinPanelBtn');
  if (joinPanelBtn) joinPanelBtn.addEventListener('click', () => {
    const codeEl = $('taowaRoomCodeInput');
    joinRoom(codeEl ? codeEl.value : '');
  });

  /* 回车快捷加入 */
  ['taowaRoomCode', 'taowaRoomCodeInput'].forEach((id, idx) => {
    const el = $(id);
    if (el) el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (idx === 0) $('taowaJoinBtn')?.click();
        else $('taowaJoinPanelBtn')?.click();
      }
    });
  });

  /* 断开 */
  const stopBtn = $('taowaStopBtn');
  if (stopBtn) stopBtn.addEventListener('click', disconnect);

  /* 复制按钮 */
  const copyCodeBtn = $('taowaCopyCodeBtn');
  if (copyCodeBtn) copyCodeBtn.addEventListener('click', () => copyTextFromElement('taowaResultCode', '邀请码'));
  const copyAddrBtn = $('taowaCopyAddrBtn');
  if (copyAddrBtn) copyAddrBtn.addEventListener('click', () => copyTextFromElement('taowaResultAddress', '服务器地址'));

  /* 主进程事件广播监听（下载进度、日志） */
  bindTaowaEvents();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTaowaView);
} else {
  setTimeout(initTaowaView, 0);
}
