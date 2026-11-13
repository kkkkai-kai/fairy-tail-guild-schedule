'use strict';
// Uses the existing literature record lock/atomic writer. Never touches task or reward ledgers.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
module.exports=function createWorkbenchBridge({ROOT,read,edit,classify,dateKey,BASE,metricFor}){
 const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 const doi=v=>String(v||'').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'').toLowerCase();
 const folders={sg:'01_应激颗粒',zn:'02_应激与Zn离子',cross:'03_应激颗粒与Zn交叉',canine:'04_犬CAR-T',zinc:'06_锌离子综合',ndv:'07_NDV',rnaphagy:'08_RNA自噬',other:'99_待分类'};
 const inside=(root,file)=>{const rel=path.relative(root,file);return !!rel&&!rel.startsWith('..')&&!path.isAbsolute(rel)};
 async function fileInfo(file,extension){
  const full=path.resolve(String(file||'')),stat=await fs.lstat(full);
  if(stat.isSymbolicLink()||!stat.isFile()||path.extname(full).toLowerCase()!==extension)throw Error('工作台需引用普通'+extension+'文件');
  const real=await fs.realpath(full),bytes=await fs.readFile(real);
  if(extension==='.pdf'&&(!bytes.subarray(0,1024).includes(Buffer.from('%PDF-'))||!bytes.subarray(-4096).includes(Buffer.from('%%EOF'))))throw Error('源文件不是完整PDF');
  return{path:real,sha256:digest(bytes),bytes:bytes.length,content:extension==='.html'?bytes.toString('utf8'):undefined};
 }
 async function copyOnce(source,target,expected){
  await fs.mkdir(path.dirname(target),{recursive:true});
  const realRoot=await fs.realpath(ROOT),parent=await fs.realpath(path.dirname(target));if(parent!==realRoot&&!inside(realRoot,parent))throw Error('归档目标越出资料库');
  try{const stat=await fs.lstat(target);if(stat.isSymbolicLink()||!stat.isFile())throw Error('归档目标不是普通文件');const old=await fs.readFile(target);if(digest(old)===expected)return target;throw Error('归档目标已有不同内容，未覆盖：'+path.basename(target))}catch(error){if(error.code!=='ENOENT')throw error}
  await fs.copyFile(source,target,require('node:fs').constants.COPYFILE_EXCL);if(digest(await fs.readFile(target))!==expected)throw Error('复制过程中源文件发生变化，未关联记录');return target;
 }
 async function register(body){
  const title=String(body.title||'').trim(),titleZh=String(body.titleZh||'').trim(),identity=doi(body.doi);
  if(!title||title.length>2000||!titleZh||titleZh.length>2000)throw Error('需要真实中英文题名');
  if(identity&&!/^10\.\d{4,9}\/\S+$/.test(identity))throw Error('DOI格式无效');
  if(!/^[a-f0-9]{64}$/.test(body.sourceSha256||''))throw Error('缺少PDF SHA256');
  const pdf=await fileInfo(body.pdfPath,'.pdf'),html=await fileInfo(body.htmlPath,'.html');
  if(pdf.sha256!==body.sourceSha256)throw Error('PDF在生成后发生变化');
  // A generated workbench must identify the same source; no arbitrary HTML attachments.
  const match=html.content.match(/<script id="paper-data" type="application\/json">([\s\S]*?)<\/script>/);
  let embedded;try{embedded=JSON.parse(match?.[1]||'null')}catch{throw Error('工作台内嵌数据无法核对')}
  if(embedded?.source_sha256!==pdf.sha256||embedded.title_en!==title||doi(embedded.doi)!==identity)throw Error('工作台与PDF题录不一致');
  const ids=embedded.figures?.flatMap(f=>f.panels?.map(p=>p.id)||[])||[];
  if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'))throw Error('工作台子图标识无效');
  if(embedded.figures.some(f=>f.panels.some(p=>!p.source?.page||!Array.isArray(p.source?.bbox))))throw Error('工作台缺少可追溯裁图来源');
  await read();const root=await fs.realpath(ROOT),info=classify(title,String(body.summary||''));
  const result=await edit(async data=>{
   const bySha=data.papers.filter(p=>p.pdf?.sha256===pdf.sha256);
   const byDoi=identity?data.papers.filter(p=>doi(p.doi)===identity):[];
   const found=[...new Set([...bySha,...byDoi])];
   if(found.length>1)throw Error('库中有多个候选记录，需人工确认，不自动合并');
   let paper=found[0];
   if(paper?.discardedAt||paper?.dispatch?.state==='skipped')throw Error('此篇已被略过，不自动重新入库');
   if(paper&&identity&&paper.doi&&doi(paper.doi)!==identity)throw Error('PDF指纹相同但DOI冲突，请人工核对');
   if(paper?.pdf?.sha256&&paper.pdf.sha256!==pdf.sha256)throw Error('同DOI对应不同PDF版本，未替换旧文献');
   if(paper?.pdf?.path&&!paper.pdf.sha256){const old=await fileInfo(paper.pdf.path,'.pdf');if(old.sha256!==pdf.sha256)throw Error('原库PDF版本不同，未覆盖原文件')}
   const folder=folders[info.topic]||folders.other;
   let pdfPath=pdf.path;
   if(!inside(root,pdf.path)){
    const safe=(dateKey()+' '+title).replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').replace(/\s+/g,' ').slice(0,140).trim();
    pdfPath=await copyOnce(pdf.path,path.join(root,folder,safe+'-'+pdf.sha256.slice(0,8)+'.pdf'),pdf.sha256);
   }
   const artifactDir=path.join(root,'_管理','阅读工作台',pdf.sha256);await fs.mkdir(artifactDir,{recursive:true});
   const artifact=path.join(artifactDir,html.sha256+'.html');await copyOnce(html.path,artifact,html.sha256);
   if(!paper){
    paper={id:identity?'doi:'+identity:'pdf:'+pdf.sha256,title,titleZh,doi:identity,journal:String(body.journal||'').slice(0,500),authors:String(body.authors||'').slice(0,2000),year:String(body.year||''),source:'AI精读工作台',sourceUrl:identity?'https://doi.org/'+identity:'',topic:info.topic,tags:[info.topic],priority:info.priority,warnings:['工作台由AI解读生成，仍需用户核对原文'],saved:true,status:'unread',notes:'',historicalImport:true,foundAt:new Date().toISOString(),pdf:{status:'downloaded',path:pdfPath,sha256:pdf.sha256,bytes:pdf.bytes,verification:{status:'pending',label:'工作台源文件指纹一致；题名与DOI身份仍由原核验流程确认'}},dispatch:{state:'received',decidedAt:new Date().toISOString()}};
    data.papers.push(paper);
   }
   // Preserve original title, PDF, courier, notes, state, tasks and rewards for existing records.
   if(!paper.titleZh)paper.titleZh=titleZh;
   if(!paper.pdf?.path)paper.pdf={status:'downloaded',path:pdfPath,sha256:pdf.sha256,bytes:pdf.bytes,verification:{status:'pending',label:'已关联工作台源PDF，仍需原身份核验'}};
   paper.workbench={...(paper.workbench||{}),schemaVersion:1,sourceSha256:pdf.sha256,htmlSha256:html.sha256,htmlPath:artifact,panelIds:ids,generatedAt:new Date().toISOString(),aiSummary:String(body.summary||'').slice(0,4000),question:String(body.question||'').slice(0,4000),evidenceCount:Array.isArray(embedded.evidence)?embedded.evidence.length:ids.length};
   return{id:paper.id};
  });
  const p=(await read()).papers.find(p=>p.id===result.id);
  let shortcut;try{shortcut=await require('./阅读快捷方式.cjs').writeShortcut({pdfPath:pdf.path,paperId:p.id,sourceSha256:pdf.sha256,base:BASE})}catch(error){shortcut={ok:false,message:error.message}}
  return{ok:true,paperId:p.id,courierName:p.courier?.name||'',viewerUrl:BASE+'/workbench?id='+encodeURIComponent(p.id),libraryUrl:BASE+'/?view=library&paper='+encodeURIComponent(p.id),pendingReception:!p.saved,shortcut};
 }
 async function artifact(id){
  const p=(await read()).papers.find(p=>p.id===id&&!p.discardedAt);if(!p?.workbench)throw Error('本篇尚无阅读工作台');
  const file=await fileInfo(p.workbench.htmlPath,'.html'),root=await fs.realpath(path.join(ROOT,'_管理','阅读工作台'));
  if(!inside(root,file.path)||file.sha256!==p.workbench.htmlSha256)throw Error('工作台文件已变化，请重新生成并关联');
  return file.content;
 }
 async function progress(body){
  if(!/^[a-f0-9]{64}$/.test(body.sourceSha256||''))throw Error('文献指纹无效');
  return edit(data=>{
   const p=data.papers.find(p=>p.id===body.paperId&&!p.discardedAt);const w=p?.workbench;
   if(!w||w.sourceSha256!==body.sourceSha256)throw Error('本篇工作台未关联或PDF版本不同');
   if(body.baseRevision!==Number(w.progress?.revision||0))throw Error('阅读记录已在另一窗口更新，请刷新后导入或对照；本机笔记仍保留');
   const done=[...new Set(Array.isArray(body.done)?body.done:[])];if(done.some(id=>!w.panelIds.includes(id)))throw Error('含未知子图');
   const notes=Object.create(null);for(const [id,value]of Object.entries(body.notes||{})){if(!w.panelIds.includes(id)||typeof value!=='string'||value.length>20000)throw Error('子图笔记无效');notes[id]=value}
   const questions=Array.isArray(body.questions)?body.questions.slice(0,200).map(q=>{if(!q||typeof q.id!=='string'||typeof q.text!=='string'||q.text.length>4000||typeof q.done!=='boolean'||(q.panel&&!w.panelIds.includes(q.panel)))throw Error('问题清单格式无效');return{id:q.id,text:q.text,done:q.done,panel:q.panel||''}}):[];
   // Absent field means an older client; it must never clear saved highlights.
   let highlights=w.progress?.highlights;
   if(Object.hasOwn(body,'highlights')){
    if(!Array.isArray(body.highlights)||body.highlights.length>1000)throw Error('高亮数量或格式无效');
    const seen=new Set();highlights=body.highlights.map(h=>{
     if(!h||typeof h.id!=='string'||!h.id||h.id.length>200||seen.has(h.id)||typeof h.text!=='string'||!h.text||h.text.length>20000||typeof h.note!=='string'||h.note.length>20000)throw Error('高亮或备注格式无效');
     seen.add(h.id);const v={id:h.id,text:h.text,note:h.note};
     for(const k of ['panelId','field','scope'])if(h[k]!==undefined){if(typeof h[k]!=='string'||h[k].length>300)throw Error('高亮锚点格式无效');v[k]=h[k]}
     for(const k of ['start','end'])if(h[k]!==undefined){if(!Number.isSafeInteger(h[k])||h[k]<0||h[k]>10000000)throw Error('高亮区间无效');v[k]=h[k]}
     if(v.start!==undefined&&v.end!==undefined&&(v.end<=v.start||v.end-v.start!==v.text.length))throw Error('高亮区间与文字不符');return v;
    });
   }
   const next={revision:Number(w.progress?.revision||0)+1,done,notes,questions,...(highlights!==undefined?{highlights}:{}),updatedAt:new Date().toISOString(),allPanelsChecked:done.length===w.panelIds.length};
   if(w.progress)w.progressVersions=[...(w.progressVersions||[]),w.progress].slice(-5);
   w.progress=next;
   // Reading all panels is not task completion or a trial reward claim.
   if(p.saved&&p.status==='unread'&&(done.length||Object.values(notes).some(Boolean)))p.status='reading';
   return{ok:true,progress:next};
  });
 }
 async function getProgress(id){const data=await read(),p=data.papers.find(p=>p.id===id&&!p.discardedAt);if(!p?.workbench)throw Error('工作台未关联');return{progressSchemaVersion:2,paperId:p.id,sourceSha256:p.workbench.sourceSha256,progress:p.workbench.progress||{revision:0,done:[],notes:{},questions:[]},linkedTasks:p.linkedTasks||[],status:p.status,courierName:p.courier?.name||'',metric:metricFor?metricFor(p,data):null}}
 return{register,artifact,progress,getProgress};
};
