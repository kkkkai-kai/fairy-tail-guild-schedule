// ============================================================
// 妖精的尾巴 · 公会系统扩展（v64）
// 天气 / 出勤 / 委托板周目标 / 羁绊之书 / 公会月刊 / 公会日常 / S级考核 / 委托速记
// 独立文件：不侵入 schedule.js 内部（仅调用注入的 window.guildGrantJ）
// 所有新数据 key 已加入 guild-cloud-sync.js syncKeys（三端同步）
// ============================================================
(function () {
  'use strict';

  /* ================= 工具 ================= */
  function lsGet(key, fb) { try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
  function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.warn('[guild-features] lsSet failed for', key, e); } }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function thisMonth() { return today().slice(0, 7); }
  function lastMonth() { var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function addDays(base, n) { var d = new Date(base); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function weekMonday(dateStr) { var d = new Date(dateStr + 'T00:00:00'); var wd = d.getDay(); var off = (wd === 0 ? -6 : 1 - wd); return addDays(dateStr, off); }
  function hashStr(s) { var h = 0; for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return Math.abs(h); }
  function monthEnd(dateStr) { var d = new Date(dateStr.slice(0, 7) + '-01'); d.setMonth(d.getMonth() + 1); d.setDate(0); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function grantJ(j, name) {
    if (window.guildGrantJ) return window.guildGrantJ(j, name);
    try { var w = lsGet('fairytail-wallet-v1', { rate: 100, cap: 300, redemptions: [] }); w.bonus = w.bonus || []; w.bonus.push({ date: today(), j: Number(j) || 0, name: String(name || '公会津贴'), id: Date.now() }); lsSet('fairytail-wallet-v1', w); } catch (e) { console.error('[guild-features] grantJ failed', e); }
    return false;
  }
  function toast(text, ok) {
    try {
      var el = document.createElement('div');
      el.style.cssText = 'position:fixed;bottom:118px;right:12px;z-index:99998;background:' + (ok ? '#e8f6e4' : '#ffe3e0') + ';color:' + (ok ? '#2f6b2f' : '#a33') + ';padding:10px 16px;border-radius:12px;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,.18);max-width:280px;line-height:1.5;transition:opacity .4s';
      el.textContent = text;
      document.body.appendChild(el);
      setTimeout(function () { el.style.opacity = '0'; setTimeout(function () { el.remove(); }, 400); }, 3600);
    } catch (e) { console.warn('[guild-features] toast display failed', e); }
  }

  /* ================= 确定性天气（按日期生成，所有设备一致） ================= */
  var WEATHERS = [
    { id: 'sunny', name: '晴', icon: '☀', jNote: '远征/实战类委托报酬 +20%' },
    { id: 'cloudy', name: '多云', icon: '⛅', jNote: '风平浪静，适合稳步推进' },
    { id: 'rain', name: '雨', icon: '🌧', jNote: '整理归档类 +20% · 远征类 -10%' },
    { id: 'heavyRain', name: '大雨', icon: '⛈', jNote: '整理归档 +25% · 远征 -20%' },
    { id: 'snow', name: '雪', icon: '❄', jNote: '研究修炼类 +25%' },
    { id: 'fog', name: '雾', icon: '🌫', jNote: '雾隐之际，稀有委托概率 ×2' },
    { id: 'storm', name: '雷暴', icon: '⚡', jNote: '远征禁止 · 室内类委托 +15~25%' }
  ];
  function weatherOf(dateStr) {
    var r = hashStr('ft-climate-' + dateStr) % 100;
    if (r < 25) return WEATHERS[0];       // 晴 25%
    if (r < 50) return WEATHERS[1];       // 多云 25%
    if (r < 70) return WEATHERS[2];       // 雨 20%
    if (r < 80) return WEATHERS[3];       // 大雨 10%
    if (r < 90) return WEATHERS[4];       // 雪 10%
    if (r < 95) return WEATHERS[5];       // 雾 5%
    return WEATHERS[6];                   // 雷暴 5%
  }
  var EXPED_KEYWORDS = ['远征', '调研', '实验', '户外', '外出', '跑腿', '采购', '实地', '访谈', '交付', '寄', '取', '开会', '上课', '复试'];
  var ARCHIVE_KEYWORDS = ['整理', '归档', '分类', '清理', '备份', '存档', '收纳', '排序', '导入', '导出'];
  var WRITE_KEYWORDS = ['写作', '写', '论文', '翻译', '总结', '复盘', '笔记', '文献', '阅读', '读', '书', '稿件', '脚本'];
  var STUDY_KEYWORDS = ['研究', '学习', '修炼', '训练', '练习', '课程', '复习', '做题', '背', '记忆', '听力', '口语'];
  function weatherBonusFor(weather, title, category) {
    var s = String(title || '') + String(category || '');
    if (weather.id === 'storm') { if (EXPED_KEYWORDS.some(function (k) { return s.indexOf(k) >= 0; })) return { blocked: true, mul: 0 }; return { mul: 1.2 }; }
    if (weather.id === 'rain') { if (ARCHIVE_KEYWORDS.some(function (k) { return s.indexOf(k) >= 0; })) return { mul: 1.2 }; if (EXPED_KEYWORDS.some(function (k) { return s.indexOf(k) >= 0; })) return { mul: 0.9 }; }
    if (weather.id === 'heavyRain') { if (ARCHIVE_KEYWORDS.some(function (k) { return s.indexOf(k) >= 0; })) return { mul: 1.25 }; if (EXPED_KEYWORDS.some(function (k) { return s.indexOf(k) >= 0; })) return { mul: 0.8 }; }
    if (weather.id === 'snow') { if (STUDY_KEYWORDS.some(function (k) { return s.indexOf(k) >= 0; })) return { mul: 1.25 }; }
    if (weather.id === 'sunny') { if (EXPED_KEYWORDS.some(function (k) { return s.indexOf(k) >= 0; })) return { mul: 1.2 }; if (STUDY_KEYWORDS.some(function (k) { return s.indexOf(k) >= 0; })) return { mul: 1.1 }; }
    return { mul: 1 };
  }

  /* ================= 角色名映射（界面显示用，不改任务数据） ================= */
  var MEMBER_NAMES = {
    natsu: '纳兹', lucy: '露西', erza: '艾尔扎', gray: '格雷', wendy: '温蒂', happy: '哈比',
    charle: '夏露露', levy: '蕾比', gajeel: '伽吉尔', juvia: '朱比娅', mira: '米拉', laxus: '拉克萨斯',
    jellal: '杰拉尔', cana: '卡娜', gildarts: '吉尔达兹', makarov: '马卡洛夫', mystogan: '密斯特岗',
    freed: '弗里德', bickslow: '比克斯洛', evergreen: '艾芭格林', elfman: '艾尔夫曼', lily: '莉莉',
    romeo: '罗密欧', jet: '杰特', droy: '德莱亚', warren: '沃伦', alzack: '阿尔扎克', bisca: '碧丝卡',
    max: '马克斯', wakaba: '瓦卡巴', macao: '马卡欧', kinana: '吉娜娜', reedus: '里杜斯', nab: '纳布',
    sting: '斯汀', rogue: '罗格', minerva: '米涅露芭', yukino: '雪莉娅', ultear: '乌尔蒂娅', azuma: '阿祖玛',
    mest: '梅斯特', loke: '洛基', brandish: '布兰蒂什', mavis: '梅比斯', ultear2: '乌尔'
  };
  function memberName(id) { return MEMBER_NAMES[id] || id || '公会成员'; }

  /* ================= 羁绊台词（风格化原创，贴合角色人设） ================= */
  var BOND_LINES = {
    natsu: ['“一起上吧，委托哪有怕的道理！”', '“火焰越烧越旺——就像我们并肩的每一天。”', '“有你在身边，我连龙都不怕。”'],
    lucy: ['“谢谢你愿意陪我一起，这比任何委托都让人安心。”', '“星灵们说，和伙伴在一起的日子最珍贵。”', '“这本日记里，已经写满我们的冒险了。”'],
    erza: ['“作为妖精的尾巴的一员，我以你为荣。”', '“铠甲会褪色，但羁绊不会。”', '“值得守护的东西，从来不在远方。”'],
    gray: ['“别看我这样，该认真时我可不会输。”', '“脱不脱衣服另说——谢谢你一直这么可靠。”', '“冰会融化，这份信任不会。”'],
    wendy: ['“天空的魔法，会一直守护大家的笑容。”', '“你努力的样子，让我也想变得更强。”', '“下次的委托，也一起加油吧！”'],
    happy: ['“Aye！和你一起做任务最开心了！”', '“要鱼吗？奖励你今天的努力～”', '“纳兹都说，你是最棒的搭档！”'],
    levy: ['“你的整理归档超棒的，书库感谢你！”', '“和你一起研究，连晦涩的书都变得有趣。”', '“这份羁绊，我会写进公会历史里。”'],
    gajeel: ['“哼，你这家伙还挺能干的嘛。”', '“铁一样的信任，砸不坏。”', '“下次喝酒，我请。”'],
    juvia: ['“和格雷大人一起……啊，对不起，走神了。”', '“朱比娅很开心能和你并肩。”', '“雨水会停，这份心意不会。”'],
    mira: ['“辛苦啦，吧台给你留了特调。”', '“公会因为有你在，才这么热闹。”', '“要听八卦吗？作为搭档的特别服务～”'],
    laxus: ['“能让我认可的搭档可不多，你算一个。”', '“雷电之后是晴空——我们还会再并肩。”', '“妖精的尾巴的荣耀，你我一起扛。”'],
    gildarts: ['“小子/姑娘，有点意思，跟我学两招？”', '“看遍世界后，还是公会最好。”', '“S级不是终点，是新的开始。”'],
    makarov: ['“公会就是家，你就是家人。”', '“看着你们成长，是我最大的欣慰。”', '“老头子我啊，最自豪的就是你们。”'],
    cana: ['“今天也要干杯！为你，为公会！”', '“塔罗牌说，我们的缘分很深哦。”', '“下次的胜利，一起来庆祝！”'],
    loke: ['“绅士的承诺，说到做到。”', '“星光会指引我们再次相遇。”', '“你的努力，我都看在眼里。”'],
    mystogan: ['“无声的行动，胜过千言万语。”', '“异界的风，也吹不散这份羁绊。”', '“委托已了，后会有期。”']
  };
  var BOND_FALLBACK = ['”和你的羁绊，让公会更加闪亮。”', '”无论什么委托，一起就没问题。”', '”今天也辛苦啦，伙伴。”'];
  /* ── Bond system: delegate to shared GuildBondSystem (defined in v4.js, single source of truth) ── */
  var GBS = globalThis.GuildBondSystem || (function () {
    var levels = [
      {lv:0,name:'初识',need:0},{lv:1,name:'面熟的伙伴',need:50},{lv:2,name:'并肩同行',need:120},
      {lv:3,name:'信赖之人',need:250},{lv:4,name:'患难与共',need:450},{lv:5,name:'生死之交',need:700},
      {lv:6,name:'灵魂羁绊',need:1000},{lv:7,name:'永恒誓言',need:1400},{lv:8,name:'命运同行者',need:1900},
      {lv:9,name:'公会传说',need:2500},{lv:10,name:'Fairy Tail 之魂',need:3300}
    ];
    var KEY = 'fairytail-bond-v1';
    function read() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
    function write(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
    function level(pts) { for (var i = levels.length - 1; i >= 0; i--) if (pts >= levels[i].need) return levels[i].lv; return 0; }
    function meta(pts) { var lv = level(pts), cur = levels[lv], nxt = levels[lv + 1]; return { level: lv, name: cur.name, need: cur.need, nextNeed: nxt ? nxt.need : null, progress: nxt ? pts - cur.need : 0, pct: nxt ? Math.min(100, Math.round((pts - cur.need) / (nxt.need - cur.need) * 100)) : 100 }; }
    function migrate() {}
    return { levels: levels, read: read, write: write, level: level, meta: meta, migrate: migrate };
  })();
  function bondLevel(points) { return GBS.level(points); }
  function bondLevelMeta(points) { var m = GBS.meta(points); return { lv: m.level, name: m.name, need: m.need, nextNeed: m.nextNeed, pct: m.pct }; }
  function linesFor(id, unlockedCount) {
    var pool = BOND_LINES[id] || BOND_FALLBACK;
    return pool.slice(0, Math.min(unlockedCount, pool.length));
  }

  /* ================= 数据读取 ================= */
  function getTasks() { return lsGet('fairytail-tasks-v2', []); }
  function taskDone(t) { return !!t && (!!t.done || t.status === 'completed' || (t.type === 'project' && (t.steps || []).length > 0 && (t.steps || []).every(function (s) { return s.done; }))); }
  function completedDate(t) { return t.completedAt ? String(t.completedAt).slice(0, 10) : ''; }

  /* ================= 模块：出勤簿 ================= */
  var ATTENDANCE_KEY = 'fairytail-attendance-v1';
  function attendance() { return lsGet(ATTENDANCE_KEY, { days: [], streak: 0, lastDate: '', total: 0, claimDate: '' }); }
  var ATTENDANCE_REWARDS = [
    { streak: 1, j: 50, frag: 0 }, { streak: 2, j: 100, frag: 0 }, { streak: 3, j: 150, frag: 1 },
    { streak: 4, j: 200, frag: 0 }, { streak: 5, j: 300, frag: 2 }, { streak: 6, j: 400, frag: 0 }, { streak: 7, j: 500, frag: 1 }
  ];
  function attendanceReward(streak) { var n = streak % 7 === 0 ? 7 : streak % 7; for (var i = 0; i < ATTENDANCE_REWARDS.length; i++) { if (ATTENDANCE_REWARDS[i].streak === n) return ATTENDANCE_REWARDS[i]; } return { j: 0, frag: 0 }; }
  function claimAttendance() {
    var a = attendance(), t = today();
    if (a.claimDate === t) { toast('今天已经签到过啦，明天再来。', false); return; }
    var yesterday = addDays(t, -1);
    a.streak = (a.lastDate === yesterday) ? a.streak + 1 : 1;
    a.days.push(t); a.lastDate = t; a.total += 1; a.claimDate = t;
    lsSet(ATTENDANCE_KEY, a);
    var rw = attendanceReward(a.streak);
    if (rw.j > 0) grantJ(rw.j, '出勤奖励 · 连续 ' + a.streak + ' 天');
    if (rw.frag > 0) addBadgeFragments(rw.frag, '出勤奖励');
    toast('✦ 出勤登记完成！连续 ' + a.streak + ' 天 · 获得 ' + rw.j + ' J' + (rw.frag ? ' · 徽章碎片×' + rw.frag : '') + '（明日继续可得 ' + attendanceReward(a.streak + 1).j + ' J）', true);
  }

  /* ================= 模块：徽章碎片 / S级徽章 ================= */
  var FRAG_KEY = 'fairytail-badge-fragments-v1';
  function fragments() { return lsGet(FRAG_KEY, { count: 0 }); }
  function addBadgeFragments(n, from) {
    var f = fragments(); f.count = (f.count || 0) + Number(n || 0);
    var titles = lsGet('fairytail-titles-v1', { list: [] });
    while (f.count >= 5) { f.count -= 5; titles.list.push({ name: 'S级·公会徽章', date: today(), from: from }); }
    if (titles.list.length) lsSet('fairytail-titles-v1', titles);
    lsSet(FRAG_KEY, f);
  }

  /* ================= 模块：公会声望 ================= */
  var REP_KEY = 'fairytail-guild-reputation-v1';
  function reputation() { return lsGet(REP_KEY, { value: 0 }); }
  function addReputation(n) { var r = reputation(); r.value = (r.value || 0) + n; lsSet(REP_KEY, r); }

  /* ================= 模块：周目标（公会委托板） ================= */
  var WEEKLY_KEY = 'fairytail-weekly-goals-v1';
  function weeklyGoals() { return lsGet(WEEKLY_KEY, { week: '', goals: [], allDone: false, rewarded: false }); }
  function countInRange(tasks, from, to, cond) {
    return tasks.filter(function (t) {
      if (!taskDone(t)) return false;
      var cd = completedDate(t);
      if (!cd || cd < from || cd > to) return false;
      return cond ? cond(t) : true;
    }).length;
  }
  function ensureWeekly() {
    var w = weeklyGoals(), monday = weekMonday(today());
    if (w.week === monday) return w;
    // 上周统计 → 生成新目标
    var tasks = getTasks(), lastFrom = weekMonday(addDays(monday, -1)), lastTo = addDays(lastFrom, 6);
    var lastCount = countInRange(tasks, lastFrom, lastTo), lastJ = tasks.filter(function (t) { return taskDone(t) && completedDate(t) >= lastFrom && completedDate(t) <= lastTo; }).reduce(function (n, t) { return n + (Number(t.settledJ || t.reward) || 0); }, 0);
    var cats = ['学习', '实验', '生活'], catTargets = {};
    var chosen = cats[hashStr('ft-weekcat-' + monday) % cats.length];
    var lastCat = countInRange(tasks, lastFrom, lastTo, function (t) { return String(t.category || '').indexOf(chosen) >= 0; });
    w.week = monday; w.allDone = false; w.rewarded = false;
    w.goals = [
      { id: 'g1', type: 'count', label: '完成委托 ' + chosen, target: Math.max(5, Math.ceil(lastCount * 1.2)), current: 0, rewardJ: 100, done: false },
      { id: 'g2', type: 'j', label: '赚取报酬 J', target: Math.max(300, Math.ceil(lastJ * 1.2)), current: 0, rewardJ: 150, done: false },
      { id: 'g3', type: 'cat', label: '完成「' + chosen + '」类委托', target: Math.max(3, Math.ceil(lastCat * 1.2)), current: 0, rewardJ: 120, done: false }
    ];
    lsSet(WEEKLY_KEY, w);
    return w;
  }
  function refreshWeeklyProgress() {
    var w = ensureWeekly(), monday = w.week, sunday = addDays(monday, 6);
    if (today() > sunday && !w.allDone) { // 本周结束未全达成，进入下周生成
      w.week = ''; lsSet(WEEKLY_KEY, w); ensureWeekly(); return;
    }
    var tasks = getTasks();
    var count = countInRange(tasks, monday, sunday);
    var jEarned = tasks.filter(function (t) { return taskDone(t) && completedDate(t) >= monday && completedDate(t) <= sunday; }).reduce(function (n, t) { return n + (Number(t.settledJ || t.reward) || 0); }, 0);
    var changed = false;
    w.goals.forEach(function (g) {
      var cur = g.type === 'count' ? count : (g.type === 'j' ? jEarned : countInRange(tasks, monday, sunday, function (t) { return String(t.category || '').indexOf(g.label.match(/「(.+)」/) ? g.label.match(/「(.+)」/)[1] : '学习') >= 0; }));
      if (cur > g.current) { g.current = cur; changed = true; }
      if (g.current >= g.target && !g.done) { g.done = true; grantJ(g.rewardJ, '委托板目标达成 · ' + g.label); toast('✦ 委托板目标达成：' + g.label + '（+' + g.rewardJ + ' J）', true); changed = true; }
    });
    var allDone = w.goals.every(function (g) { return g.done; });
    if (allDone && !w.allDone) { w.allDone = true; grantJ(100, '委托板全目标达成奖励'); addReputation(50); toast('🎉 本周委托板全部达成！公会声望 +50', true); changed = true; }
    if (changed) lsSet(WEEKLY_KEY, w);
  }

  /* ================= 模块：羁绊之书 ================= */
  function ensureBondBase() {
    var b = GBS.read(), tasks = getTasks(), changed = false, hist = {};
    // 全量统计历史完成记录：每完成一次 +10 羁绊点（真正反映历史合作次数）
    tasks.forEach(function (t) {
      var id = t.assigneeId; if (!id || !taskDone(t)) return;
      hist[id] = (hist[id] || 0) + 1;
    });
    Object.keys(hist).forEach(function (id) {
      var base = hist[id] * 10;
      var p = b[id] || (b[id] = { points: 0, unlocked: 0 });
      if ((p.points || 0) < base) p.points = base; // 基线按历史次数补齐，保留之后的增量
      var lv = bondLevel(p.points);
      var want = Math.min(lv, (BOND_LINES[id] || BOND_FALLBACK).length);
      if (p.unlocked < want) p.unlocked = want;    // 按当前等级补解锁台词条数
      delete p._base;
      changed = true;
    });
    if (changed) GBS.write(b);
  }
  function addBond(id, n) {
    if (!id) return;
    var b = GBS.read(), p = b[id] || (b[id] = { points: 0, unlocked: 0 });
    var before = bondLevel(p.points);
    p.points += n; p._base = true;
    var after = bondLevel(p.points);
    if (after > before) {
      p.unlocked = Math.min(p.unlocked + (after - before), (BOND_LINES[id] || BOND_FALLBACK).length);
      var meta = bondLevelMeta(p.points);
      toast('💛 与 ' + memberName(id) + ' 的羁绊提升至「' + meta.name + '」！新羁绊语录已解锁', true);
    }
    GBS.write(b);
  }

  /* ================= 模块：公会日常（随机事件） ================= */
  var EVENTS_KEY = 'fairytail-daily-events-v1';
  var EVENT_TYPES = [
    { type: 'help', title: '帮忙', make: function (name) { return { title: name + '请你帮忙整理', desc: name + '在公会里忙不过来，完成任意 1 个委托就能帮上忙。', req: 'any', rewardJ: 100, bond: 15 }; } },
    { type: 'invite', title: '邀约', make: function (name) { return { title: name + '邀你一起去挑书', desc: '完成 1 个阅读/写作类委托，赴这场书卷之约。', req: 'write', rewardJ: 150, bond: 15 }; } },
    { type: 'train', title: '训练', make: function (name) { return { title: name + '找你切磋', desc: '完成 1 个远征/实验类委托，用行动回应挑战。', req: 'exped', rewardJ: 120, bond: 20 }; } },
    { type: 'quest', title: '神秘委托', make: function (name) { return { title: '神秘委托 · ' + name + '的线报', desc: '完成 1 个 S/A 级委托，雾中自有真章。', req: 'high', rewardJ: 300, bond: 10 }; } },
    { type: 'chat', title: '下午茶', make: function (name) { return { title: '公会下午茶 · ' + name, desc: '完成任意委托后，来吧台坐坐。', req: 'any', rewardJ: 80, bond: 10 }; } }
  ];
  function eventsToday() { return lsGet(EVENTS_KEY, {}); }
  function ensureDailyEvents() {
    var t = today(), all = eventsToday();
    if (all[t] && all[t].length) return all[t];
    var pool = Object.keys(MEMBER_NAMES).filter(function (id) { return id !== 'happy'; });
    var count = 1 + (hashStr('ft-events-' + t) % 2); // 1~2 个
    var list = [], used = {};
    for (var i = 0; i < count; i++) {
      var id = pool[hashStr('ft-event-' + t + '-' + i) % pool.length];
      if (used[id]) continue; used[id] = 1;
      var et = EVENT_TYPES[hashStr('ft-eventtype-' + t + '-' + i) % EVENT_TYPES.length];
      var base = et.make(memberName(id));
      list.push({ id: 'ev-' + t + '-' + i, assigneeId: id, type: et.type, title: base.title, desc: base.desc, req: base.req, rewardJ: base.rewardJ, bond: base.bond, done: false, expired: false });
    }
    all[t] = list;
    // 清理过期（保留 3 天记录）
    var keys = Object.keys(all); var keep = addDays(t, -3);
    keys.forEach(function (k) { if (k < keep) delete all[k]; });
    lsSet(EVENTS_KEY, all);
    return list;
  }
  function settleEvents() {
    var t = today(), all = eventsToday(), list = all[t]; if (!list || !list.length) return;
    var tasks = getTasks(); var changed = false;
    list.forEach(function (ev) {
      if (ev.done || ev.expired) return;
      var hit = tasks.some(function (tk) {
        if (!taskDone(tk)) return false;
        if (completedDate(tk) !== t) return false;
        if (ev.req === 'any') return true;
        if (ev.req === 'write') return WRITE_KEYWORDS.some(function (k) { return String(tk.title || '').indexOf(k) >= 0; });
        if (ev.req === 'exped') return EXPED_KEYWORDS.some(function (k) { return String(tk.title || '').indexOf(k) >= 0; });
        if (ev.req === 'high') return ['S', 'A'].indexOf(tk.grade) >= 0;
        return false;
      });
      if (hit) { ev.done = true; grantJ(ev.rewardJ, '公会日常 · ' + ev.title); addBond(ev.assigneeId, ev.bond); toast('✦ 公会日常完成：' + ev.title + '（+' + ev.rewardJ + ' J · 与 ' + memberName(ev.assigneeId) + ' 羁绊 +' + ev.bond + '）', true); changed = true; }
    });
    if (changed) lsSet(EVENTS_KEY, all);
  }

  /* ================= 模块：S级考核 ================= */
  var TRIAL_KEY = 'fairytail-s-trial-v1';
  var S_TITLES = { expedition: 'S级·远征王', writing: 'S级·文豪', recovery: 'S级·治愈师', guildService: 'S级·公会之光', research: 'S级·探索者', archive: 'S级·档案馆长', delivery: 'S级·疾风使者', general: 'S级·传说魔导士' };
  function lastFullWeekActive() {
    var monday = weekMonday(today()), sunday = addDays(monday, 6), mend = monthEnd(monday);
    return sunday <= mend && monday.slice(0, 7) === mend.slice(0, 7) ? true : (sunday > mend ? false : false);
  }
  function ensureTrial() {
    var tr = lsGet(TRIAL_KEY, { month: '', active: false, stages: [], passed: false, rewarded: false, title: '' });
    var m = thisMonth();
    if (tr.month !== m) { tr = { month: m, active: false, stages: [], passed: false, rewarded: false, title: '' }; }
    var active = lastFullWeekActive();
    if (active && !tr.active) {
      var tasks = getTasks().filter(function (t) { return t.type === 'once' && !taskDone(t) && String(t.createdDate || t.createdAt || '').slice(0, 7) === m; });
      var order = { S: 0, A: 1, B: 2, C: 3, D: 4 };
      tasks.sort(function (a, b) { return (order[a.grade] || 9) - (order[b.grade] || 9); });
      tr.active = true;
      tr.stages = tasks.slice(0, 3).map(function (t) { return { taskId: t.id, title: t.title, grade: t.grade, done: false }; });
      // 若当月没有未完成任务，用已完成的历史最高级任务充作已通过关卡
      if (!tr.stages.length) { var doneHi = getTasks().filter(function (t) { return taskDone(t) && ['S', 'A'].indexOf(t.grade) >= 0; }).slice(0, 3); tr.stages = doneHi.map(function (t) { return { taskId: t.id, title: t.title, grade: t.grade, done: true }; }); tr.passed = true; }
    }
    if (!active) tr.active = false;
    lsSet(TRIAL_KEY, tr);
    return tr;
  }
  function refreshTrial() {
    var tr = ensureTrial(); if (!tr.active || tr.passed) return;
    var tasks = getTasks(), changed = false;
    tr.stages.forEach(function (st) {
      if (st.done) return;
      var tk = tasks.filter(function (t) { return t.id === st.taskId; })[0];
      if (tk && taskDone(tk)) { st.done = true; changed = true; }
    });
    if (tr.stages.every(function (s) { return s.done; }) && !tr.passed) {
      tr.passed = true;
      var titles = lsGet('fairytail-titles-v1', { list: [] });
      var cat = tr.stages[0] ? (String(tr.stages[0].title || '') + String(tr.stages[0].grade || '')) : '';
      var tKey = 'general';
      if (WRITE_KEYWORDS.some(function (k) { return cat.indexOf(k) >= 0; })) tKey = 'writing';
      else if (STUDY_KEYWORDS.some(function (k) { return cat.indexOf(k) >= 0; })) tKey = 'research';
      else if (ARCHIVE_KEYWORDS.some(function (k) { return cat.indexOf(k) >= 0; })) tKey = 'archive';
      else if (EXPED_KEYWORDS.some(function (k) { return cat.indexOf(k) >= 0; })) tKey = 'expedition';
      tr.title = S_TITLES[tKey];
      titles.list.push({ name: tr.title, date: today(), from: 'S级升级考试' });
      lsSet('fairytail-titles-v1', titles);
      addBadgeFragments(3, 'S级考核');
      grantJ(500, 'S级升级考试通过');
      addReputation(100);
      toast('🏆 恭喜通过 S 级升级考试！称号「' + tr.title + '」授予 · 500 J · 徽章碎片×3', true);
      changed = true;
    }
    if (changed) lsSet(TRIAL_KEY, tr);
  }

  /* ================= 模块：公会月刊 ================= */
  var MONTHLY_KEY = 'fairytail-monthly-reports-v1';
  function ensureMonthly() {
    var rep = lsGet(MONTHLY_KEY, {}), lm = lastMonth();
    if (rep[lm]) return rep;
    var tasks = getTasks(), from = lm + '-01', to = monthEnd(from);
    var doneIn = tasks.filter(function (t) { return taskDone(t) && completedDate(t) >= from && completedDate(t) <= to; });
    var repObj = { month: lm, generatedAt: today(), completedCount: doneIn.length };
    var dist = {}; doneIn.forEach(function (t) { var g = t.grade || 'C'; dist[g] = (dist[g] || 0) + 1; });
    repObj.gradeDist = dist;
    repObj.earnedJ = doneIn.reduce(function (n, t) { return n + (Number(t.settledJ || t.reward) || 0); }, 0);
    var byMember = {}; doneIn.forEach(function (t) { if (t.assigneeId) { byMember[t.assigneeId] = (byMember[t.assigneeId] || 0) + 1; } });
    var mvp = null, mx = 0; Object.keys(byMember).forEach(function (id) { if (byMember[id] > mx) { mx = byMember[id]; mvp = id; } });
    repObj.mvpId = mvp; repObj.mvpCount = mx;
    var q = lsGet('fairytail-quote-cache-v1', {}); repObj.quote = q.lastQuote || '“今天，也向梦想前进一步。”';
    rep[lm] = repObj; lsSet(MONTHLY_KEY, rep);
    return rep;
  }

  /* ================= 模块：新完成检测（天气津贴 / 周目标 / 事件 / S级 / 羁绊） ================= */
  var GRANT_KEY = 'fairytail-features-granted-v1';
  var lastGranted = null;
  function loadGranted() { return lsGet(GRANT_KEY, { completions: {} }); }
  function checkNewCompletions() {
    try {
      var tasks = getTasks(), g = loadGranted(), w = weatherOf(today()), changed = false;
      var bonusTotal = 0, bonusNames = [];
      tasks.forEach(function (t) {
        if (!taskDone(t) || t.type === 'daily') return;
        var cd = completedDate(t);
        if (!cd || cd !== today()) return;
        var key = t.id + '@' + cd;
        if (g.completions[key]) return;
        g.completions[key] = true; changed = true;
        // 天气津贴
        var wb = weatherBonusFor(w, t.title, t.category);
        if (wb.mul > 1) { var add = Math.round((Number(t.settledJ || t.reward) || 0) * (wb.mul - 1)); if (add > 0) { bonusTotal += add; bonusNames.push(w.name + '加成 +' + add + ' J'); } }
        if (wb.blocked) { /* 雷暴禁止远征：不额外结算 */ }
        // 羁绊点
        if (t.assigneeId) addBond(t.assigneeId, 10);
      });
      if (bonusTotal > 0) grantJ(bonusTotal, '天气津贴 · ' + w.name);
      if (changed) { lsSet(GRANT_KEY, g); if (bonusTotal > 0) toast('🌤 ' + bonusNames.join('、'), true); }
      refreshWeeklyProgress();
      settleEvents();
      refreshTrial();
    } catch (e) { console.warn('[guild-features] refreshFeatureState failed', e); }
  }

  /* ================= 模块：委托速记（手机端一行创建） ================= */
  var QUICK_TIME = [
    { re: /今天|今日|今晚|现在/g, add: 0 }, { re: /明天|明日/g, add: 1 }, { re: /后天/g, add: 2 },
    { re: /大后天/g, add: 3 }, { re: /一周后|七天后/g, add: 7 }, { re: /两周后|十四天后/g, add: 14 },
    { re: /月底|月末/g, add: -2 /* 月末特殊 */ }
  ];
  function parseQuick(text) {
    var res = { due: '', dueTime: '', grade: '', category: '', ok: false, note: '' };
    var s = String(text || '');
    // 级别
    var gm = s.match(/([SABCD])\s*级/);
    if (gm) res.grade = gm[1];
    // 类别
    if (s.indexOf('学习') >= 0 || s.indexOf('课') >= 0 || s.indexOf('复习') >= 0) res.category = '学习';
    else if (s.indexOf('实验') >= 0 || s.indexOf('研究') >= 0) res.category = '实验';
    else if (s.indexOf('生活') >= 0 || s.indexOf('整理') >= 0 || s.indexOf('收纳') >= 0) res.category = '生活';
    // N 天内
    var dm = s.match(/(\d+)\s*天(?:内|后|里)/);
    if (dm) { res.due = addDays(today(), Number(dm[1])); res.dueTime = '23:59'; res.ok = true; res.note = '识别为 ' + dm[1] + ' 天内截止'; }
    // X月X日
    else if ((s.match(/(\d{1,2})月(\d{1,2})日/) || s.match(/(\d{1,2})月(\d{1,2})号/))) { var mm = (s.match(/(\d{1,2})月(\d{1,2})[日号]/)); var md = new Date(); var mo = Number(mm[1]); var dy = Number(mm[2]); var yr = md.getFullYear(); if (mo < md.getMonth() + 1) yr++; res.due = yr + '-' + pad(mo) + '-' + pad(dy); res.ok = true; res.note = '识别为 ' + res.due + ' 截止'; }
    // 下周X / 本周X / 周X
    else if (s.match(/下[周星期]([一二三四五六日天])/)) { var wd = '一二三四五六日天'.indexOf(RegExp.$1) + 1; var mon = weekMonday(addDays(today(), 7)); res.due = addDays(mon, wd - 1); res.ok = true; res.note = '识别为下' + RegExp.$1 + '截止'; }
    else if (s.match(/[本这][周星期]([一二三四五六日天])/)) { var wd2 = '一二三四五六日天'.indexOf(RegExp.$1) + 1; var mon2 = weekMonday(today()); res.due = addDays(mon2, wd2 - 1); if (res.due < today()) res.due = addDays(res.due, 7); res.ok = true; res.note = '识别为本' + RegExp.$1 + '截止'; }
    // 后天/明天/今天
    else if (s.indexOf('大后天') >= 0) { res.due = addDays(today(), 3); res.ok = true; }
    else if (s.indexOf('后天') >= 0) { res.due = addDays(today(), 2); res.ok = true; }
    else if (s.indexOf('明天') >= 0 || s.indexOf('明日') >= 0) { res.due = addDays(today(), 1); res.ok = true; }
    else if (s.indexOf('今天') >= 0 || s.indexOf('今日') >= 0) { res.due = today(); res.ok = true; }
    else if (s.indexOf('月底') >= 0 || s.indexOf('月末') >= 0) { res.due = monthEnd(today()); res.ok = true; res.note = '识别为月底截止'; }
    else if (s.indexOf('周末') >= 0) { var mon3 = weekMonday(today()); res.due = addDays(mon3, 5); if (res.due < today()) res.due = addDays(res.due, 7); res.ok = true; res.note = '识别为本周末截止'; }
    // 时间点（今晚X点/明天下午X点/X点）
    var tm = s.match(/(\d{1,2})\s*(?:点|时)(?:\s*(\d{1,2})分?)?/);
    if (tm) { var hh = Number(tm[1]); var mnt = tm[2] ? Number(tm[2]) : 0; if (hh < 24) { var base = res.due || today(); var dt = new Date(base + 'T00:00:00'); dt.setHours(hh, mnt, 0, 0); if (dt < new Date()) dt.setDate(dt.getDate() + 1); res.dueTime = pad(dt.getHours()) + ':' + pad(dt.getMinutes()); res.due = dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); res.ok = true; res.note = '识别截止 ' + res.due + ' ' + res.dueTime; } }
    if (!res.due) { res.note = '未识别到明确截止时间，请在正式登记台确认'; }
    if (!res.category) res.category = '学习';
    if (!res.grade) res.grade = 'C';
    return res;
  }
  var GRADE_REWARD = { S: 500, A: 200, B: 100, C: 50, D: 20 };
  function quickCreate(text) {
    var title = String(text || '').trim(); if (!title) return;
    var p = parseQuick(title);
    var tasks = getTasks();
    var task = {
      id: 'quick' + Date.now(), title: title, originalText: title, type: 'once',
      category: p.category, due: p.due, dueTime: p.dueTime, reminder: '', reward: GRADE_REWARD[p.grade] || 50,
      grade: p.grade, status: 'active', schemaVersion: 6, dependsOnTaskIds: [],
      createdDate: today(), createdAt: new Date().toISOString(), estimatedMinutes: 0
    };
    tasks.push(task); lsSet('fairytail-tasks-v2', tasks);
    toast('⚡ 委托已登记：' + title + '（' + p.grade + '级 · ' + p.note + '）', true);
    setTimeout(function () { try { location.reload(); } catch (e) { console.warn('[guild-features] reload failed', e); } }, 600);
  }

  /* ================= UI ================= */
  var panelOpen = false;
  function buildStyle() {
    var st = document.createElement('style');
    st.textContent = '#guildFeaturesFab{display:none!important}#guildFeaturesFab{position:fixed;right:14px;bottom:62px;z-index:99997;width:52px;height:52px;border-radius:50%;border:2px solid #efbb87;background:linear-gradient(135deg,#ffdfaa,#ffc07a);color:#8a3d18;font-size:22px;cursor:pointer;box-shadow:0 6px 18px rgba(120,60,20,.35);display:grid;place-items:center}#guildFeaturesPanel{position:fixed;right:14px;bottom:120px;z-index:99996;width:min(330px,86vw);max-height:62vh;overflow:auto;background:rgba(255,250,242,.98);border:1px solid #efcbaa;border-radius:16px;box-shadow:0 10px 34px rgba(80,40,10,.28);padding:14px;display:none;color:#493044;font-size:13px;line-height:1.55}#guildFeaturesPanel.open{display:block}#guildWeatherBanner{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:99995;background:rgba(255,250,242,.96);border:1px solid #eac38e;border-radius:999px;padding:6px 16px;font-size:13px;box-shadow:0 4px 14px rgba(80,40,10,.18);display:flex;gap:8px;align-items:center;color:#5c3a2a;max-width:92vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gf-tab{display:inline-block;padding:6px 12px;border-radius:999px;background:#fff1db;border:1px solid #efcbaa;color:#8a4a24;cursor:pointer;margin:0 4px 8px 0;font-size:12px}.gf-tab.on{background:#f47735;color:#fff;border-color:#f47735}.gf-sec{display:none}.gf-sec.on{display:block}.gf-card{border:1px solid #eed9c0;border-radius:12px;background:#fff;padding:10px 12px;margin:8px 0}.gf-card h4{margin:0 0 5px;color:#9d421b;font-size:14px}.gf-bar{height:7px;background:#eddbd0;border-radius:9px;overflow:hidden;margin:6px 0}.gf-bar>div{height:100%;background:linear-gradient(90deg,#ff7048,#ffb23d);transition:width .3s}.gf-btn{background:#ffdfaa;border:1px solid #efbb87;color:#8a3d18;border-radius:9px;padding:6px 12px;cursor:pointer;font-size:12px}.gf-btn:disabled{opacity:.55;cursor:not-allowed}.gf-ok{color:#2f6b2f}.gf-line{border-top:1px dashed #e5cba8;margin:10px 0}.gf-quick{position:fixed;left:12px;right:12px;bottom:12px;z-index:99994;display:flex;gap:8px;background:rgba(255,250,242,.98);border:1px solid #efcbaa;border-radius:14px;padding:8px;box-shadow:0 6px 20px rgba(80,40,10,.25)}.gf-quick input{flex:1;min-width:0;border:1px solid #e9bbab;border-radius:9px;padding:9px 12px;background:#fffdf8;color:#593544;font:inherit}.gf-quick button{background:#f47735;color:#fff;border:0;border-radius:9px;padding:9px 14px;cursor:pointer;font:inherit}@media(min-width:651px){.gf-quick{display:none}}';
    st.textContent += '@media(max-width:820px){html,body.guild-mobile-v66{width:100%;max-width:100vw;overflow-x:hidden}body.guild-mobile-v66 main{width:100%;max-width:none;padding:10px 9px 28px}body.guild-mobile-v66 #guildWorkspace{width:100%;max-width:100%;min-width:0}body.guild-mobile-v66 header{min-height:0;padding:16px;margin:0 0 10px;border-radius:14px}body.guild-mobile-v66 header h1{font-size:25px;line-height:1.25}body.guild-mobile-v66 .grid{grid-template-columns:minmax(0,1fr)}body.guild-mobile-v66 .card{width:100%;max-width:100%;min-width:0;padding:14px;border-radius:14px}body.guild-mobile-v66 .toolbar{gap:7px;margin:12px 0}body.guild-mobile-v66 button,body.guild-mobile-v66 input,body.guild-mobile-v66 select{max-width:100%;min-height:42px}body.guild-mobile-v66 .project-card,body.guild-mobile-v66 .once-quest-card{min-width:0;overflow:hidden}body.guild-mobile-v66 .project-actions,body.guild-mobile-v66 .project-stage-actions,body.guild-mobile-v66 .once-actions{flex-wrap:wrap!important;justify-content:flex-start!important;min-width:0!important}body.guild-mobile-v66 .guild-sidebar,body.guild-mobile-v66 .guild-content{min-width:0;width:100%;max-width:100%}body.guild-mobile-v66 .guild-hall-scene-tabs{width:100%;max-width:100%;overflow-x:auto}.gf-quick-top{position:sticky!important;top:0!important;left:auto!important;right:auto!important;bottom:auto!important;z-index:10020!important;display:grid!important;grid-template-columns:minmax(0,1fr) auto;width:100%;margin:0 0 10px;padding:8px;background:rgba(255,250,242,.98);border-radius:13px;box-shadow:0 5px 18px rgba(80,40,10,.2);backdrop-filter:blur(8px)}.gf-quick-top input{width:100%;font-size:16px}.gf-quick-top button{white-space:nowrap;padding-inline:12px}}';
    st.textContent += '@media(max-width:820px){#guildWeatherBanner{display:none!important}}';
    document.head.appendChild(st);
  }
  function buildFab() {
    var fab = document.createElement('button');
    fab.id = 'guildFeaturesFab'; fab.textContent = '✦'; fab.title = '公会面板';
    fab.onclick = function () { toggleFeaturesPanel(); };
    document.body.appendChild(fab);
    // 暴露全局桥接，供融合菜单调用
    window.__guildFeaturesToggle = function () { toggleFeaturesPanel(); };
  }
  function toggleFeaturesPanel() {
    panelOpen = !panelOpen;
    var p = document.getElementById('guildFeaturesPanel');
    if (p) p.classList.toggle('open', panelOpen);
    if (panelOpen) refreshFeatureState(true);
  }
  function buildWeatherBanner() {
    var w = weatherOf(today());
    var el = document.createElement('div');
    el.id = 'guildWeatherBanner';
    el.innerHTML = '<span>' + w.icon + '</span><span>今日大陆气候：<b>' + w.name + '</b></span><span class="muted" style="color:#8a6a50">' + w.jNote + '</span>';
    document.body.appendChild(el);
  }
  var activeTab = 'daily';
  var featureStateSignature = '';
  function currentFeatureSignature() {
    var taskPart = getTasks().map(function (task) {
      var stagePart = (task.steps || []).map(function (step) {
        return step && step.done ? '1' : '0';
      }).join('');
      return [
        task.id || '',
        taskDone(task) ? '1' : '0',
        task.status || '',
        completedDate(task) || '',
        task.assigneeId || '',
        stagePart
      ].join(':');
    }).join('|');
    return today() + '|' + taskPart;
  }
  function refreshFeatureState(force) {
    var next = currentFeatureSignature();
    if (!force && next === featureStateSignature) return;
    featureStateSignature = next;
    checkNewCompletions();
    if (panelOpen) renderPanel();
  }
  function buildPanel() {
    var panel = document.createElement('div');
    panel.id = 'guildFeaturesPanel';
    panel.innerHTML = '<div><span class="gf-tab on" data-tab="daily">今日</span><span class="gf-tab" data-tab="board">委托板</span><span class="gf-tab" data-tab="bond">羁绊</span><span class="gf-tab" data-tab="monthly">月刊</span><span class="gf-tab" data-tab="trial">S级</span></div>'
      + '<div class="gf-sec on" data-sec="daily"></div><div class="gf-sec" data-sec="board"></div><div class="gf-sec" data-sec="bond"></div><div class="gf-sec" data-sec="monthly"></div><div class="gf-sec" data-sec="trial"></div>';
    panel.addEventListener('click', function (ev) {
      var tb = ev.target.closest ? ev.target.closest('.gf-tab') : null;
      if (tb) { activeTab = tb.dataset.tab; renderPanel(); }
    });
    document.body.appendChild(panel);
  }
  function secHTML(name) { var p = document.getElementById('guildFeaturesPanel'); if (!p) return ''; var s = p.querySelector('.gf-sec[data-sec="' + name + '"]'); return s ? s.innerHTML : ''; }
  function setSec(name, html) { var p = document.getElementById('guildFeaturesPanel'); if (!p) return; var s = p.querySelector('.gf-sec[data-sec="' + name + '"]'); if (s) s.innerHTML = html; }
  function renderPanel() {
    var p = document.getElementById('guildFeaturesPanel'); if (!p) return;
    var tabs = p.querySelectorAll('.gf-tab');
    tabs.forEach(function (t) { t.classList.toggle('on', t.dataset.tab === activeTab); });
    var secs = p.querySelectorAll('.gf-sec');
    secs.forEach(function (s) { s.classList.toggle('on', s.dataset.sec === activeTab); });
    try { renderDaily(); renderBoard(); renderBond(); renderMonthly(); renderTrial(); } catch (e) { console.warn('[guild-features] render panels failed', e); }
  }
  function renderDaily() {
    var a = attendance(), t = today(), w = weatherOf(t), evs = ensureDailyEvents();
    var claimed = a.claimDate === t;
    var rw = attendanceReward(a.streak + 1);
    var html = '<div class="gf-card"><h4>✦ 公会出勤簿</h4>';
    html += '<div>累计出勤 <b>' + a.total + '</b> 天 · 当前连续 <b>' + a.streak + '</b> 天</div>';
    html += '<div class="gf-bar"><div style="width:' + (a.streak % 7) * 14 + '%"></div></div>';
    html += claimed ? '<div class="gf-ok">✓ 今日已签到（第 ' + a.streak + ' 天）</div>' : '<button class="gf-btn" id="gfClaimBtn">📖 签到（今日可得 ' + rw.j + ' J' + (rw.frag ? ' · 碎片×' + rw.frag : '') + '）</button>';
    html += '<small>连续 7 天可得 500 J + 徽章碎片；断签清零，累计保留。</small></div>';
    html += '<div class="gf-card"><h4>🌤 今日大陆气候 · ' + w.name + '</h4><div>' + w.icon + ' ' + w.jNote + '</div></div>';
    html += '<div class="gf-card"><h4>✨ 公会日常</h4>';
    evs.forEach(function (ev) {
      html += '<div style="margin:6px 0">' + (ev.done ? '<span class="gf-ok">✓</span> ' : '◇ ') + '<b>' + esc(ev.title) + '</b>' + (ev.done ? ' <span class="gf-ok">已完成</span>' : '') + '<br><small>' + esc(ev.desc) + '（' + ev.rewardJ + ' J · 羁绊 +' + ev.bond + '）</small></div>';
    });
    html += '</div>';
    setSec('daily', html);
    var btn = document.getElementById('gfClaimBtn');
    if (btn) btn.onclick = function () { claimAttendance(); renderDaily(); };
  }
  function renderBoard() {
    var w = ensureWeekly();
    var html = '<div class="gf-card"><h4>✦ 公会委托板 · 本周目标</h4>';
    html += '<small>本周：' + w.week + ' 起 · ' + (w.allDone ? '<b class="gf-ok">全部达成！</b>' : '达成全部目标 +100 J · 公会声望 +50') + '</small>';
    w.goals.forEach(function (g) {
      var pct = Math.min(100, Math.round(g.current / g.target * 100));
      html += '<div style="margin:8px 0"><div>' + (g.done ? '<span class="gf-ok">✓</span> ' : '◇ ') + esc(g.label) + ' <small>' + g.current + ' / ' + g.target + '</small></div><div class="gf-bar"><div style="width:' + pct + '%"></div></div></div>';
    });
    html += '</div>';
    setSec('board', html);
  }
  function renderBond() {
    ensureBondBase();
    var b = GBS.read(), ids = Object.keys(b).filter(function (k) { return k !== '__v4Migrated' && b[k] && b[k].points > 0; }).sort(function (x, y) { return b[y].points - b[x].points; });
    var html = '<div class="gf-card"><h4>💛 羁绊之书</h4>';
    if (!ids.length) { html += '<div class="muted">与公会伙伴共同完成委托，羁绊将在这里开花。</div>'; }
    ids.slice(0, 8).forEach(function (id) {
      var p = b[id], meta = bondLevelMeta(p.points);
      html += '<div style="margin:8px 0"><div><b>' + memberName(id) + '</b> · Lv.' + meta.lv + ' ' + esc(meta.name) + ' <small>（' + p.points + ' 羁绊点）</small></div><div class="gf-bar"><div style="width:' + meta.pct + '%"></div></div>';
      var lines = linesFor(id, p.unlocked || 0);
      if (lines.length) { lines.forEach(function (ln) { html += '<small style="display:block;color:#8a6a50;margin:3px 0">' + esc(ln) + '</small>'; }); }
      html += '</div>';
    });
    html += '</div>';
    setSec('bond', html);
  }
  function renderMonthly() {
    var rep = ensureMonthly();
    var html = '<div class="gf-card"><h4>📖 公会月刊</h4>';
    var months = Object.keys(rep).sort().reverse();
    if (!months.length) { html += '<div class="muted">下月 1 号将自动生成首期公会月刊。</div>'; }
    months.slice(0, 3).forEach(function (m) {
      var r = rep[m];
      var dist = Object.keys(r.gradeDist || {}).map(function (g) { return g + '×' + r.gradeDist[g]; }).join(' · ') || '—';
      html += '<div style="margin:8px 0;border-top:1px dashed #e5cba8;padding-top:8px"><b>' + m + '</b><br><small>完成 ' + r.completedCount + ' 件（' + dist + '）· 赚取 ' + r.earnedJ + ' J' + (r.mvpId ? ' · 本月 MVP：' + memberName(r.mvpId) + '（' + r.mvpCount + ' 次）' : '') + '</small><br><small style="color:#8a6a50">' + esc(r.quote) + '</small></div>';
    });
    html += '</div>';
    setSec('monthly', html);
  }
  function renderTrial() {
    var tr = ensureTrial();
    var html = '<div class="gf-card"><h4>⚡ S级升级考试</h4>';
    if (!tr.active) { html += '<div class="muted">每月最后一个完整周开放。当月最难的三份委托，就是你的试炼。</div>'; }
    else if (tr.passed) { html += '<div class="gf-ok">🏆 已通过 S 级考核！称号「' + esc(tr.title) + '」</div>'; }
    else {
      tr.stages.forEach(function (st) {
        html += '<div style="margin:6px 0">' + (st.done ? '<span class="gf-ok">✓</span> ' : '◇ ') + esc(st.title) + ' <small>（' + (st.grade || '') + '级）</small></div>';
      });
      html += '<small>完成全部关卡，授予 S 级称号 + 500 J + 徽章碎片×3。</small>';
    }
    html += '</div>';
    var titles = lsGet('fairytail-titles-v1', { list: [] });
    if (titles.list.length) {
      html += '<div class="gf-card"><h4>🏅 已获称号</h4>';
      titles.list.slice(-6).reverse().forEach(function (t2) { html += '<div>· ' + esc(t2.name) + ' <small>（' + t2.date + '）</small></div>'; });
      html += '</div>';
    }
    var frag = fragments();
    html += '<div class="gf-card"><h4>🔮 徽章碎片</h4><div>当前 ' + frag.count + ' / 5 —— 集满 5 枚自动合成 S 级徽章。</div></div>';
    setSec('trial', html);
  }
  function buildQuickBar() {
    var q = document.createElement('div');
    q.className = 'gf-quick gf-quick-top';
    q.setAttribute('aria-label', '快速登记委托');
    q.innerHTML = '<input id="gfQuickInput" type="text" placeholder="快速登记：周五17:00前提交报告" maxlength="180"><button id="gfQuickBtn" type="button">整理</button>';
    var btn = q.querySelector('#gfQuickBtn');
    function useOfficialIntake() {
      var inp = q.querySelector('#gfQuickInput'), raw = String(inp.value || '').trim();
      if (!raw) { inp.focus(); return; }
      var official = document.querySelector('#quickIntake input');
      var organize = document.querySelector('#quickIntake button');
      if (!official || !organize) { toast('正式登记台尚未准备好，请稍后再试。', false); return; }
      official.value = raw;
      official.dispatchEvent(new Event('input', { bubbles: true }));
      organize.click();
      var target = document.querySelector('#quickIntake') || document.querySelector('#form');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      inp.value = '';
    }
    btn.onclick = useOfficialIntake;
    var inp = q.querySelector('#gfQuickInput');
    inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); useOfficialIntake(); } });
    document.body.classList.add('guild-mobile-v66');
    var main = document.querySelector('main');
    if (main) main.insertBefore(q, main.firstChild); else document.body.insertBefore(q, document.body.firstChild);
  }

  /* ================= 启动 ================= */
  function start() {
    try { buildStyle(); buildFab(); buildWeatherBanner(); buildPanel(); buildQuickBar(); } catch (e) { console.warn('[guild-features] build UI failed', e); }
    // 初始化
    try {
      ensureWeekly();
      refreshWeeklyProgress();
      ensureDailyEvents();
      ensureTrial();
      ensureMonthly();
      ensureBondBase();
      checkNewCompletions();
      featureStateSignature = currentFeatureSignature();
      renderPanel();
    } catch (e) { console.error('[guild-features] start failed', e); }
    setInterval(function () {
      try { refreshFeatureState(false); } catch (e) { console.warn('[guild-features] periodic refresh failed', e); }
    }, 30000);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 400); });
  } else { setTimeout(start, 400); }
})();
