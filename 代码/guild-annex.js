/* Physical rooms and functional objects share the original stage and records. */
(function(){'use strict';
 const icon=name=>'素材/道具/情报物件/guild-record-'+name+'-v86-fast-v101.webp';
 const zones={
  'life-return':{name:'公会正门',parent:'mainHall',floorLevel:'ground',x:50,y:94,floor:[25,78,80,94],anchor:'大厅前景门槛',route:'大厅门口 → 一楼正门',backgrounds:Object.fromEntries(['dawn','day','sunset','night'].map(p=>[p,'素材/场景/功能区域/return/guild-life-return-'+p+'-v283.webp']))},
  upperGallery:{name:'二楼回廊',parent:'mainHall',floorLevel:'upper',x:21,y:28,floor:[42,88,56,94],anchor:'大厅左侧楼梯',route:'大厅楼梯 → 二楼回廊',backgrounds:{day:'素材/场景/二楼回廊/guild-upper-gallery-v268.webp',dawn:'素材/场景/二楼回廊/upperGallery-dawn-v270.webp',sunset:'素材/场景/二楼回廊/upperGallery-sunset-v270.webp',night:'素材/场景/二楼回廊/upperGallery-night-v270.webp'}}
 };
 const objects={
  allianceSeat:{name:'会客长桌',parent:'mainHall',x:80,y:62,prop:'toast',action:'alliance'},
  'life-honors':{name:'成果陈列册',parent:'mainHall',x:8,y:45,prop:'report',area:'honors'},
  'life-prepare':{name:'启程整备箱',parent:'missionBoard',x:20,y:38,prop:'chest',area:'prepare'},
  'life-projects':{name:'项目沙盘',parent:'missionBoard',x:50,y:38,prop:'papers',area:'projects'},
  returnTable:{name:'交付卷宗',parent:'missionBoard',x:80,y:38,prop:'report',action:'delivery'},
  celestialDesk:{name:'星灵契约簿',parent:'archiveRoom',x:77,y:53,prop:'quill',action:'contract'},
  oldRecords:{name:'旧卷宗',parent:'archiveRoom',x:18,y:35,prop:'scroll',action:'records'},
  'life-practice':{name:'练习记录册',parent:'archiveRoom',x:40,y:52,prop:'open-book',area:'practice'},
  'life-research':{name:'论文对照桌',parent:'researchRoom',x:65,y:29,prop:'papers',area:'research'},
  readingAlcove:{name:'收藏文献',parent:'researchRoom',x:18,y:29,prop:'book',action:'reading'},
  windowSeat:{name:'休憩画册',parent:'guildTavern',x:64,y:66,prop:'book',action:'memory'},
  supplyCounter:{name:'补给篮',parent:'guildTavern',x:40,y:37,prop:'chest',action:'supplies'}
 };
 let navigate=null,context=null;
 const spatial=Object.freeze(Object.fromEntries(Object.entries(zones).map(([id,z])=>[id,{floor:z.floorLevel,anchor:z.anchor,route:z.route}])));
 function resolveScene(id){return objects[id]?.parent||id}
 function parent(id){id=resolveScene(id);return zones[id]?.parent||id}
 function register(registry,spots,connections){for(const[id,z]of Object.entries(zones)){
  registry[id]={id,name:z.name,title:z.name,parentSceneId:z.parent,spatialFloor:z.floorLevel,spatialRoute:z.route,backgrounds:z.backgrounds};
  spots[id]=[0,1,2,3,4].map(i=>({id:id+'-'+i,x:z.floor[0]+(z.floor[1]-z.floor[0])*(i%3)/2,y:z.floor[2]+(z.floor[3]-z.floor[2])*Math.floor(i/3)}));
  connections[id]=[z.parent];if(!connections[z.parent].includes(id))connections[z.parent].push(id);
  const rooms=globalThis.GuildSceneLife?.rooms;if(rooms)rooms[id]={region:z.name,links:[],windows:[],furniture:[]};
 }}
 // Empty rooms do not force the relocation of people; old view IDs remain compatible.
 function route(entries){return entries.map(e=>{const id=resolveScene(e.sceneId);return id===e.sceneId?e:{...e,sceneId:id,routeLabel:'在'+(objects[e.sceneId]?.name||'公会')+'旁整理卷宗'}})}
 function openObject(id){const o=objects[id];if(!o)return false;if(o.area){if(!globalThis.GuildLivingHub?.open)return false;GuildLivingHub.open(o.area);return true}if(!context)return false;
  switch(o.action){case'alliance':openRelated('visitor-ally','盟友协作记录');break;case'delivery':globalThis.GuildLivingHub?.open('honors');break;case'contract':openRelated('celestial-spirit','星灵协作记录');break;case'records':globalThis.GuildWorkspace?.openIndex();break;case'reading':globalThis.GuildLiterature?.open('library');break;case'memory':globalThis.GuildSceneLife?.openMemory();break;case'supplies':context.openSupplies();break;default:return false}return true;
 }
 let objectCard;
 function openRelated(role,title){objectCard?.remove();objectCard=document.createElement('dialog');objectCard.className='guild-object-card';const h=document.createElement('strong');h.textContent=title;objectCard.append(h);const list=context.tasks.filter(t=>context.registry[t.assigneeId]?.roleType===role);for(const t of list){const b=document.createElement('button');b.type='button';b.textContent=t.title;b.onclick=()=>{objectCard.close();objectCard.remove();context.openTask(t)};objectCard.append(b)}if(!list.length){const p=document.createElement('p');p.textContent='暂无相关协作记录';objectCard.append(p)}const close=document.createElement('button');close.type='button';close.textContent='关闭';close.onclick=()=>{objectCard.close();objectCard.remove()};objectCard.append(close);document.body.append(objectCard);objectCard.showModal()}
 function previewObject(id){const o=objects[id];if(!o)return;objectCard?.remove();objectCard=document.createElement('dialog');objectCard.className='guild-object-card';const h=document.createElement('strong'),text=document.createElement('p'),open=document.createElement('button'),close=document.createElement('button');h.textContent=o.name;const labels={alliance:'查看真实盟友协作记录',delivery:'查看交付成果卷宗',contract:'查看星灵协助记录',records:'查找历史委托',reading:'打开已收藏文献',memory:'查看纪念画册',supplies:'查看真实库存与补给'};text.textContent=o.area?({honors:'已完成并精选的成果',prepare:'查看任务准备与缺项',projects:'查看长期项目阶段',practice:'查看练习记录',research:'对照已收录的论文'})[o.area]:labels[o.action];open.type=close.type='button';open.textContent='打开详细记录';close.textContent='关闭';open.onclick=()=>{objectCard.close();objectCard.remove();openObject(id)};close.onclick=()=>{objectCard.close();objectCard.remove()};objectCard.addEventListener('click',e=>{if(e.target===objectCard){const r=objectCard.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close.click()}});objectCard.append(h,text,open,close);document.body.append(objectCard);objectCard.showModal()}
 function passage(stage,id,label,x,y,go){const b=document.createElement('button');b.type='button';b.className='guild-annex-sign guild-physical-passage';b.dataset.annexTarget=id;b.setAttribute('aria-label',label);b.title=label;b.style.left=x+'%';b.style.top=y+'%';b.onclick=e=>{e.stopPropagation();go(id)};stage.append(b)}
 function mount(stage,scene,phase,go,ctx){navigate=go;context=ctx;const card=stage.closest('#guildHallScene');let nav=card?.querySelector('.guild-annex-nav');if(card&&!nav){nav=document.createElement('nav');nav.className='guild-annex-nav';stage.before(nav)}
  if(nav){nav.replaceChildren();nav.setAttribute('aria-label','大厅的出入口');nav.hidden=parent(scene)!=='mainHall';for(const[id,z]of Object.entries(zones)){const b=document.createElement('button'),label=document.createElement('span'),count=document.createElement('small');b.type='button';b.dataset.sceneId=id;b.dataset.parentScene=z.parent;b.dataset.floor=z.floorLevel;b.setAttribute('aria-pressed',String(scene===id));b.setAttribute('aria-label',z.route+'，'+(ctx.counts[id]||0)+'位');b.title=z.route;label.textContent=z.name;count.textContent=String(ctx.counts[id]||0);b.append(label,count);b.onclick=()=>go(id);nav.append(b)}}
  stage.querySelectorAll(':scope>.guild-annex-sign,:scope>.guild-room-object,:scope>.guild-living-hub-entry,:scope>.guild-room-prop-rack').forEach(n=>n.remove());delete stage.dataset.annexLight;delete stage.dataset.annexRoom;
  if(zones[scene]){stage.dataset.annexRoom=scene;const gate=scene==='life-return';passage(stage,'mainHall',gate?'推开正门进入大厅':'沿楼梯下楼回大厅',gate?50:17,gate?51:88,go)}
  if(scene==='mainHall')for(const[id,z]of Object.entries(zones))passage(stage,id,z.route,z.x,z.y,go);
  const rack=document.createElement('div');rack.className='guild-room-prop-rack';rack.setAttribute('aria-label','场景物件');stage.append(rack);for(const[id,o]of Object.entries(objects)){if(o.parent!==scene)continue;const b=document.createElement('button'),img=document.createElement('img');b.type='button';b.className='guild-room-object';b.dataset.objectId=id;b.dataset.parentScene=o.parent;b.setAttribute('aria-label',o.name);b.title=o.name;img.src='素材/道具/公会实景物件/guild-object-'+id+'-v285.webp';img.onerror=()=>{img.onerror=null;img.src=icon(o.prop)};img.alt='';b.style.left=o.x+'%';b.style.top=o.y+'%';b.append(img);b.onclick=e=>{e.stopPropagation();stage.querySelector('#guildHallTip')?.setAttribute('hidden','');previewObject(id)};rack.append(b)}
 }
 globalThis.GuildAnnex=Object.freeze({zones,objects,spatial,register,resolveScene,route,parent,counts:values=>({...values}),mount,openObject,go:id=>objects[id]?openObject(id):!!(navigate&&zones[id]&&(navigate(id),true)),floor:id=>zones[id]?.floor});
})();
