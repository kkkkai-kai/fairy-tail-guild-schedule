'use strict';

// NCBI E-utilities public API. Keep requests below the unauthenticated 3/s limit.
const BASE='https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
const TERMS={
 sg:'("stress granule"[Title/Abstract] OR "stress granules"[Title/Abstract])',
 zn:'(zinc[Title/Abstract] OR "Zn2+"[Title/Abstract]) AND (stress[Title/Abstract] OR "labile zinc"[Title/Abstract] OR "free zinc"[Title/Abstract])',
 cross:'("stress granule"[Title/Abstract] OR "stress granules"[Title/Abstract]) AND (zinc[Title/Abstract] OR "Zn2+"[Title/Abstract])',
 canine:'(canine[Title/Abstract] OR dog[Title/Abstract] OR dogs[Title/Abstract]) AND ("CAR-T"[Title/Abstract] OR "CAR T"[Title/Abstract] OR "chimeric antigen receptor"[Title/Abstract])',
 zinc:'("labile zinc"[Title/Abstract] OR "free zinc"[Title/Abstract] OR "zinc homeostasis"[Title/Abstract] OR "zinc signaling"[Title/Abstract] OR "intracellular zinc"[Title/Abstract] OR "zinc ions"[Title/Abstract])',
 ndv:'("Newcastle disease virus"[Title/Abstract] OR "avian orthoavulavirus 1"[Title/Abstract] OR NDV[Title/Abstract])',
 rnaphagy:'("RNA autophagy"[Title/Abstract] OR RNautophagy[Title/Abstract] OR "RNA-phagy"[Title/Abstract] OR "lysosomal RNA degradation"[Title/Abstract])'
};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function makeUrl(endpoint,params){const url=new URL(endpoint,BASE);url.search=new URLSearchParams(params).toString();return url}
function firstId(record,type){return(record.articleids||[]).find(v=>v.idtype===type)?.value||''}
function dateOnly(value){const match=String(value||'').match(/^(\d{4})\/(\d\d)\/(\d\d)/);return match?`${match[1]}-${match[2]}-${match[3]}`:''}
function create({fetchJson,normalize,cleanDoi,cleanPmid,classify,strip,dateKey}){
 function convert(record){
  const title=strip(record.title),pmid=cleanPmid(record.uid),doi=cleanDoi(firstId(record,'doi')),
   pmcid=firstId(record,'pmc'),types=record.pubtype||[],publishedAt=dateOnly(record.sortpubdate),
   info=classify(title,'');
  return{id:doi?'doi:'+doi:'pmid:'+pmid,title,abstract:'',doi,pmid,pmcid,
   authors:(record.authors||[]).map(a=>a.name).filter(Boolean).join(', '),journal:strip(record.fulljournalname||record.source),
   issn:record.issn||record.essn||'',publishedAt,indexedAt:'',foundAt:new Date().toISOString(),
   discoveryType:'近期补收',year:publishedAt.slice(0,4)||String(record.pubdate||'').slice(0,4),
   preprint:types.some(t=>/preprint/i.test(t)),publicationTypes:types,topic:info.topic,priority:info.priority,
   warnings:info.warnings,readDepth:'仅 PubMed 题录，需核验摘要和全文',source:'PubMed',
   sourceUrl:'https://pubmed.ncbi.nlm.nih.gov/'+encodeURIComponent(pmid)+'/',pdfCandidates:[],
   openAccess:false,hasPDF:!!pmcid,collectionFolder:types.some(t=>/review/i.test(t))?'review':'',
   saved:false,status:'unread',notes:'',historicalImport:false,pdf:{status:'not_requested'}};
 }
 async function search(topics,start,end){
  const records=[],errors=[],queries=[],ids=new Set();
  for(const topic of topics.filter(t=>TERMS[t])){
   const term=TERMS[topic],url=makeUrl('esearch.fcgi',{db:'pubmed',term,retmode:'json',retmax:'40',sort:'pub date',datetype:'pdat',mindate:start,maxdate:end,tool:'GuildLiterature'});
   queries.push({source:'PubMed',topic,query:term,from:start,to:end});
   try{const value=await fetchJson(url),result=value.esearchresult;if(!Array.isArray(result?.idlist))throw Error('未返回有效 PMID 列表');for(const id of result.idlist)if(/^\d+$/.test(id))ids.add(id)}
   catch(error){errors.push('PubMed '+topic+': '+error.message)}
   await pause(400);
  }
  if(ids.size){
   const list=[...ids];
   for(let i=0;i<list.length;i+=100){
    try{const value=await fetchJson(makeUrl('esummary.fcgi',{db:'pubmed',id:list.slice(i,i+100).join(','),retmode:'json',tool:'GuildLiterature'}));
     if(!Array.isArray(value.result?.uids))throw Error('未返回有效题录');
     for(const uid of value.result.uids){const record=value.result[uid];if(record?.title)records.push(convert(record))}
    }catch(error){errors.push('PubMed 题录: '+error.message)}
    await pause(400);
   }
  }
  return{records,errors,queries};
 }
 return{search,convert};
}
module.exports={create,TERMS};
