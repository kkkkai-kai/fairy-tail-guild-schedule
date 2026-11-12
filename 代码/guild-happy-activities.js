/* Shared guild inventory and partner growth; the desktop is only a remote control. */
(()=>{'use strict';
const catalog=[
 {id:'happy-training-kit',title:'飞行练习套具',j:180,durable:true},
 {id:'happy-training-ration',title:'修炼补给包',j:25},
 {id:'happy-fishing-rod',title:'小窝钓竿',j:160,durable:true},
 {id:'happy-fishing-bait',title:'一份鱼饵',j:40}
].map(i=>({...i,iconIndex:17,category:'伙伴活动',petType:'activity',repeatable:!i.durable,note:i.durable?'可重复使用，不随活动消耗':'每15分钟消耗一份'}));
const modes={training:{name:'飞行与配合练习',gear:'happy-training-kit',supply:'happy-training-ration',duration:1800000,happyExp:16,memberExp:8},fishing:{name:'河畔钓鱼',gear:'happy-fishing-rod',supply:'happy-fishing-bait',duration:1800000,happyExp:2,memberExp:0}};
virtualCatalog.push({id:'happy-activities',name:'哈比的修炼与钓鱼',items:catalog});
function store(){const h=ensureWarehouse().happy;return h.activities||(h.activities={sessions:{}})}
function visitors(seed=today()){
 const cats=typeof guildExceedCompanions!=='undefined'?guildExceedCompanions:[];
 const pool=[...Object.values(guildMemberRegistry).filter(m=>m.roleType==='fairy-tail-member').map(m=>({id:m.assigneeId,name:m.name,sprite:m.hallSprite})),...cats.map(m=>({id:m.id,name:m.name,sprite:m.sprite}))];
 const map=new Map(pool.filter(m=>m.id&&m.id!=='happy').map(m=>[m.id,m]));
 return [...map.values()].map(m=>({...m,sprite:guildAssetPath(m.sprite||''),weight:['carla','lily','frosch','lector'].includes(m.id)?16:1})).sort((a,b)=>{
  const score=m=>-Math.log((stableHallHash(seed+'|'+m.id)+1)/4294967297)/m.weight;return score(a)-score(b)
 });
}
function quote(modeId,minutes=30){const mode=modes[modeId];if(!mode)throw Error('请选择修炼或钓鱼');minutes=Number(minutes);if(![15,30,60].includes(minutes))throw Error('请选择15、30或60分钟');const units=minutes/15;return{minutes,units,duration:minutes*60000,happyExp:modeId==='training'?8*units:units,memberExp:modeId==='training'?4*units:0}}
function view(){const sessions=Object.values(store().sessions),session=sessions.filter(s=>s.status==='running'&&s.kind!=='gather').sort((a,b)=>a.startedAt-b.startedAt)[0]||null;return{version:4,lastReceipt:sessions.filter(s=>s.status==='claimed').sort((a,b)=>b.claimedAt-a.claimedAt).map(s=>({id:s.id,mode:s.mode,message:s.receiptMessage||(s.kind==='gather'?'已领取：修炼补给1份、鱼饵1份':'已领取记录：伙伴EXP +'+s.happyExp+(s.mode==='fishing'?' · 鱼获 '+(s.fish||0)+'份':''))}))[0]||null,gather:sessions.filter(s=>s.kind==='gather'&&s.status==='running').sort((a,b)=>a.startedAt-b.startedAt)[0]||null,durations:[15,30,60],catalog:catalog.map(i=>({...i,count:warehouseStock(i.id)})),modes,session,guest:session?.memberId?{id:session.memberId,name:session.memberName,sprite:session.memberSprite,invited:true,sessionId:session.id}:visitors(today()+'|nook')[0]||null}}
const keys=['fairytail-schedule-v1','fairytail-wallet-v1','fairytail-tasks-v2','fairytail-growth-v1','fairytail-warehouse-v1'];
function commit(change){const roots=[wallet,growth,guildWarehouse],before=roots.map(v=>structuredClone(v)),raw=keys.map(k=>localStorage.getItem(k));try{const result=change();save();document.dispatchEvent(new CustomEvent('guild-happy-activity-changed'));globalThis.GuildDesktopHappy?.request();return result}catch(e){roots.forEach((r,i)=>{Object.keys(r).forEach(k=>delete r[k]);Object.assign(r,before[i])});keys.forEach((k,i)=>{try{if(localStorage.getItem(k)!==raw[i])raw[i]===null?localStorage.removeItem(k):localStorage.setItem(k,raw[i])}catch{}});throw Error('本次未保存：'+e.message)}}
function movement(id,itemId,action,quantity,sourceId){
 const w=ensureWarehouse();if(w.movements.some(m=>m.id===id||m.operationId===id))return;
 const plan=[];if(action==='out'){let remaining=quantity;const locations=[...new Set([...(w.locations||[]).map(l=>l.id),...w.movements.flatMap(m=>[m.fromLocationId,m.toLocationId])].filter(Boolean))];for(const location of locations){const used=Math.min(remaining,Math.max(0,warehouseStock(itemId,location)));if(used){plan.push({location,quantity:used});remaining-=used}if(!remaining)break}if(remaining)throw Error('补给位置或库存已改变，请重新核对')}else plan.push({location:warehouseItem(itemId)?.defaultLocationId||'happy-toy-box',quantity});
 for(const [index,p]of plan.entries()){warehouseRecord({itemId,action,quantity:p.quantity,...(action==='out'?{fromLocationId:p.location}:{toLocationId:p.location}),source:'哈比伙伴活动',sourceId,note:action==='out'?'活动补给消耗':'活动获得'});Object.assign(w.movements.at(-1),{id:id+':'+index,operationId:id})}
}

function execute(c){if(!c.id||typeof c.id!=='string'||c.id.length>120)throw Error('缺少活动回执');if(c.confirmed!==true)throw Error('请先确认活动费用和补给');
 if(c.action==='game-buy'){
  const item=catalog.find(i=>i.id===c.itemId);if(!item)throw Error('这件活动道具不存在');const quantity=c.quantity===undefined?1:Number(c.quantity);if(!Number.isInteger(quantity)||quantity<1||quantity>20||item.durable&&quantity!==1)throw Error('购买数量应为1—20份，套具每次1件');const cost=item.j*quantity;const id='happy-buy:'+c.id;if(wallet.redemptions.some(r=>r.id===id))return '这份补给已经保存';if(item.durable&&warehouseStock(item.id)>0)throw Error('套具已经备好，无需重复购买');if(totals().balance<cost)throw Error('公会余额不足，需要 '+cost+' J');
  return commit(()=>{ensureWarehouse();wallet.redemptions.push({id,date:today(),j:cost,cents:0,name:item.title,rate:wallet.rate,virtual:true,itemId:item.id});movement(id,item.id,'in',quantity,id);return item.title+' ×'+quantity+'已放入原公会库存 · 花费 '+cost+' J'})
 }
 if(c.action==='game-gather'){
  if(hallSupperPhase()!=='open')throw Error('先召回伙伴，再一起准备补给');if(store().sessions[c.id])return '采集已经安排';if(view().gather)throw Error('已有伙伴正在采集，先领取这次补给');const member=visitors(c.id+'|gather')[0];return commit(()=>{const now=Date.now();store().sessions[c.id]={id:c.id,kind:'gather',mode:'gather',status:'running',startedAt:now,endsAt:now+900000,happyExp:0,memberId:member?.id||'',memberName:member?.name||'公会伙伴'};return (member?.name||'伙伴')+'出发采集了，15分钟后可领取修炼补给1份和鱼饵1份；不需要先耗尽库存'})
 }
 if(c.action==='game-gather-claim'){
  const s=store().sessions[c.sessionId];if(!s||s.kind!=='gather')throw Error('这份采集记录不存在');if(s.status==='claimed')return '采集物资已经领取';if(Date.now()<s.endsAt)throw Error('伙伴还在采集，请稍等');return commit(()=>{movement('gather-ration:'+s.id,'happy-training-ration','in',1,s.id);movement('gather-bait:'+s.id,'happy-fishing-bait','in',1,s.id);s.status='claimed';s.claimedAt=Date.now();return (s.receiptMessage='采集归来：修炼补给 +1、鱼饵 +1，已存入原公会库存')})
 }
 if(c.action==='game-play'){
  const s=store().sessions[c.sessionId];if(!s||s.mode!=='training'||s.status!=='running'||Date.now()>=s.endsAt)throw Error('请先开始一场修炼');if(!['hoop','balance','landing'].includes(c.playType))throw Error('练习项目不存在');if(s.plays?.[c.id])return '这次配合已记下';if(Date.now()-(s.lastPlayAt||0)<5000)throw Error('让哈比歇5秒，再进行下一次配合');return commit(()=>{s.plays??={};const h=ensureWarehouse().happy,before=h.moodValue,gain=Object.keys(s.plays).length<3?1:0;h.moodValue=Math.min(100,before+gain);s.course=c.playType;s.lastPlayAt=Date.now();s.plays[c.id]={type:c.playType,at:s.lastPlayAt,moodGain:h.moodValue-before};return ({hoop:'哈比跃过了练习圈',balance:'哈比稳稳保持住平衡',landing:'哈比准确降落在标记处'})[c.playType]+' · 心情 '+h.moodValue+'/100'+(h.moodValue-before?'（+'+(h.moodValue-before)+'）':h.moodValue===100?'，已到上限':'；这次只练动作，不重复加奖励')})
 }
 if(c.action==='game-start'){
  if(hallSupperPhase()!=='open')throw Error('哈比已经收工，请先召回伙伴再安排活动');const a=store();if(a.sessions[c.id])return '这场活动已经登记';if(view().session)throw Error('先完成并领取上一场活动');const mode=modes[c.activityType];if(!mode)throw Error('请选择修炼或钓鱼');const plan=quote(c.activityType,c.minutes??30);if(warehouseStock(mode.gear)<1)throw Error('还没有'+catalog.find(i=>i.id===mode.gear).title);if(warehouseStock(mode.supply)<plan.units)throw Error('活动补给不足，本场需要 '+plan.units+' 份，请在这里购买');
  const member=c.invite===true?visitors(c.id+'|invite')[0]:null;
  return commit(()=>{const now=Date.now();movement('happy-start:'+c.id,mode.supply,'out',plan.units,c.id);store().sessions[c.id]={id:c.id,mode:c.activityType,status:'running',startedAt:now,endsAt:now+plan.duration,minutes:plan.minutes,units:plan.units,happyExp:plan.happyExp,moodGain:c.activityType==='training'?4*plan.units:2*plan.units,course:'hoop',memberExp:member?plan.memberExp:0,memberId:member?.id||'',memberName:member?.name||'',memberSprite:member?.sprite||'',fish: c.activityType==='fishing'?Array.from({length:plan.units},(_,i)=>stableHallHash(c.id+'|fish|'+i)%10<7?1:0).reduce((a,b)=>a+b,0):0};return mode.name+'开始了'+(member?'，'+member.name+'一起陪伴':'')+'；到时再来领取结果'})
 }
 if(c.action==='game-claim'){
  const s=store().sessions[c.sessionId];if(!s||s.kind==='gather')throw Error('这场活动不存在');if(s.status==='claimed')return '这场活动的结果已领取，不会重复结算';if(Date.now()<s.endsAt)throw Error('还没有结束，请让哈比慢慢完成');
  return commit(()=>{const h=ensureWarehouse().happy;h.exp=(Number(h.exp)||0)+s.happyExp;h.moodValue=Math.min(100,(Number(h.moodValue)||0)+(s.moodGain??2));if(s.fish)movement('happy-fish:'+s.id,'happy-food-fish','in',s.fish,s.id);if(s.memberId&&s.memberExp){if(!globalThis.GuildV4?.recordV4Event)throw Error('伙伴档案尚未就绪');GuildV4.recordV4Event('member-training:'+s.id,{type:'member-training',memberId:s.memberId,memberExp:s.memberExp,sourceKey:'member-training:'+s.id})}s.status='claimed';s.claimedAt=Date.now();return (s.receiptMessage='心情 '+h.moodValue+'/100'+(h.moodValue===100?'（已到上限）':'')+' · 哈比伙伴经验 +'+s.happyExp+(s.memberExp?' · '+s.memberName+'伙伴经验 +'+s.memberExp:'')+(s.mode==='fishing'?(s.fish?' · 鲜鱼小点心 +'+s.fish+'，已入原库存':' · 这次没有钓到鱼'):''))})
 }
 throw Error('未知伙伴活动')
}
globalThis.GuildHappyActivities={view,execute,visitors,quote,iconFor:title=>{const i=catalog.find(i=>i.title===title);return i?'素材/人物/happy-哈比/道具/guild-'+i.id+'-v287.png':''}};
})();
