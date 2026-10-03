/* Interface cache is versioned; filename-versioned images keep a separate cache. */
'use strict';
var CACHE_VER='guild-v104-modules-20261004';
var CACHE_NAME='guild-core-'+CACHE_VER;
var MEDIA_CACHE_NAME='guild-media-v1';
var CORE_URLS=['./index.html','./每日日程表.html','./quotes.js','./growth.js','./v4.js','./guild-history-recovery-v65.js','./guild-cloud-sync.js','./schedule.js','./guild-features-v64.js','./guild-dock-panel.js','./guild-ui-v104.css','./guild-icon-192.png','./guild-icon-512.png'];
self.addEventListener('install',function(event){event.waitUntil(caches.open(CACHE_NAME).then(function(cache){return Promise.all(CORE_URLS.map(function(url){var request=new Request(new URL(url,self.location.href),{cache:'reload'});return fetch(request).then(function(response){if(!response.ok)throw new Error('Core cache unavailable: '+url);return cache.put(url,response)})}))}).then(function(){return self.skipWaiting()}))});
self.addEventListener('activate',function(event){event.waitUntil(caches.keys().then(function(keys){return Promise.all(keys.filter(function(key){return key.indexOf('guild-core-')===0&&key!==CACHE_NAME}).map(function(key){return caches.delete(key)}))}).then(function(){return self.clients.claim()}))});
function saveResponse(cache,req,res){if(res&&res.ok)return cache.put(req,res.clone()).then(function(){return res},function(){return res});return Promise.resolve(res)}
self.addEventListener('fetch',function(event){var req=event.request;if(req.method!=='GET')return;var url=new URL(req.url);if(url.origin!==self.location.origin)return;
 if(req.mode==='navigate'||/\.html?$/.test(url.pathname)){event.respondWith(caches.open(CACHE_NAME).then(function(cache){return fetch(req).then(function(res){return saveResponse(cache,req,res)}).catch(function(){return cache.match(req).then(function(c){return c||cache.match('./index.html')})})}));return}
 if(/\.(png|jpe?g|gif|webp|svg)$/.test(url.pathname)){event.respondWith(caches.open(MEDIA_CACHE_NAME).then(function(cache){return cache.match(req).then(function(cached){return cached||fetch(req).then(function(res){return saveResponse(cache,req,res)})})}));return}
 if(!/\.(js|css|webmanifest)$/.test(url.pathname))return;
 event.respondWith(caches.open(CACHE_NAME).then(function(cache){var version=url.searchParams.get('v');return cache.match(req,{ignoreSearch:!version||version===CACHE_VER}).then(function(cached){if(cached&&version===CACHE_VER)return cached;var network=fetch(new Request(req,{cache:'reload'})).then(function(res){return saveResponse(cache,req,res)}).catch(function(error){if(cached)return cached;throw error});return version?network:cached||network})}));
});
