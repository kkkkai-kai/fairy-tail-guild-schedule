/* Character daily milestones: task facts only; never grants J or EXP. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GuildCharacterMilestones=api})(typeof globalThis==='object'?globalThis:this,function(){'use strict';
 const art='素材/人物/lucy-露西/结算插画/lucy-three-commissions-v268.webp';
 const day=value=>{if(!value)return'';const date=new Date(/Z|[+-]\d\d:\d\d$/.test(value)?value:String(value).length===10?value+'T12:00:00+08:00':value+'+08:00');return Number.isFinite(+date)?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date):''};
 const eligible=t=>!!t&&['once','project'].includes(t.type)&&t.done===true&&!t.legacyCounted&&!['cancelled','archived'].includes(t.status);
 function facts(tasks,memberId,date){const seen=new Set();return(tasks||[]).filter(t=>eligible(t)&&t.assigneeId===memberId&&day(t.completedAt)===date&&!seen.has(t.id)&&seen.add(t.id)).sort((a,b)=>String(a.completedAt).localeCompare(String(b.completedAt))||String(a.id).localeCompare(String(b.id)))}
 function records(tasks){const found=new Map();for(const t of tasks||[])for(const r of Object.values(t.characterMilestones||{}))if(r?.id&&r.memberId&&Array.isArray(r.taskIds)){const old=found.get(r.id);if(!old||r.claimedAt&&!old.claimedAt)found.set(r.id,r)}return[...found.values()]}
 function record(task,tasks,now=new Date().toISOString()){
  if(!eligible(task)||day(task.completedAt)!==day(now))return null;
  const date=day(now),id='character:'+date+':'+task.assigneeId+':3';if(records(tasks).some(r=>r.id===id))return null;
  const completed=facts(tasks,task.assigneeId,date);if(completed.length<3)return null;
  const selected=completed.slice(0,3),r={id,version:1,date,memberId:task.assigneeId,threshold:3,taskIds:selected.map(t=>t.id),titles:selected.map(t=>t.title),unlockedAt:now,claimedAt:''};
  task.characterMilestones??={};task.characterMilestones[id]=r;return r;
 }
 let pending=null,dialog=null,bound=false;
 function show(r,context,replay=false){
  if(document.querySelector('dialog[open]')){pending={r,context,replay};return false}
  const member=context.registry[r.memberId];if(!member)return false;
  dialog??=Object.assign(document.createElement('dialog'),{id:'guildCharacterMilestoneDialog',className:'guild-character-milestone'});if(!dialog.isConnected)document.body.append(dialog);dialog.replaceChildren();
  const close=document.createElement('button');close.type='button';close.className='milestone-close';close.textContent='×';close.setAttribute('aria-label','关闭纪念画面');close.onclick=()=>dialog.close();
  const image=document.createElement('img');image.className='milestone-art';image.alt=member.name+' · 今日三份委托';image.src=r.memberId==='lucy'?art:member.portrait||member.fallbackPortrait;image.onerror=()=>{if(!image.dataset.fallback&&member.portrait){image.dataset.fallback='1';image.src=member.portrait}else image.hidden=true};
  const body=document.createElement('section'),title=document.createElement('h2'),text=document.createElement('p'),list=document.createElement('ol'),foot=document.createElement('small');title.id='guildMilestoneTitle';title.textContent=member.name+' · 三份共同完成的委托';dialog.setAttribute('aria-labelledby',title.id);
  text.textContent=r.memberId==='lucy'?'露西把三份卷宗整齐收好：“今天一起做到了这么多，把这些收获记下来吧。”':'三份委托已经妥善归档，'+member.name+'为今天的共同推进留下了纪念。';
  for(const value of r.titles){const item=document.createElement('li');item.textContent=value;list.append(item)}foot.textContent=r.date+' · 酬劳与经验已按各项委托结算，本画面不重复发奖。';body.append(title,text,list,foot);dialog.append(close,image,body);
  if(!dialog.dataset.bound){dialog.dataset.bound='1';let outside=false;dialog.addEventListener('pointerdown',e=>{const b=dialog.getBoundingClientRect();outside=e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom});dialog.addEventListener('click',e=>{if(e.target===dialog&&outside)dialog.close();outside=false})}
  if(!replay&&!r.claimedAt){r.claimedAt=new Date().toISOString();context.save()}
  dialog.showModal();if(!matchMedia('(prefers-reduced-motion: reduce)').matches)image.animate([{opacity:.2,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:480,easing:'ease-out'});return true;
 }
 function completed(task,tasks,context){const r=record(task,tasks);if(!r)return null;context.save();if(!bound){bound=true;document.addEventListener('close',()=>{if(pending&&!document.querySelector('dialog[open]')){const next=pending;pending=null;queueMicrotask(()=>show(next.r,next.context,next.replay))}},true)}queueMicrotask(()=>show(r,context));return r}
 function mount(stage,sceneId,tasks,context){
  stage.querySelector(':scope>.guild-milestone-memory')?.remove();if(!['mainHall','returnTable','upperGallery'].includes(sceneId))return;
  const list=records(tasks).sort((a,b)=>b.unlockedAt.localeCompare(a.unlockedAt));if(!list.length)return;
  const button=document.createElement('button');button.type='button';button.className='guild-milestone-memory';button.textContent=list.some(r=>!r.claimedAt)?'✧ 开启纪念卷宗':'✧ 纪念卷宗';button.title='回看伙伴三份委托的纪念画面';button.onclick=e=>{e.stopPropagation();if(list.length===1){show(list[0],context,!!list[0].claimedAt);return}let picker=document.createElement('dialog');picker.className='guild-milestone-picker';const title=document.createElement('h3'),close=document.createElement('button');title.textContent='伙伴纪念卷宗';close.textContent='关闭';close.onclick=()=>picker.close();picker.addEventListener('close',()=>picker.remove(),{once:true});picker.append(title,close);for(const r of list){const choice=document.createElement('button');choice.textContent=r.date+' · '+(context.registry[r.memberId]?.name||r.memberId);choice.onclick=()=>{picker.close();show(r,context,!!r.claimedAt)};picker.append(choice)}document.body.append(picker);picker.showModal()};stage.append(button);
 }
 return Object.freeze({day,eligible,facts,records,record,completed,mount,show,art});
});
