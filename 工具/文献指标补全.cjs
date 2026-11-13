'use strict';
module.exports=function({read,edit,fetchJson,publicUrl,cleanDoi,strip}){
 const norm=v=>String(v||'').normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'').toLowerCase();
 async function metadata(id){
  const p=(await read()).papers.find(p=>p.id===id&&!p.discardedAt);if(!p?.doi)throw Error('请先核对并填写DOI');
  const json=await fetchJson('https://api.crossref.org/works/'+encodeURIComponent(p.doi)),m=json.message;if(cleanDoi(m?.DOI)!==cleanDoi(p.doi))throw Error('Crossref DOI未匹配，未写入');
  if(norm(m.title?.[0])!==norm(p.title))throw Error('Crossref题名与当前题名不同，请先核对版本和题录');
  return edit(d=>{const current=d.papers.find(p=>p.id===id);if(current.doi!==p.doi||current.title!==p.title)throw Error('题录已变，请重新核对');
   current.journal||=strip(m['container-title']?.[0]);current.issn||=m.ISSN?.[0]||'';current.authors||=(m.author||[]).map(a=>[a.given,a.family].filter(Boolean).join(' ')).join(', ');current.year||=String(m.published?.['date-parts']?.[0]?.[0]||'');
   current.metadataCheck={at:new Date().toISOString(),sourceUrl:'https://api.crossref.org/works/'+encodeURIComponent(p.doi),matched:true};current.updatedAt=new Date().toISOString();return{message:'DOI与题名匹配，已补充缺失期刊、ISSN、作者和年份；未改变原题名'};});
 }
 async function metric(id){
  const data=await read(),p=data.papers.find(p=>p.id===id&&!p.discardedAt);if(!p)throw Error('文献不存在');
  const candidates=(data.metrics||[]).filter(m=>(m.issn&&m.issn===p.issn)||norm(m.journal)===norm(p.journal));
  const urls=[...new Set(candidates.filter(m=>m.verified).map(m=>m.sourceUrl).filter(Boolean))].slice(0,2);
  const results=[];
  for(const address of urls){try{
   const url=await publicUrl(address),response=await fetch(url,{signal:AbortSignal.timeout(10000),redirect:'error'});if(!response.ok)throw Error('来源暂不可用');
   const raw=await response.text();if(raw.length>4000000)throw Error('来源页面过大');
   const text=strip(raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' '));
   if(!norm(text).includes(norm(p.journal))&&!(p.issn&&text.includes(p.issn)))throw Error('来源页面未确认同一期刊');
   const hits=[...text.matchAll(/(?:Journal\s+Impact\s+Factor|(?<!5.Year\s)Impact\s+Factor)\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?)\s*\((20\d{2})\)/gi)].map(m=>({value:Number(m[1]),year:Number(m[2])})).filter(x=>x.year<=new Date().getFullYear());
   const unique=[...new Map(hits.map(x=>[x.year+':'+x.value,x])).values()].sort((a,b)=>b.year-a.year);
   if(!unique.length||unique.filter(x=>x.year===unique[0].year).length!==1)throw Error('页面未给出唯一明确的JIF与指标年度');
   results.push({...unique[0],journal:p.journal,issn:p.issn,sourceUrl:url.href,verified:true,checkedAt:new Date().toISOString(),releaseYear:unique[0].year+1});
  }catch(error){results.push({error:error.message,sourceUrl:address});}}
  return edit(d=>{let added=0;for(const row of results.filter(x=>!x.error)){const old=d.metrics.find(m=>norm(m.journal)===norm(p.journal)&&m.year===row.year);if(old){old.partitions||={};Object.assign(old,row)}else d.metrics.push({...row,partitions:{}});added++;}const current=d.papers.find(p=>p.id===id);current.metricAttempt={at:new Date().toISOString(),results};return{message:added?'已从期刊官方来源刷新JIF，分区仍按其独立年度与来源保存':'现有已查证指标已保留；暂未从官方页面取得新值。可展开期刊来源继续查询',updated:added};});
 }
 async function enrich(body){
  // AI can supply a translated title and evidenced metrics; values need a matching quoted web source.
  const p=(await read()).papers.find(p=>p.id===body.id&&!p.discardedAt);if(!p)throw Error('文献不存在');
  const rows=[];for(const row of (Array.isArray(body.metrics)?body.metrics:[]).slice(0,6)){
   const url=await publicUrl(row.sourceUrl);const response=await fetch(url,{signal:AbortSignal.timeout(12000),redirect:'error'});if(!response.ok)throw Error('指标来源不可读取，未写入该批指标');
   const raw=await response.text();if(raw.length>4000000)throw Error('来源页面过大');const content=strip(raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')),excerpt=strip(row.excerpt);
   if(excerpt.length<8||!norm(content).includes(norm(excerpt))||!norm(content).includes(norm(p.journal)))throw Error('来源摘录或期刊身份未匹配');
   const year=Number(row.year);if(!Number.isInteger(year)||year<2000||year>new Date().getFullYear()||!excerpt.includes(String(year)))throw Error('来源需要明确指标/分区年度');
   const officialPublisher=/(^|\.)(nature\.com|springer\.com|plos\.org|mdpi\.com|wiley\.com|frontiersin\.org|clarivate\.com)$/.test(url.hostname);
   const verified=['jif','jcr'].includes(row.type)?officialPublisher:row.type==='cas'?/(^|\.)fenqubiao\.com$/.test(url.hostname):false;
   const evidence={year,sourceUrl:url.href,excerpt,checkedAt:new Date().toISOString(),verified,reference:!verified,sourceKind:verified?'publisher':'secondary'};
   const item={journal:p.journal,issn:p.issn,...evidence,partitions:{}};
   if(row.type==='jif'){const value=Number(row.value);if(!Number.isFinite(value)||value<0||!excerpt.includes(String(value))||!/impact factor|JIF|影响因子/i.test(excerpt))throw Error('摘录缺少明确JIF数值');item.value=value;}
   else if(['jcr','cas','xr'].includes(row.type)){
    const zone=String(row.zone||'');if(!(row.type==='jcr'?/^Q[1-4]$/:/^[1-4]$/).test(zone)||!String(row.category||'').trim())throw Error('分区需要正确区号和学科');
    if(!excerpt.includes(zone)||!(row.type==='jcr'?/JCR|quartile|SCI分区/i:row.type==='cas'?/中科院|Chinese Academy of Sciences/i:/新锐/).test(excerpt))throw Error('摘录缺少对应分区值或分区体系名称');item.partitions[row.type]={...evidence,zone,category:strip(row.category),categories:row.categories||[],top:row.top===true};
   }else throw Error('指标类型无效');rows.push(item);
  }
  return edit(d=>{const current=d.papers.find(p=>p.id===body.id);if(current.title!==p.title||cleanDoi(current.doi)!==cleanDoi(body.doi||p.doi))throw Error('题录已变，未写入');
   if(body.titleZh){current.titleZh=strip(body.titleZh).slice(0,2000);current.titleZhMeta={method:'AI中文译名（非官方）',at:new Date().toISOString()};}
   for(const row of rows){const old=d.metrics.find(m=>norm(m.journal)===norm(p.journal)&&m.year===row.year);if(old){if(Number.isFinite(row.value)&&(!old.verified||row.verified))Object.assign(old,{...row,partitions:{...old.partitions,...row.partitions}});else old.partitions={...row.partitions,...old.partitions};}else d.metrics.push(row);}
   current.updatedAt=new Date().toISOString();return{message:'中文译名及有来源支持的指标已保存',metrics:rows.length};});
 }
 async function manual(body){return edit(d=>{
  if(body.confirmed!==true||!String(body.journal||'').trim())throw Error('请核对期刊与来源');const year=Number(body.year),current=new Date().getFullYear(),validYear=y=>Number.isInteger(y)&&y>=2000&&y<=current,url=value=>{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)throw Error('来源须为不含凭据的HTTPS');return u.href;};
  const rows=[];if(String(body.value??'').trim()){const value=Number(body.value);if(!validYear(year)||!Number.isFinite(value)||value<0)throw Error('JIF需要有效数值及独立指标年');rows.push({journal:strip(body.journal),issn:strip(body.issn),year,value,sourceUrl:url(body.sourceUrl),verified:false,reference:true,userConfirmed:true,checkedAt:new Date().toISOString(),partitions:{}});}
  for(const[key,p]of Object.entries(body.partitions||{})){if(!['jcr','cas','xr'].includes(key))continue;const py=Number(p.year||year),zone=String(p.zone||'');if(!validYear(py)||!(key==='jcr'?/^Q[1-4]$/:/^[1-4]$/).test(zone)||!strip(p.category))throw Error('每套分区须填写其真实年度、学科与区号');rows.push({journal:strip(body.journal),issn:strip(body.issn),year:py,partitions:{[key]:{year:py,zone,category:strip(p.category),sourceUrl:url(p.sourceUrl),verified:false,reference:true,userConfirmed:true,checkedAt:new Date().toISOString(),smallZone:strip(p.smallZone),top:p.top===true}}});}
  if(!rows.length)throw Error('请至少填写一个指标或分区');for(const row of rows){const old=d.metrics.find(m=>norm(m.journal)===norm(row.journal)&&m.year===row.year);if(!old)d.metrics.push(row);else{if(row.value!==undefined&&!old.verified)Object.assign(old,{...row,partitions:old.partitions||{}});old.partitions={...old.partitions,...row.partitions};}}return{message:'已按各自年度保存；人工核对值标作参考，不冒称官方数据库验证'};
 });}
 return{metadata,metric,enrich,manual};
};
