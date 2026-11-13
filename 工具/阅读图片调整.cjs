'use strict';
const fs=require('fs/promises'),path=require('path'),os=require('os'),crypto=require('crypto'),{promisify}=require('util'),exec=promisify(require('child_process').execFile);
module.exports=({read,edit})=>{
 async function paper(id){const p=(await read()).papers.find(p=>p.id===id&&!p.discardedAt);if(!p?.workbench||!p.pdf?.path)throw Error('原PDF或工作台未关联');const hash=crypto.createHash('sha256').update(await fs.readFile(p.pdf.path)).digest('hex');if(hash!==p.workbench.sourceSha256)throw Error('PDF版本已变化，未应用旧裁剪');return p}
 function box(b){if(!Array.isArray(b)||b.length!==4||b.some(v=>typeof v!=='number'||!Number.isFinite(v))||!(0<=b[0]&&b[0]<b[2]&&b[2]<=1&&0<=b[1]&&b[1]<b[3]&&b[3]<=1))throw Error('裁剪范围无效');return b}
 async function render(p,page,bbox){if(!Number.isInteger(page)||page<1)throw Error('页码无效');const python=process.env.PAPER_READING_PYTHON||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');const {stdout}=await exec(python,['-X','utf8',path.join(__dirname,'../维护技能/paper-reading-workbench/scripts/render_reader_page.py'),p.pdf.path,String(page),JSON.stringify(bbox)],{maxBuffer:40*1024*1024,timeout:30000,windowsHide:true});return JSON.parse(stdout)}
 async function source(p,panel){if(!p.workbench.panelIds.includes(panel))throw Error('子图不存在');const html=await fs.readFile(p.workbench.htmlPath,'utf8');const data=JSON.parse(html.match(/<script id="paper-data" type="application\/json">([\s\S]*?)<\/script>/)?.[1]||'null');const item=data?.figures.flatMap(f=>f.panels).find(p=>p.id===panel);if(!item?.source?.page)throw Error('缺少原页来源');return item.source}
 return{
  list:async id=>(await paper(id)).workbench.manualCrops||{},
  page:async(id,panel)=>{const p=await paper(id),s=await source(p,panel);return{...await render(p,s.page,null),page:s.page}},
  image:async(id,panel)=>{const p=await paper(id),v=p.workbench.manualCrops?.[panel];if(!v||v.reset)return{reset:true};return{...await render(p,v.page,box(v.bbox)),...v}},
  save:async body=>{const p=await paper(body.id),s=await source(p,body.panel),old=p.workbench.manualCrops?.[body.panel];if(body.baseRevision!==(old?.revision||0))throw Error('裁剪已在另一窗口更新，请重新打开图片');const next={revision:(old?.revision||0)+1,page:s.page,reset:body.reset===true,...(body.reset===true?{}:{bbox:box(body.bbox)})};const image=next.reset?{}:await render(p,s.page,next.bbox);await edit(d=>{const target=d.papers.find(q=>q.id===body.id&&!q.discardedAt);if(!target||target.workbench?.sourceSha256!==p.workbench.sourceSha256||(target.workbench.manualCrops?.[body.panel]?.revision||0)!==body.baseRevision)throw Error('记录已变化，请重新打开图片');target.workbench.manualCrops||={};target.workbench.manualCrops[body.panel]=next});return{...image,...next}}
 };
};
