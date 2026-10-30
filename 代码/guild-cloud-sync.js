// ============================================================
// 妖精的尾巴 · 三端云同步桥
// 不改动 代码/schedule.js，通过 hook localStorage 实现云端镜像
// 模式：supabase → Supabase（免费层 500MB，真云端 REST API）
// 使用：填好下方 supabase 凭据即可
// ============================================================
(function () {
  'use strict';

  var CONFIG = {
    // 在线同步总开关：false = 屏蔽云端同步（纯本地模式，不发起任何云端请求）。
    syncEnabled: true,
    mode: 'supabase',
    // Supabase 凭据（Settings → API 页面获取）
    supabaseUrl: 'https://pjrcbacixmfdytuvgetu.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqcmNiYWNpeG1mZHl0dXZnZXR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3NzUxODIsImV4cCI6MjEwNjM1MTE4Mn0.3VIBAs13hYb2bPwz2YrN47BLelbc9Vqapk0tETTcMvw',
    supabaseTable: 'guildcloudsync',
    // 参与云同步的数据 key（页面全部核心数据）
    syncKeys: [
      'fairytail-reading-library-v1',
      'fairytail-guild-daily-journal-v1',
      'fairytail-schedule-v1',
      'fairytail-wallet-v1',
      'fairytail-tasks-v2',
      'fairytail-growth-v1',
      'fairytail-warehouse-v1',
      'guildRPGData',
      // 以下为跨设备状态（2026-09-27 补齐，修复手机/电脑不一致）
      'fairytail-guild-hall-v3-encounters', // 公会大厅相遇对话记录
      'fairytail-guild-hall-active-scene',  // 当前场景（白天/夜晚等）
      'fairytail-guild-hall-open',          // 大厅展开状态
      'fairytail-guild-hall-ui-version',    // 大厅 UI 版本
      'fairytail-daily-template-v2',        // 每日模板起始日期
      // v64 公会系统扩展（2026-09-27 新增）
      'fairytail-attendance-v1',            // 出勤簿
      'fairytail-weekly-goals-v1',          // 委托板周目标
      'fairytail-bond-v1',                  // 羁绊之书
      'fairytail-monthly-reports-v1',       // 公会月刊
      'fairytail-daily-events-v1',          // 公会日常
      'fairytail-s-trial-v1',               // S级考核
      'fairytail-guild-reputation-v1',      // 公会声望
      'fairytail-badge-fragments-v1',       // 徽章碎片
      'fairytail-titles-v1',                // 已获称号
      'fairytail-features-granted-v1',      // 奖励发放去重
      'fairytail-quote-cache-v1'            // 名言缓存（月刊引用）
    ]
  };

  var META_KEY = '__guild_cloud_meta__';
  // 云端接收/合并不得走用户写入钩子，否则会制造待上传回声。
  var nativeStorageSet = Storage.prototype.setItem;
  var nativeStorageRemove = Storage.prototype.removeItem;
  var dirty = new Set();
  var PENDING_KEY = '__guild_cloud_pending_keys__';
  var pending = new Set();
  try {
    var savedPending = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    if (Array.isArray(savedPending)) savedPending.forEach(function (key) {
      if (CONFIG.syncKeys.indexOf(key) !== -1 && localStorage.getItem(key) !== null) { pending.add(key); dirty.add(key); }
    });
  } catch (e) { console.warn('[guild-cloud] pending queue unreadable', e); }
  function persistPending() {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(Array.from(pending))); }
    catch (e) { setBadge('本机已保存 · 待同步清单保存失败，请勿关闭页面', false); }
  }
  var pushTimer = null;
  var lastPullAt = 0;
  var latestCloudRecords = [], lastAuditAt = 0, latestAudit = null, syncRisk = null, recoveryNote = "尚未保存本次恢复点";
  var online = false;
  var hookInstalled = false;
  var supaWriteQueue = Promise.resolve();
  var activeWrites = 0;
  var lastConfirmedAt = 0;
  // 前台每10秒只探测时间戳，有更新才下载正文；后台暂停轮询。
  // 打开页面 / 回到前台 / 点击浮标时立即拉一次，切后台或离开页面前立即 flush 推送。
  var PULL_INTERVAL = 10 * 1000;

  // ---------- 本地时间记录 ----------
  function readMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function writeMeta(meta) {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { console.warn('[guild-cloud] writeMeta failed', e); }
  }
  function localTimeOf(key) {
    var m = readMeta();
    return m[key] || 0;
  }
  function markLocalWrite(key, t) {
    var m = readMeta();
    m[key] = t || Date.now();
    writeMeta(m);
  }

  // 历史数据保护：云端内容覆盖本机前必须通过结构和规模校验。
  function parseJson(value, fallback) {
    try { return JSON.parse(value); } catch (e) { return fallback; }
  }
  function validRemoteValue(key, remoteValue, localValue) {
    if (typeof remoteValue !== 'string' || !remoteValue.length) return false;
    var remote = parseJson(remoteValue, null);
    var local = parseJson(localValue, null);
    if (key === 'fairytail-reading-library-v1') return GuildReadingCore.valid(remote);
    if (key === 'fairytail-tasks-v2') {
      if (!Array.isArray(remote) || remote.some(function (task) { return task && Array.isArray(task.value); })) return false;
      var remoteIds = remote.map(function (task) { return task && task.id; }).filter(Boolean);
      if (new Set(remoteIds).size !== remoteIds.length) return false;
      var localCount = Array.isArray(local) ? local.filter(function (task) { return task && task.id; }).length : 0;
      if (localCount >= 10 && remoteIds.length < Math.floor(localCount * 0.8)) return false;
    }
    if (key === 'fairytail-schedule-v1') {
      if (!remote || Array.isArray(remote) || typeof remote !== 'object') return false;
      var remoteDates = Object.keys(remote).filter(function (name) { return /^\d{4}-\d{2}-\d{2}$/.test(name); }).length;
      var localDates = local && typeof local === 'object' ? Object.keys(local).filter(function (name) { return /^\d{4}-\d{2}-\d{2}$/.test(name); }).length : 0;
      if (localDates >= 5 && remoteDates < Math.floor(localDates * 0.7)) return false;
    }
    if (key === 'fairytail-growth-v1') {
      if (!remote || Array.isArray(remote) || typeof remote !== 'object') return false;
      var remoteEntries = Object.keys(remote.entries || {}).length;
      var localEntries = Object.keys((local && local.entries) || {}).length;
      if (localEntries >= 20 && remoteEntries < Math.floor(localEntries * 0.7)) return false;
    }
    if (key === 'fairytail-wallet-v1') {
      var remoteRedemptions = Array.isArray(remote && remote.redemptions) ? remote.redemptions.length : 0;
      var localRedemptions = Array.isArray(local && local.redemptions) ? local.redemptions.length : 0;
      if (localRedemptions >= 3 && remoteRedemptions < Math.floor(localRedemptions * 0.7)) return false;
      var remoteBonus = Array.isArray(remote && remote.bonus) ? remote.bonus.length : 0;
      var localBonus = Array.isArray(local && local.bonus) ? local.bonus.length : 0;
      if (localBonus > remoteBonus) return false;
    }
    if (key === 'fairytail-warehouse-v1') {
      var remoteItems = Array.isArray(remote && remote.items) ? remote.items.length : 0;
      var localItems = Array.isArray(local && local.items) ? local.items.length : 0;
      if (localItems >= 10 && remoteItems < Math.floor(localItems * 0.7)) return false;
    }
    return true;
  }

  // ---------- 同步状态浮标（统一状态源：顶部 connectionBadge + 右下悬浮浮标同步显示） ----------
  function badgeEls() {
    var top = document.getElementById('connectionBadge');
    var floater = document.getElementById('guildCloudBadge');
    return { top: top, floater: floater };
  }
  function ensureBadge() {
    var els = badgeEls();
    var top = els.top;
    if (!top) return;
    var statusLabel = top.querySelector('.label-text');
    if (statusLabel) statusLabel.style.setProperty('display', 'inline', 'important');
    if (top.getAttribute('data-cloud-bound') !== '1') {
      top.setAttribute('data-cloud-bound', '1');
      top.style.cursor = 'pointer';
      top.title = '点击核对本机与云端记录';
      top.onclick = function () { if (globalThis.GuildWorkspace) GuildWorkspace.openSync(); else { var floater = document.getElementById('guildCloudBadge'); if(floater)showDockMenu(floater); } };
      top.ondblclick = null;
    }
    if (!els.floater) {
      var b = document.createElement('div');
      b.id = 'guildCloudBadge';
      b.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:99999;width:52px;height:52px;border-radius:50%;background:#fff8ee url(素材/界面/站点标识/guild-dock-icon-fast-v101.webp) center/76% no-repeat;border:3px solid #e7a362;box-shadow:0 3px 12px rgba(0,0,0,.22);transition:border-color .3s,box-shadow .3s;cursor:pointer;user-select:none;';
      b.title = '公会工具';
      b.innerHTML = '<img src="素材/界面/功能图标/guild-ui-tools-v210.svg" alt="" width="30" height="30"><span>工具</span>';
      b.setAttribute('role', 'button');
      b.tabIndex = 0;
      b.setAttribute('aria-label', '打开公会工具');
      b.onkeydown = function (event) { if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showDockMenu(b); } };
      b.onclick = function () { showDockMenu(b); };
      document.body.appendChild(b);
    }
    if (!document.getElementById('guildSyncNow')) {
      var syncButton = document.createElement('button');
      syncButton.id = 'guildSyncNow'; syncButton.type = 'button';
      syncButton.textContent = '立即同步';
      syncButton.style.cssText = 'margin:6px 0;min-height:36px;padding:6px 12px;';
      syncButton.onclick = function (event) { event.stopPropagation(); manualSync(); };
      top.insertAdjacentElement('afterend', syncButton);
    }
    if (!document.getElementById('guildRefreshPage')) {
      var refresh = document.createElement('button');
      refresh.id = 'guildRefreshPage'; refresh.type = 'button';
      refresh.textContent = '↻ 刷新页面';
      refresh.title = '重新加载当前页面，保留已保存的存档';
      refresh.onclick = function (event) { event.stopPropagation(); refreshGuildPage(); };
      document.getElementById('guildSyncNow').insertAdjacentElement('afterend', refresh);
      var refreshStyle = document.createElement('style');
      refreshStyle.textContent = '#guildRefreshPage{display:none}@media(max-width:820px){#guildRefreshPage{display:inline-flex!important;align-items:center;justify-content:center;flex:0 0 auto;width:auto!important;min-height:44px;margin:0 0 0 6px;padding:6px 12px;border:1px solid #c99b86;border-radius:9px;background:#fffaf4;color:#7f293b;font-family:inherit;font-size:13px;font-weight:600;white-space:nowrap}}';
      document.head.appendChild(refreshStyle);
    }
    if (!window.__guildCloudState) setBadge('云端：连接中…', null);
  }
  async function refreshGuildPage() {
    var hasDraft = Array.from(document.querySelectorAll('#newTask,#quickIntake input[type="text"],form textarea,dialog[open] input:not([type="button"]):not([type="submit"])')).some(function (field) {
      return field.getClientRects().length && !field.disabled && String(field.value || '').trim() && field.value !== field.defaultValue;
    });
    if (hasDraft || pending.size || activeWrites) {
      var text = hasDraft ? '页面还有未提交的输入，刷新可能丢失这些内容。已保存的记录会保留。仍要刷新吗？' : '本机记录已保存，仍有云端同步尚未确认；刷新后会继续同步。现在刷新吗？';
      var approved = typeof guildConfirmDialog === 'function'
        ? await guildConfirmDialog({ title: '刷新公会页面', text: text, okText: '刷新页面', cancelText: '留在页面' })
        : window.confirm(text);
      if (!approved) return false;
    }
    location.reload();
    return true;
  }
  // ---------- 融合菜单：单击右下角按钮弹出两个选项 ----------
  function showDockMenu(anchor) {
    var old = document.getElementById('guildDockMenu');
    if (old) { if (old._close) old._close(); else old.remove(); return; }
    var m = document.createElement('div');
    m.id = 'guildDockMenu';
    m.className = 'guild-tool-menu';
    m.setAttribute('aria-label', '公会工具');
    anchor.setAttribute('aria-expanded', 'true');
    var items = [
      { icon: 'quest', label: '登记委托', action: function () {
        var input = document.getElementById('newTask');
        if (!input) { showNotice('登记入口暂未就绪，请稍后再试'); return; }
        input.scrollIntoView({behavior:'smooth',block:'center'}); input.focus({preventScroll:true});
      } },
      { icon: 'warehouse', label: '打开仓库', action: function () {
        var button = document.getElementById('openGuildWarehouse');
        if (button) button.click(); else showNotice('仓库入口暂未就绪，请稍后再试');
      } },
      { icon: 'mail', label: '公会信箱', action: function () {
        if (document.getElementById('guildFeaturesPanel')?.classList.contains('open') && typeof window.__guildFeaturesToggle === 'function') window.__guildFeaturesToggle();
        if (typeof window.guildToggleMailbox === 'function') window.guildToggleMailbox(); else showNotice('信箱暂未就绪，请稍后再试');
      } },
      { icon: 'book', label: '公会记录与羁绊', action: function () {
        if (document.getElementById('ge196-panel')?.classList.contains('open')) document.querySelector('#ge196-panel .ge196-close')?.click();
        if (typeof window.__guildFeaturesToggle === 'function') window.__guildFeaturesToggle(); else showNotice('成长档案暂未就绪，请稍后再试');
      }}
    ];
    items.forEach(function (it) {
      var d = document.createElement('button');
      d.type = 'button';
      d.innerHTML = '<img src="素材/界面/功能图标/guild-ui-' + it.icon + '-v210.svg" width="24" height="24" alt=""><span>' + it.label + '</span>';
      d.onclick = function (e) { e.stopPropagation(); close(); it.action(); };
      m.appendChild(d);
    });
    var more = document.createElement('details');
    var summary = document.createElement('summary'); summary.textContent = '维护与设置'; more.appendChild(summary);
    var maintenance = document.createElement('button'); maintenance.type = 'button'; maintenance.textContent = '维护簿';
    maintenance.onclick = function () { close(); showMaintenanceBook(); }; more.appendChild(maintenance);
    var automatic = document.createElement('button'); automatic.type = 'button';
    var autoEnabled = (localStorage.getItem('guildAutoRefresh') || 'on') !== 'off';
    automatic.textContent = '自动显示云端更新：' + (autoEnabled ? '已开启 · 点击关闭' : '已关闭 · 点击开启');
    automatic.setAttribute('aria-pressed',String(autoEnabled));
    automatic.onclick = function () { toggleAutoRefresh(); close(); }; more.appendChild(automatic);m.appendChild(more);
    document.body.appendChild(m);
    function close() { m.remove(); anchor.setAttribute('aria-expanded','false'); document.removeEventListener('click',outside); document.removeEventListener('keydown',escape); }
    function outside(ev) { if (!m.contains(ev.target) && !anchor.contains(ev.target)) close(); }
    function escape(ev) { if (ev.key === 'Escape') {close();anchor.focus({preventScroll:true});} }
    m._close = close;
    document.addEventListener('click',outside); document.addEventListener('keydown',escape);
    m.querySelector('button').focus({preventScroll:true});
  }
  function toggleAutoRefresh() {
    var off = (localStorage.getItem('guildAutoRefresh') || 'on') === 'off';
    localStorage.setItem('guildAutoRefresh', off ? 'on' : 'off');
    showNotice(off ? '自动显示已开启：收到新委托后自动更新列表' : '自动显示已关闭：云端数据仍会接收，点击立即同步可更新列表');
  }
  // ok: true=绿(已同步) false=红(待同步/离线) null=黄(连接中/重试)
  function setBadge(text, ok) {
    if (CONFIG.syncEnabled && ok === true && (pending.size || activeWrites)) {
      text = '本机已保存 · 云端尚有待确认数据';
      ok = null;
    }
    if (CONFIG.syncEnabled && pending.size) {
      text = '本机已保存 · '+pending.size+'组记录待云端确认'+(ok===false?'（连接未成功）':'');
    } else if (CONFIG.syncEnabled && ok===true) {
      text = (lastConfirmedAt ? '云端写入已确认' : '云端连接正常') + (lastPullAt ? ' · 接收 '+new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit'}).format(new Date(lastPullAt)) : '') + ' · 点击核对';
    }
    window.__guildCloudState = { text: text, ok: ok, pendingCount: pending.size, activeWrites: activeWrites, lastConfirmedAt: lastConfirmedAt, lastPullAt: lastPullAt, otherDeviceConfirmed: null };
    var els = badgeEls();
    var top = els.top, floater = els.floater;
    if (top) {
      var label = top.querySelector('.label-text');
      if (label && label.textContent!==text) label.textContent = text;
      top.setAttribute('role','status');top.setAttribute('aria-live','polite');
      var cls = 'guild-connection-badge';
      if (ok === true) cls += ' online';
      else if (ok === false) cls += ' offline';
      else cls += ' syncing';
      top.className = cls;
      top.title = '点击核对本机、云端与恢复点。'+(lastConfirmedAt?'本次访问上次写入确认：'+new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit'}).format(new Date(lastConfirmedAt))+'。':'')+'云端确认不代表另一台设备已拉取。';
    }
    if (floater) {
      floater.style.borderColor = ok === true ? '#4caf50' : ok === false ? '#d9603b' : '#e7a362';
      floater.style.boxShadow = ok === true ? '0 0 10px #4caf5088' : ok === false ? '0 0 10px #d9603b66' : '0 3px 12px rgba(0,0,0,.22)';
      floater.title = '公会工具 · 单击打开';
    }
    var dockStatus = document.getElementById('guildDockStatus');
    if (dockStatus) {
      dockStatus.textContent = text;
      dockStatus.className = 'guild-dock-status ' + (ok === true ? 'ok' : ok === false ? 'fail' : 'syncing');
    }
    if (typeof window.dispatchEvent === 'function') {
      try { window.dispatchEvent(new CustomEvent('guildCloudStateChange')); } catch (e) {}
    }
  }
  function showMaintenanceBook() {
    var previous = document.getElementById('guildMaintenanceBook');
    if (previous) { previous.showModal(); return; }
    var dialog = document.createElement('dialog');
    dialog.id = 'guildMaintenanceBook';
    dialog.style.cssText = 'max-width:440px;width:calc(100% - 40px);max-height:86vh;overflow:auto;padding:22px;background:#fffdf8;color:#392d28;border:1px solid #c9935c;border-radius:16px;box-shadow:0 16px 44px rgba(80,40,20,.2);font-family:"Microsoft YaHei",sans-serif;';
    var title = document.createElement('h3'); title.textContent = '公会维护簿'; title.style.cssText = 'margin:0 0 14px;color:#a53243;font-size:19px;'; dialog.appendChild(title);
    var tasks = parseJson(localStorage.getItem('fairytail-tasks-v2'), []);
    var lines = [
      CONFIG.syncEnabled ? '在线同步：已启用' : '在线同步：已停用；当前记录仅保存在本机',
      '待上传数据组：' + pending.size + '；正在确认：' + activeWrites,
      '最近云端写后确认：' + (lastConfirmedAt ? new Date(lastConfirmedAt).toLocaleString('zh-CN') : '本次打开尚未确认'),
      '最近云端读取：' + (lastPullAt ? new Date(lastPullAt).toLocaleString('zh-CN') : '尚未读取'),
      recoveryNote,
      '任务记录：' + (Array.isArray(tasks) ? tasks.length : '格式异常'),
      '缺少人物身份：' + (Array.isArray(tasks) ? tasks.filter(function (task) { return task && !task.assigneeId; }).length : '未检查'),
      '图片加载失败：' + Array.from(document.images).filter(function (img) { return img.getAttribute('src') && img.complete && !img.naturalWidth; }).length,
      '说明：待上传数按存储数据组统计，并非任务数；未检查真实跨端一致性、人物身份及历史恢复。'
    ];
    lines.forEach(function (line) { var p = document.createElement('p'); p.textContent = line; p.style.cssText = 'margin:0 0 9px;color:#49382f;font-size:14px;line-height:1.65;overflow-wrap:anywhere'; dialog.appendChild(p); });
    var compareButton = document.createElement('button'); compareButton.type = 'button'; compareButton.textContent = '核对本机与云端／恢复缺失历史'; compareButton.onclick = function () { dialog.close(); if (globalThis.GuildWorkspace) GuildWorkspace.openSync(); }; dialog.appendChild(compareButton);
    var close = document.createElement('button'); close.type = 'button'; close.textContent = '关闭'; close.style.cssText = 'min-height:38px;padding:7px 16px;border:1px solid #c9935c;border-radius:10px;background:#fff7eb;color:#713d2d;font:600 14px "Microsoft YaHei",sans-serif;cursor:pointer;'; close.onclick = function () { dialog.close(); }; dialog.appendChild(close);
    dialog.addEventListener('click', function (event) { if (event.target === dialog) { var rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
    dialog.addEventListener('close', function () { dialog.remove(); });
    document.body.appendChild(dialog); dialog.showModal();
  }
  function showNotice(text) {
    ensureBadge();
    var els = badgeEls();
    if (els.top) {
      var label = els.top.querySelector('.label-text');
      if (label) label.textContent = text;
      els.top.className = 'guild-connection-badge syncing';
    }
    if (els.floater) els.floater.style.borderColor = '#e7a362';
    var dockStatus = document.getElementById('guildDockStatus');
    if (dockStatus) { dockStatus.textContent = text; dockStatus.className = 'guild-dock-status syncing'; }
    setTimeout(function () { setBadge(online ? '云端：已同步' : '云端：离线（本地数据待同步）', online); }, 2000);
  }

  // ---------- 推送（本地 → 云端） ----------
  function schedulePush() {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 800); // 防抖 0.8s
  }
  function retryEntries(entries, error) {
    (entries || []).forEach(function (entry) {
      if (entry && entry.key) { dirty.add(entry.key); pending.add(entry.key); }
    });
    persistPending();
    online = false;
    if (error && error.syncGuard) { syncRisk = error.message; setBadge('同步保护：已暂停异常覆盖，请核对数据', false); return; }
    setBadge('云端：离线（本地数据待同步）', false);
    if (navigator.onLine !== false) setTimeout(push, 3500 + Math.floor(Math.random() * 3000));
  }

  function push() {
    if (!dirty.size) return;
    if (navigator.onLine === false) {
      online = false;
      setBadge('云端：离线（本地数据待同步）', false);
      return;
    }
    var entries = [];
    dirty.forEach(function (k) {
      var v = localStorage.getItem(k);
      if (v === null) return;
      entries.push({ key: k, value: v, updatedAt: localTimeOf(k) || Date.now() });
    });
    dirty.clear();

    var payload = { entries: entries };
    var url, headers = { 'Content-Type': 'application/json' };

    if (CONFIG.mode === 'supabase' && CONFIG.supabaseAnonKey) {
      return supaPush(entries)
        .then(function () { online = true; setBadge('云端：已同步', true); })
        .catch(function (error) { retryEntries(entries, error); });
      return;
    }

    online = false;
    setBadge('云端：离线（本地数据待同步）', false);
  }

  // ---------- 拉取（云端 → 本地） ----------
  function pull() {
    var url;
    var headers = {};

    if (CONFIG.mode === 'supabase' && CONFIG.supabaseAnonKey) {
      return supaPull()
        .then(function (list) {
          applyRemote(list);
          return list;
        })
        .catch(function (error) {
          online = false;
          cloudReadFailure(error);
          throw error;
        });
    }

    return Promise.resolve([]);
  }

  // ---------- 云端通道（Supabase REST API） ----------
  function supaHeaders(extra) {
    var h = { 'apikey': CONFIG.supabaseAnonKey, 'Authorization': 'Bearer ' + CONFIG.supabaseAnonKey, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };
    if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    return h;
  }
  function supaRestUrl(params) {
    var url = CONFIG.supabaseUrl + '/rest/v1/' + CONFIG.supabaseTable;
    if (params) url += '?' + params + '&key=in.(' + CONFIG.syncKeys.map(encodeURIComponent).join(',') + ')';
    return url;
  }
  function cloudReadFailure(error) {
    var message = String(error && error.message || '');
    var reason = /HTTP (401|403)/.test(message) ? '云端授权失败' : /HTTP/.test(message) ? '云端服务响应异常' : /超时|timeout|abort/i.test(message) ? '网络超时' : /JSON/.test(message) ? '云端响应格式异常' : '网络连接失败';
    setBadge('云端：' + reason + ' · 本机记录已保留', false);
  }
  function checkedJson(response, label) {
    if (!response || !response.ok) {
      return response.text().then(function (text) {
        throw new Error(label + '失败：HTTP ' + (response ? response.status : '无响应') + ' ' + (text || ''));
      });
    }
    return response.text().then(function (text) {
      if (!text) return [];
      try { return JSON.parse(text); }
      catch (e) { throw new Error(label + '返回了无效 JSON'); }
    });
  }
  function cloudJson(url, options, label) {
    options = Object.assign({ cache: 'no-store', credentials: 'omit' }, options);
    var readable = !options.method || options.method === 'GET';
    function attempt(retried) {
      var controller = typeof AbortController === 'function' ? new AbortController() : null, timer;
      var request = Object.assign({}, options); if (controller) request.signal = controller.signal;
      return Promise.race([
        Promise.resolve().then(function () { return fetch(url, request); }).then(function (response) { return checkedJson(response, label); }),
        new Promise(function (_, reject) { timer = setTimeout(function () { if (controller) controller.abort(); reject(new Error(label + '连接超时，本机记录已保留')); }, 20000); })
      ]).finally(function () { clearTimeout(timer); }).catch(function (error) {
        if (readable && !retried && !document.hidden && !/HTTP/.test(error.message || '')) return attempt(true);
        throw error;
      });
    }
    return attempt(false);
  }
  function supaPushNow(entries, baseline) {
    if (!entries || !entries.length) return Promise.resolve({ list: [] });
    if (globalThis.GuildWorkspaceCore && baseline) {
      var byKey = {}; baseline.forEach(function (r) { byKey[r.key] = r; });
      var risks = []; entries.forEach(function (e) { if (byKey[e.key]) risks = risks.concat(GuildWorkspaceCore.reductions(e.key, byKey[e.key].value, e.value)); });
      if (risks.length) { var problem = new Error(risks.join('；')); problem.syncGuard = true; syncRisk = problem.message; backupLocalToStorage(); if (globalThis.GuildSyncRecovery) return GuildSyncRecovery.save(baseline, 'blocked-' + Date.now()).catch(function () {}).then(function () { throw problem; }); return Promise.reject(problem); }
    }
    activeWrites++;
    setBadge('本机已保存 · 正在确认云端写入', null);
    var rows = entries.map(function (e) { return { key: e.key, value: e.value, updated_at: Number(e.updatedAt) || Date.now() }; });
    return cloudJson(supaRestUrl(), {
      method: 'POST',
      headers: supaHeaders({ 'Prefer': 'return=representation,resolution=merge-duplicates' }),
      body: JSON.stringify(rows)
    }, '云端写入')
      .then(function () { return supaPull(); })
      .then(function (list) {
        entries.forEach(function (entry) {
          var matches = list.filter(function (item) { return item.key === entry.key; });
          if (matches.length !== 1 || matches[0].value !== entry.value) {
            throw new Error('云端写后校验失败：' + entry.key);
          }
        });
        entries.forEach(function (entry) {
          if (localStorage.getItem(entry.key) === entry.value && localTimeOf(entry.key) <= entry.updatedAt) {
            pending.delete(entry.key); dirty.delete(entry.key);
          } else { pending.add(entry.key); dirty.add(entry.key); }
        });
        persistPending();
        lastConfirmedAt = Date.now();
        return { list: list };
      }).finally(function () { activeWrites--; });
  }
  function supaPush(entries) {
    var snapshot = (entries || []).map(function (entry) {
      return { key: entry.key, value: entry.value, updatedAt: entry.updatedAt };
    });
    var run = function () {
      return supaPull().then(function (remoteList) {
        var remoteByKey = {}, remoteTasks = null;
        var mergedViewChanged = false;
        (remoteList || []).forEach(function (item) {
          remoteByKey[item.key] = item;
          if (item.key === 'fairytail-tasks-v2') remoteTasks = item;
        });
        snapshot.forEach(function (entry) {
          var latestRaw = localStorage.getItem(entry.key);
          if (latestRaw && latestRaw !== entry.value) {
            entry.value = entry.key === 'fairytail-tasks-v2'
              ? JSON.stringify(mergeTaskArrays(parseJsonSafe(latestRaw, []), parseJsonSafe(entry.value, []), true))
              : mergeProtectedValue(entry.key, latestRaw, entry.value, true);
          }
          var remote = remoteByKey[entry.key];
          if (!remote) return;
          var mergedRaw = entry.value;
          if (entry.key === 'fairytail-tasks-v2' && remoteTasks) {
            var localTasks = parseJsonSafe(entry.value, []);
            var cloudTasks = parseJsonSafe(remoteTasks.value, []);
            if (Array.isArray(localTasks) && Array.isArray(cloudTasks)) {
              mergedRaw = JSON.stringify(mergeTaskArrays(localTasks, cloudTasks, true));
            }
          } else {
            mergedRaw = mergeProtectedValue(entry.key, entry.value, remote.value, true);
          }
          entry.value = mergedRaw;
          entry.updatedAt = Math.max(Date.now(), Number(entry.updatedAt) || 0, (Number(remote.updatedAt) || 0) + 1);
          if (mergedRaw !== latestRaw) mergedViewChanged = true;
          nativeStorageSet.call(localStorage, entry.key, mergedRaw);
          markLocalWrite(entry.key, entry.updatedAt);
        });
        if (typeof window.guildReloadStoredState === 'function') window.guildReloadStoredState();
        if (mergedViewChanged) scheduleRemoteRefresh();
        return supaPushNow(snapshot, remoteList);
      });
    };
    supaWriteQueue = supaWriteQueue.then(run, run);
    return supaWriteQueue;
  }
  function supaPull() {
    return cloudJson(supaRestUrl('select=key,value,updated_at&updated_at=gte.0'), {
      headers: supaHeaders(),
      cache: 'no-store'
    }, '云端读取')
      .then(function (rows) {
        var records = (Array.isArray(rows) ? rows : []).map(function (x) { return { key: x.key, value: x.value, updatedAt: Number(x.updated_at) || 0 }; });
        latestCloudRecords = records; lastPullAt = Date.now();
        if (globalThis.GuildSyncRecovery) void GuildSyncRecovery.saveDaily(records).then(function (saved) { recoveryNote = saved ? '本机恢复点已保存（最近3份）' : '云端尚无可保存的历史'; }).catch(function () { recoveryNote = '恢复点保存失败，请导出个人备份'; });
        return records;
      });
  }

  // ---------- 方案 B：轻量时间戳探测（~1KB，替代全量轮询） ----------
  function supaMeta() {
    return cloudJson(supaRestUrl('select=key,updated_at&updated_at=gte.0'), {
      headers: supaHeaders(),
      cache: 'no-store'
    }, '云端元数据')
      .then(function (rows) {
        var meta = {};
        (Array.isArray(rows) ? rows : []).forEach(function (x) {
          meta[x.key] = Number(x.updated_at) || 0;
        });
        return meta;
      });
  }
  // 云端任一参与同步的 key 比本地新（或本地从未写过），就值得全量拉一次
  function metaNeedsPull(remoteMeta) {
    if (!remoteMeta) return false;
    return Object.keys(remoteMeta).some(function (k) {
      if (CONFIG.syncKeys.indexOf(k) === -1) return false;
      var lT = localTimeOf(k);
      var rT = Number(remoteMeta[k]) || 0;
      return lT === 0 || rT > lT;
    });
  }
  // 只共享当前轻量读取；没有更新也会产生一次meta请求，不拉取业务正文。
  var lazyPullFlight = null;
  function pullLazy() {
    if (lazyPullFlight) return lazyPullFlight;
    lazyPullFlight = pullLazyAttempt(0).finally(function () { lazyPullFlight = null; });
    return lazyPullFlight;
  }
  function pullLazyAttempt(retryCount) {
    retryCount = retryCount || 0;
    return supaMeta().then(function (meta) {
      if (metaNeedsPull(meta)) {
        return supaPull().then(function (list) {
          applyRemote(list);
          return list;
        });
      }
      online = true;
      setBadge('云端：已同步', true);
      return [];
    }).catch(function (error) {
      if (retryCount < 1) {
        // 首次失败：3 秒后重试一次，避免手机网络波动误判离线
        return new Promise(function (resolve) { setTimeout(resolve, 3000); })
          .then(function () { return pullLazyAttempt(1); });
      }
      online = false;
      cloudReadFailure(error);
      throw error;
    });
  }

  // ========== 议会·双卷核对（v6.7 多端冲突检测）==========
  function parseJsonSafe(value, fallback) {
    try { return JSON.parse(value); } catch (e) { return fallback; }
  }
  function mergeRecordArrays(localList, remoteList, preferLocal) {
    var map = {}, order = [];
    function add(list, overwrite) {
      (Array.isArray(list) ? list : []).forEach(function (item, index) {
        var key = item && (item.id || item.key || item.taskId) || ('json:' + JSON.stringify(item) + ':' + index);
        if (!Object.prototype.hasOwnProperty.call(map, key)) order.push(key);
        if (overwrite || !Object.prototype.hasOwnProperty.call(map, key)) map[key] = item;
      });
    }
    add(preferLocal ? remoteList : localList, false);
    add(preferLocal ? localList : remoteList, true);
    return order.map(function (key) { return map[key]; });
  }
  function mergeProtectedValue(key, localRaw, remoteRaw, preferLocal) {
    var local = parseJsonSafe(localRaw, null), remote = parseJsonSafe(remoteRaw, null);
    if (key === 'fairytail-guild-daily-journal-v1') return JSON.stringify(GuildJournalCore.merge(local, remote));
    if (key === 'fairytail-reading-library-v1') return GuildReadingCore.stable(GuildReadingCore.merge(local, remote));
    if (!local) return remoteRaw;
    if (!local || !remote || Array.isArray(local) || Array.isArray(remote)) return localRaw;
    var merged = Object.assign({}, preferLocal ? remote : local, preferLocal ? local : remote);
    if (key === 'fairytail-wallet-v1') {
      merged.redemptions = mergeRecordArrays(local.redemptions, remote.redemptions, preferLocal);
      merged.bonus = mergeRecordArrays(local.bonus, remote.bonus, preferLocal);
    } else if (key === 'fairytail-growth-v1') {
      merged.entries = Object.assign({}, preferLocal ? remote.entries : local.entries, preferLocal ? local.entries : remote.entries);
      if (globalThis.GuildWorkspaceCore) merged.guildLedger = GuildWorkspaceCore.mergeLedgerRows(local.guildLedger || [], remote.guildLedger || []);
      var primary = preferLocal ? local : remote, secondary = preferLocal ? remote : local;
      if (primary.v4 && secondary.v4) {
        merged.v4 = JSON.parse(JSON.stringify(primary.v4));
        var ledger = merged.v4.eventLedger || (merged.v4.eventLedger = {});
        var sources = new Set(Object.keys(ledger).map(function (id) { return ledger[id].sourceKey || id; }));
        Object.keys(secondary.v4.eventLedger || {}).forEach(function (id) {
          var entry = secondary.v4.eventLedger[id], source = entry.sourceKey || id;
          if (Object.prototype.hasOwnProperty.call(ledger, id) || sources.has(source)) return;
          ledger[id] = entry; sources.add(source);
          if (entry.reversedAt || entry.active === false) return;
          if (merged.v4.levelTrack) merged.v4.levelTrack.exp = (Number(merged.v4.levelTrack.exp) || 0) + (Number(entry.levelExp) || 0);
          Object.keys(entry.affinities || {}).forEach(function (affinity) {
            if (merged.v4.affinities && merged.v4.affinities[affinity]) merged.v4.affinities[affinity].exp = (Number(merged.v4.affinities[affinity].exp) || 0) + (Number(entry.affinities[affinity]) || 0);
          });
          if (entry.drop && !entry.consumed && merged.v4.inventory && merged.v4.inventory.items) merged.v4.inventory.items[entry.drop] = (Number(merged.v4.inventory.items[entry.drop]) || 0) + 1;
        });
        if (merged.v4.inventory && secondary.v4.inventory) merged.v4.inventory.ledger = mergeRecordArrays(primary.v4.inventory.ledger, secondary.v4.inventory.ledger, preferLocal);
      } else if (!primary.v4 && secondary.v4) merged.v4 = secondary.v4;
    } else if (key === 'fairytail-warehouse-v1') {
      merged.items = mergeRecordArrays(local.items, remote.items, preferLocal);
    } else if (key === 'fairytail-schedule-v1') {
      Object.keys(Object.assign({}, remote, local)).forEach(function (date) {
        var l = local[date], r = remote[date];
        if (!l || !r || typeof l !== 'object' || typeof r !== 'object') return;
        var state = Object.assign({}, preferLocal ? r : l, preferLocal ? l : r);
        state.checked = Object.assign({}, preferLocal ? r.checked : l.checked, preferLocal ? l.checked : r.checked);
        state.rewards = Object.assign({}, preferLocal ? r.rewards : l.rewards, preferLocal ? l.rewards : r.rewards);
        state.extra = mergeRecordArrays(l.extra, r.extra, preferLocal);
        merged[date] = state;
      });
    } else {
      return localRaw;
    }
    return JSON.stringify(merged);
  }
  function guildTaskStats(arr) {
    var list = Array.isArray(arr) ? arr : [];
    var done = 0, ids = {};
    list.forEach(function (t) { if (t && t.id) ids[t.id] = 1; if (t && t.done) done++; });
    return { count: list.length, done: done, ids: ids };
  }
  function detectGuildConflict(remoteList) {
    var localRaw = localStorage.getItem('fairytail-tasks-v2');
    var localArr = parseJsonSafe(localRaw, []);
    var remoteArr = null;
    var remoteT = 0;
    (remoteList || []).forEach(function (r) {
      if (r && r.key === 'fairytail-tasks-v2') {
        remoteArr = parseJsonSafe(r.value, []);
        remoteT = Number(r.updatedAt) || 0;
      }
    });
    if (!Array.isArray(localArr)) localArr = [];
    if (!Array.isArray(remoteArr)) remoteArr = [];
    var ls = guildTaskStats(localArr), rs = guildTaskStats(remoteArr);
    var onlyLocal = localArr.filter(function (t) { return t && t.id && !rs.ids[t.id]; });
    var onlyRemote = remoteArr.filter(function (t) { return t && t.id && !ls.ids[t.id]; });
    var conflicted = localArr.filter(function (t) {
      if (!t || !t.id || !rs.ids[t.id]) return false;
      var r = remoteArr.find(function (x) { return x && x.id === t.id; });
      return r && (r.title !== t.title || r.due !== t.due || (r.dueTime || '') !== (t.dueTime || ''));
    });
    var diff = onlyLocal.length + onlyRemote.length;
    var localT = localTimeOf('fairytail-tasks-v2');
    var timeGap = Math.abs(localT - remoteT) > 30 * 60 * 1000;
    if ((diff >= 3 && onlyLocal.length > 0 && onlyRemote.length > 0) || conflicted.length > 0 || (diff > 0 && timeGap)) {
      return { onlyLocal: onlyLocal, onlyRemote: onlyRemote, conflicted: conflicted, diff: diff, localT: localT, remoteT: remoteT };
    }
    return null;
  }
  function guildFmtTime(ts) {
    if (!ts) return '—';
    try {
      var d = new Date(Number(ts));
      var p = function (n) { return String(n).padStart(2, '0'); };
      return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    } catch (e) { return '—'; }
  }
  function guildCountGrowth(key) {
    var obj = parseJsonSafe(localStorage.getItem(key), {});
    var entries = (obj && obj.entries) || {};
    return Object.keys(entries).length;
  }
  function backupLocalToStorage() {
    var snap = {};
    CONFIG.syncKeys.forEach(function (k) { var v = localStorage.getItem(k); if (v !== null) snap[k] = v; });
    try { localStorage.setItem('guild-backup-' + Date.now(), JSON.stringify(snap)); } catch (e) { console.warn('[guild-cloud] backup save failed', e); }
    // 保留最近 5 个备份 key，删除更旧
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('guild-backup-') === 0) keys.push(k);
    }
    keys.sort();
    while (keys.length > 5) { var old = keys.shift(); try { localStorage.removeItem(old); } catch (e) { console.warn('[guild-cloud] backup cleanup failed', e); } }
  }
  function mergeTaskArrays(localArr, remoteArr, preferLocal) {
    var map = {};
    (localArr || []).forEach(function (t) { if (t && t.id) map[t.id] = { t: t, src: 'l' }; });
    (remoteArr || []).forEach(function (t) {
      if (!t || !t.id) return;
      if (!map[t.id]) map[t.id] = { t: t, src: 'r' };
      else {
        var l = map[t.id].t, r = t;
        var lDone = !!(l.done || l.completedAt), rDone = !!(r.done || r.completedAt);
        // 完成状态保护：已完成的一侧绝不被未完成的一侧覆盖（防止完成记录被旧数据吞掉）
        if (globalThis.GuildWorkspaceCore && GuildWorkspaceCore.explicitUndoWins(l,r)) map[t.id] = {t:l,src:'l'};
        else if (globalThis.GuildWorkspaceCore && GuildWorkspaceCore.explicitUndoWins(r,l)) map[t.id] = {t:r,src:'r'};
        else if (lDone && !rDone) { map[t.id].src = 'l'; }
        else if (rDone && !lDone) { map[t.id] = { t: t, src: 'r' }; }
        else if (!preferLocal) map[t.id] = { t: t, src: 'r' };
      }
    });
    var merged = Object.keys(map).map(function (id) { return map[id].t; });
    var localMap = {}, remoteMap = {};
    (localArr || []).forEach(function (task) { if (task && task.id) localMap[task.id] = task; });
    (remoteArr || []).forEach(function (task) { if (task && task.id) remoteMap[task.id] = task; });
    merged.forEach(function (task, taskIndex) {
      var localTask = localMap[task.id], remoteTask = remoteMap[task.id];
      if (!localTask || !remoteTask) return;
      // 接续独立于整条任务的新旧：旧设备改截止不能吞掉新接续，保留可对照版本。
      var progressVersions = [], progressSeen = new Set();
      [localTask.workProgress, remoteTask.workProgress].concat(localTask.workProgressVersions || [], remoteTask.workProgressVersions || []).forEach(function (record) {
        if (!record || typeof record !== 'object' || Array.isArray(record)) return;
        var identity = JSON.stringify([record.updatedAt || '', record.last || '', record.next || '', record.references || '']);
        if (!progressSeen.has(identity)) { progressSeen.add(identity); progressVersions.push(record); }
      });
      if (progressVersions.length) {
        progressVersions.sort(function (a, b) { return (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) || JSON.stringify(a).localeCompare(JSON.stringify(b)); });
        task = Object.assign({}, task, {workProgress: progressVersions[0]});
        if (progressVersions.length > 1) task.workProgressVersions = progressVersions.slice(1);
        else delete task.workProgressVersions;
        merged[taskIndex] = task;
      }
      if (globalThis.GuildWorkspaceCore) {
        var dossierFields = GuildWorkspaceCore.mergeDossiers(localTask, remoteTask);
        var workflowFields = GuildWorkspaceCore.mergeWorkspaceStates(localTask, remoteTask); task = Object.assign({}, task, workflowFields); merged[taskIndex] = task;
        if (dossierFields.dossier) { task = Object.assign({}, task, dossierFields); merged[taskIndex] = task; }
      }
      var preferredTask = preferLocal ? localTask : remoteTask;
      var otherTask = preferLocal ? remoteTask : localTask;
      var preferredSteps = Array.isArray(preferredTask.steps) ? preferredTask.steps : [];
      var otherSteps = Array.isArray(otherTask.steps) ? otherTask.steps : [];
      if (!preferredSteps.length && !otherSteps.length) return;
      var otherByKey = {};
      otherSteps.forEach(function (step, index) {
        var key = (step && (step.id || step.title)) || ('#' + index);
        otherByKey[key] = step;
      });
      var seen = {};
      var combined = preferredSteps.map(function (step, index) {
        var key = (step && (step.id || step.title)) || ('#' + index);
        seen[key] = true;
        var other = otherByKey[key];
        if (!other) return step;
        if (other.done && !step.done) return other;
        return step;
      });
      otherSteps.forEach(function (step, index) {
        var key = (step && (step.id || step.title)) || ('#' + index);
        if (!seen[key]) combined.push(step);
      });
      // 阶段删除复用成长事件账本；旧端的未完成阶段不能复活，已完成阶段继续保护。
      var growthState = parseJsonSafe(localStorage.getItem('fairytail-growth-v1'), {});
      var deletedStages = {};
      Object.keys((growthState.v4 || {}).eventLedger || {}).forEach(function (id) {
        var record = growthState.v4.eventLedger[id];
        if (record && record.type === 'stage-delete' && !record.reversedAt && record.taskId === task.id) deletedStages[record.stageId] = true;
      });
      task.steps = combined.filter(function (step) { return task.done || step.done || !deletedStages[step.id]; });
    });
    return merged;
  }
  function completedStageCount(tasks) {
    return (tasks || []).reduce(function (total, task) {
      return total + (Array.isArray(task && task.steps) ? task.steps.filter(function (step) { return step && step.done; }).length : 0);
    }, 0);
  }
  function mergeWithRemote(remoteList) {
    var byKey = {};
    (remoteList || []).forEach(function (r) { if (r && r.key) byKey[r.key] = r; });
    var pushed = [];
    CONFIG.syncKeys.forEach(function (k) {
      var localV = localStorage.getItem(k), remote = byKey[k];
      if (!remote || !remote.value) return;
      if (localV === null) {
        localStorage.setItem(k, remote.value);
        markLocalWrite(k, Number(remote.updatedAt) || Date.now());
        return;
      }
      var lT = localTimeOf(k), rT = Number(remote.updatedAt) || 0;
      if (k === 'fairytail-guild-daily-journal-v1' || k === 'fairytail-reading-library-v1') {
        var journalValue = mergeProtectedValue(k, localV, remote.value, true);
        if (journalValue !== localV) localStorage.setItem(k, journalValue);
        if (journalValue !== remote.value) pushed.push({key:k,value:journalValue,updatedAt:Math.max(Date.now(),rT+1)});
        document.dispatchEvent(new CustomEvent(k === 'fairytail-reading-library-v1' ? 'guild-reading-changed' : 'guild-journal-changed'));
        return;
      }
      if (k === 'fairytail-tasks-v2') {
        var localArr = parseJsonSafe(localV, null), remoteArr = parseJsonSafe(remote.value, null);
        if (!Array.isArray(localArr) || !Array.isArray(remoteArr)) {
          if (rT > lT) { localStorage.setItem(k, remote.value); markLocalWrite(k, rT); }
          return;
        }
        var merged = mergeTaskArrays(localArr, remoteArr, lT >= rT);
        localStorage.setItem(k, JSON.stringify(merged));
        markLocalWrite(k, Date.now());
        pushed.push({ key: k, value: localStorage.getItem(k), updatedAt: localTimeOf(k) });
        return;
      }
      if (rT > lT) { localStorage.setItem(k, remote.value); markLocalWrite(k, rT); }
      else { pushed.push({ key: k, value: localV, updatedAt: lT }); }
    });
    // 推送本地有而云端缺失或更新的 key
    CONFIG.syncKeys.forEach(function (k) {
      var localV = localStorage.getItem(k);
      if (localV === null) return;
      var remote = byKey[k];
      if (!remote || Number(remote.updatedAt) < localTimeOf(k)) {
        if (!pushed.some(function (e) { return e.key === k; })) pushed.push({ key: k, value: localV, updatedAt: localTimeOf(k) });
      }
    });
    if (pushed.length) {
      supaPush(pushed).then(function () { online = true; setBadge('云端：已同步', true); })
        .catch(function () { retryEntries(pushed); });
    }
  }
  function showGuildConflictDialog(remoteList, conflict) {
    if (document.getElementById('guildConflictDialog')) return;
    var dlg = document.createElement('dialog');
    dlg.id = 'guildConflictDialog';
    dlg.style.cssText = 'border:1px solid #c9935c;border-radius:16px;background:#fffdf8;color:#392d28;padding:0;max-width:500px;width:min(92vw,500px);max-height:88vh;overflow:auto;box-shadow:0 16px 44px rgba(80,40,20,.22);font-family:"Microsoft YaHei",sans-serif;';
    var wrap = document.createElement('div');
    wrap.style.cssText = 'padding:18px 20px;';
    var h = document.createElement('h3');
    h.style.cssText = 'margin:0 0 6px;color:#9d421b;font-size:18px;';
    h.textContent = '⚖ 议会·双卷核对';
    var sub = document.createElement('p');
    sub.style.cssText = 'margin:0 0 12px;font-size:13px;color:#554138;line-height:1.65;';
    sub.textContent = '云端委托板副本与本地公会档案出现了分歧。请选择保留哪一边，避免记录丢失。';
    var grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:10px;margin:12px 0;';
    var localRaw = localStorage.getItem('fairytail-tasks-v2');
    var localArr = parseJsonSafe(localRaw, []);
    var remoteArr = conflict.onlyRemote.length ? conflict.onlyRemote : [];
    var rs = guildTaskStats(remoteArr);
    var ls = guildTaskStats(localArr);
    var remoteRaw = null;
    (remoteList || []).forEach(function (r) { if (r && r.key === 'fairytail-tasks-v2') remoteRaw = r.value; });
    var remoteFull = parseJsonSafe(remoteRaw, []);
    var remoteStats = guildTaskStats(remoteFull);
    var localStats = guildTaskStats(localArr);
    var localGrowthN = guildCountGrowth('fairytail-growth-v1');
    var remoteGrowthN = 0;
    (remoteList || []).forEach(function (r) { if (r && r.key === 'fairytail-growth-v1') remoteGrowthN = guildCountGrowth('fairytail-growth-v1') || Object.keys(parseJsonSafe(r.value, {}).entries || {}).length; });
    var sides = [
      { name: '卷一 · 本地公会档案', stats: localStats, growth: localGrowthN, t: conflict.localT },
      { name: '卷二 · 云端委托板', stats: remoteStats, growth: remoteGrowthN, t: conflict.remoteT }
    ];
    sides.forEach(function (s) {
      var box = document.createElement('div');
      box.style.cssText = 'border:1px solid #e5cdb5;border-radius:10px;background:#fff;padding:10px 12px;color:#49382f;font-size:13px;line-height:1.7;overflow-wrap:anywhere;';
      var t = document.createElement('strong');
      t.style.cssText = 'display:block;color:#9d421b;font-size:13px;';
      t.textContent = s.name;
      box.appendChild(t);
      var lines = [
        '委托：' + s.stats.count + ' 项 · 已完成 ' + s.stats.done + ' 项',
        '成长履历：' + s.growth + ' 条',
        '最近修改：' + guildFmtTime(s.t)
      ];
      lines.forEach(function (ln) {
        var p = document.createElement('div');
        p.textContent = ln;
        box.appendChild(p);
      });
      grid.appendChild(box);
    });
    var diffList = document.createElement('div');
    diffList.style.cssText = 'margin:10px 0 12px;padding:9px 12px;border:1px solid #d8b68d;border-radius:10px;background:#fff6e6;font-size:13px;line-height:1.7;color:#49382f;overflow-wrap:anywhere;';
    var diffHead = document.createElement('strong');
    diffHead.style.cssText = 'color:#9d421b;display:block;margin-bottom:3px;';
    diffHead.textContent = '差异明细（共 ' + conflict.diff + ' 项）';
    diffList.appendChild(diffHead);
    var items = [];
    conflict.onlyLocal.slice(0, 3).forEach(function (t) { items.push('仅本地：' + t.title); });
    conflict.onlyRemote.slice(0, 3).forEach(function (t) { items.push('仅云端：' + t.title); });
    conflict.conflicted.slice(0, 2).forEach(function (t) { items.push('内容不同：' + t.title); });
    if (!items.length) items.push('主要是修改时间差距较大。');
    var rest = conflict.diff - items.length;
    if (rest > 0) items.push('另有 ' + rest + ' 条差异。');
    items.forEach(function (txt) {
      var d = document.createElement('div');
      d.textContent = txt;
      diffList.appendChild(d);
    });
    var note = document.createElement('p');
    note.style.cssText = 'margin:0 0 12px;font-size:12px;color:#554138;line-height:1.65;';
    note.textContent = '提示：建议优先选择「逐条取新」，两边都保留。选择前不会执行任何覆盖。';
    var actions = document.createElement('div');
    actions.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    function btn(text, style, fn, primary) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.style.cssText = style;
      b.onclick = function () { try { fn(); } catch (e) { console.warn('双卷核对处理失败：', e); } dlg.close(); };
      return b;
    }
    var base = 'border-radius:9px;padding:10px 12px;font-size:13px;cursor:pointer;font-family:inherit;';
    actions.appendChild(btn('以本地为准（云端将同步为本地的记录）',
      base + 'border:1px solid #d2ad88;background:#fff;color:#49382f;',
      function () {
        CONFIG.syncKeys.forEach(function (k) { var v = localStorage.getItem(k); if (v !== null) markLocalWrite(k, Date.now() + 1000); });
        var entries = [];
        CONFIG.syncKeys.forEach(function (k) { var v = localStorage.getItem(k); if (v !== null) entries.push({ key: k, value: v, updatedAt: localTimeOf(k) }); });
        if (entries.length) {
          supaPush(entries).then(function () { online = true; setBadge('云端：已同步', true); })
            .catch(function () { retryEntries(entries, error); });
        }
      }));
    actions.appendChild(btn('以云端为准（本地先备份再覆盖）',
      base + 'border:1px solid #d2ad88;background:#fff;color:#49382f;',
      function () {
        backupLocalToStorage();
        applyRemote(remoteList);
      }));
    actions.appendChild(btn('逐条取新（两边都保留，推荐）',
      base + 'border:1px solid #8d2635;background:#a53243;color:#fff;font-weight:700;',
      function () {
        backupLocalToStorage();
        mergeWithRemote(remoteList);
      }, true));
    wrap.appendChild(h); wrap.appendChild(sub); wrap.appendChild(grid); wrap.appendChild(diffList); wrap.appendChild(note); wrap.appendChild(actions);
    dlg.appendChild(wrap);
    dlg.addEventListener('click', function (ev) {
      var r = dlg.getBoundingClientRect();
      if (ev.target === dlg && (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom)) dlg.close();
    });
    document.body.appendChild(dlg);
    if (typeof dlg.showModal === 'function') dlg.showModal();
  }
  var remoteRefreshTimer = null;
  function scheduleRemoteRefresh() {
    if (remoteRefreshTimer !== null) return;
    var loadWaitStarted = Date.now();
    remoteRefreshTimer = setTimeout(function retryRefresh() {
      if ((localStorage.getItem('guildAutoRefresh') || 'on') === 'off') {
        remoteRefreshTimer = null;
        return;
      }
      if (!window.__guildScheduleReady || typeof all !== 'function') {
        if (Date.now() - loadWaitStarted > 30000) { remoteRefreshTimer = null; setBadge('记录已接收，页面资源尚未就绪，请点击刷新页面', false); return; }
        remoteRefreshTimer = setTimeout(retryRefresh, 1000); return;
      }
      if (document.hidden || inputBusy()) {
        remoteRefreshTimer = setTimeout(retryRefresh, 1000);
        return;
      }
      remoteRefreshTimer = null;
      silentRefresh();
    }, 150);
  }
  function inputBusy() {
    try {
      var el = document.activeElement;
      if (!el) return false;
      var t = el.tagName || '';
      return t === 'INPUT' || t === 'TEXTAREA' || el.isContentEditable;
    } catch (e) { return false; }
  }
  // 后台静默刷新：云端数据已写入 localStorage，直接重绘页面，避免整页 reload 白屏闪烁
  function silentRefresh() {
    if (!window.__guildScheduleReady || typeof all !== 'function') { scheduleRemoteRefresh(); return false; }
    try {
      if (typeof window.guildReloadStoredState === 'function') window.guildReloadStoredState();
      if (typeof all === 'function') {
        all();
        setBadge('云端：已同步', true);
        showNotice('已同步其他设备的新委托');
        return;
      }
    } catch (e) { console.warn('静默刷新失败：', e); }
    setBadge('记录已接收，画面更新未完成，请主动刷新页面', false);
    return false;
  }
  function applyRemote(list) {
    var changed = false, taskChanged = false;
    var origSet = nativeStorageSet;
    (list || []).forEach(function (r) {
      if (!CONFIG.syncKeys.indexOf) return;
      if (CONFIG.syncKeys.indexOf(r.key) === -1) return;
      if (!r.value) return;
      // 离线修改优先留在本机，交由推送阶段合并，不能被较新云时间戳直接覆盖。
      if (pending.has(r.key)) return;
      if (r.key === 'fairytail-guild-daily-journal-v1' || r.key === 'fairytail-reading-library-v1') {
        var journalRaw = localStorage.getItem(r.key), journalMerged = mergeProtectedValue(r.key, journalRaw, r.value, false);
        if (journalMerged !== journalRaw) {
          origSet.call(localStorage, r.key, journalMerged);
          document.dispatchEvent(new CustomEvent(r.key === 'fairytail-reading-library-v1' ? 'guild-reading-changed' : 'guild-journal-changed'));
        }
        // Only merge back genuinely missing revisions; an identical union must not echo forever.
        if (journalMerged !== mergeProtectedValue(r.key, r.value, r.value, false)) {
          markLocalWrite(r.key,Math.max(Date.now(),Number(r.updatedAt)+1));
          pending.add(r.key); dirty.add(r.key); persistPending(); schedulePush();
        } else markLocalWrite(r.key,Number(r.updatedAt)||Date.now());
        return;
      }
      var localT = localTimeOf(r.key);
      if (Number(r.updatedAt) > localT) {
        if (!validRemoteValue(r.key, r.value, localStorage.getItem(r.key))) {
          console.warn('已阻止异常云端数据覆盖：', r.key);
          return;
        }
        // 完成状态保护：云端 tasks 若比本地少了"已完成"记录（完成操作可能因离线未上云），
        // 不允许整包覆盖把本地完成状态吞掉，改为完成保护合并并回推云端。
        if (r.key === 'fairytail-tasks-v2') {
          var pLocalArr = parseJsonSafe(localStorage.getItem('fairytail-tasks-v2'), []);
          var pRemoteArr = parseJsonSafe(r.value, []);
          if (Array.isArray(pLocalArr) && Array.isArray(pRemoteArr)) {
            var pLocalDone = pLocalArr.filter(function (t) { return t && (t.done || t.completedAt); }).length;
            var pRemoteDone = pRemoteArr.filter(function (t) { return t && (t.done || t.completedAt); }).length;
            var pLocalStages = completedStageCount(pLocalArr);
            var pRemoteStages = completedStageCount(pRemoteArr);
            if (pLocalDone > pRemoteDone || pLocalStages > pRemoteStages) {
              if (!changed) backupLocalToStorage();
              var pMerged = mergeTaskArrays(pLocalArr, pRemoteArr, true);
              origSet.call(localStorage, r.key, JSON.stringify(pMerged));
              markLocalWrite(r.key, Date.now());
              changed = true; taskChanged = true;
              var protectedEntry = { key: r.key, value: JSON.stringify(pMerged), updatedAt: Date.now() };
              supaPush([protectedEntry])
                .then(function () { online = true; setBadge('云端：已同步', true); })
                .catch(function (error) { retryEntries([protectedEntry], error); });
              return; // 跳过常规整包覆盖
            }
          }
        }
        if (!changed) backupLocalToStorage();
        var nextValue = r.value;
        if (r.key === 'fairytail-tasks-v2') {
          nextValue = JSON.stringify(mergeTaskArrays(parseJsonSafe(localStorage.getItem(r.key), []), parseJsonSafe(r.value, []), false));
        } else {
          nextValue = mergeProtectedValue(r.key, localStorage.getItem(r.key), r.value, false);
        }
        origSet.call(localStorage, r.key, nextValue);
        markLocalWrite(r.key, Number(r.updatedAt));
        changed = true;
        if (['fairytail-tasks-v2', 'fairytail-schedule-v1', 'fairytail-growth-v1', 'fairytail-wallet-v1', 'fairytail-warehouse-v1'].indexOf(r.key) !== -1) taskChanged = true;
      }
    });
    online = true;
    lastPullAt = Date.now();
    setBadge('云端：已同步', true);
    if (changed) {
      if (typeof window.guildReloadStoredState === 'function') window.guildReloadStoredState();
      var autoRefresh = (localStorage.getItem('guildAutoRefresh') || 'on') !== 'off';
      // 委托及完成/奖励记录变化都排队静默重绘，输入期间暂缓但不丢失请求；
      // 其他数据（场景/天气/档案等）变化只提示，避免每次加载微变导致设备间无限循环刷屏。
      if (taskChanged) {
        if (autoRefresh) {
          scheduleRemoteRefresh();
        } else {
          showNotice('云端有新委托，点击立即同步更新列表');
        }
      } else {
        showNotice('其他数据已接收，点击立即同步更新页面');
      }
    }
  }

  // ---------- hook localStorage ----------
  function installHook() {
    if (hookInstalled) return;
    hookInstalled = true;
    var origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      var unchanged = this === localStorage && this.getItem(String(key)) === String(value);
      origSet.call(this, key, value);
      if (!unchanged && this === localStorage && CONFIG.syncKeys.indexOf(String(key)) !== -1) {
        markLocalWrite(key, Date.now());
        dirty.add(key);
        pending.add(key);
        persistPending();
        setBadge('本机已保存 · 等待云端确认', null);
        schedulePush();
      }
    };
    // 本地时间戳单独记录，避免 setItem 触发推送循环
  }

  var manualSyncFlight = null;
  function manualSync() {
    if (manualSyncFlight) return manualSyncFlight;
    if (!CONFIG.syncEnabled) {
      setBadge('本机已保存 · 当前无法联网同步', false); return Promise.resolve(false);
    }
    var button = document.getElementById('guildSyncNow');
    if (button) { button.disabled = true; button.textContent = '同步中…'; }
    clearTimeout(pushTimer);
    setBadge('本机已保存 · 正在主动同步', null);
    manualSyncFlight = pull().then(function () {
      pending.forEach(function (key) { dirty.add(key); });
      return push();
    }).then(fullPush).then(function () {
      if (!inputBusy()) silentRefresh();
      var confirmed = online && !pending.size && !activeWrites;
      setBadge(confirmed ? '云端：已同步' : '本机已保存 · 云端未确认，请稍后重试', confirmed);
      return confirmed;
    }).catch(function (error) {
      cloudReadFailure(error); return false;
    }).finally(function () {
      manualSyncFlight = null;
      if (button) { button.disabled = false; button.textContent = '立即同步'; }
    });
    return manualSyncFlight;
  }
  window.guildSyncNow = manualSync;
  function snapshotMetrics(values) {
    var reading = parseJsonSafe(values['fairytail-reading-library-v1'], null), rewards = globalThis.GuildReadingCore && GuildReadingCore.valid(reading) ? GuildReadingCore.rewardTotals(reading) : {j:0,exp:0};
    return GuildWorkspaceCore.metrics(values, rewards, typeof window.guildDailyRewardForAudit === 'function' ? window.guildDailyRewardForAudit : null);
  }
  window.guildAuditSync = async function () {
    var rows = await supaPull(), remote = {}, local = {}; rows.forEach(function (r) { remote[r.key] = r.value; }); CONFIG.syncKeys.forEach(function (k) { local[k] = localStorage.getItem(k); });
    var l = snapshotMetrics(local), r = snapshotMetrics(remote); lastAuditAt = Date.now(); latestAudit = {at:lastAuditAt,local:l,remote:r,differences:GuildWorkspaceCore.compare(l,r),contentDifferences:GuildWorkspaceCore.contentDifferences(local,remote),pending:pending.size,activeWrites:activeWrites,risk:syncRisk,recovery:recoveryNote}; return latestAudit;
  };
  function missingRecovery(records) {
    var entries = [], notes = [];
    if (!Array.isArray(records)) throw Error('恢复点格式无效，未作修改');
    var seen = new Set(), currentGrowth = parseJsonSafe(localStorage.getItem('fairytail-growth-v1'), {});
    records.forEach(function (r) { var raw = localStorage.getItem(r.key), old = parseJsonSafe(r.value, null), current = parseJsonSafe(raw, null), value; if (!old) return;
      if (['fairytail-schedule-v1','fairytail-tasks-v2','fairytail-growth-v1','fairytail-wallet-v1'].indexOf(r.key) === -1) return;
      if (seen.has(r.key) || !validRemoteValue(r.key,r.value,raw)) throw Error('恢复点包含重复或无效记录，未作修改'); seen.add(r.key);
      if (r.key === 'fairytail-schedule-v1') { value = GuildWorkspaceCore.recoverSchedule(current,old,currentGrowth); }
      else if (r.key === 'fairytail-tasks-v2') { value = (current || []).slice(); var ids = new Set(value.map(function (t) {return t.id;})); old.filter(function(t){return t.done || t.completedAt;}).forEach(function(t){if(!ids.has(t.id))value.push(t);}); }
      else if (r.key === 'fairytail-growth-v1') { value = Object.assign({}, current || {}); value.entries = Object.assign({}, old.entries || {}, value.entries || {}); }
      else if (r.key === 'fairytail-wallet-v1') { value = Object.assign({}, current || {}); ['redemptions','bonus'].forEach(function(k){value[k]=mergeRecordArrays(value[k],old[k],true);}); }
      else return;
      var next = JSON.stringify(value); if (GuildWorkspaceCore.stable(parseJsonSafe(raw,null)) !== GuildWorkspaceCore.stable(value)) { entries.push({key:r.key,value:next,updatedAt:Date.now()}); notes.push(r.key); }
    }); return {entries:entries,keys:notes};
  }
  window.guildPreviewRecovery = function (records) { var p = missingRecovery(records); return {keys:p.keys,before:snapshotMetrics(Object.fromEntries(CONFIG.syncKeys.map(function(k){return[k,localStorage.getItem(k)];}))),after:snapshotMetrics(Object.assign(Object.fromEntries(CONFIG.syncKeys.map(function(k){return[k,localStorage.getItem(k)];})),Object.fromEntries(p.entries.map(function(e){return[e.key,e.value];}))))}; };
  window.guildRestoreMissingHistory = async function (records) {
    if (!missingRecovery(records).entries.length) return {groups:0};
    var original = CONFIG.syncKeys.map(function(k){return{key:k,value:localStorage.getItem(k),updatedAt:localTimeOf(k)};}).filter(function(r){return r.value!==null;});
    if (!globalThis.GuildSyncRecovery || !await GuildSyncRecovery.save(original)) throw Error('未能保存恢复前记录，已停止恢复');
    // Recompute after the asynchronous snapshot; concurrent local work must win.
    var p = missingRecovery(records), before = p.entries.map(function(e){return{key:e.key,value:localStorage.getItem(e.key)};});
    if (!p.entries.length) return {groups:0};
    var oldMeta = localStorage.getItem(META_KEY), oldPending = localStorage.getItem(PENDING_KEY), nextMeta = readMeta(), nextPending = new Set(pending), stamp = Date.now();
    p.entries.forEach(function(e){nextMeta[e.key]=Math.max(stamp,Number(nextMeta[e.key]||0)+1);nextPending.add(e.key);});
    try {
      p.entries.forEach(function(e){nativeStorageSet.call(localStorage,e.key,e.value);});
      nativeStorageSet.call(localStorage,META_KEY,JSON.stringify(nextMeta));
      nativeStorageSet.call(localStorage,PENDING_KEY,JSON.stringify(Array.from(nextPending)));
    } catch(error) {
      var rollbackFailed=false;
      before.concat([{key:META_KEY,value:oldMeta},{key:PENDING_KEY,value:oldPending}]).forEach(function(e){try{if(e.value===null)nativeStorageRemove.call(localStorage,e.key);else nativeStorageSet.call(localStorage,e.key,e.value);}catch(rollbackError){rollbackFailed=true;}});
      throw Error(rollbackFailed?'恢复未完成，部分回滚失败；请保留页面并使用恢复前快照核对。':'恢复未完成，已撤回本次修改；未新增云端上传。');
    }
    p.entries.forEach(function(e){dirty.add(e.key);pending.add(e.key);});schedulePush();
    var refreshed=true;try{if(typeof window.guildReloadStoredState==='function')window.guildReloadStoredState();scheduleRemoteRefresh();}catch(error){refreshed=false;}
    return {groups:p.entries.length,refreshed:refreshed};
  };
  // ---------- 全量推送（首次上云/启动兜底） ----------
  function fullPush() {
    // 全量推送走 supaWriteQueue 串行化，避免与增量 supaPush 并发交错
    var run = function () {
    var entries = [];
    CONFIG.syncKeys.forEach(function (k) {
      var v = localStorage.getItem(k);
      if (v !== null) { entries.push({ key: k, value: v, updatedAt: localTimeOf(k) || Date.now() }); }
    });
    if (!entries.length) return Promise.resolve();
    var headers = { 'Content-Type': 'application/json' };

    if (CONFIG.mode === 'supabase' && CONFIG.supabaseAnonKey) {
      // 智能：先拉云端，只推送云端缺失或本地更新的 key，避免无谓抬时间戳。
      // 2026-09-30 修复：委托数据（tasks-v2）强制按"本地为准 + 合并云端"推送——
      // 旧代码时代本地时间戳停滞导致云端始终收不到本地完成记录，两端数据长期不一致。
      return supaPull().then(function (remoteList) {
        var remoteMap = {};
        var remoteTasks = null;
        (remoteList || []).forEach(function (r) {
          remoteMap[r.key] = r;
          if (r.key === 'fairytail-tasks-v2') remoteTasks = r.value;
        });
        var need = [], mergedViewChanged = false;
        entries.forEach(function (entry) {
          // 拉云端期间可能已登记/完成新任务，不能用请求前的旧快照覆盖。
          var currentRaw = localStorage.getItem(entry.key);
          if (currentRaw === null) return;
          entry.value = currentRaw;
          entry.updatedAt = localTimeOf(entry.key) || entry.updatedAt;
          var remote = remoteMap[entry.key];
          if (entry.key !== 'fairytail-tasks-v2') {
            // 启动恢复也必须合并日程和奖励历史；新设备的较新空表不能覆盖旧档。
            if (remote && ['fairytail-schedule-v1','fairytail-wallet-v1','fairytail-growth-v1','fairytail-warehouse-v1'].indexOf(entry.key) !== -1) {
              var combined = mergeProtectedValue(entry.key, entry.value, remote.value, pending.has(entry.key) || entry.updatedAt >= Number(remote.updatedAt));
              if (combined !== entry.value) {
                nativeStorageSet.call(localStorage, entry.key, combined);
                mergedViewChanged = true;
              }
              entry.value = combined;
              if (combined !== remote.value) {
                entry.updatedAt = Math.max(Date.now(), entry.updatedAt, Number(remote.updatedAt) + 1);
                markLocalWrite(entry.key, entry.updatedAt);
                need.push(entry);
              } else {
                markLocalWrite(entry.key, Number(remote.updatedAt));
                if (localStorage.getItem(entry.key) === combined) { pending.delete(entry.key); dirty.delete(entry.key); }
              }
              return;
            }
            if (!remote || Number(remote.updatedAt) < entry.updatedAt) need.push(entry);
            return;
          }
          var pLocal = parseJsonSafe(entry.value, []);
          var pRemote = parseJsonSafe(remoteTasks, []);
          var rT = remote ? Number(remote.updatedAt) || 0 : 0;
          var pMerged = mergeTaskArrays(pLocal, pRemote, pending.has(entry.key) || entry.updatedAt >= rT);
          var mergedRaw = JSON.stringify(pMerged);
          if (mergedRaw !== entry.value) {
            nativeStorageSet.call(localStorage, entry.key, mergedRaw);
            mergedViewChanged = true;
          }
          if (!remote || mergedRaw !== remote.value) {
            var nextTime = Math.max(Date.now(), entry.updatedAt || 0, rT + 1);
            markLocalWrite(entry.key, nextTime);
            need.push({ key: entry.key, value: mergedRaw, updatedAt: nextTime });
          } else if (rT > entry.updatedAt) {
            markLocalWrite(entry.key, rT);
          }
        });
        // 新安装入口可能先存了初始任务；合并后的历史必须立即进入业务内存和画面。
        if (mergedViewChanged) {
          if (typeof window.guildReloadStoredState === 'function') window.guildReloadStoredState();
          scheduleRemoteRefresh();
        }
        persistPending();
        if (!need.length) { online = true; setBadge('云端：已同步', true); return; }
        // 已在串行队列内部，不能再次排队并等待自己后面的任务。
        return supaPushNow(need, remoteList)
          .then(function () { online = true; setBadge('云端：已同步', true); })
          .catch(function (error) { retryEntries(need, error); });
      }).catch(function (error) {
        // 无法读取云端时不能盲目全量推送，否则旧设备可能覆盖较新的云端档案。
        online = false;
        cloudReadFailure(error);
      });
    }

    return Promise.resolve();
    };
    // 每个网络请求由 cloudJson 限时；串行队列在成功和失败后均可继续。
    supaWriteQueue = supaWriteQueue.then(run, run);
    return supaWriteQueue;
  }

  // ---------- 启动 ----------
  function start() {
    ensureBadge();
    // 屏蔽开关：纯本地模式，不安装 hook、不轮询、不监听，零云端请求（功能代码保留可恢复）。
    if (!CONFIG.syncEnabled) {
      window.__guildCloudOfflineMode = true;
      setBadge('本地模式 · 在线同步已停用', true);
      return;
    }
    installHook();
    // 另一标签页的真实操作先重载共享存档，避免本页内存仍停留在旧状态。
    window.addEventListener('storage', function (event) {
      if (event.storageArea !== localStorage || CONFIG.syncKeys.indexOf(event.key) === -1) return;
      if (typeof window.guildReloadStoredState === 'function') window.guildReloadStoredState();
      scheduleRemoteRefresh();
    });
    window.addEventListener('pageshow', function (event) {
      if (!event.persisted || navigator.onLine === false) return;
      if (dirty.size) schedulePush();
      pullLazy().catch(function (e) { console.warn('[guild-cloud] resume pull failed', e); });
    });
    // 打开页面：立即全量拉一次，再补传确实较新的本地 key。
    // 读取失败时保持纯本地模式，绝不把旧设备整包覆盖到云端。
    setTimeout(function () {
      pull().then(fullPush).catch(function (e) { console.warn('[guild-cloud] startup sync failed', e); })
        .finally(function () { if (dirty.size) schedulePush(); });
    }, 300);
    // 前台10秒轻量检查，仅页面可见时执行，且先走meta探测，
    // 云端确有更新才全量拉取；不可见时完全停止轮询。
    setInterval(function () {
      if (document.hidden || navigator.onLine === false) return;
      pullLazy().catch(function (e) { console.warn('[guild-cloud] polling pull failed', e); });
    }, PULL_INTERVAL);
    window.addEventListener('online', function () {
      if (dirty.size) schedulePush();
      if (!document.hidden) pullLazy().catch(function (e) { console.warn('[guild-cloud] reconnect pull failed', e); });
    });
    window.addEventListener('focus', function () {
      if (!document.hidden && navigator.onLine !== false) {
        pullLazy().catch(function (e) { console.warn('[guild-cloud] focus pull failed', e); });
      }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        // 切后台/离开页面前：立即把本地待同步数据推送出去，避免最后一步操作滞留本机
        if (dirty.size) push();
      } else {
        // 回到前台：立即拉一次最新数据（meta 探测，有更新才全量）
        pullLazy().catch(function (e) { console.warn('[guild-cloud] visibility pull failed', e); });
      }
    });
    window.addEventListener('beforeunload', function () {
      if (dirty.size) push();
    });
  }

  start();
})();
