// ============================================================
// 妖精的尾巴 · 三端云同步桥
// 不改动 schedule.js，通过 hook localStorage 实现云端镜像
// 模式：
//   demo      → 本地演示服务器（localhost:8787），先看效果
//   cloudbase → 腾讯云开发 CloudBase（免费体验版，真云端）
// 使用：填好下方 cloudbase 凭据，将 mode 改为 'cloudbase' 即可
// ============================================================
(function () {
  'use strict';

  var CONFIG = {
    mode: 'cloudbase', // 'demo' | 'cloudbase'
    // demo 演示服务器（cloud-server.js）
    demoEndpoint: 'http://localhost:8787/api/sync',
    // CloudBase 凭据（云开发平台 → 身份认证 → API Key 管理 创建）
    cloudbaseEnvId: 'fairytail-guild-d4f1qjyd1c3ba45b',
    cloudbaseApiKey: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjlkMWRjMzFlLWI0ZDAtNDQ4Yi1hNzZmLWIwY2M2M2Q4MTQ5OCJ9.eyJpc3MiOiJodHRwczovL2ZhaXJ5dGFpbC1ndWlsZC1kNGYxcWp5ZDFjM2JhNDViLmFwLXNoYW5naGFpLnRjYi1hcGkudGVuY2VudGNsb3VkYXBpLmNvbSIsInN1YiI6ImFub24iLCJhdWQiOiJmYWlyeXRhaWwtZ3VpbGQtZDRmMXFqeWQxYzNiYTQ1YiIsImV4cCI6NDA5NDEyNzM4OCwiaWF0IjoxNzkwNDQ0MTg4LCJub25jZSI6Im42RDRxSEg1UkpHMWV4RXZmTDBNcFEiLCJhdF9oYXNoIjoibjZENHFISDVSSkcxZXhFdmZMME1wUSIsIm5hbWUiOiJBbm9ueW1vdXMiLCJzY29wZSI6ImFub255bW91cyIsInByb2plY3RfaWQiOiJmYWlyeXRhaWwtZ3VpbGQtZDRmMXFqeWQxYzNiYTQ1YiIsIm1ldGEiOnsicGxhdGZvcm0iOiJQdWJsaXNoYWJsZUtleSJ9LCJ1c2VyX3R5cGUiOiIiLCJjbGllbnRfdHlwZSI6ImNsaWVudF91c2VyIiwiaXNfc3lzdGVtX2FkbWluIjpmYWxzZX0.J6ejkoVFv2v4Xvay0NfAgT1e9J_b9szaF2J0e0fIpa0J2OV-DO4GkmHaUvDKLrw1--mCwadJFKSmj1LjxRdkytVft67bBZfpBSJVzGgW3qSBbDNJUT50w-NKFBkOj4aKjIbrO0rzXQ1K31Thn-w3PZaAtBP7e1tfH54KWUK2SeJ-PsGXVihWaW7Mnw3S_5sDDEM5CJt1Oj5ubHoifYHv3b6O6j7Ts-SjBYIQTUzJ-1-SE7eK2c-NuCrq1St5k84oAK-lO5wNRL8bMpELTq-Hbh8ojNkUc6GJhD6-MIK-1XFaLQ0BJ6oqom0phI1OjBfdQNo-s245xJMYAtrGhoUxyw', // ← Publishable Key（客户端密钥）
    cloudbaseCollection: 'guildcloudsync', // 云端集合名（需在控制台数据库页新建同名集合）
    // 云函数同步通道（2026-09-29 上线，替代直连 API/本地代理：手机与电脑统一走此 URL，CORS 全放行）
    syncApiUrl: 'https://fairytail-guild-d4f1qjyd1c3ba45b-1496526010.ap-shanghai.app.tcloudbase.com/sync',
    // 参与云同步的数据 key（页面全部核心数据）
    syncKeys: [
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
  var dirty = new Set();
  var pushTimer = null;
  var lastPullAt = 0;
  var online = false;
  var hookInstalled = false;
  var cbWriteQueue = Promise.resolve();
  // 方案 A（省额度）：轮询从 60s 放宽到 5 分钟，且仅页面可见时轮询；
  // 打开页面 / 回到前台 / 点击浮标时立即拉一次，切后台或离开页面前立即 flush 推送。
  var PULL_INTERVAL = 5 * 60 * 1000;

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

  // ---------- 同步状态浮标（统一：顶部 connectionBadge，真实云端状态驱动） ----------
  function ensureBadge() {
    var b = document.getElementById('connectionBadge');
    if (!b) return;
    if (b.getAttribute('data-cloud-bound') === '1') return;
    b.setAttribute('data-cloud-bound', '1');
    b.style.cursor = 'pointer';
    b.title = '单击=立即刷新；双击=切换自动刷新';
    b.onclick = function () { location.reload(); };
    b.ondblclick = function (ev) {
      ev.stopPropagation();
      var off = (localStorage.getItem('guildAutoRefresh') || 'on') === 'off';
      localStorage.setItem('guildAutoRefresh', off ? 'on' : 'off');
      showNotice(off ? '自动刷新：已开启（收到新数据自动刷新）' : '自动刷新：已关闭（只提示，单击状态标识手动刷新）');
    };
    setBadge('云端：连接中…', false);
  }
  function setBadge(text, ok) {
    var b = document.getElementById('connectionBadge');
    if (!b) return;
    var label = b.querySelector('.label-text');
    if (label) label.textContent = text;
    var cls = 'guild-connection-badge';
    if (text.indexOf('连接中') !== -1) cls += ' syncing';
    else if (ok) cls += ' online';
    else cls += ' offline';
    b.className = cls;
    b.title = '单击=立即刷新；双击=切换自动刷新';
  }
  function showNotice(text) {
    ensureBadge();
    var b = document.getElementById('connectionBadge');
    if (!b) return;
    var label = b.querySelector('.label-text');
    if (label) label.textContent = text;
    b.className = 'guild-connection-badge syncing';
    setTimeout(function () { setBadge(online ? '云端：已同步' : '云端：离线（本地数据待同步）', online); }, 2000);
  }

  // ---------- 推送（本地 → 云端） ----------
  function schedulePush() {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 800); // 防抖 0.8s
  }
  function retryEntries(entries) {
    (entries || []).forEach(function (entry) {
      if (entry && entry.key) dirty.add(entry.key);
    });
    online = false;
    setBadge('云端：离线（本地数据待同步）', false);
    setTimeout(push, 3500 + Math.floor(Math.random() * 3000));
  }

  function push() {
    if (!dirty.size) return;
    var entries = [];
    dirty.forEach(function (k) {
      var v = localStorage.getItem(k);
      if (v === null) return;
      entries.push({ key: k, value: v, updatedAt: localTimeOf(k) || Date.now() });
    });
    dirty.clear();

    var payload = { entries: entries };
    var url, headers = { 'Content-Type': 'application/json' };

    if (CONFIG.mode === 'cloudbase' && CONFIG.cloudbaseApiKey) {
      cbPush(entries)
        .then(function () { online = true; setBadge('云端：已同步', true); })
        .catch(function () {
          // 降级：先拉后推失败（通常是 cbPull 网络波动），跳过合并直接推
          cbPushNow(entries.slice())
            .then(function () { online = true; setBadge('云端：已同步（降级直推）', true); })
            .catch(function () { retryEntries(entries); });
        });
      return;
    }

    // demo 模式
    fetch(CONFIG.demoEndpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); })
      .then(function () { online = true; setBadge('云端：已同步', true); })
      .catch(function () { online = false; setBadge('云端：离线（本地模式）', false); });
  }

  // ---------- 拉取（云端 → 本地） ----------
  function pull() {
    var url;
    var headers = {};

    if (CONFIG.mode === 'cloudbase' && CONFIG.cloudbaseApiKey) {
      return cbPull()
        .then(function (list) {
          applyRemote(list);
          return list;
        })
        .catch(function (error) {
          online = false;
          setBadge('云端：读取失败（本地模式）', false);
          throw error;
        });
    }

    return fetch(CONFIG.demoEndpoint + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (list) { applyRemote(list); return list; })
      .catch(function (error) {
        online = false;
        setBadge('云端：读取失败（本地模式）', false);
        throw error;
      });
  }

  // ---------- 云端通道（本地页面→本地门户代理 / 线上页面→直连 CloudBase） ----------
  function isLocal() {
    try {
      var proto = window.location.protocol;
      if (proto === 'file:') return true;
      var h = window.location.hostname;
      if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
    } catch (e) { console.warn('[guild-cloud] isLocal check failed', e); }
    return false;
  }
  function cbDocsUrl() {
    return 'https://' + CONFIG.cloudbaseEnvId + '.api.tcloudbasegateway.com/v1/database/instances/(default)/databases/(default)/collections/' + CONFIG.cloudbaseCollection + '/documents';
  }
  function checkedJson(response, label) {
    if (!response || !response.ok) {
      throw new Error(label + '失败：HTTP ' + (response ? response.status : '无响应'));
    }
    return response.text().then(function (text) {
      if (!text) return {};
      try { return JSON.parse(text); }
      catch (e) { throw new Error(label + '返回了无效 JSON'); }
    });
  }
  function cbPushNow(entries) {
    if (!entries || !entries.length) return Promise.resolve({ list: [] });
    // syncfn 已修复为顶层 upsert。单次 POST 避免 DELETE 与重建之间出现短暂缺键，
    // 并保留回读校验，确保服务器实际保存了本次值。
    return fetch(CONFIG.syncApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: entries })
    }).then(function (response) {
      return checkedJson(response, '云端写入记录');
    }).then(function () {
      return cbPull();
    }).then(function (list) {
      entries.forEach(function (entry) {
        var matches = list.filter(function (item) { return item.key === entry.key; });
        if (matches.length !== 1 || matches[0].value !== entry.value) {
          throw new Error('云端写后校验失败：' + entry.key);
        }
      });
      return { list: list };
    });
  }
  function cbPush(entries) {
    var snapshot = (entries || []).map(function (entry) {
      return { key: entry.key, value: entry.value, updatedAt: entry.updatedAt };
    });
    var run = function () {
      // 删除旧记录前再读取一次云端，避免本机写入把另一台设备刚新增的任务整包抹掉。
      return cbPull().then(function (remoteList) {
        var remoteByKey = {}, remoteTasks = null;
        (remoteList || []).forEach(function (item) {
          remoteByKey[item.key] = item;
          if (item.key === 'fairytail-tasks-v2') remoteTasks = item;
        });
        snapshot.forEach(function (entry) {
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
          Storage.prototype.setItem.call(localStorage, entry.key, mergedRaw);
          markLocalWrite(entry.key, entry.updatedAt);
        });
        return cbPushNow(snapshot);
      });
    };
    cbWriteQueue = cbWriteQueue.then(run, run);
    return cbWriteQueue;
  }
  function cbPull() {
    // 手机/电脑统一走云函数通道（GET 拉取，已含 CORS 头）
    return fetch(CONFIG.syncApiUrl + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var list = (j && Array.isArray(j.list)) ? j.list : [];
        return list.map(function (x) {
          return { key: x.key, value: x.value, updatedAt: numFromEJSON(x.updatedAt) };
        });
      });
  }

  // ---------- 方案 B：轻量时间戳探测（~1KB，替代全量轮询） ----------
  function cbMeta() {
    return fetch(CONFIG.syncApiUrl + '?meta=1&t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var meta = (j && j.meta && typeof j.meta === 'object') ? j.meta : null;
        return meta; // { key: updatedAt }
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
  // 懒轮询：先 meta 探测，云端确有更新才发起全量拉取；无更新则零流量
  function pullLazy(retryCount) {
    retryCount = retryCount || 0;
    return cbMeta().then(function (meta) {
      if (metaNeedsPull(meta)) {
        return cbPull().then(function (list) {
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
          .then(function () { return pullLazy(1); });
      }
      online = false;
      setBadge('云端：读取失败（本地模式）', false);
      throw error;
    });
  }

  // ---------- CloudBase EJSON 数值还原 ----------
  function numFromEJSON(v) {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { var n = Number(v); return isNaN(n) ? 0 : n; }
    if (typeof v === 'object') {
      if (v['$numberLong'] !== undefined) { var a = Number(v['$numberLong']); return isNaN(a) ? 0 : a; }
      if (v['$numberInt'] !== undefined) { var b = Number(v['$numberInt']); return isNaN(b) ? 0 : b; }
      if (v['$date'] !== undefined) {
        if (typeof v['$date'] === 'number') return v['$date'];
        if (v['$date']['$numberLong'] !== undefined) { var c = Number(v['$date']['$numberLong']); return isNaN(c) ? 0 : c; }
      }
    }
    return 0;
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
    if (!local || !remote || Array.isArray(local) || Array.isArray(remote)) return localRaw;
    var merged = Object.assign({}, preferLocal ? remote : local, preferLocal ? local : remote);
    if (key === 'fairytail-wallet-v1') {
      merged.redemptions = mergeRecordArrays(local.redemptions, remote.redemptions, preferLocal);
      merged.bonus = mergeRecordArrays(local.bonus, remote.bonus, preferLocal);
    } else if (key === 'fairytail-growth-v1') {
      merged.entries = Object.assign({}, preferLocal ? remote.entries : local.entries, preferLocal ? local.entries : remote.entries);
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
        if (lDone && !rDone) { map[t.id].src = 'l'; }
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
      task.steps = combined;
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
      cbPush(pushed).then(function () { online = true; setBadge('云端：已同步', true); })
        .catch(function () { retryEntries(pushed); });
    }
  }
  function showGuildConflictDialog(remoteList, conflict) {
    if (document.getElementById('guildConflictDialog')) return;
    var dlg = document.createElement('dialog');
    dlg.id = 'guildConflictDialog';
    dlg.style.cssText = 'border:1px solid #d98a4a;border-radius:16px;background:#fffaf0;color:#4a3b48;padding:0;max-width:430px;width:92vw;box-shadow:0 18px 60px rgba(80,40,20,.35);font-family:"Microsoft YaHei",sans-serif;';
    var wrap = document.createElement('div');
    wrap.style.cssText = 'padding:18px 20px;';
    var h = document.createElement('h3');
    h.style.cssText = 'margin:0 0 6px;color:#9d421b;font-size:18px;';
    h.textContent = '⚖ 议会·双卷核对';
    var sub = document.createElement('p');
    sub.style.cssText = 'margin:0 0 12px;font-size:12px;color:#705768;line-height:1.6;';
    sub.textContent = '云端委托板副本与本地公会档案出现了分歧。请选择保留哪一边，避免记录丢失。';
    var grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0;';
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
      box.style.cssText = 'border:1px solid #e5cdb5;border-radius:10px;background:#fff;padding:10px 12px;font-size:12px;line-height:1.7;';
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
    diffList.style.cssText = 'margin:10px 0 12px;padding:9px 12px;border:1px dashed #d9a257;border-radius:9px;background:#fff6e6;font-size:12px;line-height:1.7;color:#705768;';
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
    note.style.cssText = 'margin:0 0 12px;font-size:11px;color:#806574;line-height:1.6;';
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
      base + 'border:1px solid #e5cdb5;background:#fff;color:#705768;',
      function () {
        CONFIG.syncKeys.forEach(function (k) { var v = localStorage.getItem(k); if (v !== null) markLocalWrite(k, Date.now() + 1000); });
        var entries = [];
        CONFIG.syncKeys.forEach(function (k) { var v = localStorage.getItem(k); if (v !== null) entries.push({ key: k, value: v, updatedAt: localTimeOf(k) }); });
        if (entries.length) {
          cbPush(entries).then(function () { online = true; setBadge('云端：已同步', true); })
            .catch(function () { retryEntries(entries); });
        }
      }));
    actions.appendChild(btn('以云端为准（本地先备份再覆盖）',
      base + 'border:1px solid #e5cdb5;background:#fff;color:#705768;',
      function () {
        backupLocalToStorage();
        applyRemote(remoteList);
      }));
    actions.appendChild(btn('逐条取新（两边都保留，推荐）',
      base + 'border:1px solid #dd6130;background:#ef7135;color:#fff;font-weight:700;',
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
  var lastReloadAt = Date.now();
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
    try {
      if (typeof all === 'function') {
        all();
        setBadge('云端：已同步', true);
        showNotice('已同步其他设备的新委托');
        return;
      }
    } catch (e) { console.warn('静默刷新失败：', e); }
    location.reload();
  }
  function applyRemote(list) {
    var changed = false, taskChanged = false;
    var origSet = Storage.prototype.setItem;
    (list || []).forEach(function (r) {
      if (!CONFIG.syncKeys.indexOf) return;
      if (CONFIG.syncKeys.indexOf(r.key) === -1) return;
      if (!r.value) return;
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
              cbPush([protectedEntry])
                .then(function () { online = true; setBadge('云端：已同步', true); })
                .catch(function () { retryEntries([protectedEntry]); });
              return; // 跳过常规整包覆盖
            }
          }
        }
        if (!changed) backupLocalToStorage();
        origSet.call(localStorage, r.key, r.value);
        markLocalWrite(r.key, Number(r.updatedAt));
        changed = true;
        if (r.key === 'fairytail-tasks-v2') taskChanged = true;
      }
    });
    online = true;
    setBadge('云端：已同步', true);
    if (changed) {
      var now = Date.now();
      var autoRefresh = (localStorage.getItem('guildAutoRefresh') || 'on') !== 'off';
      // 只有委托数据（fairytail-tasks-v2）变化才整页自动刷新（15 秒防抖、输入中不刷新）；
      // 其他数据（场景/天气/档案等）变化只提示，避免每次加载微变导致设备间无限循环刷屏。
      if (taskChanged) {
        if (autoRefresh && now - lastReloadAt > 15000 && !inputBusy()) {
          lastReloadAt = now;
          showNotice('收到其他设备的新委托，正在后台同步…');
          setTimeout(function () {
            if (inputBusy()) { showNotice('检测到你正在输入，暂缓自动刷新（可点上方状态标识手动刷新）'); return; }
            silentRefresh();
          }, 1200);
        } else {
          showNotice('云端有新委托，点击上方状态标识手动刷新');
        }
      } else {
        showNotice('其他数据已同步，点击上方状态标识可刷新页面');
      }
    }
  }

  // ---------- hook localStorage ----------
  function installHook() {
    if (hookInstalled) return;
    hookInstalled = true;
    var origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      origSet.call(this, key, value);
      if (CONFIG.syncKeys.indexOf(key) !== -1) {
        markLocalWrite(key, Date.now());
        dirty.add(key);
        schedulePush();
      }
    };
    // 本地时间戳单独记录，避免 setItem 触发推送循环
  }

  // ---------- 全量推送（首次上云/启动兜底） ----------
  var _fullPushTimeout = null;
  function fullPush() {
    // 全量推送走 cbWriteQueue 串行化，避免与增量 cbPush 并发交错
    var run = function () {
    var entries = [];
    CONFIG.syncKeys.forEach(function (k) {
      var v = localStorage.getItem(k);
      if (v !== null) { entries.push({ key: k, value: v, updatedAt: localTimeOf(k) || Date.now() }); }
    });
    if (!entries.length) return Promise.resolve();
    var headers = { 'Content-Type': 'application/json' };

    if (CONFIG.mode === 'cloudbase' && CONFIG.cloudbaseApiKey) {
      // 智能：先拉云端，只推送云端缺失或本地更新的 key，避免无谓抬时间戳。
      // 2026-09-30 修复：委托数据（tasks-v2）强制按"本地为准 + 合并云端"推送——
      // 旧代码时代本地时间戳停滞导致云端始终收不到本地完成记录，两端数据长期不一致。
      return cbPull().then(function (remoteList) {
        var remoteMap = {};
        var remoteTasks = null;
        (remoteList || []).forEach(function (r) {
          remoteMap[r.key] = r;
          if (r.key === 'fairytail-tasks-v2') remoteTasks = r.value;
        });
        var need = [];
        entries.forEach(function (entry) {
          var remote = remoteMap[entry.key];
          if (entry.key !== 'fairytail-tasks-v2') {
            if (!remote || Number(remote.updatedAt) < entry.updatedAt) need.push(entry);
            return;
          }
          var pLocal = parseJsonSafe(entry.value, []);
          var pRemote = parseJsonSafe(remoteTasks, []);
          var rT = remote ? Number(remote.updatedAt) || 0 : 0;
          var pMerged = mergeTaskArrays(pLocal, pRemote, entry.updatedAt >= rT);
          var mergedRaw = JSON.stringify(pMerged);
          if (mergedRaw !== entry.value) {
            Storage.prototype.setItem.call(localStorage, entry.key, mergedRaw);
          }
          if (!remote || mergedRaw !== remote.value) {
            var nextTime = Math.max(Date.now(), entry.updatedAt || 0, rT + 1);
            markLocalWrite(entry.key, nextTime);
            need.push({ key: entry.key, value: mergedRaw, updatedAt: nextTime });
          } else if (rT > entry.updatedAt) {
            markLocalWrite(entry.key, rT);
          }
        });
        if (!need.length) { online = true; setBadge('云端：已同步', true); return; }
        return cbPush(need)
          .then(function () { online = true; setBadge('云端：已同步', true); })
          .catch(function () { retryEntries(need); });
      }).catch(function () {
        // 无法读取云端时不能盲目全量推送，否则旧设备可能覆盖较新的云端档案。
        online = false;
        setBadge('云端：读取失败，已保留本地数据', false);
      });
    }

    var payload = { entries: entries };
    return fetch(CONFIG.demoEndpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); })
      .then(function () { online = true; setBadge('云端：已同步', true); })
      .catch(function () { online = false; setBadge('云端：离线（本地模式）', false); });
    };
    // 超时保护：15 秒后强制解锁
    cbWriteQueue = cbWriteQueue.then(run, run);
    _fullPushTimeout = setTimeout(function () { _fullPushTimeout = null; }, 15000);
    return cbWriteQueue;
  }

  // ---------- 启动 ----------
  function start() {
    ensureBadge();
    installHook();
    // 打开页面：立即全量拉一次，再补传确实较新的本地 key。
    // 读取失败时保持纯本地模式，绝不把旧设备整包覆盖到云端。
    setTimeout(function () {
      pull().then(fullPush).catch(function (e) { console.warn('[guild-cloud] startup sync failed', e); });
    }, 300);
    // 方案 A+B：5 分钟懒轮询，仅页面可见时执行，且先走轻量 meta 探测（~1KB），
    // 云端确有更新才全量拉取；不可见时完全停止轮询。
    setInterval(function () {
      if (document.hidden) return;
      pullLazy().catch(function (e) { console.warn('[guild-cloud] polling pull failed', e); });
    }, PULL_INTERVAL);
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
