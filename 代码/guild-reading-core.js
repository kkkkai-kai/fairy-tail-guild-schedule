/* Shared local/online literature state. Immutable reading revisions, deterministic rewards. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GuildReadingCore=api;})(globalThis,function(){
 'use strict';
 const KEY='fairytail-reading-library-v1',POLICY={archive:{j:5,exp:0},read:{j:30,exp:20},notes:{j:20,exp:10}};
 const plain=x=>x&&typeof x==='object'&&!Array.isArray(x),clone=x=>JSON.parse(JSON.stringify(x)),text=(v,n=4000)=>String(v??'').slice(0,n);
 const empty=()=>({version:1,papers:{},changes:{},receipts:{}});
 const stable=x=>JSON.stringify(x,(_,v)=>plain(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
 const doi=v=>text(v).trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'').toLowerCase();
 const stamp=x=>Number.isFinite(Date.parse(x))?Date.parse(x):0;
 const safeUrl=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}};
 function valid(input){return plain(input)&&input.version===1&&plain(input.papers)&&plain(input.changes)&&plain(input.receipts)}
 function merge(a,b){
  const result=empty();for(const source of [a,b])if(valid(source)){
   for(const[id,p]of Object.entries(source.papers))if(plain(p)&&p.id===id&&typeof p.title==='string'){
    const old=result.papers[id];if(!old||stamp(p.catalogAt)>stamp(old.catalogAt)||(stamp(p.catalogAt)===stamp(old.catalogAt)&&stable(p)>stable(old)))result.papers[id]=clone(p);
   }
   for(const group of ['changes','receipts'])for(const[id,record]of Object.entries(source[group]))if(plain(record)&&record.id===id&&typeof record.paperId==='string'){
    const old=result[group][id];if(!old||stable(record)>stable(old))result[group][id]=clone(record);
   }
  }return clone(JSON.parse(stable(result)));
 }
 function heads(data,paperId,kind){const rows=Object.values(data.changes||{}).filter(r=>r.paperId===paperId&&r.kind===kind),parents=new Set(rows.flatMap(r=>Array.isArray(r.parents)?r.parents:[]));return rows.filter(r=>!parents.has(r.id)).sort((a,b)=>stamp(a.at)-stamp(b.at)||a.id.localeCompare(b.id))}
 function change(data,paperId,kind,payload,{id,at=new Date().toISOString(),parents}={}){
  if(!data.papers[paperId])throw Error('文献不存在');
  id||=globalThis.crypto.randomUUID();if(data.changes[id])return data.changes[id];
  const row={id,paperId,kind,at,parents:parents||heads(data,paperId,kind).map(r=>r.id),payload:clone(payload)};data.changes[id]=row;return row;
 }
 function view(data,id){
  const source=data?.papers?.[id];if(!source)return null;const p=clone(source);p.conflicts=[];
  for(const kind of ['progress','notes','research','finish','receive','discard']){const leaves=heads(data,id,kind),latest=leaves.at(-1);if(leaves.length>1)p.conflicts.push({kind,versions:leaves});if(!latest)continue;
   if(kind==='progress')p.progress=latest.payload;
   if(kind==='notes')p.notes=latest.payload.text;
   if(kind==='research')p.research=latest.payload;
   if(kind==='finish'){p.status='read';p.completion=latest.payload;p.completedAt=latest.at;}
   if(kind==='receive'){p.saved=true;p.dispatch={state:'received',decidedAt:latest.at};}
   if(kind==='discard'){p.discardedAt=latest.at;p.saved=false;}
  }
  if(p.progress&&(p.progress.done?.length||Object.values(p.progress.notes||{}).some(Boolean))&&p.status!=='read')p.status='reading';
  return p;
 }
 function aliases(p){return['paper:'+p.id,...(doi(p.doi)?['doi:'+doi(p.doi)]:[]),...(p.pdf?.sha256?['sha:'+p.pdf.sha256]:[])]}
 function identity(p){return doi(p.doi)?'doi:'+doi(p.doi):p.pdf?.sha256?'sha:'+p.pdf.sha256:'paper:'+p.id}
 function recorded(data,p,kind){const keys=aliases(p);return Object.values(data.receipts).some(r=>r.kind===kind&&(r.paperId===p.id||(r.aliases||[]).some(k=>keys.includes(k))))}
 function rewardRows(data){
  const all=Object.values(data.receipts||{}),parents=new Map(),find=k=>{if(!parents.has(k))parents.set(k,k);if(parents.get(k)!==k)parents.set(k,find(parents.get(k)));return parents.get(k);},keys=r=>(r.aliases?.length?r.aliases:['paper:'+r.paperId]).map(k=>r.kind+'|'+k);
  for(const r of all){const group=keys(r);for(const k of group)parents.set(find(k),find(group[0]));}
  const historical=new Set(all.filter(r=>r.status==='legacy-trial').map(r=>find(keys(r)[0]))),rows=all.filter(r=>r.policy===1&&r.status==='granted'&&POLICY[r.kind]&&r.j===POLICY[r.kind].j&&r.exp===POLICY[r.kind].exp).sort((a,b)=>stamp(a.at)-stamp(b.at)||a.id.localeCompare(b.id)),seen=new Set(),days={},result=[];
  for(const r of rows){const group=find(keys(r)[0]);if(seen.has(group)||historical.has(group))continue;seen.add(group);if(r.kind==='archive'&&(days[r.date]=(days[r.date]||0)+1)>5)continue;result.push(r)}return result;
 }
 function rewardTotals(data){return rewardRows(valid(data)?data:empty()).reduce((a,r)=>({j:a.j+r.j,exp:a.exp+r.exp,count:a.count+1}),{j:0,exp:0,count:0})}
 function eligible(data,id,kind,takeaway='',linked=false){
  const p=view(data,id);if(!p?.saved||p.discardedAt)return'请先接收并保留此篇文献';
  if(!POLICY[kind])return'奖励类型无效';if(recorded(data,p,kind))return'此项已有记录，不重复结算';
  if(p.conflicts.some(c=>['progress','notes','research'].includes(c.kind)))return'先对照并解决不同设备的阅读记录';
  if(kind!=='archive'&&(linked||p.linkedTasks?.length))return'已关联普通委托，请从原委托结算';
  if(kind==='archive'){if(p.historicalImport!==false)return'历史文献不补发归档奖励';if(p.pdf?.verification?.status!=='matched')return'归档奖励需要PDF题名和DOI核验匹配';}
  if(kind==='read'){
   if(p.status==='read')return'已有已读记录，不追补奖励';
   if(String(takeaway).trim().length<8)return'请写至少8字的具体研读收获';
   if(!p.pdf?.sha256)return'请先在电脑保存PDF并确认原文身份';
   if(p.workbench?.panelIds?.length&&!p.workbench.panelIds.every(id=>p.progress?.done?.includes(id)))return'还有子图未标记研读完成';
  }
  if(kind==='notes'){
   if(p.status!=='read')return'请先确认完成研读';
   if(!['question','conditions','supports'].every(k=>String(p.research?.[k]||'').trim()))return'请填写研究问题、关键条件和支持结论';
   if(!p.research.sourcePage&&!p.research.sourceFigure)return'请保留至少一个原文页码或图号';
  }return'';
 }
 function claim(data,id,kind,body={}){
  const p=view(data,id);if(p&&recorded(data,p,kind))return{duplicate:true,message:'此项已记录，不重复结算'};
  if(kind==='read'&&p?.completion)return{duplicate:true,message:'研读成果已确认，不重复结算'};
  const linked=body.linkedTask||p?.linkedTasks?.length;
  if(kind==='read'&&linked){
   if(!p.saved||p.discardedAt||String(body.takeaway||'').trim().length<8||body.confirmed!==true)throw Error('请确认研读并记录至少8字收获');
   if(p.workbench?.panelIds?.some(id=>!p.progress?.done?.includes(id)))throw Error('还有子图未标记研读完成');
   change(data,id,'finish',{takeaway:text(body.takeaway),linkedTask:true});return{message:'研读已完成；由关联委托结算，本次不另发文献奖励'};
  }
  const reason=eligible(data,id,kind,body.takeaway,body.linkedTask);if(reason)throw Error(reason);
  if(body.confirmed!==true)throw Error('请明确确认本次研读成果');
  if(kind==='read'&&p.pdf.verification?.status!=='matched'&&body.identityConfirmed!==true)throw Error('请先确认当前PDF确为这篇论文');
  const at=body.at||new Date().toISOString(),date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
  if(kind==='archive'&&rewardRows(data).filter(r=>r.kind==='archive'&&r.date===date).length>=5)throw Error('今日5篇归档奖励已满');
  if(kind==='read')change(data,id,'finish',{takeaway:text(body.takeaway),sourceSha256:p.pdf.sha256,identityConfirmed:true},{at});
  const receipt={id:'literature:'+identity(p)+':'+kind,paperId:id,aliases:aliases(p),kind,...POLICY[kind],at,date,policy:1,status:'granted',title:p.title};data.receipts[receipt.id]=receipt;
  return{receipt,message:'已记录：'+receipt.j+' J＋'+receipt.exp+' EXP；主公会读取同一回执，不重复加账'};
 }
 function projectPaper(p,metric){
  const keys=['id','title','titleZh','doi','pmid','authors','journal','issn','year','publishedAt','foundAt','topic','priority','saved','status','historicalImport','collectedAt','dispatch','courier','linkedTasks','discardedAt'];
  const result={};for(const k of keys)if(p[k]!==undefined)result[k]=clone(p[k]);
  result.abstract=text(p.abstract,12000);result.notes=text(p.notes,20000);result.research=clone(p.research||{});result.sourceUrl=safeUrl(p.sourceUrl);result.catalogAt=p.updatedAt||p.workbench?.generatedAt||p.foundAt||'2000-01-01T00:00:00Z';
  result.pdf={status:p.pdf?.status||'not_requested',sha256:p.pdf?.sha256||'',verification:{status:p.pdf?.verification?.status||'pending',label:text(p.pdf?.verification?.label,500)}};
  if(p.workbench)result.workbench={sourceSha256:p.workbench.sourceSha256,panelIds:clone(p.workbench.panelIds||[]),generatedAt:p.workbench.generatedAt};
  if(metric)result.metric=clone(metric);return result;
 }
 return{KEY,POLICY,empty,valid,merge,stable,heads,change,view,aliases,identity,recorded,rewardRows,rewardTotals,eligible,claim,projectPaper,safeUrl};
});
