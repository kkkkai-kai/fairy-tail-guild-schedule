/* Independent, idempotent EXP ledger. No currency balances are changed here. */
(function(root){
  const points={F:3,E:5,D:8,C:10,B:25,A:50,S:100};
  const rankName=level=>level<=4?'见习魔导士':level<=9?'初级魔导士':level<=19?'中级魔导士':level<=29?'高级魔导士':level<=39?'王牌候补':level<=49?'公会王牌':level<=59?'S级魔导士':level<=69?'最强候补':level<=79?'最强魔导士':level<=87?'公会荣耀':level<=93?'妖精女王／妖精之王':level<=98?'传说魔导士':'神话魔导士';
  const requiredTotalExpForLevel=level=>{const safe=Math.min(100,Math.max(1,Number(level)||1));if(safe===1)return 0;const n=safe-1;return Math.round(80*Math.pow(n,1.65)+40*n)};
  const title=level=>rankName(Math.min(100,Math.max(1,Number(level)||1)));
  function grade(task){
    if(Object.hasOwn(points,task.grade))return task.grade;
    if(task.type==='project'||task.keyDelivery)return 'S';
    if(/关键|重要|定稿|交付|汇报|论文投稿/.test(task.title||task.t||''))return 'A';
    if(task.category==='生活'||/准备|预约|整理桌面|吃饭|饮水|休息|睡前|检查材料/.test(task.title||task.t||''))return 'C';
    return 'B';
  }
  function level(exp){exp=Math.max(0,Number(exp)||0);let l=1;for(let candidate=2;candidate<=100;candidate++){if(exp>=requiredTotalExpForLevel(candidate))l=candidate;else break}const floor=requiredTotalExpForLevel(l),next=l<100?requiredTotalExpForLevel(l+1):null,levelSpan=next===null?1:Math.max(1,next-floor),gainedInLevel=Math.max(0,exp-floor),remaining=next===null?0:Math.max(0,next-exp);return{level:l,title:title(l),rankName:title(l),exp,totalExp:exp,floor,next,levelSpan,gainedInLevel,remaining,progress:next===null?100:Math.min(100,gainedInLevel/levelSpan*100),isMaxLevel:l>=100}}
  function allocation(steps,pool){if(!steps.length)return [];const weights=steps.map(s=>Math.max(0,Number(s.reward)||0)),sum=weights.reduce((a,b)=>a+b,0);const shares=weights.map(w=>Math.floor(pool*(sum?w/sum:1/steps.length)));shares[shares.length-1]+=pool-shares.reduce((a,b)=>a+b,0);return shares}
  function dailyGrade(id,item){if(item?.grade)return grade(item);if(id==='ifa')return 'B';if(id==='qiewen-script-20260916')return 'S';if(/^(0|3|4)-/.test(id))return 'C';if(id==='2-0')return 'C';if(/^[12]-/.test(id))return 'B';return grade(item||{})}
  function sync(data,tasks,input){
    const g=input||{version:1,migrationComplete:false,entries:{},projectPools:{},highestNotified:1};g.entries??={};g.projectPools??={};
    const seen=new Set();
    function entry(key,active,value){seen.add(key);const e=g.entries[key]??={exp:value,active:false};e.active=!!active}
    for(const [d,s]of Object.entries(data))for(const [id,on]of Object.entries(s.checked||{}))entry('daily:'+d+':'+id,on&&!(id==='qiewen-script-20260916'&&tasks.some(t=>t.id==='qiewen-20260916')),points[dailyGrade(id,(s.extra||[]).find(t=>t.id===id))]);
    for(const t of tasks){
      if(t.type==='project'){
        const steps=t.steps||[];
        if(!g.projectPools[t.id]){const pool=points[grade(t)],shares=allocation(steps,pool);g.projectPools[t.id]={pool,shares:{}};steps.forEach((s,i)=>g.projectPools[t.id].shares[s.id||'step-'+i]=shares[i])}
        const p=g.projectPools[t.id];
        const legacyDone=t.id==='qiewen-20260916'&&data['2026-09-16']?.checked?.['qiewen-script-20260916'];
        steps.forEach((s,i)=>entry('project:'+t.id+':'+(s.id||'step-'+i),s.done||legacyDone,p.shares[s.id||'step-'+i]||0));
      }else{
        // A migrated IFA checkbox and its task object represent the same completion.
        const linked=t.legacyDate&&t.legacyId&&Object.hasOwn(data[t.legacyDate]?.checked||{},t.legacyId);
        if(!linked)entry('task:'+t.id,t.done,points[grade(t)]);
      }
    }
    for(const [key,e]of Object.entries(g.entries))if(!seen.has(key))e.active=false;
    const total=Object.values(g.entries).reduce((n,e)=>n+(e.active?(e.levelExp??e.exp):0),0),result=level(total);
    if(!g.migrationComplete){g.highestNotified=result.level;g.migrationComplete=true;g.migratedAt=new Date().toISOString()}
    return {growth:g,...result};
  }
  function validateBackup(x){
    const obj=v=>v&&typeof v==='object'&&!Array.isArray(v),integer=v=>Number.isSafeInteger(v)&&v>=0;
    if(!obj(x)||!obj(x.data)||!obj(x.wallet)||!Array.isArray(x.wallet.redemptions))throw Error('备份缺少日程或兑换记录');
    if(x.wallet.rate!==undefined&&(!Number.isFinite(x.wallet.rate)||x.wallet.rate<=0))throw Error('兑换比例格式无效');
    if(x.wallet.cap!==undefined&&(!Number.isFinite(x.wallet.cap)||x.wallet.cap<0))throw Error('月度预算格式无效');
    for(const [d,s]of Object.entries(x.data)){if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!obj(s)||!obj(s.checked)||!obj(s.rewards||{})||!Array.isArray(s.extra||[]))throw Error('日程格式无效');for(const v of Object.values(s.checked))if(typeof v!=='boolean')throw Error('勾选格式无效');for(const v of Object.values(s.rewards||{}))if(!integer(v))throw Error('奖励格式无效')}
    for(const r of x.wallet.redemptions)if(!obj(r)||!integer(r.j)||!integer(r.cents)||typeof r.date!=='string'||typeof r.name!=='string')throw Error('兑换记录格式无效');
    if(x.tasks!==undefined&&!Array.isArray(x.tasks))throw Error('任务格式无效');
    if(x.warehouse!==undefined&&(!obj(x.warehouse)||!Array.isArray(x.warehouse.items||[])||!Array.isArray(x.warehouse.locations||[])||!Array.isArray(x.warehouse.movements||[])))throw Error('仓库记录格式无效');
    const ids=new Set();for(const t of x.tasks||[]){if(!obj(t)||typeof t.id!=='string'||ids.has(t.id)||typeof t.title!=='string'||!['once','project','daily'].includes(t.type))throw Error('任务格式无效');ids.add(t.id);if(t.plannedAt!==undefined&&typeof t.plannedAt!=='string')throw Error('计划时间格式无效');if(t.type==='project'&&t.steps!==undefined&&(!Array.isArray(t.steps)||t.steps.some(s=>!obj(s)||typeof s.title!=='string'||!integer(s.reward))))throw Error('子任务格式无效')}
    if(x.growth!==undefined){if(!obj(x.growth)||!obj(x.growth.entries)||!obj(x.growth.projectPools))throw Error('经验记录格式无效');for(const e of Object.values(x.growth.entries))if(!obj(e)||!integer(e.exp)||typeof e.active!=='boolean')throw Error('经验明细无效');for(const p of Object.values(x.growth.projectPools))if(!obj(p)||!integer(p.pool)||!obj(p.shares)||Object.values(p.shares).some(v=>!integer(v))||Object.values(p.shares).reduce((a,b)=>a+b,0)!==p.pool)throw Error('项目经验池无效')}
    const validTime=v=>typeof v==='string'&&v.includes('T')&&Number.isFinite(Date.parse(v));
    for(const s of Object.values(x.data))if(s.completedAt!==undefined&&(!obj(s.completedAt)||Object.values(s.completedAt).some(v=>!validTime(v))))throw Error('完成时间记录无效');
    const arcane=x.growth?.arcane;
    if(arcane!==undefined){
      if(!obj(arcane))throw Error('魔法记录无效');
      if(arcane.summarySeen!==undefined&&(!obj(arcane.summarySeen)||Object.values(arcane.summarySeen).some(v=>!validTime(v))))throw Error('总结查看记录无效');
      if(arcane.items!==undefined){if(!obj(arcane.items))throw Error('收藏记录无效');for(const item of Object.values(arcane.items))if(item?.usedAt&&(!validTime(item.usedAt)||typeof item.magicId!=='string'||!integer(item.magicExp)))throw Error('道具修习记录无效')}
    }
    return x;
  }
  root.GuildGrowth={points,grade,level,title,rankName,requiredTotalExpForLevel,allocation,dailyGrade,sync,validateBackup};
})(typeof globalThis!=='undefined'?globalThis:window);
