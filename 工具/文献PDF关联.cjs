'use strict';
// 单篇手动PDF：预检 → 用户核对 → 原paperId归档。不扫描下载目录，不发奖励。
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
module.exports=function createPdfAttachment({ROOT,read,edit,inspectPdf,dateKey,safeFilename,FOLDERS}){
 const staged=new Map(),directory=path.join(ROOT,'_管理','待核对PDF'),limit=60*1024*1024;
 const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 const signature=p=>JSON.stringify([p.title,p.doi,p.pdf?.path,p.pdf?.sha256,p.workbench?.sourceSha256,p.discardedAt,p.saved]);
 function paper(data,id){const p=data.papers.find(p=>p.id===id&&p.saved&&!p.discardedAt);if(!p)throw Error('请先收下这篇卷宗，再关联PDF');return p;}
 async function safeDirectory(dir){await fs.mkdir(dir,{recursive:true});const root=await fs.realpath(ROOT),real=await fs.realpath(dir),rel=path.relative(root,real);if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('归档目录不能跳转到文献库外');return real;}
 async function forget(key){const entry=staged.get(key);if(!entry)return;staged.delete(key);await fs.unlink(entry.file).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 async function expire(){for(const [key,entry]of staged)if(entry.expires<Date.now())await forget(key);}
 async function preview(id,bytes,name){
  await expire();const p=paper(await read(),id);
  if(!Buffer.isBuffer(bytes)||bytes.length<20||bytes.length>limit)throw Error('请选择60MB以内的完整PDF');
  if(!/\.pdf$/i.test(String(name))||bytes.indexOf(Buffer.from('%PDF-'))<0||bytes.indexOf(Buffer.from('%PDF-'))>1024||!bytes.subarray(-4096).includes(Buffer.from('%%EOF')))throw Error('文件不是完整PDF，可能下载成了网页');
  if(staged.size>=8)throw Error('已有多份PDF等待核对，请先确认或取消');
  const key=crypto.randomBytes(24).toString('hex'),dir=await safeDirectory(directory),file=path.join(dir,key+'.pdf');
  await fs.writeFile(file,bytes,{flag:'wx'});
  try{
   const verification=await inspectPdf(p,file),digest=sha(bytes),data=await read();
   const other=data.papers.find(x=>x.id!==id&&!x.discardedAt&&x.pdf?.sha256===digest);
   if(other)throw Error('这个PDF已关联另一篇文献，请核对两篇记录，未新建副本');
   // 有原图工作台时换源会破坏坐标与笔记，交由独立版本迁移处理。
   if(p.workbench&&p.pdf?.sha256!==digest)throw Error('本篇已有原图工作台，不能直接换成不同PDF版本；请先核对版本');
   staged.set(key,{id,file,digest,signature:signature(p),expires:Date.now()+30*60000});
   return{key,id,name:path.basename(String(name).replace(/\\/g,'/')),bytes:bytes.length,sha256:digest,verification,alreadyLinked:p.pdf?.sha256===digest,message:'仅完成预检，尚未改动文献记录；请打开所选PDF核对题名和正文。'};
  }catch(error){await fs.unlink(file).catch(()=>{});throw error;}
 }
 async function candidate(key){await expire();const entry=staged.get(key);if(!entry)throw Error('PDF核对已过期，请重新选择');const bytes=await fs.readFile(entry.file);if(sha(bytes)!==entry.digest)throw Error('待核对PDF发生变化，请重新选择');return{entry,bytes};}
 async function confirm(body){
  if(body.confirmed!==true||body.identityConfirmed!==true)throw Error('请先打开PDF并确认题名、正文与此篇一致');
  const {entry,bytes}=await candidate(body.key);if(body.id!==entry.id)throw Error('文献不一致，请重新选择PDF');
  const result=await edit(async data=>{
   const p=paper(data,entry.id);if(signature(p)!==entry.signature)throw Error('此篇题录或PDF已经更新，请重新预检');
   const other=data.papers.find(x=>x.id!==p.id&&!x.discardedAt&&x.pdf?.sha256===entry.digest);if(other)throw Error('这个PDF已经关联另一条记录，未重复归档');
   const check=await inspectPdf(p,entry.file);
   if(check.status==='suspect'||check.version==='疑似补充材料')throw Error('未能匹配论文首页，或疑似补充材料；未关联，请核对原文或先修正题录');
   const folder=FOLDERS[p.collectionFolder]||FOLDERS[p.topic]||FOLDERS.other,dir=await safeDirectory(path.join(ROOT,folder));
   const date=/^\d{4}-\d{2}-\d{2}$/.test(p.collectedDate||'')?p.collectedDate:dateKey();
   const basename=date+'_'+safeFilename(p.title,Math.max(40,220-dir.length-date.length-16))+'_'+entry.digest.slice(0,10);
   let target=path.join(dir,basename+'.pdf'),existing=false;
   if(p.pdf?.sha256===entry.digest&&p.pdf.path){try{const real=await fs.realpath(p.pdf.path),rel=path.relative(await fs.realpath(ROOT),real),info=await fs.lstat(p.pdf.path);if(rel.startsWith('..')||path.isAbsolute(rel)||!info.isFile()||info.isSymbolicLink())throw Error('原PDF路径异常，不能自动复用');if(sha(await fs.readFile(real))!==entry.digest)throw Error('原PDF已变化，请先重新核验');target=real;}catch(error){if(error.code!=='ENOENT')throw error;}}
   try{await fs.writeFile(target,bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;existing=true;const info=await fs.lstat(target);if(!info.isFile()||info.isSymbolicLink()||sha(await fs.readFile(target))!==entry.digest)throw Error('归档同名文件不同，未覆盖');}
   try{
    const verification=await inspectPdf(p,target);
    if(p.pdf?.path&&p.pdf.path!==target){p.pdfVersions||=[];if(!p.pdfVersions.some(x=>x.path===p.pdf.path&&x.sha256===p.pdf.sha256))p.pdfVersions.push({...p.pdf,retainedAt:new Date().toISOString()});}
    p.pdf={status:'downloaded',path:target,sha256:entry.digest,bytes:bytes.length,verification,source:'用户手动关联',downloadedAt:new Date().toISOString(),manualIdentity:{confirmed:true,at:new Date().toISOString(),basis:'用户确认题名及正文，独立于自动首页校验'}};
    p.updatedAt=new Date().toISOString();
    return{ok:true,id:p.id,path:target,verification,message:'PDF已归档到本篇卷宗；NPC、笔记、任务关联、研读状态和奖励保持不变。'};
   }catch(error){if(!existing)await fs.unlink(target).catch(()=>{});throw error;}
  });
  await forget(body.key);return result;
 }
 async function cancel(key){await forget(key);return{ok:true};}
 async function close(){for(const key of [...staged.keys()])await forget(key);}
 return{preview,confirm,candidate,cancel,close,limit};
};
