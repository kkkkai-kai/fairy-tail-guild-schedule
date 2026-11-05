/* Functional corners share the existing stage, actors and motion controller. */
(function(){'use strict';
 const zones={
  upperGallery:{name:'二楼回廊',parent:'mainHall',file:'素材/场景/二楼回廊/guild-upper-gallery-v268.webp',x:72,y:18,floor:[42,88,56,94]},
  allianceSeat:{name:'联盟会客席',parent:'mainHall',file:'素材/场景/联盟会客席/guild-alliance-seat-v268.webp',x:16,y:39,floor:[18,87,59,94]},
  celestialDesk:{name:'星灵契约桌',parent:'archiveRoom',file:'素材/场景/星灵契约桌/guild-celestial-desk-v268.webp',x:82,y:29,floor:[20,85,57,94]},
  returnTable:{name:'归队交付长桌',parent:'missionBoard',reuse:'mainHall',x:51,y:35},
  oldRecords:{name:'旧卷宗壁龛',parent:'archiveRoom',reuse:'archiveRoom',x:18,y:35},
  windowSeat:{name:'窗边休憩席',parent:'guildTavern',reuse:'guildTavern',x:73,y:31}
 };
 const hash=text=>{let n=2166136261;for(const c of String(text)){n^=c.charCodeAt(0);n=Math.imul(n,16777619)}return n>>>0};
 function register(registry,spots,connections){for(const[id,z]of Object.entries(zones)){
  const base=registry[z.reuse||z.parent],backgrounds=z.file?Object.fromEntries(['dawn','day','sunset','night'].map(p=>[p,z.file])):{...base.backgrounds};registry[id]={id,name:z.name,title:z.name,parentSceneId:z.parent,backgrounds};
  const floor=z.floor||({mainHall:[35,65,61,92],archiveRoom:[16,85,75,93],guildTavern:[35,72,77,94]}[z.reuse]||[20,85,66,93]);z.floor=floor;
  spots[id]=[0,1,2,3,4].map((i)=>({id:id+'-'+i,x:floor[0]+(floor[1]-floor[0])*(i%3)/2,y:floor[2]+(floor[3]-floor[2])*Math.floor(i/3)}));connections[id]=[z.parent];if(!connections[z.parent].includes(id))connections[z.parent].push(id);
  const room=globalThis.GuildSceneLife?.rooms;if(room)room[id]={...(z.reuse?room[z.reuse]:{}),region:z.name,links:[],windows:z.reuse?room[z.reuse]?.windows||[]:[],furniture:z.reuse?room[z.reuse]?.furniture||[]:[]};
 }}
 function route(entries,date,index,registry){return entries.map(entry=>{
  if(entry.visitor||entry.literature||entry.routeLabel)return entry;
  const role=registry[entry.id]?.roleType,n=hash(date+'|'+index+'|annex|'+entry.id);if(n%3!==0)return entry;
  const scene=role==='celestial-spirit'?'celestialDesk':role==='historical-member'?'oldRecords':role==='visitor-ally'?'allianceSeat':entry.task?.type==='project'?'upperGallery':['returnTable','windowSeat'][n%2];
  return{...entry,sceneId:scene,routeLabel:'在'+zones[scene].name+'停留'};
 })}
 function parent(id){return zones[id]?.parent||id}
 function counts(values){const out={...values};for(const[id,z]of Object.entries(zones))out[z.parent]=(out[z.parent]||0)+(values[id]||0);return out}
 function mount(stage,scene,phase,go,context){
  stage.querySelectorAll(':scope>.guild-annex-sign').forEach(n=>n.remove());const zone=zones[scene];if(zone?.file)stage.dataset.annexLight=phase;else delete stage.dataset.annexLight;
  const sign=(id,label,x,y,run)=>{const b=document.createElement('button');b.type='button';b.className='guild-annex-sign';b.dataset.annexTarget=id;b.style.left=x+'%';b.style.top=y+'%';b.textContent=label;b.onclick=e=>{e.stopPropagation();run()};stage.append(b);return b};
  if(zone){sign(zone.parent,'← '+(context.scenes[zone.parent]?.name||'大厅'),17,9,()=>go(zone.parent));
   if(scene==='upperGallery')sign('project-records','成果卷宗',82,29,()=>{const project=context.tasks.find(t=>t.type==='project'&&t.done)||context.tasks.find(t=>t.type==='project');project?context.openTask(project):globalThis.GuildSceneLife?.openMemory()});
   if(scene==='returnTable')sign('delivery-records','交付卷宗',82,36,()=>context.openRecords());
   if(scene==='oldRecords')sign('historical-records','旧卷宗回响',76,30,()=>context.openMember('mavis'));
   if(scene==='celestialDesk')sign('contract-records','契约联络',66,31,()=>context.openMember('lucy'));
   if(scene==='allianceSeat'){const guest=context.tasks.find(t=>context.registry[t.assigneeId]?.roleType==='visitor-ally');sign('alliance-records','来访记录',42,35,()=>context.openMember(guest?.assigneeId||'sting'))}
   if(scene==='windowSeat')sign('memory-album','纪念画册',70,29,()=>globalThis.GuildSceneLife?.openMemory());
  }else for(const[id,z]of Object.entries(zones))if(z.parent===scene)sign(id,z.name,z.x,z.y,()=>go(id));
 }
 globalThis.GuildAnnex=Object.freeze({zones,register,route,parent,counts,mount,floor:id=>zones[id]?.floor});
})();
