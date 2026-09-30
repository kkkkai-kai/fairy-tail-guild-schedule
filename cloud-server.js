// ============================================================
// 妖精的尾巴 · 本地门户 + 云端代理
// 运行：node cloud-server.js
// 功能：
//   1) 静态服务：http://localhost:8787/每日日程表.html 直接打开页面
//   2) demo 数据：/api/sync（保留本地演示能力）
//   3) 云端代理：/api/cloud-sync（把浏览器请求转发到腾讯云 CloudBase，
//      避开免费体验版无法配置安全域名的限制）
// 密钥读取自 guild-cloud-sync.js 的 cloudbaseApiKey（单一配置源）
// ============================================================
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, '.cloud-data.json');
const PORT = 8787;

// ---------- 读取 CloudBase 凭据（从数据桥配置文件） ----------
function loadCloudConfig() {
  try {
    const src = fs.readFileSync(path.join(ROOT, 'guild-cloud-sync.js'), 'utf8');
    const env = src.match(/cloudbaseEnvId:\s*'([^']+)'/);
    const key = src.match(/cloudbaseApiKey:\s*'([^']+)'/);
    const col = src.match(/cloudbaseCollection:\s*'([^']+)'/);
    return {
      envId: env ? env[1] : '',
      apiKey: key ? key[1] : '',
      collection: col ? col[1] : 'guildcloudsync'
    };
  } catch (e) { return { envId: '', apiKey: '', collection: 'guildcloudsync' }; }
}

function cloudBaseUrl(cfg) {
  return 'https://' + cfg.envId + '.api.tcloudbasegateway.com/v1/database/instances/(default)/databases/(default)/collections/' + cfg.collection + '/documents';
}

// ---------- CloudBase EJSON 还原 ----------
function numFromEJSON(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = Number(v); return isNaN(n) ? 0 : n; }
  if (typeof v === 'object') {
    if (v.$numberLong !== undefined) { const a = Number(v.$numberLong); return isNaN(a) ? 0 : a; }
    if (v.$numberInt !== undefined) { const b = Number(v.$numberInt); return isNaN(b) ? 0 : b; }
    if (v.$date !== undefined) {
      if (typeof v.$date === 'number') return v.$date;
      if (v.$date.$numberLong !== undefined) { const c = Number(v.$date.$numberLong); return isNaN(c) ? 0 : c; }
    }
  }
  return 0;
}

// ---------- demo 数据 ----------
function loadDemo() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { return {}; }
}
function saveDemo(d) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 5e7) { reject(new Error('body too large')); req.destroy(); } });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const u = new URL(req.url, 'http://localhost:' + PORT);
  const p = decodeURIComponent(u.pathname);

  // ---------- 云端代理：读取 ----------
  if (req.method === 'GET' && p.startsWith('/api/cloud-sync')) {
    const cfg = loadCloudConfig();
    if (!cfg.apiKey) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'cloudbaseApiKey 未配置，请先填写 guild-cloud-sync.js' }));
      return;
    }
    fetch(cloudBaseUrl(cfg) + '?limit=1000', {
      headers: { Authorization: 'Bearer ' + cfg.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' }
    }).then(r => r.json()).then(json => {
      let list = [];
      if (json && Array.isArray(json.list)) list = json.list;
      else if (json && json.data && Array.isArray(json.data.list)) list = json.data.list;
      const out = list.map(x => ({ key: x.key, value: x.value, updatedAt: numFromEJSON(x.updatedAt) }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ list: out }));
    }).catch(err => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    });
    return;
  }

  // ---------- 云端代理：写入 ----------
  if (req.method === 'POST' && p.startsWith('/api/cloud-sync')) {
    readBody(req).then(async body => {
      const { entries } = JSON.parse(body);
      const cfg = loadCloudConfig();
      if (!cfg.apiKey) throw new Error('cloudbaseApiKey 未配置');
      let ok = 0;
      for (const e of (entries || [])) {
        const r = await fetch(cloudBaseUrl(cfg), {
          method: 'PATCH',
          headers: { Authorization: 'Bearer ' + cfg.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: { key: e.key },
            data: { key: e.key, value: e.value, updatedAt: Number(e.updatedAt) },
            multi: false, upsert: true, replaceMode: true
          })
        });
        if (r.ok || r.status === 200) ok++;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, count: ok }));
    }).catch(err => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(err) }));
    });
    return;
  }

  // ---------- demo 数据（保留） ----------
  if (req.method === 'POST' && p === '/api/sync') {
    readBody(req).then(body => {
      try {
        const { entries } = JSON.parse(body);
        const store = loadDemo();
        (entries || []).forEach(e => {
          const cur = store[e.key];
          if (!cur || e.updatedAt > cur.updatedAt) store[e.key] = { value: e.value, updatedAt: e.updatedAt };
        });
        saveDemo(store);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, count: (entries || []).length }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(err) }));
      }
    }).catch(() => {});
    return;
  }

  if (req.method === 'GET' && p.startsWith('/api/sync')) {
    const store = loadDemo();
    const list = Object.keys(store).map(k => ({ key: k, value: store[k].value, updatedAt: store[k].updatedAt }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(list));
    return;
  }

  // ---------- 静态文件服务 ----------
  let file = p === '/' || p === '' ? '/每日日程表.html' : p;
  let fp = path.normalize(path.join(ROOT, file));
  if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    // 尝试 index.html 兜底
    fp = path.join(ROOT, 'index.html');
    if (!fs.existsSync(fp)) { res.writeHead(404); res.end('not found'); return; }
  }
  const ext = path.extname(fp).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res);
}).listen(PORT, () => {
  console.log('✦ 妖精的尾巴 · 本地门户运行中: http://localhost:' + PORT + '/每日日程表.html');
  console.log('  云端代理: /api/cloud-sync · 演示数据: /api/sync');
});
