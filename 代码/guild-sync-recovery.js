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
 globalThis.GuildSyncRecovery=Object.freeze({list,save,saveDaily});
})();
