'use strict';
// Requests are durable; only the original guild page owns its task and reward ledgers.
const crypto=require('node:crypto');
module.exports=function({read,edit,openHome}){
 const digest=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,32);
 function paper(data,id){const p=data.papers.find(p=>p.id===id&&p.saved&&!p.discardedAt);if(!p?.workbench)throw Error('请先关联这篇文献的阅读工作台');return p;}
 function command(p,action){const w=p.readingWorkflow;return {requestId:w.requestId+':'+action,action,paperId:p.id,taskId:w.taskId,title:'阅读文献：'+(p.titleZh||p.title),sourceSha256:p.workbench.sourceSha256,takeaway:w.takeaway||'',requestedAt:w.requestedAt};}
 async function start({id,open=true,embedded=false}){
  const result=await edit(data=>{const p=paper(data,id);let w=p.readingWorkflow;
   if(p.status==='read'&&!w)return{ok:true,workflow:{state:'completed',mode:'historical',taskId:null},message:'这篇文献已完成研读，不补建委托或追发奖励。'};
   if(!w){const linked=p.linkedTasks?.[0];const taskId=linked?.id||'reading-'+digest(p.doi||p.workbench.sourceSha256||p.id);w=p.readingWorkflow={requestId:'reading-'+digest(p.id+'|'+p.workbench.sourceSha256),taskId,mode:linked?'existing':'automatic',state:linked?'linked':'pending',requestedAt:new Date().toISOString()};if(!linked)p.linkedTasks=[...(p.linkedTasks||[]),{id:taskId,title:'阅读文献：'+(p.titleZh||p.title),source:'reading-workflow'}];}
   if(p.status==='unread')p.status='reading';p.updatedAt=new Date().toISOString();return{ok:true,workflow:{...w},message:w.state==='pending'?'阅读已开始，委托正在等待公会登记。':'已接续原有关联委托，不重复创建。'};
  });
  if(open&&!embedded&&result.workflow.mode==='automatic'&&result.workflow.state==='pending'){
   try{await openHome({paperId:id,view:'library'});result.message+=' 已打开公会接收登记。';}catch(e){result.message+=' 公会尚未打开，请使用返回公会按钮；登记请求已保留。';}
  }return result;
 }
 async function prepareFinish(body){
  const p=paper(await read(),body.id);
  if(body.confirmed!==true||body.identityConfirmed!==true||String(body.takeaway||'').trim().length<8)throw Error('请确认PDF身份、研读完成，并填写至少8字收获');
  if(p.workbench.panelIds.some(id=>!p.workbench.progress?.done?.includes(id)))throw Error('还有子图未标记研读完成');
  return start({id:p.id,open:false});
 }
 async function finish(id,takeaway){return edit(data=>{const p=paper(data,id),w=p.readingWorkflow;if(!w)throw Error('尚未建立阅读关联');if(w.mode==='automatic'&&w.state!=='completed'){w.finishRequestedAt||=new Date().toISOString();w.takeaway=String(takeaway||'').slice(0,4000);}return{workflow:{...w},message:w.mode==='automatic'?'研读成果已保存，关联委托将由公会按原规则完成结算。':'研读成果已保存，请回公会验收原有关联委托。'};});}
 async function pending(){const data=await read();return data.papers.filter(p=>p.saved&&!p.discardedAt&&p.readingWorkflow?.mode==='automatic').flatMap(p=>{const w=p.readingWorkflow;if(!w.startAcknowledgedAt)return[command(p,'start')];if(w.finishRequestedAt&&!w.completedAt)return[command(p,'finish')];return[];});}
 async function acknowledge(body){return edit(data=>{const p=paper(data,body.paperId),w=p.readingWorkflow;if(!w||w.mode!=='automatic'||body.taskId!==w.taskId||!['start','finish'].includes(body.action)||body.requestId!==w.requestId+':'+body.action)throw Error('委托回执与原请求不一致');if(body.action==='finish'&&(!w.finishRequestedAt||body.done!==true))throw Error('完成请求或公会完成回执尚未确认');if(body.action==='start'){w.startAcknowledgedAt||=new Date().toISOString();if(w.state!=='completed')w.state='started';}else{w.completedAt||=new Date().toISOString();w.state='completed';}delete w.error;return{ok:true,workflow:{...w}};});}
 async function fail(body){return edit(data=>{const p=paper(data,body.paperId),w=p.readingWorkflow;if(!w||w.taskId!==body.taskId)throw Error('委托回执不一致');w.error=String(body.error||'公会登记暂未完成').slice(0,500);return{ok:true};});}
 return{start,prepareFinish,finish,pending,acknowledge,fail};
};
