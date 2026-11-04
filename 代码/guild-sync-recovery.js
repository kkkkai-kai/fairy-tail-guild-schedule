/* Device-only recovery points, kept out of the cloud upload whitelist. */
(function(){'use strict';
 let opening,dailySaved='';
 function db(){if(!globalThis.indexedDB)return Promise.reject(Error('当前浏览器不支持恢复点存储'));if(opening)return opening;opening=new Promise((resolve,reject)=>{const req=indexedDB.open('fairytail-sync-recovery-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('points',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)}).catch(e=>{opening=null;throw e});return opening}
 async function list(){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('points','readonly'),req=tx.objectStore('points').getAll();req.onsuccess=()=>resolve(req.result.sort((a,b)=>b.at-a.at));req.onerror=()=>reject(req.error)})}
 async function save(records,id='before-restore-'+Date.now()){
  const points=await list();if(points.some(p=>p.id===id))return true;const keys=Object.values(GuildWorkspaceCore.KEYS).filter(k=>k!=='fairytail-warehouse-v1'),rows=records.filter(r=>keys.includes(r.key));if(!rows.length)return false;
  const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('points','readwrite'),store=tx.objectStore('points');store.put({id,at:Date.now(),records:rows});points.slice(0).sort((a,b)=>b.at-a.at).slice(2).forEach(p=>store.delete(p.id));tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})
 }
 function saveDaily(rows){const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());if(dailySaved===date)return Promise.resolve(true);return save(rows,'cloud-'+date).then(ok=>{if(ok)dailySaved=date;return ok})}

 let archiveOpening,archiveQueue=Promise.resolve(),taskSnapshots=[];
 function archiveDb(){if(!globalThis.indexedDB)return Promise.reject(Error('当前浏览器不支持恢复点存储'));if(archiveOpening)return archiveOpening;archiveOpening=new Promise((resolve,reject)=>{const req=indexedDB.open('fairytail-local-backups-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('backups',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)}).catch(error=>{archiveOpening=null;throw error});return archiveOpening}
 async function archiveRows(){const database=await archiveDb();return new Promise((resolve,reject)=>{const tx=database.transaction('backups','readonly'),req=tx.objectStore('backups').getAll();tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
 function enqueueArchive(entries){const job=archiveQueue.catch(()=>{}).then(async()=>{const records=[];for(const entry of entries){if(entry.key==='fairytail-auto-snapshots-v1'){const snapshots=JSON.parse(entry.raw);if(!Array.isArray(snapshots)||snapshots.some(item=>!item?.id||!Array.isArray(item.tasks)))throw Error('恢复点格式异常，保留原位置');for(const snapshot of snapshots)records.push({id:'task:'+snapshot.id,kind:'task',at:Date.parse(snapshot.createdAt)||Date.now(),raw:JSON.stringify(snapshot)})}else records.push({id:'legacy:'+entry.key,kind:entry.kind||'legacy',at:Date.now(),raw:entry.raw})}
 const database=await archiveDb();await new Promise((resolve,reject)=>{const tx=database.transaction('backups','readwrite'),store=tx.objectStore('backups');records.forEach(record=>store.put(record));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});
 const stored=await archiveRows(),byId=new Map(stored.map(record=>[record.id,record.raw]));if(records.some(record=>byId.get(record.id)!==record.raw))throw Error('恢复点核验失败，原位置保留');
 // Only verified copies may leave the small synchronous storage area.
 for(const entry of entries)if(localStorage.getItem(entry.key)===entry.raw)localStorage.removeItem(entry.key);
 const ordered=stored.filter(record=>record.kind==='task').sort((a,b)=>b.at-a.at||b.id.localeCompare(a.id));taskSnapshots=ordered.slice(0,5).map(record=>JSON.parse(record.raw));
 // Keep the same five automatic rollback generations; unrelated legacy backups are retained.
 const obsolete=[...ordered.slice(5),...stored.filter(record=>record.kind==='cloud').sort((a,b)=>b.at-a.at||b.id.localeCompare(a.id)).slice(5)];if(obsolete.length)await new Promise((resolve,reject)=>{const tx=database.transaction('backups','readwrite');obsolete.forEach(record=>tx.objectStore('backups').delete(record.id));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});
 return{verified:records.length,releasedCharacters:entries.reduce((n,entry)=>n+(localStorage.getItem(entry.key)===null?entry.raw.length:0),0)};
 });archiveQueue=job;return job}
 function archiveLocalBackups(){const entries=[];for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key==='fairytail-auto-snapshots-v1'||/^guild-backup-\d+$/.test(key)){const raw=localStorage.getItem(key);if(raw!==null)entries.push({key,raw})}}return enqueueArchive(entries)}
 function archiveBackup(key,raw){if(!/^guild-backup-\d+$/.test(key))return Promise.reject(Error('非恢复点存档'));return enqueueArchive([{key,raw,kind:'cloud'}])}
 function saveTaskSnapshot(snapshot){if(!snapshot?.id||!Array.isArray(snapshot.tasks))return Promise.reject(Error('恢复点格式无效'));return enqueueArchive([{key:'fairytail-auto-snapshots-v1',raw:JSON.stringify([snapshot])}]).then(result=>{window.dispatchEvent(new Event('guild-local-backups-ready'));return result})}
 async function exportLocalBackups(){const records=await archiveRows(),url=URL.createObjectURL(new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),records},null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='公会本机恢复点-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 globalThis.GuildSyncRecovery=Object.freeze({list,save,saveDaily,archiveLocalBackups,archiveBackup,saveTaskSnapshot,exportLocalBackups,getTaskSnapshots:()=>structuredClone(taskSnapshots)});
 archiveLocalBackups().then(()=>window.dispatchEvent(new Event('guild-local-backups-ready'))).catch(error=>console.warn('恢复点仍保留原位置：',error));

})();
