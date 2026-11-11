/* Explicit historical repair. Never replay inventory, tasks, money or rewards. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GuildHappyHistory=api})(typeof globalThis==='object'?globalThis:this,()=>{'use strict';
const key='fairytail-warehouse-v1';
function exp(record){const n=Number(record.exp||0);if(!Number.isSafeInteger(n)||n<0||n>10000)throw Error('历史经验字段无效');return n}
function same(a,b){return ['title','action','occurredAt'].every(k=>String(a[k]||'')===String(b[k]||''))&&exp(a)===exp(b)}
function plan(warehouse,proposal){
 if(!warehouse?.happy||!proposal?.id||proposal.version!==1||!Array.isArray(proposal.records)||proposal.records.length>500)throw Error('历史恢复资料格式无效');
 const current=warehouse.happy,found=new Map();for(const r of current.interactions||[]){if(!r?.id)throw Error('现有互动记录缺少ID，先核对再恢复');if(found.has(r.id)&&!same(found.get(r.id),r))throw Error('现有记录ID冲突');found.set(r.id,r)}
 const missing=[];for(const r of proposal.records){if(!r||typeof r.id!=='string'||!r.id||!r.occurredAt||!Number.isFinite(Date.parse(r.occurredAt)))throw Error('历史记录身份或时间无效');exp(r);const old=found.get(r.id);if(old){if(!same(old,r))throw Error('历史记录ID相同但内容不一致');continue}missing.push(structuredClone(r));found.set(r.id,r)}
 const explicit=[...new Map((current.interactions||[]).map(r=>[r.id,r])).values()].reduce((n,r)=>n+exp(r),0);
 if(Number(current.exp)!==explicit)throw Error('当前总经验与现有互动明细不一致，停止自动恢复');
 if(warehouse.migrationIds?.[proposal.id]&&missing.length)throw Error('恢复标记存在但明细缺失，停止重复恢复');
 const addedExp=missing.reduce((n,r)=>n+exp(r),0),next=structuredClone(warehouse);if(missing.length){next.happy.interactions=[...found.values()].sort((a,b)=>String(a.occurredAt).localeCompare(String(b.occurredAt))||a.id.localeCompare(b.id));next.happy.exp=Number(current.exp)+addedExp;next.migrationIds??={};next.migrationIds[proposal.id]={at:new Date().toISOString(),records:missing.length,exp:addedExp,auditDigest:String(proposal.auditDigest||'')}}
 return {warehouse:next,addedRecords:missing.length,addedExp,beforeExp:Number(current.exp),afterExp:next.happy.exp};
}
async function apply(proposal){
 const current=ensureWarehouse(),before=JSON.stringify(current),result=plan(current,proposal);if(!result.addedRecords)return {addedRecords:0,addedExp:0,beforeExp:result.beforeExp,afterExp:result.afterExp};
 if(!globalThis.GuildSyncRecovery?.archiveBackup)throw Error('保护恢复点接口尚未就绪');
 await GuildSyncRecovery.archiveBackup('guild-backup-'+Date.now(),JSON.stringify({[key]:before,reason:'哈比历史恢复前保护',savedAt:new Date().toISOString()}));
 if(JSON.stringify(ensureWarehouse())!==before)throw Error('等待备份期间仓库发生变化，请重新核对');
 const raw=JSON.stringify(result.warehouse);localStorage.setItem(key,raw);if(localStorage.getItem(key)!==raw)throw Error('历史恢复未持久保存');guildWarehouse=result.warehouse;
 window.dispatchEvent(new CustomEvent('fairytail:data-changed'));all();
 return {addedRecords:result.addedRecords,addedExp:result.addedExp,beforeExp:result.beforeExp,afterExp:result.afterExp};
}
return Object.freeze({plan,apply});});
