'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const Core=require('../代码/guild-reading-core.js');
module.exports=function({read,edit,metricFor,ROOT,verifyPdf}){
 let active=null,last={state:'idle',message:'目录、笔记和成果可同步；PDF留在本机'};
 const hash=x=>crypto.createHash('sha256').update(Core.stable(x)).digest('hex');
 function capture(d){
  const portable=Core.merge(d.readingCloud,Core.empty());
  for(const p of d.papers){
   portable.papers[p.id]={...Core.projectPaper(p,metricFor(p,d)),featured:!!d.batches?.[0]?.paperIds?.includes(p.id)};p.readingCloudHashes||={};
   const fields={notes:{text:p.notes||''},research:p.research||{},...(p.workbench?.progress?{progress:p.workbench.progress}:{})};
   for(const[kind,payload]of Object.entries(fields)){
    const signature=hash(payload),old=p.readingCloudHashes[kind],has=kind==='notes'?!!payload.text:kind==='research'?Object.values(payload).some(Boolean):true;
    if(old!==signature&&has)Core.change(portable,p.id,kind,payload,{id:hash([p.id,kind,signature,old||'seed']),at:old?new Date().toISOString():(p.updatedAt||p.workbench?.progress?.updatedAt||p.foundAt||'2000-01-01T00:00:00Z'),...(!old?{parents:[]}: {})});
    p.readingCloudHashes[kind]=signature;
   }
   if(p.discardedAt&&!Core.heads(portable,p.id,'discard').length)Core.change(portable,p.id,'discard',{}, {id:hash([p.id,'discard',p.discardedAt]),at:p.discardedAt});
  }
  // Old trial receipts remain historical and block duplicate claims; never back-pay them.
  for(const r of d.literatureRewards||[]){const id='legacy:'+r.id;portable.receipts[id]={...r,id,status:'legacy-trial',aliases:r.aliases||['paper:'+r.paperId]};}
  d.readingCloud=portable;return portable;
 }
 async function exportLocal(){return edit(d=>capture(d));}
 async function applyRemote(portable){return edit(d=>{
  const merged=Core.merge(capture(d),portable);d.readingCloud=merged;
  for(const p of d.papers){const remote=Core.view(merged,p.id);if(!remote)continue;
   p.readingCloudConflicts=remote.conflicts;
   // A remote discard requests local deletion; deletion still requires the existing local confirmation.
   if(remote.discardedAt&&!p.discardedAt){p.readingCloudDiscardRequestedAt=remote.discardedAt;continue;}
   for(const kind of ['notes','research'])if(Core.heads(merged,p.id,kind).length===1){p[kind]=remote[kind];p.readingCloudHashes||={};p.readingCloudHashes[kind]=hash(kind==='notes'?{text:p.notes||''}:p.research||{});}
   const progress=remote.progress;
   if(p.workbench&&progress&&remote.workbench?.sourceSha256===p.workbench.sourceSha256&&Core.heads(merged,p.id,'progress').length===1&&hash(progress)!==p.readingCloudHashes?.progress){
    if(p.workbench.progress)p.workbench.progressVersions=[...(p.workbench.progressVersions||[]),p.workbench.progress].slice(-5);
    p.workbench.progress={...progress,revision:Number(p.workbench.progress?.revision||0)+1};p.readingCloudHashes||={};p.readingCloudHashes.progress=hash(p.workbench.progress);
   }
   if(remote.completion){p.status='read';p.readingCompletion=remote.completion;}
   if(remote.saved&&!p.saved){p.saved=true;p.dispatch=remote.dispatch;p.collectedAt||=remote.dispatch?.decidedAt;}
  }return merged;
 })}
 async function credentials(){
  const source=await fs.readFile(path.join(__dirname,'../代码/guild-cloud-sync.js'),'utf8');
  const url=source.match(/supabaseUrl:\s*'([^']+)'/)?.[1],key=source.match(/supabaseAnonKey:\s*'([^']+)'/)?.[1],table=source.match(/supabaseTable:\s*'([^']+)'/)?.[1];
  if(!url||!key||!table)throw Error('未找到现有公会同步配置');return{url:url+'/rest/v1/'+table,key};
 }
 async function sync(){
  if(process.env.GUILD_LIT_ROOT||process.env.GUILD_LIT_PORT||process.env.GUILD_READING_CLOUD==='off')return{state:'disabled',message:'自定义/测试资料库不连接正式云端'};
  if(active)return active;
  active=(async()=>{try{
   last={state:'syncing',message:'正在同步文献目录与阅读记录'};const config=await credentials();let local=await exportLocal();
   async function request(url,options={}){const r=await fetch(url,{...options,signal:AbortSignal.timeout(12000),headers:{apikey:config.key,Authorization:'Bearer '+config.key,'Content-Type':'application/json',...(options.headers||{})}});if(!r.ok)throw Error('文献同步返回 '+r.status);const body=await r.text();return body?JSON.parse(body):null;}
   const query=config.url+'?key=eq.'+encodeURIComponent(Core.KEY);
   for(let i=0;i<3;i++){
    const remote=(await request(query+'&select=value,updated_at'))?.[0];let parsed=null;if(remote){try{parsed=JSON.parse(remote.value)}catch{throw Error('云端文献记录无法解析，未覆盖')}if(!Core.valid(parsed))throw Error('云端文献格式不兼容，未覆盖');}
    local=Core.merge(local,parsed);local=await applyRemote(local);
    const value=Core.stable(local);if(Buffer.byteLength(value)>3*1024*1024)throw Error('文献笔记超过3MB，请先导出整理；本地记录仍保留');
    if(remote?.value!==value){
     const row={key:Core.KEY,value,updated_at:Math.max(Date.now(),Number(remote?.updated_at||0)+1)};
     if(remote){const changed=await request(query+'&updated_at=eq.'+remote.updated_at,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(row)});if(!changed?.length)continue;}
     else await request(config.url+'?on_conflict=key',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify(row)});
    }
    const check=(await request(query+'&select=value'))?.[0];const actual=check?JSON.parse(check.value):null;
    if(Core.stable(Core.merge(local,actual))!==Core.stable(actual)){local=Core.merge(local,actual);continue;}
    last={state:'synced',at:new Date().toISOString(),papers:Object.keys(local.papers).length,message:'文献目录、笔记与奖励回执已同步；PDF保存在本机'};return last;
   }throw Error('另一设备正在更新，记录已保留，稍后重试');
  }catch(e){last={state:'error',message:e.message+'；本机记录保留，稍后可重试'};return last;}finally{active=null;}})();return active;
 }
 async function claim(body){
  if(body.kind==='archive'&&verifyPdf)await verifyPdf(body.id);
  // Export current local edits before applying eligibility; this never grants an automatic reward.
  await exportLocal();return edit(d=>{
   const input={takeaway:String(body.takeaway||''),confirmed:body.confirmed===true,identityConfirmed:body.identityConfirmed===true,linkedTask:body.linkedTask===true};
   const result=Core.claim(d.readingCloud,body.id,body.kind,input),remote=Core.view(d.readingCloud,body.id),p=d.papers.find(p=>p.id===body.id);
   if(p&&remote?.completion){p.status='read';p.readingCompletion=remote.completion;}
   return result;
  });
 }
 async function resolve(body){await exportLocal();return edit(d=>{const row=d.readingCloud.changes[body.revisionId];if(!row||row.paperId!==body.id||!['notes','research','progress'].includes(row.kind))throw Error('修订不存在或类型无效');Core.change(d.readingCloud,body.id,row.kind,row.payload);return{message:'已采用所选修订，其他版本保留；同步后写回本地阅读页'};});}
 return{sync,exportLocal,applyRemote,claim,resolve,status:()=>last};
};
