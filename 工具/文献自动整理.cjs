'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
function category(name){
 const t=name.toLowerCase();
 const sg=/stress.granul|应激颗粒/.test(t),zn=/\bzinc\b|zn2|锌/.test(t);
 if(sg&&zn)return '03_应激颗粒与Zn交叉';
 if(/canine|犬/.test(t)&&/car.?t|chimeric antigen/.test(t))return '04_犬CAR-T';
 if(sg)return '01_应激颗粒';
 if(/rnautophagy|rna.?autophagy|rna自噬|rna噬/.test(t))return '08_RNA自噬';
 if(/newcastle disease|\bndv\b|新城疫/.test(t))return '07_NDV';
 if(zn)return /stress|应激/.test(t)?'02_应激与Zn离子':'06_锌离子综合';
 if(/p.bod(?:y|ies)|p小体/.test(t))return '10_P小体';
 if(/guidelines|assays|monitoring and measuring/.test(t))return '05_方法与综述/实验方法';
 if(/autophagy|自噬/.test(t))return '09_自噬基础';
 if(/rna.degrad|rna.metabol|rna代谢/.test(t))return '11_RNA代谢基础';
 return '99_待分类';
}
module.exports=function createOrganizer({ROOT,read,settleMs=30000}){
 const root=path.resolve(ROOT),inbox=path.join(root,'00_下载待整理'),manage=path.join(root,'_管理'),seen=new Map();let running=false,timer;
 async function safeDir(dir){await fs.mkdir(dir,{recursive:true});const actual=await fs.realpath(dir),rel=path.relative(await fs.realpath(root),actual);if(rel.startsWith('..')||path.isAbsolute(rel))throw Error('目录指向文献库外');return dir;}
 async function pdfs(dir){let files=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){if(e.isSymbolicLink()||e.name.startsWith('_')||e.name==='00_下载待整理')continue;const f=path.join(dir,e.name);if(e.isDirectory())files.push(...await pdfs(f));else if(e.isFile()&&/\.pdf$/i.test(f))files.push(f)}return files;}
 async function inboxCount(){try{return (await fs.readdir(inbox,{withFileTypes:true})).filter(e=>e.isFile()&&/\.pdf$/i.test(e.name)).length}catch{return 0}}
 async function writeStatus(patch){await fs.writeFile(path.join(manage,'自动整理状态.json'),JSON.stringify({checkedAt:new Date().toISOString(),state:'checked',message:'本轮检查完成；移动明细见自动整理记录.json',inbox:await inboxCount(),...patch})).catch(()=>{})}
 async function scan(options={}){
  if(running)return{running:true,moved:0};
  running=true;let lock,moved=0,failed=0;
  const force=!!options.force;
  try{
   await safeDir(inbox);await safeDir(manage);
   const lockPath=path.join(manage,'自动整理.lock');
   for(let attempt=0;attempt<2&&!lock;attempt++){
    try{lock=await fs.open(lockPath,'wx');await lock.writeFile(String(process.pid))}
    catch(e){
     if(e.code!=='EEXIST')throw e;
     let owner=0;try{owner=Number((await fs.readFile(lockPath,'utf8')).trim())}catch{}
     let alive=false;if(Number.isInteger(owner)&&owner>0){try{process.kill(owner,0);alive=true}catch(err){if(err.code!=='ESRCH')alive=true}}
     if(alive)return{running:true,moved:0,message:'另一进程正在整理，本次跳过'};
     await fs.unlink(lockPath).catch(()=>{});
    }
   }
   if(!lock)throw Error('无法取得自动整理锁，请核对 _管理/自动整理.lock')
   let history=[];const report=path.join(manage,'自动整理记录.json');try{history=JSON.parse(await fs.readFile(report,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
   const records=await read(),registered=new Set(records.papers.map(p=>p.pdf?.path).filter(Boolean).map(p=>path.resolve(p).toLowerCase()));
   const candidates=[],entries=await fs.readdir(inbox,{withFileTypes:true});const names=new Set(entries.map(e=>e.name.toLowerCase()));
   for(const file of seen.keys())if(!names.has(path.basename(file).toLowerCase()))seen.delete(file);
   for(const e of entries){
    if(!e.isFile()||e.isSymbolicLink()||!/\.pdf$/i.test(e.name))continue;
    if(['.crdownload','.part','.download'].some(ext=>names.has(e.name.toLowerCase()+ext)))continue;
    const source=path.join(inbox,e.name),stat=await fs.stat(source),key=stat.size+':'+stat.mtimeMs;
    if(!force&&(seen.get(source)!==key||Date.now()-stat.mtimeMs<settleMs)){seen.set(source,key);continue}
    seen.set(source,key);
    if(registered.has(source.toLowerCase()))continue;
    const bytes=await fs.readFile(source);
    if(!bytes.subarray(0,1024).includes(Buffer.from('%PDF-'))||!bytes.subarray(-4096).includes(Buffer.from('%%EOF')))continue;
    candidates.push({source,stat,hash:digest(bytes)});
   }
   if(!candidates.length){await writeStatus({moved:0,failed:0});return{moved:0,failed:0,inbox:await inboxCount()}}
   const index=new Map();for(const f of await pdfs(root)){try{const hash=digest(await fs.readFile(f));if(!index.has(hash))index.set(hash,f)}catch(e){if(e.code!=='ENOENT')throw e}}
   for(const c of candidates){
    const duplicate=index.get(c.hash),folder=duplicate?'_管理/重复与版本备份/自动整理':category(path.basename(c.source));
    const dir=await safeDir(path.join(root,folder));let target=path.join(dir,path.basename(c.source));
    const stem=path.parse(c.source).name;let suffix=0;while(true){try{await fs.lstat(target);suffix++;target=path.join(dir,stem+'_'+c.hash.slice(0,12)+(suffix>1?'_'+suffix:'')+'.pdf')}catch(e){if(e.code==='ENOENT')break;throw e}}
    // Copy exclusively so a download writer cannot modify the archived copy through a hard link.
    const stat=await fs.stat(c.source);if(stat.size!==c.stat.size||stat.mtimeMs!==c.stat.mtimeMs||digest(await fs.readFile(c.source))!==c.hash)continue;
    const record={at:new Date().toISOString(),from:c.source,to:target,sha256:c.hash,duplicateOf:duplicate||null,status:'pending',classification:'仅按文件名初筛'};
    history.push(record);const save=async()=>{const tmp=report+'.tmp';await fs.writeFile(tmp,JSON.stringify(history.slice(-500),null,2));await fs.rename(tmp,report)};
    await save();
    try{await fs.copyFile(c.source,target,require('node:fs').constants.COPYFILE_EXCL);if(digest(await fs.readFile(target))!==c.hash||digest(await fs.readFile(c.source))!==c.hash)throw Error('源文件仍在变化，已保留两份待核对');await fs.unlink(c.source);record.status='moved';moved++;index.set(c.hash,duplicate||target);seen.delete(c.source)}catch(e){record.status='error';failed++;record.error=e.code||'文件整理失败'}
    await save();
   }
   await writeStatus({moved,failed});return{moved,failed,inbox:await inboxCount()};
  }finally{try{if(lock){await lock.close();await fs.unlink(path.join(manage,'自动整理.lock'))}}finally{running=false}}
 }
 async function tick(){try{await scan()}catch(e){console.error('文献自动整理：',e.message);await fs.writeFile(path.join(manage,'自动整理状态.json'),JSON.stringify({checkedAt:new Date().toISOString(),state:'error',message:e.message})).catch(()=>{})}}
 function start(){if(timer)return;void tick();timer=setInterval(()=>void tick(),30000);timer.unref()}
 return{scan,start,stop(){clearInterval(timer);timer=null},inbox};
};
module.exports.category=category;
