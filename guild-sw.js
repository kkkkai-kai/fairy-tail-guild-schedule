/* Interface cache is versioned; filename-versioned images keep a separate cache. */
'use strict';
var CACHE_VER='guild-v195-literature-discard-20261009';
importScripts('./代码/guild-assets.js?v='+CACHE_VER);
var CACHE_NAME='guild-core-'+CACHE_VER;
var MEDIA_CACHE_NAME='guild-media-v1';
var CORE_URLS=['./代码/guild-assets.js','./代码/guild-literature-static.js','./代码/guild-literature-local.js','./index.html','./每日日程表.html','./代码/quotes.js','./代码/growth.js','./代码/v4.js','./代码/guild-history-recovery-v65.js','./代码/guild-cloud-sync.js','./代码/schedule.js','./代码/guild-features-v64.js','./代码/guild-dock-panel.js','./样式/guild-ui-v109.css','./素材/界面/站点标识/guild-icon-192.png','./素材/界面/站点标识/guild-icon-512.png'];
self.addEventListener('install',function(event){event.waitUntil(caches.open(CACHE_NAME).then(function(cache){return Promise.all(CORE_URLS.map(function(url){var request=new Request(new URL(url,self.location.href),{cache:'reload'});return fetch(request).then(function(response){if(!response.ok)throw new Error('Core cache unavailable: '+url);return cache.put(url,response)})}))}).then(function(){return self.skipWaiting()}))});
self.addEventListener('activate',function(event){event.waitUntil(caches.keys().then(function(keys){return Promise.all(keys.filter(function(key){return key.indexOf('guild-core-')===0&&key!==CACHE_NAME}).map(function(key){return caches.delete(key)}))}).then(function(){return self.clients.claim()}))});
function saveResponse(cache,req,res){if(res&&res.ok)return cache.put(req,res.clone()).then(function(){return res},function(){return res});return Promise.resolve(res)}
self.addEventListener('fetch',function(event){var req=event.request;if(req.method!=='GET')return;var url=new URL(req.url);if(url.origin!==self.location.origin)return;
 if(req.mode==='navigate'||/\.html?$/.test(url.pathname)){event.respondWith(caches.open(CACHE_NAME).then(function(cache){return fetch(req).then(function(res){return saveResponse(cache,req,res)}).catch(function(){return cache.match(req).then(function(c){return c||cache.match('./index.html')})})}));return}
 if(/\.(png|jpe?g|gif|webp|svg|ico)$/.test(url.pathname)){var base=new URL('./',self.location.href),relative=decodeURIComponent(url.pathname).slice(decodeURIComponent(base.pathname).length),mapped=GuildAssets.resolve(relative);var mediaReq=mapped!==relative?new Request(new URL(mapped+url.search,base),{credentials:req.credentials,cache:req.cache}):req;event.respondWith(caches.open(MEDIA_CACHE_NAME).then(function(cache){return cache.match(mediaReq).then(function(cached){return cached||fetch(mediaReq).then(function(res){return saveResponse(cache,mediaReq,res)})})}));return}
 if(!/\.(js|css|webmanifest)$/.test(url.pathname))return;
 event.respondWith(caches.open(CACHE_NAME).then(function(cache){var version=url.searchParams.get('v');return cache.match(req,{ignoreSearch:!version||version===CACHE_VER}).then(function(cached){if(cached&&version===CACHE_VER)return cached;var network=fetch(new Request(req,{cache:'reload'})).then(function(res){return saveResponse(cache,req,res)}).catch(function(error){if(cached)return cached;throw error});return version?network:cached||network})}));
});
