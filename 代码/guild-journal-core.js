/* Factual journals: immutable revisions, date-level merge and source-backed reports. */
(function(root){
 'use strict';
 const KEY='fairytail-guild-daily-journal-v1';
 const copy=value=>JSON.parse(JSON.stringify(value));
 const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 function shift(date,days){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
 function week(date){const d=new Date(date+'T00:00:00Z');return shift(date,-((d.getUTCDay()+6)%7))}
 function hash(text){let h=2166136261;for(const c of text){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return(h>>>0).toString(36)}
 function normalize(value){
  const src=value&&typeof value==='object'?value:{},out={version:2,entries:{},reports:{},revisions:{}};
  for(const [id,row]of Object.entries(src.revisions||{}))if(row&&typeof row==='object')out.revisions[id]=copy(row);
  for(const group of ['entries','reports'])for(const [key,row]of Object.entries(src[group]||{})){
   if(!row||typeof row!=='object'||(group==='entries'&&!validDate(key)))continue;
   const item=copy(row);item.revisionId||='legacy-'+hash(JSON.stringify([group,key,row]));item.recordKey=group+':'+key;item.parentIds=Array.isArray(item.parentIds)?item.parentIds:[];
   out[group][key]=item;const revision=copy(item);delete revision.conflicts;out.revisions[item.revisionId]=revision;
  }
  return out;
 }
 function merge(a,b){
  a=normalize(a);b=normalize(b);const out=normalize({}),ids=[...new Set([...Object.keys(a.revisions),...Object.keys(b.revisions)])].sort();
  for(const id of ids){const x=a.revisions[id],y=b.revisions[id];out.revisions[id]=x&&y?(JSON.stringify(x)<JSON.stringify(y)?x:y):(x||y)}
  const ancestors=(id,target,seen=new Set())=>{if(id===target)return true;if(seen.has(id))return false;seen.add(id);return(out.revisions[id]?.parentIds||[]).some(parent=>ancestors(parent,target,seen))};
  for(const group of ['entries','reports'])for(const key of [...new Set([...Object.keys(a[group]),...Object.keys(b[group])])].sort()){
   const candidates=Object.values(out.revisions).filter(row=>row.recordKey===group+':'+key),tips=candidates.filter(row=>!candidates.some(other=>other.revisionId!==row.revisionId&&ancestors(other.revisionId,row.revisionId)));
   tips.sort((x,y)=>(Date.parse(y.updatedAt)||0)-(Date.parse(x.updatedAt)||0)||y.revisionId.localeCompare(x.revisionId));
   if(tips[0])out[group][key]={...tips[0],conflicts:tips.slice(1).map(row=>row.revisionId)};
  }
  return out;
 }
 function put(store,group,key,record,{id,now,parents}={}){
  store=normalize(store);const previous=store[group][key];
  const row={...copy(record),recordKey:group+':'+key,updatedAt:now||new Date().toISOString(),revisionId:id||crypto.randomUUID(),parentIds:parents||(previous?[previous.revisionId]:[])};
  delete row.conflicts;store[group][key]=row;store.revisions[row.revisionId]=row;return merge(store,store);
 }
 function hasContent(entry){return!!entry&&(Object.values(entry.templates||{}).some(g=>Object.values(g||{}).some(v=>String(v||'').trim()))||(entry.experiments||[]).some(g=>Object.values(g).some(v=>typeof v==='string'&&v.trim()&&v!==g.id))||!!String(entry.freeText||'').trim()||!!entry.continuity?.next||!!entry.continuity?.blocker)}
 function carryover(store,date){const from=shift(date,-1),entry=normalize(store).entries[from];if(!entry||entry.status!=='saved')return[];const rows=[];const add=(text,category,source)=>{text=String(text||'').trim();if(text&&!rows.some(r=>r.text===text))rows.push({text,category,date:from,source})};add(entry.continuity?.next,'学习','今日接续');for(const [k,g]of Object.entries(entry.templates||{}))add(g.next||g.tomorrow,k==='experiment'||k==='data'?'实验':'学习',k);for(const g of entry.experiments||[])add(g.next,'实验',g.name||'实验记录');return rows}
 function report(store,date,facts=[]){
  store=normalize(store);const start=week(date),end=shift(start,6),entries=Object.entries(store.entries).filter(([d,e])=>d>=start&&d<=end&&e.status==='saved'),sections={实验进展:[],数据整理:[],文献与学习:[],沟通与事务:[],问题与等待:[],下周接续:[]},sources=[];
  const add=(key,text,d,ref)=>{if(String(text||'').trim()){sections[key].push(d+' · '+String(text).trim());if(!sources.some(s=>s.id===ref))sources.push({id:ref,date:d})}};
  for(const [d,e]of entries){const groups=e.templates||{};for(const [key,title]of [['experiment','实验进展'],['data','数据整理'],['reading','文献与学习'],['communication','沟通与事务']])for(const [field,text]of Object.entries(groups[key]||{}))add(field==='next'?'下周接续':field==='waiting'||field==='question'||field==='check'?'问题与等待':title,text,d,'journal:'+d);for(const x of e.experiments||[])for(const field of ['name','done','progress','observation','location','next'])add(field==='next'?'下周接续':'实验进展',x[field],d,'journal:'+d);add('问题与等待',e.continuity?.blocker,d,'journal:'+d);add('下周接续',e.continuity?.next,d,'journal:'+d)}
  const records=facts.filter(f=>f.day>=start&&f.day<=end),text=['研究周报 · '+start+' 至 '+end,...Object.entries(sections).flatMap(([title,rows])=>['','【'+title+'】',...(rows.length?rows:['（待填写）'])]),'','【账本完成记录】',...records.map(f=>f.day+' · '+f.title)].join('\n');
  return{date:start,start,end,text,sources:[...sources,...records.map(f=>({id:f.key,date:f.day,title:f.title}))]};
 }
 const api={KEY,normalize,merge,put,hasContent,carryover,report,week,shift,validDate};root.GuildJournalCore=api;if(typeof module==='object')module.exports=api;
})(typeof globalThis==='object'?globalThis:this);
