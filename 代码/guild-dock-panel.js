/* 代码/guild-dock-panel.js — 公会悬浮面板（日历 + 该日截止委托 + 云端状态 + 快捷入口）
 * 由右下角公会徽章按钮（guildCloudBadge）触发，配合 代码/guild-cloud-sync.js 使用。
 * 单一状态源：面板内状态行由 代码/guild-cloud-sync.js 的 setBadge 同步更新。
 */
(function () {
  'use strict';
  var STORE_KEY = 'fairytail-tasks-v2';
  var PANEL_ID = 'guildDockPanel';
  var FLOATER_ID = 'guildCloudBadge';

  var view = { year: 0, month: 0, selected: '' }; // month 0-11
  var panel = null;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function keyOf(y, m, d) { return y + '-' + pad2(m + 1) + '-' + pad2(d); }

  function loadTasks() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function doneOf(t) { return !!(t && t.done); }
  function gradeOf(t) { return (t && t.grade) || '-'; }
  function dueDateOf(t) {
    if (!t) return '';
    if (t.due) return String(t.due).slice(0, 10);
    if (t.dueTime) return String(t.dueTime).slice(0, 10);
    return '';
  }
  function statusText(t) {
    if (!t) return '';
    if (doneOf(t)) return '已完成';
    if (t.startedAt || t.status === 'in_progress') return '远征进行中';
    if (t.acceptedAt) return '已接取 · 待启程';
    return '待接取';
  }
  function dueText(t) {
    return (t && t.dueTime) ? t.dueTime : '当日结束前';
  }
  var GRADE_ORDER = { S: 0, A: 1, B: 2, C: 3, D: 4, E: 5, F: 6 };

  // ---------- 任务截止统计：date -> {count, overdue} ----------
  function collectByDate(tasks) {
    var map = {};
    var today = todayKey();
    tasks.forEach(function (t) {
      if (!t || t.status === 'cancelled') return;
      var d = dueDateOf(t);
      if (!d) return;
      if (!map[d]) map[d] = { count: 0, overdue: 0 };
      map[d].count++;
      if (!doneOf(t) && d < today) map[d].overdue++;
      // 多阶段任务的未完成阶段截止日
      var steps = t.steps || [];
      steps.forEach(function (s) {
        if (!s || s.done || !s.due) return;
        var sd = String(s.due).slice(0, 10);
        if (!sd) return;
        if (!map[sd]) map[sd] = { count: 0, overdue: 0 };
        map[sd].count++;
        if (sd < today) map[sd].overdue++;
      });
    });
    return map;
  }

  // ---------- 该日截止任务列表 ----------
  function tasksDueOn(tasks, dateKey) {
    var out = [];
    tasks.forEach(function (t) {
      if (!t || t.status === 'cancelled') return;
      if (dueDateOf(t) === dateKey) out.push({ kind: 'quest', t: t });
      var steps = t.steps || [];
      steps.forEach(function (s, i) {
        if (!s || s.done || !s.due) return;
        if (String(s.due).slice(0, 10) === dateKey) out.push({ kind: 'stage', t: t, step: s, index: i });
      });
    });
    var today = todayKey();
    out.sort(function (a, b) {
      var ad = doneOf(a.t) ? 1 : 0, bd = doneOf(b.t) ? 1 : 0;
      if (ad !== bd) return ad - bd;
      if (a.kind !== b.kind) return a.kind === 'quest' ? -1 : 1;
      var ag = GRADE_ORDER[gradeOf(a.t)] != null ? GRADE_ORDER[gradeOf(a.t)] : 9;
      var bg = GRADE_ORDER[gradeOf(b.t)] != null ? GRADE_ORDER[gradeOf(b.t)] : 9;
      if (ag !== bg) return ag - bg;
      var ao = (!doneOf(a.t) && a.t.due && String(a.t.due) < today) ? 1 : 0;
      var bo = (!doneOf(b.t) && b.t.due && String(b.t.due) < today) ? 1 : 0;
      if (ao !== bo) return bo - ao;
      return 0;
    });
    return out;
  }

  // ---------- 面板 DOM ----------
  function ensureStyles() {
    if (document.getElementById('guildDockStyles')) return;
    var style = document.createElement('style');
    style.id = 'guildDockStyles';
    style.textContent =
      '#guildDockPanel{position:fixed;right:14px;bottom:76px;z-index:99998;width:min(340px,92vw);max-height:min(76vh,680px);display:flex;flex-direction:column;background:#fff8e9;border:2px solid #bfa27a;border-radius:6px;box-shadow:0 8px 26px #55301e33;overflow:hidden;font-family:"Microsoft YaHei UI","PingFang SC",system-ui,sans-serif;color:#5d3b2b}' +
      '#guildDockPanel[hidden]{display:none}' +
      '.guild-dock-head{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#654632;border-bottom:1px solid #b3986e}' +
      '.guild-dock-head strong{font-size:14px;color:#fff3dd;white-space:nowrap}' +
      '.guild-dock-status{flex:1;min-width:0;text-align:right;font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:3px 8px;border-radius:999px;background:#f4ead9;color:#8a5a22}' +
      '.guild-dock-status.ok{background:#e8f6e4;color:#2f6b2f}' +
      '.guild-dock-status.fail{background:#ffe3e0;color:#a33}' +
      '.guild-dock-close{min-width:26px;height:26px;padding:0;border:1px solid #e0bf96;border-radius:50%;background:#fffaf2;color:#8a5a22;font-size:15px;line-height:1;cursor:pointer}' +
      '.guild-dock-close:hover{background:#f7e3c4}' +
      '.guild-dock-body{overflow-y:auto;padding:10px 12px 4px}' +
      '.guild-dock-cal-head{display:flex;align-items:center;gap:6px;margin-bottom:8px}' +
      '.guild-dock-cal-head .cal-title{flex:1;text-align:center;font-size:13px;font-weight:700;color:#6d4324}' +
      '.guild-dock-cal-head button{min-height:26px;padding:2px 9px;border:1px solid #e0bf96;border-radius:8px;background:#fffaf2;color:#7a4a26;font-size:12px;cursor:pointer}' +
      '.guild-dock-cal-head button:hover{background:#f7e3c4}' +
      '.guild-dock-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:6px}' +
      '.guild-dock-cal .wk{text-align:center;font-size:10px;color:#a07a58;padding:2px 0}' +
      '.guild-dock-cal .day{position:relative;min-height:30px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#5d3b2b;background:#fdf8ef;border:1px solid transparent;border-radius:8px;cursor:pointer;padding:2px 0}' +
      '.guild-dock-cal .day:hover{background:#f7e3c4}' +
      '.guild-dock-cal .day.out{color:#c9b298;background:transparent}' +
      '.guild-dock-cal .day.today{border-color:#e7a362;font-weight:700;color:#9d421b}' +
      '.guild-dock-cal .day.sel{background:#f0c98a;color:#6d3a12;font-weight:700}' +
      '.guild-dock-cal .day .dot{position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:5px;height:5px;border-radius:50%;background:#c9a06a}' +
      '.guild-dock-cal .day .dot.overdue{background:#d9603b}' +
      '.guild-dock-cal .day.sel .dot{background:#fff}' +
      '.guild-dock-tasks-title{font-size:12px;font-weight:700;color:#6d4324;margin:4px 0 6px;display:flex;align-items:baseline;gap:6px}' +
      '.guild-dock-tasks-title small{font-weight:400;color:#a07a58}' +
      '.guild-dock-tasks{display:flex;flex-direction:column;gap:5px;max-height:34vh;overflow-y:auto;padding-right:2px}' +
      '.guild-dock-task{display:grid;grid-template-columns:26px minmax(0,1fr) auto;gap:6px;align-items:start;padding:6px 8px;border:1px solid #eed9bc;border-radius:10px;background:#fdf8ef}' +
      '.guild-dock-task.stage{background:#f7f0e3;border-color:#e3d2b4}' +
      '.guild-dock-task.done{opacity:.62}' +
      '.guild-dock-task .gd-grade{font-size:11px;font-weight:700;text-align:center;padding-top:1px}' +
      '.guild-dock-task .gd-title{font-size:12px;line-height:1.4;min-width:0;overflow-wrap:anywhere}' +
      '.guild-dock-task .gd-meta{font-size:10px;color:#a07a58;margin-top:2px}' +
      '.guild-dock-task .gd-side{font-size:10px;text-align:right;color:#8a6a4a;white-space:nowrap}' +
      '.guild-dock-task.stage .gd-side{color:#b0854e}' +
      '.guild-dock-empty{font-size:12px;color:#b29678;text-align:center;padding:12px 0}' +
      '.guild-dock-actions{display:flex;gap:6px;padding:8px 12px 10px;border-top:1px solid #eed9bc}' +
      '.guild-dock-actions button{flex:1;min-height:30px;padding:4px 6px;border:1px solid #e0bf96;border-radius:9px;background:#fffaf2;color:#7a4a26;font-size:11px;cursor:pointer;white-space:nowrap}' +
      '.guild-dock-actions button:hover{background:#f7e3c4}' +
      '.guild-dock-actions button.primary{background:#f0c98a;border-color:#e0a95e;color:#6d3a12;font-weight:700}' +
      '@media(max-width:650px){#guildDockPanel{right:8px;bottom:70px;width:min(340px,94vw)}.guild-dock-task{grid-template-columns:24px minmax(0,1fr) auto}.guild-dock-status{max-width:150px}}';
    document.head.appendChild(style);
  }

  function gradeColor(g) {
    var map = { S: '#9f2f1e', A: '#b85f20', B: '#277ca5', C: '#78618d', D: '#438e7d', E: '#927454', F: '#95857b' };
    return map[g] || '#8a6a4a';
  }

  function buildPanel() {
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.hidden = true;
    panel.innerHTML =
      '<div class="guild-dock-head">' +
      '<strong>公会面板</strong>' +
      '<span id="guildDockStatus" class="guild-dock-status">云端：连接中…</span>' +
      '<button type="button" id="guildDockClose" class="guild-dock-close" aria-label="关闭公会面板">×</button>' +
      '</div>' +
      '<div class="guild-dock-body">' +
      '<div class="guild-dock-cal-head">' +
      '<button type="button" id="dockPrevMonth" aria-label="上个月">◀</button>' +
      '<span id="dockCalTitle" class="cal-title"></span>' +
      '<button type="button" id="dockNextMonth" aria-label="下个月">▶</button>' +
      '<button type="button" id="dockTodayBtn">今天</button>' +
      '</div>' +
      '<div id="dockCalGrid" class="guild-dock-cal"></div>' +
      '<div id="dockTasksTitle" class="guild-dock-tasks-title"></div>' +
      '<div id="dockTaskList" class="guild-dock-tasks"></div>' +
      '</div>' +
      '<div class="guild-dock-actions">' +
      '<button type="button" data-go="today" class="primary">回到今天</button>' +
      '<button type="button" data-go="form">登记新委托</button>' +
      '<button type="button" data-go="refresh">立即刷新</button>' +
      '</div>';
    document.body.appendChild(panel);
    document.getElementById('guildDockClose').onclick = hide;
    document.getElementById('dockPrevMonth').onclick = function () { shiftMonth(-1); };
    document.getElementById('dockNextMonth').onclick = function () { shiftMonth(1); };
    document.getElementById('dockTodayBtn').onclick = goToday;
    panel.querySelectorAll('.guild-dock-actions button').forEach(function (b) {
      b.onclick = function () {
        var go = b.getAttribute('data-go');
        if (go === 'today') { goToday(); }
        else if (go === 'form') { hide(); scrollToEl('#form'); }
        else if (go === 'refresh') { location.reload(); }
      };
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !panel.hidden) hide();
    });
    syncStatusFromGlobal();
  }

  function scrollToEl(sel) {
    var el = document.querySelector(sel);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('quest-located');
      setTimeout(function () { el.classList.remove('quest-located'); }, 1600);
    }
  }

  // ---------- 状态行 ----------
  function renderStatus(text, ok) {
    var el = document.getElementById('guildDockStatus');
    if (!el) return;
    el.textContent = text;
    el.className = 'guild-dock-status ' + (ok === true ? 'ok' : ok === false ? 'fail' : 'syncing');
  }
  function syncStatusFromGlobal() {
    if (window.__guildCloudState) renderStatus(window.__guildCloudState.text, window.__guildCloudState.ok);
  }

  // ---------- 日历 ----------
  function initView() {
    var now = new Date();
    view.year = now.getFullYear();
    view.month = now.getMonth();
    view.selected = todayKey();
  }
  function shiftMonth(delta) {
    view.month += delta;
    if (view.month < 0) { view.month = 11; view.year--; }
    if (view.month > 11) { view.month = 0; view.year++; }
    renderCalendar();
  }
  function goToday() {
    initView();
    renderCalendar();
  }

  function renderCalendar() {
    var title = document.getElementById('dockCalTitle');
    var grid = document.getElementById('dockCalGrid');
    if (!title || !grid) return;
    title.textContent = view.year + '年' + (view.month + 1) + '月';
    var tasks = loadTasks();
    var map = collectByDate(tasks);
    var today = todayKey();
    var first = new Date(view.year, view.month, 1);
    var lead = first.getDay(); // 0=周日
    var daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
    var html = '<span class="wk">日</span><span class="wk">一</span><span class="wk">二</span><span class="wk">三</span><span class="wk">四</span><span class="wk">五</span><span class="wk">六</span>';
    // 上月补白
    for (var i = 0; i < lead; i++) html += '<span class="day out"></span>';
    for (var d = 1; d <= daysInMonth; d++) {
      var k = keyOf(view.year, view.month, d);
      var info = map[k];
      var cls = 'day';
      if (k === today) cls += ' today';
      if (k === view.selected) cls += ' sel';
      var dot = info && info.count > 0 ? '<span class="dot' + (info.overdue > 0 ? ' overdue' : '') + '"></span>' : '';
      html += '<span class="' + cls + '" data-date="' + k + '">' + d + dot + '</span>';
    }
    grid.innerHTML = html;
    grid.querySelectorAll('.day[data-date]').forEach(function (cell) {
      cell.onclick = function () {
        view.selected = cell.getAttribute('data-date');
        renderCalendar();
        renderTaskList();
      };
    });
    renderTaskList();
  }

  // ---------- 该日截止任务 ----------
  function renderTaskList() {
    var title = document.getElementById('dockTasksTitle');
    var list = document.getElementById('dockTaskList');
    if (!title || !list) return;
    var tasks = loadTasks();
    var today = todayKey();
    var entries = tasksDueOn(tasks, view.selected);
    title.innerHTML = '';
    var tt = document.createElement('span');
    tt.textContent = view.selected === today ? '今天截止的委托' : view.selected + ' 截止的委托';
    title.appendChild(tt);
    var count = document.createElement('small');
    count.textContent = entries.length ? '共 ' + entries.length + ' 项' : '';
    title.appendChild(count);
    if (!entries.length) {
      list.innerHTML = '<p class="guild-dock-empty">这一天没有截止的委托</p>';
      return;
    }
    list.innerHTML = '';
    entries.forEach(function (e) {
      var row = document.createElement('div');
      var cls = 'guild-dock-task' + (e.kind === 'stage' ? ' stage' : '') + (doneOf(e.t) ? ' done' : '');
      row.className = cls;
      var g = document.createElement('span');
      g.className = 'gd-grade';
      g.textContent = gradeOf(e.t);
      g.style.color = gradeColor(gradeOf(e.t));
      var mid = document.createElement('span');
      mid.className = 'gd-title';
      if (e.kind === 'stage') {
        mid.textContent = '阶段' + (e.index + 1) + ' · ' + (e.t.title || '远征');
        var meta = document.createElement('div');
        meta.className = 'gd-meta';
        meta.textContent = e.step.title || '';
        mid.appendChild(meta);
      } else {
        mid.textContent = e.t.title;
        var meta2 = document.createElement('div');
        meta2.className = 'gd-meta';
        meta2.textContent = (e.t.category || '') + (e.t.dueTime ? ' · ' + e.t.dueTime : ' · 当日结束前');
        mid.appendChild(meta2);
      }
      var side = document.createElement('span');
      side.className = 'gd-side';
      side.textContent = statusText(e.t);
      row.append(g, mid, side);
      list.appendChild(row);
    });
  }

  // ---------- 开关 ----------
  function show() {
    if (!panel) return;
    panel.hidden = false;
    renderCalendar();
    syncStatusFromGlobal();
  }
  function hide() {
    if (panel) panel.hidden = true;
  }
  function toggle() {
    if (!panel) buildPanel();
    if (panel.hidden) show(); else hide();
  }

  // ---------- 挂载 ----------
  function init() {
    ensureStyles();
    initView();
    buildPanel();
    document.addEventListener('guildDockToggle', toggle);
    // 状态行跟随云端状态（代码/guild-cloud-sync.js 的 setBadge 也会主动更新）
    window.addEventListener('guildCloudStateChange', function () { syncStatusFromGlobal(); });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
