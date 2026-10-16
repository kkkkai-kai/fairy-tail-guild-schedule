/* Calendar export and page-open reminders. No background scheduler or calendar-account access. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.GuildCalendar = api; api.install(root); }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const ONLINE = 'https://kkkkai-kai.github.io/fairy-tail-guild-schedule/';
  const LOG_KEY = 'fairytail-calendar-delivery-v207';
  const PREF_KEY = 'fairytail-alert-pref-v196';
  const closed = item => !item || !!item.done || ['completed', 'cancelled', 'archived'].includes(item.status);
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    const d = new Date(value + 'T00:00:00Z');
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === value;
  }
  function parseTime(value) {
    const m = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d{1,3})?)?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)?$/.exec(value || '');
    if (!m || !validDate(m[1])) return NaN;
    return Date.parse(value + (m[4] ? '' : '+08:00'));
  }
  function shanghaiInput(stamp) {
    return Number.isFinite(stamp) ? new Date(stamp + 8 * 3600000).toISOString().slice(0, 16) : '';
  }
  const utc = stamp => new Date(stamp).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const text = value => String(value || '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  function fold(line) {
    let out = '', part = '', size = 0;
    for (const char of line) {
      const bytes = new TextEncoder().encode(char).length;
      if (size + bytes > 75) { out += part + '\r\n'; part = ' '; size = 1; }
      part += char; size += bytes;
    }
    return out + part;
  }
  function target(task, stageId) {
    if (!task || !task.id) throw Error('这项委托已不存在，请刷新后重试。');
    const item = stageId ? (task.steps || []).find(s => s.id === stageId) : task;
    if (!item) throw Error('这个阶段已移除，请重新打开委托。');
    return item;
  }
  function fingerprint(task, stageId) {
    const item = target(task, stageId);
    return JSON.stringify([task.id, task.title, task.done, task.status, stageId || '', item.title, item.done, item.status, item.due || '', item.dueTime || '', item.reminder || '']);
  }
  function taskURL(taskId, stageId, base = ONLINE) {
    const url = new URL(base);
    url.hash = 'guild-task=' + encodeURIComponent(taskId) + (stageId ? '&stage=' + encodeURIComponent(stageId) : '');
    return url.href;
  }
  function calendar(task, stageId, now = Date.now()) {
    const item = target(task, stageId);
    if (closed(task) || closed(item)) throw Error('这项委托或阶段已经结束，不再导出新的日历提醒。');
    if (!validDate(item.due)) throw Error('请先在委托中设置明确的截止日期；不会自动编造时间。');
    const name = stageId ? task.title + ' · ' + item.title : task.title;
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fairy Tail Guild//Quest Calendar//ZH', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:' + encodeURIComponent(JSON.stringify([String(task.id), stageId || ''])) + '@fairy-tail-guild', 'DTSTAMP:' + utc(now), 'SUMMARY:' + text(name)];
    if (item.dueTime) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.dueTime)) throw Error('截止时间格式不正确，请先修订为小时和分钟。');
      lines.push('DTSTART:' + utc(parseTime(item.due + 'T' + item.dueTime)));
    } else {
      lines.push('DTSTART;VALUE=DATE:' + item.due.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + new Date(Date.parse(item.due + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10).replace(/-/g, ''));
    }
    const url = taskURL(task.id, stageId);
    lines.push('TRANSP:TRANSPARENT', 'URL:' + url, 'DESCRIPTION:' + text('公会委托截止记录。' + (item.dueTime ? '截止时刻以北京时间记录。' : '未设置具体时刻，显示为全天事项。') + '\n打开原委托：' + url + '\n这是手动导入的副本。改期、完成或取消后，请在苹果日历中同步修改或删除；网页无法自动撤回。'));
    const reminder = parseTime(item.reminder);
    if (Number.isFinite(reminder) && reminder > now) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER;VALUE=DATE-TIME:' + utc(reminder), 'DESCRIPTION:' + text(name), 'END:VALARM');
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }
  function pending(tasks, log, now) {
    const out = [];
    (tasks || []).forEach(task => {
      if (closed(task)) return;
      [task, ...(task.steps || [])].forEach(item => {
        if (closed(item)) return;
        const at = parseTime(item.reminder), stageId = item === task ? '' : item.id;
        if (!Number.isFinite(at) || !item.id || at > now || now - at > 86400000) return;
        const key = JSON.stringify([task.id, stageId, item.reminder]);
        if (log[key]) return;
        out.push({key, at, taskId:task.id, stageId, title:item === task ? task.title : task.title + ' · ' + item.title});
      });
    });
    return out.sort((a, b) => a.at - b.at);
  }
  function install(win) {
    const doc = win.document;
    let dialog, active, opener, polling = false, lastLink = '', activeNotice;
    const desktopNotifications = new Map();
    const bridge = () => win.guildCalendarTaskBridge;
    const read = (key, fallback) => { try { return JSON.parse(win.localStorage.getItem(key)) || fallback; } catch { return fallback; } };
    const tasks = () => bridge()?.list() || [];
    const get = (id, stageId) => { const task = tasks().find(t => t.id === id); target(task, stageId); return task; };
    const message = (value, ok = false) => win.showGuildValidation?.(value, ok);
    function open(taskId, stageId = '', button) {
      let task;
      try { task = get(taskId, stageId); } catch (error) { message(error.message); return; }
      const item = target(task, stageId);
      if (!dialog) {
        dialog = doc.createElement('dialog'); dialog.id = 'guildCalendarReminderDialog';
        dialog.setAttribute('aria-labelledby', 'guildCalendarReminderTitle');
        dialog.addEventListener('click', event => {
          if (event.target !== dialog) return;
          const r = dialog.getBoundingClientRect();
          if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
        });
        dialog.addEventListener('close', () => { active = null; opener?.isConnected && opener.focus({preventScroll:true}); });
        doc.body.append(dialog);
      }
      opener = button || doc.activeElement;
      active = {taskId, stageId, expected:fingerprint(task, stageId)};
      dialog.innerHTML = '<header><h3 id="guildCalendarReminderTitle">日历与提醒</h3><button type="button" data-close aria-label="关闭日历与提醒">×</button></header>' +
        '<strong class="gcr-title"></strong><p class="gcr-due"></p><form><label>提醒时间（北京时间）<input type="datetime-local" name="reminder"></label>' +
        '<div class="gcr-shortcuts"><button type="button" data-offset="1440">截止前一天</button><button type="button" data-offset="60">截止前一小时</button><button type="button" data-clear>不提醒</button></div>' +
        '<p class="gcr-help">本版在公会页面运行期间检查提醒。关闭页面或系统暂停网页后不能保证提醒；iPhone 锁屏提醒请使用日历并确认其提醒设置。</p>' +
        '<div class="gcr-actions"><button type="submit">保存提醒</button><button type="button" data-export>加入苹果 / 系统日历</button></div></form>' +
        '<p class="gcr-status" role="status" aria-live="polite"></p><p class="gcr-help">加入日历会下载 .ics 文件，需要你确认导入。重复导入可能生成副本；完成或改期后，请自行修改苹果日历中的旧事项。返回链接使用线上公会，需该端已有同一委托。</p>';
      dialog.querySelector('.gcr-title').textContent = stageId ? task.title + ' · ' + item.title : task.title;
      dialog.querySelector('.gcr-due').textContent = '截止：' + (item.due || '未设置') + (item.dueTime ? ' ' + item.dueTime : item.due ? '（全天事项）' : '');
      const form = dialog.querySelector('form'), input = form.elements.reminder, status = dialog.querySelector('.gcr-status');
      input.value = shanghaiInput(parseTime(item.reminder));
      const ended = closed(task) || closed(item);
      status.textContent = ended ? '委托已结束，公会内提醒已停止。' : item.reminder ? '已设置：' + (input.value.replace('T', ' ') || '原提醒格式待修正') : '尚未设置提醒。';
      if (!ended && Number.isFinite(parseTime(item.reminder)) && parseTime(item.reminder) <= Date.now()) status.textContent += ' 提醒时间已过，可重新安排。';
      form.querySelectorAll('button,input').forEach(el => { el.disabled = ended; });
      dialog.querySelector('[data-close]').onclick = () => dialog.close();
      form.querySelectorAll('[data-offset]').forEach(b => {
        b.disabled = ended || !validDate(item.due) || !item.dueTime;
        if (b.disabled && !ended) b.title = '请先设置明确的截止日期和时刻，或直接选择提醒时间';
        b.onclick = () => { input.value = shanghaiInput(parseTime(item.due + 'T' + item.dueTime) - Number(b.dataset.offset) * 60000); };
      });
      form.querySelector('[data-clear]').onclick = () => { input.value = ''; status.textContent = '点击保存后关闭此项提醒；截止日期不变。'; };
      function persist() {
        const latest = get(taskId, stageId), value = input.value;
        if (fingerprint(latest, stageId) !== active.expected) throw Error('委托已更新，请关闭并重新打开后设置，未覆盖新内容。');
        if (closed(latest) || closed(target(latest, stageId))) throw Error('委托已经结束，提醒已停止。');
        if (value && (!Number.isFinite(parseTime(value)) || parseTime(value) <= Date.now())) throw Error('请选择未来的提醒时间，或选择“不提醒”。');
        bridge().saveReminder(taskId, stageId, value, active.expected);
        active.expected = fingerprint(get(taskId, stageId), stageId);
        status.textContent = value ? '提醒时间已保存。公会页面运行时生效；锁屏提醒请导入日历确认。' : '已关闭此项提醒。';
        return get(taskId, stageId);
      }
      form.onsubmit = event => { event.preventDefault(); try { persist(); } catch (error) { status.textContent = error.message; } };
      form.querySelector('[data-export]').onclick = () => {
        try {
          const latest = get(taskId, stageId);
          if (fingerprint(latest, stageId) !== active.expected) throw Error('委托已更新，请重新打开后导出。');
          if (input.value !== shanghaiInput(parseTime(target(latest, stageId).reminder))) throw Error('请先保存提醒设置，再加入日历。');
          const content = calendar(latest, stageId), blob = new Blob([content], {type:'text/calendar;charset=utf-8'}), url = URL.createObjectURL(blob), a = doc.createElement('a');
          a.href = url; a.download = (target(latest, stageId).due + '-' + target(latest, stageId).title).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100) + '.ics';
          doc.body.append(a); a.click(); a.remove(); win.setTimeout(() => URL.revokeObjectURL(url), 60000);
          status.textContent = '日历文件已准备，请在下载项或日历中打开并确认导入及提醒时间。本页无法确认苹果日历是否已接收。';
        } catch (error) { status.textContent = error.message; }
      };
      if (!dialog.open) { doc.querySelectorAll('dialog[open]').forEach(other => other.close()); dialog.showModal(); }
    }
    function button(taskId, stageId = '') {
      const b = doc.createElement('button'); b.type = 'button'; b.className = 'action-secondary guild-calendar-entry';
      b.textContent = '日历与提醒'; b.onclick = event => { event.stopPropagation(); open(taskId, stageId, b); }; return b;
    }
    function notice(entries) {
      if (!activeNotice) {
        activeNotice = doc.createElement('div'); activeNotice.className = 'guild-reminder-notice'; activeNotice.setAttribute('role', 'status'); doc.body.append(activeNotice);
      }
      activeNotice.replaceChildren();
      const label = doc.createElement('strong'); label.textContent = '委托提醒'; activeNotice.append(label);
      entries.forEach(entry => {
        const b = doc.createElement('button'); b.type = 'button'; b.textContent = entry.title; b.dataset.taskId = entry.taskId; b.dataset.stageId = entry.stageId;
        b.onclick = () => { bridge()?.locate(entry.taskId, entry.stageId); activeNotice.remove(); activeNotice = null; }; activeNotice.append(b);
      });
      const close = doc.createElement('button'); close.type = 'button'; close.textContent = '知道了'; close.onclick = () => { activeNotice.remove(); activeNotice = null; }; activeNotice.append(close);
    }
    async function systemNotify(entry) {
      if (!read(PREF_KEY, {}).enabled || win.Notification?.permission !== 'granted') return 'page';
      const options = {body:entry.title, tag:'guild-reminder:' + entry.key, icon:'素材/界面/站点标识/guild-icon-192.png', data:{guildReminder:true, taskId:entry.taskId, stageId:entry.stageId, url:taskURL(entry.taskId, entry.stageId, win.location.href)}};
      try {
        let registration;
        try { registration = await win.navigator.serviceWorker?.getRegistration(); } catch {}
        const current = get(entry.taskId, entry.stageId);
        const item = target(current, entry.stageId);
        if (closed(current) || closed(item) || JSON.stringify([current.id, entry.stageId, item.reminder]) !== entry.key) return 'cancelled';
        if (registration) await registration.showNotification('公会委托提醒', options);
        else {
          const n = new win.Notification('公会委托提醒', options);
          desktopNotifications.set(entry.key, {notification:n, taskId:entry.taskId, stageId:entry.stageId});
          n.onclose = () => desktopNotifications.delete(entry.key);
          n.onclick = () => { win.focus(); bridge()?.locate(entry.taskId, entry.stageId); n.close(); };
        }
        return 'system';
      } catch { return 'failed'; }
    }
    async function tick() {
      if (polling || !bridge()) return;
      polling = true;
      try {
        const log = read(LOG_KEY, {}), entries = pending(tasks(), log, Date.now()).slice(0, 5);
        if (!entries.length) return;
        notice(entries);
        for (const entry of entries) log[entry.key] = {at:Date.now(), delivery:await systemNotify(entry)};
        if (entries.some(entry => log[entry.key].delivery === 'failed') && activeNotice) {
          const warning = doc.createElement('small'); warning.textContent = '系统通知发送失败，本次已在页面显示；可改用日历提醒。'; activeNotice.append(warning);
        }
        const recent = Object.entries(log).sort((a, b) => b[1].at - a[1].at).slice(0, 500);
        win.localStorage.setItem(LOG_KEY, JSON.stringify(Object.fromEntries(recent)));
      } finally { polling = false; }
    }
    async function reconcile() {
      for (const [key, entry] of desktopNotifications) {
        let current; try { current = get(entry.taskId, entry.stageId); } catch {}
        if (!current || closed(current) || closed(target(current, entry.stageId))) { entry.notification.close(); desktopNotifications.delete(key); }
      }
      if (active && dialog?.open) {
        let current; try { current = get(active.taskId, active.stageId); } catch {}
        if (!current || closed(current) || closed(target(current, active.stageId))) {
          dialog.querySelectorAll('form button,form input').forEach(el => { el.disabled = true; });
          dialog.querySelector('.gcr-status').textContent = '委托已结束或移除，公会内提醒已停止。已导入苹果日历的事项请自行删除。';
        }
      }
      if (activeNotice) {
        activeNotice.querySelectorAll('[data-task-id]').forEach(b => {
          let task; try { task = get(b.dataset.taskId, b.dataset.stageId); } catch {}
          if (!task || closed(task) || closed(target(task, b.dataset.stageId))) b.remove();
        });
        if (!activeNotice.querySelector('[data-task-id]')) { activeNotice.remove(); activeNotice = null; }
      }
      try {
        const registration = await win.navigator.serviceWorker?.getRegistration();
        for (const n of await registration?.getNotifications() || []) {
          if (!n.data?.guildReminder) continue;
          let task; try { task = get(n.data.taskId, n.data.stageId); } catch {}
          if (!task || closed(task) || closed(target(task, n.data.stageId))) n.close();
        }
      } catch {}
    }
    function followLink() {
      if (!bridge() || lastLink === win.location.hash || !win.location.hash.startsWith('#guild-task=')) return;
      const params = new URLSearchParams(win.location.hash.slice(1)), id = params.get('guild-task'), stageId = params.get('stage') || '';
      if (!tasks().some(t => t.id === id)) return; // May arrive after the initial cloud pull.
      lastLink = win.location.hash; bridge().locate(id, stageId);
    }
    Object.assign(api, {open, button, tick, reconcile});
    win.addEventListener('hashchange', () => { lastLink = ''; followLink(); });
    win.addEventListener('fairytail:data-changed', () => { reconcile(); followLink(); });
    win.navigator.serviceWorker?.addEventListener('message', event => {
      if (event.data?.type === 'guild-reminder-open') { win.location.hash = new URL(event.data.url).hash; followLink(); }
    });
    doc.addEventListener('DOMContentLoaded', followLink, {once:true});
  }
  const api = {validDate, parseTime, shanghaiInput, calendar, fingerprint, pending, taskURL, closed, install};
  return api;
});
