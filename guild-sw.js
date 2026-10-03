/* 妖精的尾巴 · 公会徽章缓存（Service Worker）
   策略：stale-while-revalidate —— 命中先返回缓存，后台重新拉取更新。
   升级版本号时，同步修改 HTML 中的 ?v= 与下方 CACHE_VER。 */
'use strict';
var CACHE_VER = 'guild-v99-ui-20261003';
var CACHE_NAME = 'guild-core-' + CACHE_VER;

var CORE_URLS = [
  './每日日程表.html?pwa=1',
  './每日日程表.html',
  './index.html',
  './quotes.js',
  './growth.js',
  './v4.js',
  './guild-history-recovery-v65.js',
  './guild-cloud-sync.js',
  './schedule.js',
  './guild-features-v64.js',
  './guild-dock-panel.js',
  './guild-icon-192.png',
  './guild-icon-512.png',
  './guild-dock-icon.png',
  './fairy-tail-guild-silhouette.png',
  './guild-happy-nook-v94.png',
  './guild-exceed-happy-idle-v95.png',
  './guild-exceed-carla-idle-v95.png',
  './guild-exceed-lily-idle-v95.png',
  './guild-exceed-frosch-idle-v95.png',
  './guild-exceed-lector-idle-v95.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.allSettled(
        CORE_URLS.map(function (url) { return cache.add(url); })
      );
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key.indexOf('guild-core-') === 0 && key !== CACHE_NAME; })
            .map(function (key) { return caches.delete(key); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // 只缓存同源静态资源

  // 导航请求（打开页面/刷新）：网络优先，失败才回退缓存
  // 保证用户每次打开都是最新版本，避免 SW 缓存旧 HTML 导致长期使用旧功能
  if (req.mode === 'navigate' || /\.html?$/.test(url.pathname)) {
    event.respondWith(
      fetch(req).then(function (res) {
        if (res && (res.status === 200 || res.status === 0)) {
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, res.clone()); }).catch(function () {});
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (c) { return c || caches.match('./每日日程表.html'); });
      })
    );
    return;
  }

  if (!/\.(js|css|png|jpe?g|gif|webp|webmanifest)$/.test(url.pathname)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.match(req).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res && (res.status === 200 || res.status === 0)) {
            try { cache.put(req, res.clone()); } catch (e) {}
          }
          return res;
        }).catch(function () { return cached; });
        return cached || network;
      });
    })
  );
});
