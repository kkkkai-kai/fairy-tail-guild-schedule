/* Character weekly milestones: task facts only; never grants J or EXP. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GuildCharacterMilestones=api})(typeof globalThis==='object'?globalThis:this,function(){'use strict';
 const art='素材/人物/lucy-露西/结算插画/lucy-three-commissions-v268.webp';
 const day=value=>{if(!value)return'';const date=new Date(/Z|[+-]\d\d:\d\d$/.test(value)?value:String(value).length===10?value+'T12:00:00+08:00':value+'+08:00');return Number.isFinite(+date)?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date):''};
 const eligible=t=>!!t&&['once','project'].includes(t.type)&&t.done===true&&!t.legacyCounted&&!['cancelled','archived'].includes(t.status);
 const thresholds=Object.freeze([3,5,10]);
 function week(value){const date=day(value);if(!date)return null;const monday=new Date(date+'T00:00:00Z');monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));const end=new Date(monday);end.setUTCDate(end.getUTCDate()+6);return{start:monday.toISOString().slice(0,10),end:end.toISOString().slice(0,10)}}
 function facts(tasks,memberId,date){const range=week(date),seen=new Set();if(!range)return[];return(tasks||[]).filter(t=>{const d=day(t?.completedAt);return eligible(t)&&t.assigneeId===memberId&&d>=range.start&&d<=range.end&&!seen.has(t.id)&&seen.add(t.id)}).sort((a,b)=>String(a.completedAt).localeCompare(String(b.completedAt))||String(a.id).localeCompare(String(b.id)))}
 function progress(tasks,memberId,date){const count=facts(tasks,memberId,date).length,next=thresholds.find(n=>n>count);return'本周共同完成 '+count+' 项正式委托 · '+(next?'下一档 '+next+' 次纪念':'3 / 5 / 10 次纪念均已达标')}
 function records(tasks){const found=new Map();for(const t of tasks||[])for(const r of Object.values(t.characterMilestones||{}))if(r?.id&&r.memberId&&Array.isArray(r.taskIds)){const old=found.get(r.id);if(!old||r.claimedAt&&!old.claimedAt)found.set(r.id,r)}return[...found.values()]}
 function record(task,tasks,now=new Date().toISOString()){
  const range=week(now);if(!eligible(task)||!range||week(task.completedAt)?.start!==range.start)return null;
  const completed=facts(tasks,task.assigneeId,now),existing=new Set(records(tasks).map(r=>r.id));let latest=null;
  for(const threshold of thresholds){const id='character-week:'+range.start+':'+task.assigneeId+':'+threshold;if(completed.length<threshold||existing.has(id))continue;const selected=completed.slice(0,threshold),r={id,version:2,period:'week',date:range.start,weekStart:range.start,weekEnd:range.end,memberId:task.assigneeId,threshold,taskIds:selected.map(t=>t.id),titles:selected.map(t=>t.title),unlockedAt:now,claimedAt:''};task.characterMilestones??={};task.characterMilestones[id]=r;latest=r;}
  return latest;
 }
 const pending=[];let dialog=null,bound=false,drainTimer=0;
 function bindQueue(){if(bound)return;bound=true;document.addEventListener('close',()=>{clearTimeout(drainTimer);drainTimer=setTimeout(drain,60)},true);document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='hidden')drain()})}
 function drain(){if(document.visibilityState==='hidden'||document.querySelector('dialog[open]'))return;const next=pending.shift();if(next)show(next.r,next.context,next.replay)}
 function enqueue(r,context,replay){bindQueue();const key=r.id||[r.memberId,r.period,r.date,r.threshold].join(':');if(!pending.some(x=>x.key===key))pending.push({key,r,context,replay});return false}
 function show(r,context,replay=false){
  if(!r||!context?.registry?.[r.memberId])return false;bindQueue();
  if(dialog?.open&&dialog.dataset.recordId===r.id)return true;
  if(document.querySelector('dialog[open]'))return enqueue(r,context,replay);
  const member=context.registry[r.memberId];
  dialog??=Object.assign(document.createElement('dialog'),{id:'guildCharacterMilestoneDialog',className:'guild-character-milestone'});if(!dialog.isConnected)document.body.append(dialog);dialog.replaceChildren();
  const close=document.createElement('button');close.type='button';close.className='milestone-close';close.textContent='×';close.setAttribute('aria-label','关闭纪念画面');close.onclick=()=>dialog.close();
  const image=document.createElement('img');image.className='milestone-art';image.decoding='async';image.fetchPriority='high';
  const theme=globalThis.GuildMilestoneThemes?.config(r.memberId,r.threshold,context.registry)||{title:member.name+'的纪念',tier:'伙伴纪念',color:'#97754b',line:'完成记录已经妥善收好。',motif:'完成卷宗'};
  const visual=globalThis.GuildMilestoneThemes?.visualFor(r,context.registry),dedicated=visual?.illustration||'',candidates=visual?.candidates||[member.hallSprite].filter(Boolean);let candidateIndex=0;
  image.alt=member.name+' · '+r.threshold+'次协作纪念';image.dataset.memberId=r.memberId;dialog.dataset.recordId=r.id||'';dialog.dataset.artUsage='settlement-dialog';
  dialog.dataset.tier=String(r.threshold);dialog.style.setProperty('--milestone-accent',theme.color);dialog.classList.toggle('milestone-composed',!dedicated);dialog.classList.toggle('milestone-illustrated',!!dedicated);
  image.onerror=()=>{candidateIndex++;dialog.classList.remove('milestone-illustrated');dialog.classList.add('milestone-composed');scene.style.backgroundImage='url("'+visual.background+'")';if(candidateIndex<candidates.length){image.dataset.fallback='1';image.src=candidates[candidateIndex]}else{image.hidden=true;scene.dataset.artUnavailable='true'}};if(candidates.length)image.src=candidates[0];else image.hidden=true;
  const body=document.createElement('section'),title=document.createElement('h2'),text=document.createElement('p'),list=document.createElement('ol'),foot=document.createElement('small');title.id='guildMilestoneTitle';title.textContent=member.name+' · '+theme.title+' · '+theme.tier;dialog.setAttribute('aria-labelledby',title.id);
  text.textContent=(r.period==='week'?'本周已共同完成 '+r.threshold+' 项正式委托。':'旧每日纪念 · 三项正式委托。')+theme.line;

  for(const value of r.titles||[]){const item=document.createElement('li');item.textContent=value;list.append(item)}foot.textContent=(r.period==='week'?r.weekStart+' — '+r.weekEnd:r.date+' · 旧每日纪念')+' · 酬劳与经验已按各项委托结算，本画面不重复发奖。';const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='查看这次纪念的真实委托 · '+(r.titles||[]).length+' 项';details.append(summary,list);body.append(title,text,details,foot);const scene=document.createElement('div');scene.className='milestone-tableau';scene.append(image);
  const historical=member.roleType==='historical-member'||r.memberId==='azuma',spirit=member.roleType==='celestial-spirit',visitor=member.roleType==='visitor-ally';
  const bg=historical||spirit?'素材/场景/星灵契约桌/guild-celestial-desk-v268.webp':visitor?'素材/场景/联盟会客席/guild-alliance-seat-v268.webp':r.threshold>=10?'素材/场景/大厅/guild-hall-supper-night-v155.webp':r.threshold>=5?'素材/场景/联盟会客席/guild-alliance-seat-v268.webp':'素材/场景/星灵契约桌/guild-celestial-desk-v268.webp';if(!dedicated)scene.style.backgroundImage='url("'+(visual?.background||bg)+'")';
  const tier=document.createElement('span');tier.className='milestone-tier-seal';tier.textContent=(r.period==='week'?'本周 ':'')+r.threshold+' 次 · '+theme.tier;scene.append(tier);
  const count=r.threshold>=10?5:r.threshold>=5?3:1;for(let i=0;!dedicated&&i<count;i++){const prop=document.createElement('img');prop.className='milestone-prop';prop.alt='';prop.src='素材/道具/情报物件/guild-record-'+(r.threshold>=10?'pennant':r.threshold>=5?'toast':'scroll')+'-v86-fast-v101.webp';prop.style.left=(count===1?68:15+i*(70/(count-1)))+'%';scene.append(prop)}
  const keepsake=document.createElement('p');keepsake.className='milestone-keepsake';keepsake.textContent=theme.motif;scene.append(keepsake);const finish=document.createElement('button');finish.type='button';finish.className='milestone-finish';finish.textContent='收好纪念 · 继续';finish.onclick=()=>dialog.close();body.append(finish);dialog.append(close,scene,body);
  if(!dialog.dataset.bound){dialog.dataset.bound='1';let outside=false;dialog.addEventListener('pointerdown',e=>{const b=dialog.getBoundingClientRect();outside=e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom});dialog.addEventListener('click',e=>{if(e.target===dialog&&outside)dialog.close();outside=false})}
  dialog.showModal();if(!dialog.open)return enqueue(r,context,replay);
  if(!replay&&!r.claimedAt){r.claimedAt=new Date().toISOString();try{context.save()}catch(error){r.claimedAt='';foot.textContent+=' 观看标记尚未保存，可从纪念卷宗重新开启。';console.error('纪念观看记录未保存',error)}}
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)scene.animate([{opacity:.2,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:320,easing:'ease-out'});close.focus({preventScroll:true});return true;
 }
 function completed(task,tasks,context){const r=record(task,tasks);if(!r)return null;context.save();bindQueue();queueMicrotask(()=>show(r,context));return r}
 function mount(stage,sceneId,tasks,context){
  stage.querySelector(':scope>.guild-milestone-memory')?.remove();if(!['mainHall','returnTable','upperGallery'].includes(sceneId))return;
  const list=records(tasks).sort((a,b)=>b.unlockedAt.localeCompare(a.unlockedAt));if(!list.length)return;
  const button=document.createElement('button');button.type='button';button.className='guild-milestone-memory';button.textContent=list.some(r=>!r.claimedAt)?'✧ 开启纪念卷宗':'✧ 纪念卷宗';button.title='回看伙伴每周3、5、10次协作的纪念画面';button.onclick=e=>{e.stopPropagation();if(list.length===1){show(list[0],context,!!list[0].claimedAt);return}let picker=document.createElement('dialog');picker.className='guild-milestone-picker';const title=document.createElement('h3'),close=document.createElement('button');title.textContent='伙伴纪念卷宗';close.textContent='关闭';close.onclick=()=>picker.close();picker.addEventListener('close',()=>picker.remove(),{once:true});picker.append(title,close);for(const r of list){const choice=document.createElement('button');choice.textContent=r.date+' · '+(context.registry[r.memberId]?.name||r.memberId)+' · '+r.threshold+'次'+(r.period==='week'?'周纪念':'旧每日纪念');choice.onclick=()=>{picker.close();show(r,context,!!r.claimedAt)};picker.append(choice)}document.body.append(picker);picker.showModal()};stage.append(button);
 }
 return Object.freeze({day,week,thresholds,progress,eligible,facts,records,record,completed,mount,show,art});
});
