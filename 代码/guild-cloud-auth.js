/* Email-link authentication. Session secrets are local-only, never guild sync data. */
(function () {
  'use strict';
  var SESSION_KEY = '__guild_auth_session_v1__';
  var PKCE_KEY = '__guild_auth_pkce_v1__';
  var config = null, session = null, refreshFlight = null, sendFlight = null, exchangeFlight = null;
  var callbackPage = document.documentElement.dataset.guildAuthCallback === 'true';
  var callbackCode = '', callbackError = '';
  try {
    var current = new URL(location.href);
    callbackCode = current.searchParams.get('code') || '';
    callbackError = current.searchParams.get('error_description') || '';
    if (callbackCode || current.searchParams.has('error')) {
      current.searchParams.delete('code'); current.searchParams.delete('error');
      current.searchParams.delete('error_code'); current.searchParams.delete('error_description');
      history.replaceState(null, '', current.href);
    }
  } catch (_) {}
  function read(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; } }
  function notify() { window.dispatchEvent(new CustomEvent('guild-auth-change')); }
  function authError(message, status) { var error = new Error(message); error.authRequired = true; error.status = status; return error; }
  function storeSession(next) {
    if (!next || !next.access_token || !next.refresh_token || !next.user || !next.user.id) throw authError('登录返回不完整，请重新发送邮件');
    next.expires_at = Number(next.expires_at) || Math.floor(Date.now() / 1000) + Number(next.expires_in || 3600);
    localStorage.setItem(SESSION_KEY, JSON.stringify(next)); session = next; notify(); return next;
  }
  function forgetSession() { localStorage.removeItem(SESSION_KEY); session = null; notify(); }
  async function api(path, body, token, method) {
    if (!config) throw authError('登录服务尚未就绪');
    var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 15000);
    try {
      var headers = { apikey: config.key, 'Content-Type': 'application/json' };
      if (token) headers.Authorization = 'Bearer ' + token;
      var response = await fetch(config.url + '/auth/v1/' + path, {
        method: method || 'POST', headers: headers, body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store', signal: controller.signal, credentials: 'omit'
      });
      var result = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        var message = response.status === 429 ? '邮件发送过于频繁，请稍后再试' :
          response.status === 401 || response.status === 403 ? '登录已失效，请重新发送登录邮件' :
          '登录请求未成功（' + response.status + '），请稍后重试';
        throw authError(message, response.status);
      }
      return result;
    } finally { clearTimeout(timer); }
  }
  function hasSession() { session = read(SESSION_KEY); return Boolean(session && session.user && session.access_token && session.refresh_token); }
  function userId() { return hasSession() ? session.user.id : ''; }
  async function token(force) {
    if (refreshFlight) return refreshFlight;
    var run = async function () {
      if (!hasSession()) throw authError('请先登录公会；本机存档已保留');
      if (!force && Number(session.expires_at) * 1000 > Date.now() + 60000) return session.access_token;
      var previous = session;
      try {
        var next = await api('token?grant_type=refresh_token', { refresh_token: previous.refresh_token });
        // An explicit sign-out during a slow refresh must never log this browser back in.
        var currentSession = read(SESSION_KEY);
        if (!currentSession || currentSession.refresh_token !== previous.refresh_token) throw authError('登录状态已改变，请重试');
        storeSession(next); return next.access_token;
      } catch (error) {
        if ([400, 401, 403].indexOf(error.status) !== -1 && read(SESSION_KEY)?.refresh_token === previous.refresh_token) forgetSession();
        throw error;
      }
    };
    refreshFlight = (navigator.locks ? navigator.locks.request('guild-auth-refresh', run) : run())
      .finally(function () { refreshFlight = null; });
    return refreshFlight;
  }
  async function authorizedFetch(url, options, retry) {
    var access = await token(false), expectedUser = userId(), settings = Object.assign({}, options || {});
    settings.headers = Object.assign({}, settings.headers || {}, { apikey: config.key, Authorization: 'Bearer ' + access });
    settings.credentials = 'omit'; settings.cache = 'no-store';
    var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 15000);
    settings.signal = controller.signal;
    var response;
    try { response = await fetch(url, settings); } finally { clearTimeout(timer); }
    if (!expectedUser || userId() !== expectedUser) throw authError('同步账户已改变，请重试');
    if (response.status === 401 && !retry) { await token(true); return authorizedFetch(url, options, true); }
    if (response.status === 401) { forgetSession(); throw authError('登录失效，请重新登录', 401); }
    if (response.status === 403) throw authError('此账户尚未获准访问公会存档', 403);
    return response;
  }
  function base64url(bytes) { return btoa(String.fromCharCode.apply(null, new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function sendLink(email) {
    if (sendFlight) return sendFlight;
    sendFlight = (async function () {
      email = String(email || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw authError('请填写正确的邮箱');
      var previous = read(PKCE_KEY);
      if (previous && Date.now() - previous.createdAt < 60000) throw authError('请等一分钟后再发送，先查看收件箱与垃圾邮件');
      if (!crypto.subtle) throw authError('当前浏览器不支持安全登录，请使用最新浏览器打开线上公会');
      var verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
      var challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
      var pending = { verifier: verifier, email: email, createdAt: Date.now() };
      localStorage.setItem(PKCE_KEY, JSON.stringify(pending));
      try {
        await api('otp?redirect_to=' + encodeURIComponent(config.redirect), {
          email: email, create_user: true, code_challenge: challenge, code_challenge_method: 's256'
        });
      } catch (error) {
        // Keep an earlier valid request intact if the service rejects this resend.
        if (previous) localStorage.setItem(PKCE_KEY, JSON.stringify(previous)); else localStorage.removeItem(PKCE_KEY);
        throw error;
      }
    })().finally(function () { sendFlight = null; });
    return sendFlight;
  }
  function exchange(code) {
    if (exchangeFlight) return exchangeFlight;
    exchangeFlight = (async function () {
      code = String(code || '').trim();
      if (/^https?:/.test(code)) { var link = new URL(code); code = link.searchParams.get('code') || ''; }
      var pending = read(PKCE_KEY);
      if (!pending || !pending.verifier) throw authError('请回到发起登录的浏览器完成验证，或在这里重新发送邮件');
      if (!code || !/^[a-zA-Z0-9_-]{16,256}$/.test(code)) throw authError('请粘贴登录页给出的一次性登录码');
      var next = await api('token?grant_type=pkce', { auth_code: code, code_verifier: pending.verifier });
      if (!next.user || String(next.user.email || '').toLowerCase() !== pending.email.toLowerCase()) throw authError('登录邮箱不一致，请重新发起');
      storeSession(next); localStorage.removeItem(PKCE_KEY); callbackCode = ''; return next;
    })().finally(function () { exchangeFlight = null; });
    return exchangeFlight;
  }
  async function signOut() {
    var saved = read(SESSION_KEY); forgetSession();
    localStorage.removeItem(PKCE_KEY);
    if (saved?.access_token) await api('logout?scope=local', null, saved.access_token).catch(function () {});
  }
  function show() {
    var existing = document.getElementById('guildAuthDialog');
    if (existing) { if (!existing.open) existing.showModal(); return; }
    var dialog = document.createElement('dialog'); dialog.id = 'guildAuthDialog';
    dialog.style.cssText = 'width:min(420px,calc(100vw - 36px));max-height:85vh;overflow:auto;box-sizing:border-box;padding:24px;border:1px solid #bf916b;border-radius:16px;background:#fffdf8;color:#382b27;font:15px/1.65 "Microsoft YaHei",sans-serif;box-shadow:0 14px 60px #382b2740';
    var heading = document.createElement('h2'); heading.textContent = '公会存档 · 邮箱登录'; heading.style.margin = '0 0 12px'; dialog.appendChild(heading);
    var note = document.createElement('p'); note.textContent = '无需密码。使用同一邮箱连接手机与电脑。未登录时仍可登记任务，记录保存在本机。'; dialog.appendChild(note);
    var status = document.createElement('p'); status.setAttribute('role', 'status'); status.style.cssText = 'color:#813f2b;overflow-wrap:anywhere';
    function button(label, action) {
      var element = document.createElement('button'); element.type = 'button'; element.textContent = label;
      element.style.cssText = 'min-height:40px;padding:8px 14px;margin:6px 6px 6px 0;border:1px solid #bf916b;border-radius:8px;background:#fff3e2;color:#653b2b;font:inherit;cursor:pointer';
      element.onclick = async function () { element.disabled = true; try { await action(); } catch (error) { status.textContent = error.message || '操作未成功，请重试'; } finally { element.disabled = false; } }; return element;
    }
    if (hasSession()) {
      var account = document.createElement('p'); account.textContent = '已登录：' + (session.user.email || '公会账户'); dialog.appendChild(account);
      dialog.appendChild(button('退出此设备（保留本机记录）', async function () { await signOut(); dialog.close(); }));
      if (callbackPage) { var home = document.createElement('a'); home.href = './'; home.textContent = '返回公会'; dialog.appendChild(home); }
    } else {
      var label = document.createElement('label'); label.textContent = '登录邮箱';
      var input = document.createElement('input'); input.type = 'email'; input.autocomplete = 'email'; input.placeholder = '填写你的邮箱'; input.value = read(PKCE_KEY)?.email || '';
      input.style.cssText = 'display:block;width:100%;box-sizing:border-box;min-height:44px;padding:9px;margin:6px 0;border:1px solid #bf916b;border-radius:8px;font:inherit'; label.appendChild(input); dialog.appendChild(label);
      dialog.appendChild(button('发送登录邮件', async function () { await sendLink(input.value); status.textContent = '邮件已发送。请在这台设备的同一浏览器打开邮件链接；也请检查垃圾邮件。'; }));
      var details = document.createElement('details'); var summary = document.createElement('summary'); summary.textContent = '从本地页面或另一浏览器发起的登录'; details.appendChild(summary);
      var explanation = document.createElement('p'); explanation.textContent = '若邮件打开后提示返回原页面，将登录页提供的一次性登录码粘贴在这里。不要发送到聊天里。'; details.appendChild(explanation);
      var code = document.createElement('input'); code.type = 'text'; code.autocomplete = 'off'; code.setAttribute('aria-label', '一次性登录码'); code.style.cssText = input.style.cssText; details.appendChild(code);
      details.appendChild(button('验证登录码', async function () { await exchange(code.value); code.value = ''; dialog.close(); if (callbackPage) location.replace('./'); })); dialog.appendChild(details);
    }
    dialog.appendChild(status);
    dialog.appendChild(button('关闭', function () { dialog.close(); }));
    dialog.addEventListener('click', function (event) { if (event.target !== dialog) return; var r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); });
    dialog.addEventListener('close', function () { dialog.remove(); }); document.body.appendChild(dialog); dialog.showModal();
  }
  function renderCallback(message) {
    var status = document.getElementById('guildLoginStatus'); if (status) status.textContent = message;
    var transfer = document.getElementById('guildLoginTransfer');
    if (transfer && callbackCode && !read(PKCE_KEY)) { transfer.hidden = false; transfer.querySelector('textarea').value = callbackCode; }
  }
  async function configure(options) {
    config = options; session = read(SESSION_KEY);
    if (!callbackPage) return;
    if (callbackError) { renderCallback('登录链接未能验证，请重新发送邮件。'); return; }
    if (callbackCode && read(PKCE_KEY)) {
      try { await exchange(callbackCode); renderCallback('邮箱验证成功。可以返回公会；其他设备也需各自登录一次。'); }
      catch (error) { renderCallback(error.message); }
    } else if (callbackCode) renderCallback('请将下面的一次性登录码，粘贴回发起登录的本地页面或浏览器。');
    else renderCallback(hasSession() ? '此浏览器已登录，可以返回公会。' : '点击下方按钮，发送免费的邮箱登录链接。');
  }
  window.addEventListener('storage', function (event) { if (event.key === SESSION_KEY) { session = read(SESSION_KEY); notify(); } });
  window.GuildCloudAuth = { configure: configure, hasSession: hasSession, userId: userId, token: token, fetch: authorizedFetch, show: show, sendLink: sendLink, exchange: exchange, signOut: signOut };
})();
