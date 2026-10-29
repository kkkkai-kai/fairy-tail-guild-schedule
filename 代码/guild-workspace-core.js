/* Pure research-guild views. Never settles rewards or writes personal records. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GuildWorkspaceCore=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const KEYS={tasks:'fairytail-tasks-v2',schedule:'fairytail-schedule-v1',growth:'fairytail-growth-v1',wallet:'fairytail-wallet-v1',warehouse:'fairytail-warehouse-v1',reading:'fairytail-reading-library-v1'};
 const parse=(v,f)=>{try{return typeof v==='string'?JSON.parse(v):v??f}catch{return f}};
 const stable=v=>JSON.stringify(sort(v));
 function sort(v){return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v}
 const taskTime=t=>Math.max(0,...[t.dossier?.updatedAt,t.workProgress?.updatedAt,t.startedAt,t.acceptedAt,t.createdAt].map(x=>Date.parse(x)||0));
 function beijingDay(value){const stamp=Date.parse(value);return Number.isFinite(stamp)?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(stamp)):''}
 function metrics(values,readingRewards={j:0,exp:0},dailyFallback=null){
  const tasks=parse(values[KEYS.tasks],[]),days=parse(values[KEYS.schedule],{}),growth=parse(values[KEYS.growth],{}),wallet=parse(values[KEYS.wallet],{});
  let dailyJ=0,dailyDone=0,missingReward=0;
  for(const s of Object.values(days))for(const [id,on]of Object.entries(s.checked||{}))if(on){dailyDone++;if(s.rewards?.[id]===undefined){missingReward++;if(dailyFallback)dailyJ+=Number(dailyFallback(id,s))||0}else dailyJ+=Number(s.rewards[id])||0}
  const taskJ=tasks.reduce((sum,t)=>sum+(t.type==='project'?(t.steps||[]).filter(s=>s.done).reduce((n,s)=>n+(Number(s.settledJ??s.reward)||0),0):t.type==='once'&&t.done&&!t.legacyCounted?Number(t.settledJ??t.reward)||0:0),0);
  const spent=(wallet.redemptions||[]).reduce((n,r)=>n+(Number(r.j)||0),0),bonus=(wallet.bonus||[]).reduce((n,r)=>n+(Number(r.j)||0),0);
  const exp=Object.values(growth.entries||{}).reduce((n,e)=>n+(e.active?Number(e.levelExp??e.exp)||0:0),0)+(Number(readingRewards.exp)||0);
  return{tasks:tasks.length,completedTasks:tasks.filter(t=>t.done||t.completedAt).length,historyDays:Object.keys(days).filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k)).length,dailyDone,exp,income:dailyJ+taskJ+(Number(readingRewards.j)||0),balance:dailyJ+taskJ+(Number(readingRewards.j)||0)+bonus-spent,missingReward};
 }
 function compare(local,remote){const fields=['tasks','completedTasks','historyDays','dailyDone','exp','income','balance'];return fields.filter(k=>local[k]!==remote[k]).map(key=>({key,local:local[key],remote:remote[key]}))}
 function contentDifferences(local,remote){
  function records(key,value){const v=parse(value,{});if(key===KEYS.tasks)return Object.fromEntries((Array.isArray(v)?v:[]).filter(t=>t.id).map(t=>[t.id,t]));if(key===KEYS.growth)return{...(v.entries||{}),...Object.fromEntries((v.guildLedger||[]).map(r=>['账本:'+r.ledgerKey,r])),附加档案:v.v4||null};if(key===KEYS.wallet)return{...Object.fromEntries((v.redemptions||[]).map((r,i)=>['兑换:'+(r.id||stable(r)+i),r])),...Object.fromEntries((v.bonus||[]).map((r,i)=>['津贴:'+(r.id||stable(r)+i),r])),兑换规则:{rate:v.rate,cap:v.cap}};return v}
  const out=[];for(const [key,label]of [[KEYS.tasks,'委托'],[KEYS.schedule,'日程日期'],[KEYS.growth,'成长与账本'],[KEYS.wallet,'兑换与津贴'],[KEYS.warehouse,'仓库']]){const a=records(key,local[key]),b=records(key,remote[key]),onlyLocal=Object.keys(a).filter(k=>!Object.hasOwn(b,k)),onlyRemote=Object.keys(b).filter(k=>!Object.hasOwn(a,k)),changed=Object.keys(a).filter(k=>Object.hasOwn(b,k)&&stable(a[k])!==stable(b[k]));if(onlyLocal.length||onlyRemote.length||changed.length)out.push({key,label,onlyLocal,onlyRemote,changed})}return out;
 }
 function missingRecords(oldRows,newRows){const id=v=>v?.id||v?.key||stable(v),have=new Set((newRows||[]).map(id));return(oldRows||[]).filter(v=>!have.has(id(v))).length}
 function reductions(key,oldRaw,newRaw){
  const a=parse(oldRaw,null),b=parse(newRaw,null);if(!a||!b)return[];const result=[];
  if(key===KEYS.schedule){const missing=Object.keys(a).filter(k=>/^\d{4}-\d{2}-\d{2}$/.test(k)&&!Object.hasOwn(b,k));if(missing.length)result.push('日程缺少 '+missing.length+' 天历史')}
  if(key===KEYS.tasks){const ids=new Set(b.map(t=>t.id)),missing=a.filter(t=>(t.done||t.completedAt)&&!ids.has(t.id));if(missing.length)result.push('缺少 '+missing.length+' 项已完成委托')}
  if(key===KEYS.growth){const missing=Object.keys(a.entries||{}).filter(k=>!Object.hasOwn(b.entries||{},k));if(missing.length)result.push('缺少 '+missing.length+' 条成长记录')}
  if(key===KEYS.wallet)for(const field of ['redemptions','bonus']){const n=missingRecords(a[field],b[field]);if(n)result.push((field==='redemptions'?'兑换':'津贴')+'缺少 '+n+' 条记录')}
  return result;
 }
 function mergeDossiers(a={},b={}){
  const versions=[a.dossier,b.dossier,...(a.dossierVersions||[]),...(b.dossierVersions||[])].filter(v=>v&&typeof v==='object'&&!Array.isArray(v));
  const unique=[...new Map(versions.map(v=>[stable(v),v])).values()].sort((x,y)=>(Date.parse(y.updatedAt)||0)-(Date.parse(x.updatedAt)||0)||stable(x).localeCompare(stable(y)));
  return unique.length?{dossier:unique[0],dossierVersions:unique.slice(1)}:{};
 }
 function mergeLedgerRows(a=[],b=[]){const map=new Map();for(const row of [...a,...b]){if(!row||!row.ledgerKey)continue;const old=map.get(row.ledgerKey),time=r=>Date.parse(r.updatedAt||r.reversedAt||r.createdAt)||0;if(!old||time(row)>time(old)||time(row)===time(old)&&stable(row).localeCompare(stable(old))>0)map.set(row.ledgerKey,row)}return[...map.values()].sort((a,b)=>(Date.parse(a.createdAt)||0)-(Date.parse(b.createdAt)||0)||String(a.ledgerKey).localeCompare(String(b.ledgerKey)))}
 function explicitUndoWins(undone,completed){return !!(completed?.done||completed?.completedAt)&&undone?.type==='once'&&!undone.done&&!undone.completedAt&&Number.isFinite(Date.parse(undone.completionRevokedAt))&&Date.parse(undone.completionRevokedAt)>(Date.parse(completed?.completedAt)||0)}
 function mergeWorkspaceStates(a={},b={}){const rows=[a.workspaceState,b.workspaceState,...(a.workspaceStateVersions||[]),...(b.workspaceStateVersions||[])].filter(r=>r&&typeof r==='object'),unique=[...new Map(rows.map(r=>[stable(r),r])).values()].sort((a,b)=>(Date.parse(b.at)||0)-(Date.parse(a.at)||0)||stable(a).localeCompare(stable(b)));if(!unique.length)return{};const patch={workspaceState:unique[0],workspaceStateVersions:unique.slice(1)};if(!(a.done||a.completedAt||b.done||b.completedAt)){patch.status=a.status==='cancelled'||b.status==='cancelled'?'cancelled':unique[0].status;patch.pausedAt=unique[0].pausedAt||''}return patch}
 function deliveryIssue(task,outcome=task.outcome||{}){const mode=task.dossier?.deliveryMode||'optional';if(['summary','both'].includes(mode)&&!String(outcome.summary||'').trim())return'这项委托约定记录一句实际成果。';if(['file','both'].includes(mode)&&!String(outcome.references||'').trim())return'这项委托约定记录成果位置或链接。';return''}
 function staleTasks(tasks,now=Date.now()){return tasks.filter(t=>!t.done&&!['completed','cancelled','archived'].includes(t.status)&&taskTime(t)&&now-taskTime(t)>=14*86400000).sort((a,b)=>taskTime(a)-taskTime(b))}
 function memberHistory(tasks,id){const list=tasks.filter(t=>t.assigneeId===id);return{completed:list.filter(t=>t.done).sort((a,b)=>(Date.parse(b.completedAt)||0)-(Date.parse(a.completedAt)||0)),waiting:list.filter(t=>!t.done&&(t.waitingActive||t.blockedReason||t.pausedAt)),active:list.filter(t=>!t.done&&!['cancelled','archived'].includes(t.status))}}
 function bottlenecks(tasks){const groups=new Map();for(const t of tasks.filter(t=>!t.done&&(t.waitingActive||t.blockedReason))){const reason=t.waitingFor||t.blockedReason||'等待外部条件';if(!groups.has(reason))groups.set(reason,[]);groups.get(reason).push(t)}return[...groups].map(([reason,tasks])=>({reason,tasks}))}
 function workArchive(tasks,journal,range){const inRange=value=>{const d=beijingDay(value);return d&&d>=range.start&&d<=range.end},projects=new Map(),repeated=new Map();for(const t of tasks){const completed=t.done&&inRange(t.completedAt),steps=(t.steps||[]).filter(s=>s.done&&inRange(s.completedAt));if(!completed&&!steps.length)continue;const parent=tasks.find(p=>p.id===t.dossier?.projectId),id=parent?.id||(t.type==='project'?t.id:'independent'),label=parent?.title||(t.type==='project'?t.title:'独立委托');if(!projects.has(id))projects.set(id,{id,label,items:[]});if(completed)projects.get(id).items.push({taskId:t.id,title:t.title,summary:t.outcome?.summary||'',references:t.outcome?.references||''});steps.forEach(s=>projects.get(id).items.push({taskId:t.id,title:s.title,summary:s.note||'',references:'',stage:true}))}const days=Object.entries(journal.entries||{}).filter(([d])=>d>=range.start&&d<=range.end);for(const [date,entry]of days){for(const text of [entry.templates?.communication?.waiting,entry.templates?.data?.check].filter(Boolean)){const key=String(text).normalize('NFKC').replace(/\s+/g,' ').trim();if(!key)continue;if(!repeated.has(key))repeated.set(key,new Set());repeated.get(key).add(date)}}return{projects:[...projects.values()],days:days.map(([date])=>date),repeated:[...repeated].filter(([,dates])=>dates.size>=2).map(([text,dates])=>({text,dates:[...dates].sort()}))}}
 function evidenceGroups(papers){const groups=new Map();for(const p of papers.filter(p=>p.saved&&!p.discardedAt)){const q=String(p.research?.question||'').normalize('NFKC').replace(/\s+/g,' ').trim();if(!q)continue;const key=q.toLocaleLowerCase();if(!groups.has(key))groups.set(key,{question:q,papers:[]});groups.get(key).papers.push(p)}return[...groups.values()]}
 function projectFacts(task,tasks,papers){const ids=new Set(task.dossier?.paperIds||[]);return{children:tasks.filter(t=>t.id!==task.id&&t.dossier?.projectId===task.id),papers:papers.filter(p=>ids.has(p.id)||(p.linkedTasks||[]).some(t=>t.id===task.id)),stages:(task.steps||[]).map(s=>({id:s.id,title:s.title,done:!!s.done,outcome:s.note||''})),outcome:task.outcome||{}}}
 function lifeEvent(scene,date,hour,weather,finished){const rain=/雨/.test(weather||'');if(scene==='mainHall')return rain?{id:'rain',text:'窗外有雨，伙伴把卷宗收进了干燥的桌角。',icon:'guild-ui-book-v210.svg'}:hour>=20?{id:'lamplight',text:'晚灯下，桌上的卷宗正被慢慢收好。',icon:'guild-ui-ledger-v210.svg'}:{id:'table',text:finished?'桌上多了一份已交付的卷宗。':'桌上留着今天的日程，伙伴各自忙着。',icon:'guild-ui-quest-v210.svg'};if(scene==='guildTavern')return{id:'tea',text:'吧台留了一杯茶，可以歇一会儿。',icon:'guild-scene-icon-tavern-v102.webp'};return null}
 function recoverSchedule(current,old,growth={}){
  const value=JSON.parse(JSON.stringify(current||{})),own=(v,k)=>Object.prototype.hasOwnProperty.call(v||{},k);
  for(const [date,source]of Object.entries(old||{})){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!source||typeof source!=='object'||Array.isArray(source))continue;
   if(!own(value,date)){value[date]=JSON.parse(JSON.stringify(source));continue}
   const day=value[date];if(!day||typeof day!=='object'||Array.isArray(day))continue;
   for(const [id,done]of Object.entries(source.checked||{})){
    const entry=growth?.entries?.['daily:'+date+':'+id];
    if(done!==true||entry?.active===false)continue;
    if(!own(day.checked,id)){day.checked??={};day.checked[id]=true}
    if(day.checked?.[id]!==true)continue;
    if(own(source.rewards,id)&&!own(day.rewards,id)){day.rewards??={};day.rewards[id]=source.rewards[id]}
    if(own(source.completedAt,id)&&!own(day.completedAt,id)){day.completedAt??={};day.completedAt[id]=source.completedAt[id]}
    const extra=(source.extra||[]).find(e=>e.id===id);
    if(extra&&!(day.extra||[]).some(e=>e.id===id)){day.extra??=[];day.extra.push(JSON.parse(JSON.stringify(extra)))}
   }
  }
  return value;
 }
 const textKey=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
 function sceneHash(value){let n=2166136261;for(const c of String(value)){n^=c.charCodeAt(0);n=Math.imul(n,16777619)}return n>>>0}
 function projectDesk(tasks,papers,date){
  const projects=tasks.filter(t=>t.type==='project'&&!['archived','cancelled'].includes(t.status)&&(!t.done||beijingDay(t.completedAt)===date)).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  if(!projects.length)return null;
  const project=projects[sceneHash(date+'|desk|'+projects.map(t=>t.id).join('|'))%projects.length],facts=projectFacts(project,tasks,papers);
  return{project,children:facts.children,steps:facts.stages,papers:facts.papers,completedSteps:facts.stages.filter(s=>s.done).length,completedChildren:facts.children.filter(t=>t.done).length,artifact:project.outcome?.references||project.dossier?.artifact||'',summary:project.outcome?.summary||'',date};
 }
 function continuityNotes(rows,tasks,date){
  return rows.map(row=>{const key=textKey(row.text),matches=tasks.filter(t=>t.status!=='cancelled'&&(textKey(t.title)===key||t.dossier?.sourceJournal?.date===row.date&&textKey(t.dossier.sourceJournal.text)===key));
   if(matches.some(t=>t.done&&beijingDay(t.completedAt)>=date))return null;
   const linked=matches.find(t=>!t.done);return{...row,key:'journal:'+row.date+':'+sceneHash(key),linkedTaskId:linked?.id||'',status:linked?'linked':'unregistered'};
  }).filter(Boolean);
 }
 function readingShelf(papers,date){
  const groups=[['unread','待研读'],['reading','研读中'],['read','已读归档']];
  return groups.map(([state,label])=>{const rows=papers.filter(p=>p.saved&&!p.discardedAt&&(state==='unread'?!['read','reading'].includes(p.status):p.status===state)).slice().sort((a,b)=>String(a.id).localeCompare(String(b.id)));
   return rows.length?{state,label,count:rows.length,paper:rows[sceneHash(date+'|shelf|'+state+'|'+rows.map(p=>p.id).join('|'))%rows.length]}:null;
  }).filter(Boolean);
 }
 function memberMemory(tasks,id,date){
  const completed=[];for(const t of tasks.filter(t=>t.assigneeId===id&&t.status!=='cancelled')){
   if(t.done&&t.completedAt)completed.push({taskId:t.id,at:t.completedAt,kind:'completion',text:'我们一起完成过「'+t.title+'」。'+(t.outcome?.summary?'你留下的成果记录是：'+t.outcome.summary:'完成记录仍收在公会卷宗里。')});
   for(const s of t.steps||[])if(s.done&&s.completedAt)completed.push({taskId:t.id,at:s.completedAt,kind:'stage',text:'「'+t.title+'」里的「'+s.title+'」已经完成，阶段记录还在。'});
  }
  completed.sort((a,b)=>(Date.parse(b.at)||0)-(Date.parse(a.at)||0)||a.taskId.localeCompare(b.taskId));
  const candidates=completed.slice(0,3);if(!candidates.length){const next=tasks.find(t=>t.assigneeId===id&&!t.done&&!['archived','cancelled'].includes(t.status)&&t.workProgress?.next);return next?{taskId:next.id,kind:'next',text:'你给「'+next.title+'」留下的下一步是：'+next.workProgress.next}:null}
  return candidates[sceneHash(id+'|memory|'+date)%candidates.length];
 }
 return Object.freeze({KEYS,stable,parse,beijingDay,metrics,compare,contentDifferences,reductions,mergeDossiers,mergeWorkspaceStates,explicitUndoWins,mergeLedgerRows,deliveryIssue,staleTasks,memberHistory,bottlenecks,workArchive,evidenceGroups,projectFacts,lifeEvent,recoverSchedule,projectDesk,continuityNotes,readingShelf,memberMemory});
});
