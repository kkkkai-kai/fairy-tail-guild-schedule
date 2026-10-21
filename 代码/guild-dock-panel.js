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
  function beijingDateParts(date) {
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date || new Date());
    return {
      year: Number(parts.find(function (part) { return part.type === 'year'; }).value),
      month: Number(parts.find(function (part) { return part.type === 'month'; }).value),
      day: Number(parts.find(function (part) { return part.type === 'day'; }).value)
    };
  }
  function todayKey() {
    var d = beijingDateParts();
    return d.year + '-' + pad2(d.month) + '-' + pad2(d.day);
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
  function dateKeyOf(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(String(value || ''));
    if (!match) return '';
    var stamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    var d = new Date(stamp);
    if (d.getUTCFullYear() !== Number(match[1]) || d.getUTCMonth() + 1 !== Number(match[2]) || d.getUTCDate() !== Number(match[3])) return '';
    return match[1] + '-' + match[2] + '-' + match[3];
  }
  function dueDateOf(t) {
    if (!t) return '';
    return dateKeyOf(t.due) || dateKeyOf(t.dueTime);
  }
  function statusText(t, entry) {
    if (!t) return '';
    if (doneOf(t)) return '已完成';
    if (entry && entry.kind === 'stage') return t.startedAt || t.status === 'in_progress' ? '远征阶段进行中' : t.acceptedAt ? '远征待启程' : '远征待接取';
    if (t.startedAt || t.status === 'in_progress') return t.type === 'project' ? '远征进行中' : '委托进行中';
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
      if (d) {
        if (!map[d]) map[d] = { count: 0, overdue: 0 };
        map[d].count++;
        if (!doneOf(t) && d < today) map[d].overdue++;
      }
      // 多阶段任务的未完成阶段截止日
      var steps = t.steps || [];
      steps.forEach(function (s) {
        if (!s || s.done) return;
        var sd = dateKeyOf(s.due) || dateKeyOf(s.dueTime);
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
        if (!s || s.done) return;
        if ((dateKeyOf(s.due) || dateKeyOf(s.dueTime)) === dateKey) out.push({ kind: 'stage', t: t, step: s, index: i });
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
      var adue = a.kind === 'stage' ? (dateKeyOf(a.step.due) || dateKeyOf(a.step.dueTime)) : dueDateOf(a.t);
      var bdue = b.kind === 'stage' ? (dateKeyOf(b.step.due) || dateKeyOf(b.step.dueTime)) : dueDateOf(b.t);
      var ao = (!doneOf(a.t) && adue && adue < today) ? 1 : 0;
      var bo = (!doneOf(b.t) && bdue && bdue < today) ? 1 : 0;
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
      '#guildDockPanel{position:fixed;right:5vw;top:18vh;bottom:auto;z-index:99998;width:min(380px,92vw);max-height:min(76vh,680px);display:flex;flex-direction:column;background:#fffdf8;border:1px solid #dfc8aa;border-radius:14px;box-shadow:0 10px 28px #38211620;overflow:hidden;font-family:"Microsoft YaHei UI","PingFang SC",system-ui,sans-serif;color:#382b26}' +
      '#guildDockPanel[hidden]{display:none}' +
      '.guild-dock-head{display:flex;align-items:center;gap:8px;padding:10px 12px;background:linear-gradient(180deg,#fff7e9,#fff1dc);border-bottom:1px solid #ead8bd}' +
      '.guild-dock-head strong{display:flex;align-items:center;gap:7px;font-size:15px;color:#81283b;white-space:nowrap}' +
      '.guild-dock-head strong::before{content:"";display:inline-block;width:19px;height:19px;background:url(素材/界面/功能图标/guild-ui-ledger-v210.svg) center/contain no-repeat}' +
      '.guild-dock-status{flex:1;min-width:0;text-align:right;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:4px 8px;border-radius:999px;background:#fffdf8;color:#574337}' +
      '.guild-dock-status.ok{background:#edf6e9;color:#35663d}' +
      '.guild-dock-status.fail{background:#fff0f2;color:#882638}' +
      '.guild-dock-close{min-width:30px;height:30px;padding:0;border:1px solid #d8bda0;border-radius:50%;background:#fffdf8;color:#744137;font-size:17px;line-height:1;cursor:pointer}' +
      '.guild-dock-close:hover{background:#fff4e4;border-color:#ad7859}' +
      '.guild-dock-body{overflow-y:auto;padding:10px 12px 4px}' +
      '.guild-dock-cal-head{display:flex;align-items:center;gap:6px;margin-bottom:8px}' +
      '.guild-dock-cal-head .cal-title{flex:1;text-align:center;font-size:14px;font-weight:700;color:#81283b}' +
      '.guild-dock-cal-head button{min-height:32px;padding:3px 9px;border:1px solid #d8bda0;border-radius:8px;background:#fffdf8;color:#574337;font-size:13px;cursor:pointer}' +
      '.guild-dock-cal-head button:hover{background:#fff4e4;border-color:#ad7859}' +
      '.guild-dock-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:6px}' +
      '.guild-dock-cal .wk{text-align:center;font-size:11px;color:#655044;padding:3px 0}' +
      '.guild-dock-cal .day{position:relative;min-height:32px;display:flex;align-items:center;justify-content:center;font-size:13px;color:#49382e;background:#fffaf2;border:1px solid transparent;border-radius:8px;cursor:pointer;padding:2px 0}' +
      '.guild-dock-cal .day:hover{background:#fff1dc;border-color:#ead8bd}' +
      '.guild-dock-cal .day.out{color:#9a8170;background:transparent}' +
      '.guild-dock-cal .day.today{border-color:#d48b48;font-weight:700;color:#81283b;background:#fff5e5}' +
      '.guild-dock-cal .day.sel{background:#9e3145;color:#fffdf8;font-weight:700}' +
      '.guild-dock-cal .day .dot{position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:5px;height:5px;border-radius:50%;background:#bd8b45}' +
      '.guild-dock-cal .day .dot.overdue{background:#d9603b}' +
      '.guild-dock-cal .day.sel .dot{background:#fff}' +
      '.guild-dock-tasks-title{font-size:14px;font-weight:700;color:#81283b;margin:6px 0;display:flex;align-items:baseline;gap:6px}' +
      '.guild-dock-tasks-title small{font-size:12px;font-weight:500;color:#655044}' +
      '.guild-dock-tasks{display:flex;flex-direction:column;gap:5px;max-height:34vh;overflow-y:auto;padding-right:2px}' +
      '.guild-dock-task{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:7px;align-items:start;padding:8px;border:1px solid #ead8bd;border-radius:9px;background:#fffefa}' +
      '.guild-dock-task.stage{background:#fff5e5;border-color:#ddc39f}' +
      '.guild-dock-task.done{opacity:.82}' +
      '.guild-dock-task .gd-grade{font-size:12px;font-weight:700;text-align:center;padding-top:1px}' +
      '.guild-dock-task .gd-title{font-size:14px;line-height:1.5;min-width:0;overflow-wrap:anywhere;color:#382b26}' +
      '.guild-dock-task .gd-meta{font-size:12px;color:#655044;margin-top:3px;line-height:1.45}' +
      '.guild-dock-task .gd-side{font-size:12px;text-align:right;color:#574337;white-space:nowrap}' +
      '.guild-dock-task.stage .gd-side{color:#805725}' +
      '.guild-dock-empty{font-size:13px;color:#655044;text-align:center;padding:14px 0}' +
      '.guild-dock-actions{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px 10px;border-top:1px solid #ead8bd}' +
      '.guild-dock-actions button{flex:1 1 92px;min-height:36px;padding:5px 8px;border:1px solid #d8bda0;border-radius:8px;background:#fffdf8;color:#574337;font-size:13px;cursor:pointer;white-space:nowrap}' +
      '.guild-dock-actions button:hover{background:#fff4e4;border-color:#ad7859}' +
      '.guild-dock-actions button.primary{background:#9e3145;border-color:#8d293c;color:#fffdf8;font-weight:700}' +
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
    var now = beijingDateParts();
    view.year = now.year;
    view.month = now.month - 1;
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
    var dateInput = document.getElementById('day');
    if (dateInput && dateInput.value !== view.selected) {
      dateInput.value = view.selected;
      dateInput.dispatchEvent(new Event('change', {bubbles:true}));
    }
    renderCalendar();
  }

  document.addEventListener('guild-journal-changed',()=>renderCalendar());
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
      var journalMark = window.GuildJournal?.store().entries[k]?.status==='saved' ? '<span class="journal-day-mark" title="有手记">✎</span>' : '';
      var dot = info && info.count > 0 ? '<span class="dot' + (info.overdue > 0 ? ' overdue' : '') + '"></span>' : '';
      html += '<span class="' + cls + '" data-date="' + k + '">' + d + dot + journalMark + '</span>';
    }
    grid.innerHTML = html;
    grid.querySelectorAll('.day[data-date]').forEach(function (cell) {
      cell.onclick = function () {
        view.selected = cell.getAttribute('data-date');
        var dateInput = document.getElementById('day');
        if (dateInput && dateInput.value !== view.selected) {
          dateInput.value = view.selected;
          dateInput.dispatchEvent(new Event('change', {bubbles:true}));
        }
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
    let actions=document.getElementById('guildJournalCalendarActions');if(!actions){actions=document.createElement('div');actions.id='guildJournalCalendarActions';actions.className='guild-journal-calendar-actions';title.after(actions)}actions.replaceChildren();for(const [label,report]of [['✎ 当日手记',false],['研究周报',true]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>window.GuildJournal.open({date:view.selected,report});actions.append(b)}
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
      side.textContent = statusText(e.t, e);
      row.append(g, mid, side);
      if(window.GuildCalendar){
        var reminder=window.GuildCalendar.button(e.t.id,e.kind==='stage'?e.step.id:'');
        reminder.classList.add('gd-calendar-entry');row.appendChild(reminder);
      }
      list.appendChild(row);
    });
  }

  // ---------- 开关 ----------
  function show() {
    if (!panel) return;
    panel.hidden = false;
    renderCalendar();
    syncStatusFromGlobal();
    if (panel.classList.contains('guild-calendar-embedded')) panel.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function hide() {
    if (panel && !panel.classList.contains('guild-calendar-embedded')) panel.hidden = true;
  }
  function toggle() {
    if (!panel) buildPanel();
    if (panel.classList.contains('guild-calendar-embedded') || panel.hidden) show(); else hide();
  }

  // ---------- 挂载 ----------
  function init() {
    ensureStyles();
    initView();
    buildPanel();
    var hero = document.querySelector('.guild-content > header .hero, main > header .hero');
    var stats = document.getElementById('topTotal');
    if (hero) {
      var right = document.createElement('aside');
      right.className = 'guild-calendar-column';
      var header = hero.closest('header');
      header.classList.add('guild-calendar-header');
      var left = document.createElement('div');
      left.className = 'guild-today-column';
      Array.from(header.children).forEach(function (node) {
        left.appendChild(node);
      });
      header.prepend(left);
      header.appendChild(right);
      right.appendChild(panel);
      panel.classList.add('guild-calendar-embedded');
      panel.hidden = false;
      panel.querySelector('.guild-dock-head strong').textContent = '委托日历';
      document.getElementById('guildDockClose').hidden = true;
      panel.querySelector('.guild-dock-actions').hidden = true;
      if (stats) {
        var ledger = document.createElement('details');
        ledger.className = 'guild-ledger-fold';
        var heading = document.createElement('summary');
        heading.textContent = '公会账本 · 收入与完成记录';
        ledger.appendChild(heading);
        ledger.appendChild(stats);
        right.appendChild(ledger);
      }
      renderCalendar();
      var line = left.querySelector('.header-line');
      var badge = document.getElementById('connectionBadge');
      var sync = document.getElementById('guildSyncNow');
      if (line && badge) {
        var connection = document.createElement('div');
        connection.className = 'guild-connection-tools';
        connection.appendChild(badge);
        if (sync) connection.appendChild(sync);
        line.appendChild(connection);
      }
    }
    var dateBar = document.getElementById('day') && document.getElementById('day').parentElement;
    if(dateBar && !panel.classList.contains('guild-calendar-embedded') && !document.getElementById('guildCalendarEntry')){
      var entry=document.createElement('button');entry.id='guildCalendarEntry';entry.type='button';entry.textContent='▦ 委托日历';entry.onclick=toggle;
      document.getElementById('day').after(entry);
    }
    document.addEventListener('guildDockToggle', toggle);
    // 状态行跟随云端状态（代码/guild-cloud-sync.js 的 setBadge 也会主动更新）
    window.addEventListener('guildCloudStateChange', function () { syncStatusFromGlobal(); });
    window.addEventListener('storage', function (event) { if(event.key === STORE_KEY) renderCalendar(); });
    window.addEventListener('fairytail:data-changed', renderCalendar);
    var dayInput = document.getElementById('day');
    if (dayInput) dayInput.addEventListener('change', function () {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayInput.value)) return;
      view.selected = dayInput.value;
      view.year = Number(view.selected.slice(0,4));
      view.month = Number(view.selected.slice(5,7))-1;
      renderCalendar();
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
