/* guild-enhance-v196.js — v196 增量模块：截止提醒 / 公会周报 / 妖尾节日 / 羁绊之星
 * 独立于现有模块，命名前缀 GE196 避免冲突；只读现有全局(getTasks/taskDone/completedDate/memberName/grantJ/toast/GBS)，
 * 不修改任何既有函数与数据。右下角悬浮「公会信箱」为唯一入口。
 */
'use strict';
(function () {
  if (typeof window === 'undefined') return;

  /* ── 工具 ── */
  function lsGet(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function two(n) { return (n < 10 ? '0' : '') + n; }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()); }
  function mdStr() { var d = new Date(); return two(d.getMonth() + 1) + '-' + two(d.getDate()); }
  function addDaysStr(base, n) { var d = new Date(base.getTime() + n * 86400000); return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()); }
  function mondayStr() { var d = new Date(); var w = d.getDay() || 7; d.setDate(d.getDate() - (w - 1)); return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()); }
  function getTasks() {
    if (typeof window.getTasks === 'function') { try { var t = window.getTasks(); if (Array.isArray(t)) return t; } catch (e) {} }
    try { var raw = localStorage.getItem('fairytail-tasks-v2'); if (raw) { var a = JSON.parse(raw); if (Array.isArray(a)) return a; } } catch (e) {}
    return [];
  }
  function isDone(t) { return !!(t && t.done); }
  function doneDate(t) { try { return String((t && t.completedAt) || ''); } catch (e) { return ''; } }
  function memberName(id) {
    if (typeof window.memberName === 'function') { try { var n = window.memberName(id); if (n) return String(n); } catch (e) {} }
    if (typeof window.resolveGuildMember === 'function') { try { var m = window.resolveGuildMember(id); if (m && m.name) return String(m.name); } catch (e) {} }
    return id || '';
  }
  function toast(msg) {
    if (typeof window.toast === 'function') { try { window.toast(msg, true); return; } catch (e) {} }
    if (typeof window.guildAlert === 'function') { try { window.guildAlert(msg); return; } catch (e) {} }
  }
  function grantJ(n, why) {
    if (typeof window.grantJ === 'function') { try { return !!window.grantJ(n, why); } catch (e) {} }
    if (typeof window.guildGrantJ === 'function') { try { return !!window.guildGrantJ(n, why); } catch (e) {} }
    return false;
  }
  function dueDay(t) { var d = (t && (t.due || '')) || ''; return d ? String(d).slice(0, 10) : ''; }

  /* ── 妖尾节日日历（固定公历，无农历依赖；联动天气/奖励描述） ── */
  var FESTIVALS = [
    { md: '01-01', name: '岁首祭', desc: '新年第一缕阳光照进公会大厅。', mult: 1.2, type: 'any', tag: '新年' },
    { md: '03-21', name: '花见之日', desc: '春分花见，书页与花瓣一起翻飞。', bonus: 50, type: 'write', tag: '花见' },
    { md: '05-17', name: '火龙祭', desc: '纳兹生日庆典，火焰魔法点亮夜空。', mult: 1.3, type: 'high', tag: '庆典' },
    { md: '07-07', name: '星灵祭', desc: '七夕之夜，星灵之门缓缓敞开。', bond: 20, type: 'any', tag: '星灵' },
    { md: '08-15', name: '花火大会', desc: '仲夏夜花火，公会全员在码头相聚。', mult: 1.5, type: 'any', tag: '花火' },
    { md: '10-31', name: '妖尾变装夜', desc: '万圣夜全员变装，连艾露莎都换下了铠甲。', bonus: 80, type: 'any', tag: '变装' },
    { md: '12-24', name: '公会平安夜', desc: '平安夜派对，吧台的酒已经热好。', bonus: 80, bond: 10, type: 'any', tag: '平安夜' }
  ];
  /* 每月固定：1日公会日（月例集会）、15日满月夜（远征/实验加成） */
  function monthlyEvent() {
    var d = new Date();
    if (d.getDate() === 1) return { name: '公会日 · 月例集会', desc: '每月例会，接取委托更有干劲。', bonus: 60, type: 'any', tag: '月例' };
    if (d.getDate() === 15) return { name: '满月夜', desc: '月圆之夜，远征与实验类委托奖励加成。', mult: 1.3, type: 'exped', tag: '满月' };
    return null;
  }
  function festivalOf() {
    var md = mdStr(), i;
    for (i = 0; i < FESTIVALS.length; i++) if (FESTIVALS[i].md === md) return FESTIVALS[i];
    return monthlyEvent();
  }

  /* ── 截止提醒（页面打开期间每分钟检查；静态托管无法后台推送，如实提示） ── */
  var ALERT_LOG_KEY = 'fairytail-alert-log-v196';
  var ALERT_PREF_KEY = 'fairytail-alert-pref-v196';
  function alertStatus(t) {
    if (!t || isDone(t)) return null;
    var due = dueDay(t);
    if (!due) return null;
    var today = todayStr();
    if (due < today) return { kind: 'overdue', label: '已逾期' };
    if (due === today) return { kind: 'today', label: '今日截止' };
    if (due === addDaysStr(new Date(), 1)) return { kind: 'tomorrow', label: '明日截止' };
    return null;
  }
  function collectAlerts() {
    var out = { overdue: [], today: [], tomorrow: [] };
    getTasks().forEach(function (t) {
      var st = alertStatus(t);
      if (st) { (out[st.kind] || (out[st.kind] = [])).push(t); }
    });
    return out;
  }
  function notifyBrowser(text) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try {
      var n = new Notification('公会信箱', { body: text, icon: '素材/界面/站点标识/guild-icon-192.png' });
      setTimeout(function () { try { n.close(); } catch (e) {} }, 8000);
    } catch (e) {}
  }
  function fireNewAlerts() {
    var log = lsGet(ALERT_LOG_KEY, {});
    var alerts = collectAlerts(), changed = false;
    getTasks().forEach(function (t) {
      var st = alertStatus(t);
      if (!st) return;
      var id = t.id || t.title || '';
      if (log[id] === st.kind) return;                       /* 同一状态只提醒一次 */
      log[id] = st.kind; changed = true;
      var name = memberName(t.assigneeId);
      var msg = st.kind === 'overdue'
        ? '⚠ 委托已逾期：「' + t.title + '」' + (name ? '（' + name + '）' : '')
        : (st.kind === 'today' ? '⏰ 今日截止：「' + t.title + '」' + (name ? '（' + name + '）' : '') : '🌙 明日截止：「' + t.title + '」');
      toast(msg);
      notifyBrowser(t.title + (st.kind === 'overdue' ? ' 已逾期' : ' 今日截止'));
    });
    if (changed) lsSet(ALERT_LOG_KEY, log);
    var pref = lsGet(ALERT_PREF_KEY, {});
    if (pref.enabled && alerts.today.length) {
      /* 每小时最多一次今日截止总览提示 */
      var last = pref.lastSummary || '';
      var now = todayStr() + ':' + Math.floor(Date.now() / 3600000);
      if (last !== now) { pref.lastSummary = now; lsSet(ALERT_PREF_KEY, pref); toast('📌 今日有 ' + alerts.today.length + ' 项委托截止，记得去完成'); }
    }
  }

  /* ── 周报统计（本周完成 / 本周截止 / 分类） ── */
  function inRange(dateStr, fromStr, toStr) { return dateStr >= fromStr && dateStr <= toStr; }
  function weeklyStats() {
    var mon = mondayStr(), sun = addDaysStr(new Date(mon + 'T00:00:00'), 6);
    var done = 0, j = 0, cats = {}, deadline = 0, overdue = 0;
    getTasks().forEach(function (t) {
      var cd = doneDate(t);
      if (cd && inRange(cd.slice(0, 10), mon, sun)) {
        done++;
        if (t.rewardJ) j += Number(t.rewardJ) || 0;
        var c = t.category || '其他'; cats[c] = (cats[c] || 0) + 1;
      }
      if (!isDone(t)) {
        var due = dueDay(t);
        if (due && inRange(due, mon, sun)) deadline++;
        if (due && due < todayStr()) overdue++;
      }
    });
    return { mon: mon, sun: sun, done: done, j: j, cats: cats, deadline: deadline, overdue: overdue };
  }
  var WEEK_KEY = 'fairytail-weekly-announce-v196';
  function shouldShowWeekly() {
    var st = lsGet(WEEK_KEY, {});
    var mon = mondayStr();
    if (st.week === mon) return false;
    st.week = mon; lsSet(WEEK_KEY, st);
    return true;
  }

  /* ── 羁绊之星（Lv≥5 且当前实景常驻角色高亮） ── */
  function bondLevelOf(id) {
    try {
      var G = window.GuildBondSystem || window.GBS;
      if (!G || !G.read) return 0;
      var b = G.read();
      var p = (b && b[id]) || null;
      var pts = (p && p.points) || 0;
      if (typeof G.level === 'function') return G.level(pts);
    } catch (e) {}
    return 0;
  }
  var BOND_NAMES = ['初识', '面熟的伙伴', '并肩同行', '信赖之人', '患难与共', '生死之交', '灵魂羁绊', '永恒誓言', '命运同行者', '公会传说', 'Fairy Tail 之魂'];
  function bondTitle(id) { var lv = bondLevelOf(id); return BOND_NAMES[lv] || BOND_NAMES[0]; }
  function bondStars() {
    var out = [];
    getTasks().forEach(function (t) {
      var id = t.assigneeId;
      if (!id) return;
      var lv = bondLevelOf(id);
      if (lv >= 5 && !out.some(function (x) { return x.id === id; })) out.push({ id: id, lv: lv });
    });
    return out;
  }

  /* ── 节日奖励结算（仿新完成检测：快照对比，幂等） ── */
  var SNAP_KEY = 'fairytail-enhance-snapshot-v196';
  function checkFestivalReward() {
    var fest = festivalOf();
    if (!fest) return;
    var tasks = getTasks(), doneIds = [];
    tasks.forEach(function (t) { if (isDone(t)) doneIds.push(t.id || t.title || ''); });
    var snap = lsGet(SNAP_KEY, {});
    if (snap.day === todayStr() && Array.isArray(snap.ids)) {
      var newly = doneIds.filter(function (id) { return snap.ids.indexOf(id) < 0; });
      if (newly.length) {
        var target = tasks.filter(function (t) { var id = t.id || t.title || ''; return newly.indexOf(id) >= 0 && !snap.paid || (snap.paid && snap.paid.indexOf(id) < 0); });
        var paid = Array.isArray(snap.paid) ? snap.paid : [];
        target.forEach(function (t) {
          var id = t.id || t.title || '';
          if (paid.indexOf(id) >= 0) return;
          var extra = 0;
          if (fest.mult && (fest.type === 'any' || (fest.type === 'write' && /学习|写作|阅读/.test(t.category || '')) || (fest.type === 'high' && /S|A/.test(t.level || '')) || (fest.type === 'exped' && t.type === 'project'))) {
            extra = Math.round(((t.rewardJ || 100) * (fest.mult - 1)) / 10) * 10;
          } else if (fest.bonus) {
            extra = fest.bonus;
          }
          if (extra > 0 && grantJ(extra, '节日加成 · ' + fest.name)) {
            paid.push(id);
            toast('🎉 今日「' + fest.name + '」加成 +' + extra + ' J（' + t.title + '）');
          }
        });
        snap.paid = paid;
      }
      snap.ids = doneIds; lsSet(SNAP_KEY, snap);
      return;
    }
    snap = { day: todayStr(), ids: doneIds, paid: [] };
    lsSet(SNAP_KEY, snap);
  }

  /* ── UI：左下角悬浮「公会信箱」（避开右侧云端状态徽章） ── */
  var PANEL_STYLE = '.ge196-fab{position:fixed;left:14px;bottom:14px;z-index:100000;width:52px;height:52px;border-radius:50%;border:2px solid var(--gold,#c9a24a);background:var(--red,#a53243);color:#fff;font-size:22px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;user-select:none}'
    + '.ge196-panel{position:fixed;left:14px;bottom:74px;z-index:100001;width:min(330px,86vw);max-height:70vh;overflow:auto;background:var(--paper,#fffdf5);border:2px solid var(--gold,#c9a24a);border-radius:14px;box-shadow:0 8px 26px rgba(0,0,0,.3);padding:12px 14px;font-size:13px;color:var(--ink,#3a2c20);display:none}'
    + '.ge196-panel.open{display:block}'
    + '.ge196-sec{margin:9px 0 4px;font-weight:700;color:var(--red,#a53243);border-bottom:1px dashed var(--gold,#c9a24a);padding-bottom:3px}'
    + '.ge196-item{margin:5px 0;line-height:1.45}'
    + '.ge196-item .ge196-badge{display:inline-block;margin-right:5px;padding:0 6px;border-radius:8px;font-size:11px;color:#fff}'
    + '.ge196-b-overdue{background:#c0392b}.ge196-b-today{background:#d97706}.ge196-b-tomorrow{background:#2563eb}'
    + '.ge196-b-fest{background:#7c3aed}.ge196-empty{color:var(--muted,#8a7a6a);font-style:italic}'
    + '.ge196-toggle{margin-top:8px;padding:6px 10px;border-radius:8px;border:1px solid var(--gold,#c9a24a);background:#fff8e8;cursor:pointer;color:var(--ink,#3a2c20);font-size:12px}'
    + '.ge196-close{position:sticky;top:0;float:right;background:none;border:none;font-size:16px;cursor:pointer;color:var(--muted,#8a7a6a);line-height:1}'
    + '@media(max-width:640px){.ge196-fab{width:46px;height:46px;font-size:19px;left:10px;bottom:10px}.ge196-panel{left:10px;bottom:64px;width:88vw}}';
  function injectStyle() {
    if (document.getElementById('ge196-style')) return;
    var s = document.createElement('style');
    s.id = 'ge196-style'; s.textContent = PANEL_STYLE;
    (document.head || document.documentElement).appendChild(s);
  }
  var panelOpen = false;
  function renderPanel() {
    var box = document.getElementById('ge196-panel');
    if (!box) return;
    var h = '<button type="button" class="ge196-close" title="关闭">✕</button>';
    var alerts = collectAlerts();
    var fest = festivalOf();
    var stats = weeklyStats();
    var stars = bondStars();
    var pref = lsGet(ALERT_PREF_KEY, {});

    h += '<div class="ge196-sec">⏰ 截止告示</div>';
    if (!alerts.overdue.length && !alerts.today.length && !alerts.tomorrow.length) {
      h += '<div class="ge196-item ge196-empty">暂无截止与逾期委托，公会一切安好。</div>';
    }
    [['overdue', 'overdue', '已逾期'], ['today', 'today', '今日'], ['tomorrow', 'tomorrow', '明日']].forEach(function (row) {
      (alerts[row[0]] || []).forEach(function (t) {
        h += '<div class="ge196-item"><span class="ge196-badge ge196-b-' + row[1] + '">' + row[2] + '</span>' + esc(t.title) + (t.assigneeId ? ' · ' + esc(memberName(t.assigneeId)) : '') + '</div>';
      });
    });
    if (alerts.overdue.length || alerts.today.length) {
      h += '<div class="ge196-item" style="color:var(--muted,#8a7a6a)">完成或撤销后会自动从告示消失。</div>';
    }

    h += '<div class="ge196-sec">📬 公会周报 · ' + stats.mon.slice(5) + ' 起</div>';
    if (!stats.done && !stats.deadline) {
      h += '<div class="ge196-item ge196-empty">本周尚无完成记录。</div>';
    } else {
      h += '<div class="ge196-item">本周完成 <b>' + stats.done + '</b> 项' + (stats.j ? ' · 获得 <b>' + stats.j + '</b> J' : '') + (stats.deadline ? ' · 还有 <b>' + stats.deadline + '</b> 项待截止' : '') + (stats.overdue ? ' · <b style="color:#c0392b">' + stats.overdue + ' 项已逾期</b>' : '') + '</div>';
      var ck = Object.keys(stats.cats);
      if (ck.length) h += '<div class="ge196-item" style="color:var(--muted,#8a7a6a)">领域：' + ck.map(function (c) { return c + '×' + stats.cats[c]; }).join('、') + '</div>';
    }

    h += '<div class="ge196-sec">✨ 今日公会</div>';
    if (fest) {
      h += '<div class="ge196-item"><span class="ge196-badge ge196-b-fest">' + esc(fest.tag || '节日') + '</span><b>' + esc(fest.name) + '</b> — ' + esc(fest.desc) + '</div>';
    } else {
      h += '<div class="ge196-item ge196-empty">今日无特别节日，照常接取委托。</div>';
    }

    h += '<div class="ge196-sec">💛 羁绊之星</div>';
    if (!stars.length) {
      h += '<div class="ge196-item ge196-empty">羁绊 Lv.5 以上的伙伴，会在这里闪耀。</div>';
    } else {
      stars.forEach(function (s) {
        h += '<div class="ge196-item">✨ ' + esc(memberName(s.id)) + ' · Lv.' + s.lv + ' ' + esc(bondTitle(s.id)) + '</div>';
      });
    }

    h += '<button type="button" class="ge196-toggle" id="ge196-notify-btn">' + (pref.enabled ? '🔔 截止提醒：已开启' : '🔕 截止提醒：未开启（点击开启）') + '</button>';
    box.innerHTML = h;

    var closeBtn = box.querySelector('.ge196-close');
    if (closeBtn) closeBtn.onclick = function () { box.classList.remove('open'); panelOpen = false; };
    var nb = box.querySelector('#ge196-notify-btn');
    if (nb) nb.onclick = function () {
      if (!('Notification' in window)) { toast('此浏览器不支持系统通知，仅展示页面提示'); return; }
      if (Notification.permission === 'granted') {
        pref.enabled = !pref.enabled; lsSet(ALERT_PREF_KEY, pref);
        toast(pref.enabled ? '🔔 截止提醒已开启' : '🔕 截止提醒已关闭');
        renderPanel();
      } else {
        Notification.requestPermission().then(function (p) {
          pref.enabled = p === 'granted'; lsSet(ALERT_PREF_KEY, pref);
          if (p === 'granted') { toast('🔔 已开启系统通知'); notifyBrowser('截止提醒已开启'); }
          else toast('未获得通知权限，仍将显示页面提示');
          renderPanel();
        });
      }
    };
  }
  function buildFab() {
    if (document.getElementById('ge196-fab')) return;
    injectStyle();
    var fab = document.createElement('button');
    fab.id = 'ge196-fab'; fab.className = 'ge196-fab'; fab.type = 'button';
    fab.textContent = '📮'; fab.title = '公会信箱';
    var panel = document.createElement('div');
    panel.id = 'ge196-panel'; panel.className = 'ge196-panel';
    document.body.appendChild(fab); document.body.appendChild(panel);
    fab.addEventListener('click', function () {
      panelOpen = !panelOpen;
      if (panelOpen) { renderPanel(); panel.classList.add('open'); }
      else panel.classList.remove('open');
    });
  }

  /* ── 初始化 ── */
  function init() {
    buildFab();
    renderPanel();
    fireNewAlerts();
    checkFestivalReward();
    setInterval(function () { fireNewAlerts(); checkFestivalReward(); }, 60000);
    /* 数据变化后刷新面板内容（不常驻定时刷新，仅任务变化时） */
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('fairytail:data-changed', function () { if (panelOpen) renderPanel(); });
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) { fireNewAlerts(); if (panelOpen) renderPanel(); }
      });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
