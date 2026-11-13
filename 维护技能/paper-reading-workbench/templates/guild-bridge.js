// Connects the reading page to its existing local guild record; never completes tasks or rewards.
(()=>{'use strict';
 // Share position with the parent without changing reading data or issuing workflow requests.
 if(!window.GuildWorkbenchNavigation){
  const navNonce=new URL(location.href).searchParams.get('context');
  if(parent!==window&&navNonce){
   let navTimer=null,restoringPosition=false,restoreVersion=0;
   const report=()=>{if(restoringPosition)return;parent.postMessage({type:'guild-literature-navigation',nonce:navNonce,path:location.pathname+location.search,scrollY:Math.round(window.scrollY)},'*')};
   const scheduleReport=()=>{clearTimeout(navTimer);navTimer=setTimeout(report,200)};
   const restore=async y=>{const version=++restoreVersion;restoringPosition=true;await Promise.race([Promise.allSettled([...document.images].filter(im=>!im.complete).map(im=>new Promise(resolve=>{im.addEventListener('load',resolve,{once:true});im.addEventListener('error',resolve,{once:true})}))),new Promise(resolve=>setTimeout(resolve,2000))]);requestAnimationFrame(()=>requestAnimationFrame(()=>{if(version!==restoreVersion)return;window.scrollTo(0,y);restoringPosition=false;report()}))};
   window.GuildWorkbenchNavigation={report,scheduleReport};
   window.addEventListener('message',event=>{if(event.source!==parent||event.data?.type!=='guild-literature-restore-position'||event.data.nonce!==navNonce)return;const y=event.data.scrollY;if(typeof y==='number'&&Number.isFinite(y)&&y>=0&&y<=10000000)void restore(y)});
   window.addEventListener('scroll',scheduleReport,{passive:true});window.addEventListener('hashchange',scheduleReport);window.addEventListener('popstate',scheduleReport);window.addEventListener('pagehide',report);
   if(document.readyState==='complete')scheduleReport();else window.addEventListener('load',scheduleReport,{once:true});
  }
 }

 const guildRuntimeToken="__GUILD_WORKBENCH_TOKEN__";
 if(!D.guild?.enabled)return;
 const base=/^http:\/\/127\.0\.0\.1:\d+$/.test(location.origin)?location.origin:'http://127.0.0.1:18765',paperId=location.origin===base?new URL(location.href).searchParams.get('id'):'',linked=!!paperId&&guildRuntimeToken!=='__GUILD_'+'WORKBENCH_TOKEN__';
 const brand=document.querySelector('.brand');brand.textContent='妖精的尾巴 · 研读角';const mark=document.createElement('span');mark.className='guild-book-mark';
 mark.innerHTML='<svg viewBox="0 0 32 36" fill="none" aria-hidden="true"><path d="M4 6h11c3-3 8-3 13-2v25c-5-1-10-1-13 2H4z" stroke="currentColor" stroke-width="1.8"/><path d="M15 6v25M8 11h4M8 16h4M20 10h4M20 15h4" stroke="#b48b44" stroke-width="1.5"/><path d="m23 20 1.2 2.8 3 .4-2.3 2 .6 3-2.5-1.5-2.5 1.5.6-3-2.3-2 3-.4z" fill="#b48b44"/></svg>';
 brand.prepend(mark);document.querySelector('.eyebrow').textContent='FAIRY TAIL · RESEARCH ARCHIVE';
 const host=document.createElement('section');host.className='guild-link';host.setAttribute('aria-label','公会研读联动');const title=document.createElement('strong');title.textContent='研读卷宗 · 与公会接续';
 const status=document.createElement('p');status.className='guild-link-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const actions=document.createElement('div');actions.className='guild-actions';
 const contextNonce=new URL(location.href).searchParams.get('context');
 function libraryUrl(){const u=new URL('/',base);u.searchParams.set('view','library');if(paperId)u.searchParams.set('paper',paperId);else u.searchParams.set('query',D.doi||D.title_en);if(contextNonce)u.searchParams.set('context',contextNonce);return u.href}
 globalThis.GuildWorkbenchReturn=async view=>{if(linked&&typeof globalThis.GuildWorkbenchSave==='function')await globalThis.GuildWorkbenchSave();if(view==='library'){location.assign(libraryUrl());return}if(parent!==window&&contextNonce){parent.postMessage({type:'guild-literature-return',nonce:contextNonce,paperId},'*');return}const capabilities=await fetch(base+'/api/workbench-capabilities',{cache:'no-store'}).then(response=>response.ok?response.json():{}).catch(()=>({}));if(capabilities.readingTaskWorkflow!==true)throw Error('当前文献服务尚未加载研读委托功能，请先手动重启本地文献服务，再刷新本页。');const result=await api('open-guild',{paperId,view:'guild'});status.textContent=result.message||'已请求打开原公会主系统。'};
 for(const[label,view]of [['返回公会系统','guild'],['返回公会研读角','library']]){const link=document.createElement('button');link.type='button';link.textContent=label;link.dataset.guildReturn=view;link.onclick=async()=>{link.disabled=true;try{await globalThis.GuildWorkbenchReturn(view)}catch(error){status.textContent=error.message+'。尚未离开，本机笔记仍保留。'}finally{link.disabled=false}};actions.append(link)}
 const save=document.createElement('button');save.type='button';save.textContent='保存进度到公会';save.className='is-primary';save.disabled=!linked;actions.prepend(save);
 const info=document.createElement('details'),sum=document.createElement('summary');sum.textContent='联动范围与完成规则';const copy=document.createElement('p');copy.textContent='子图进度、笔记、问题、高亮及备注保存到本机公会，再由原公会机制同步云端。此处“已保存”指本机写入成功；不会自动结算委托。离线HTML可导出完整记录。';info.append(sum,copy);host.append(title,status,actions,info);document.querySelector('.title').after(host);
 // A visible status remains beside the floating save button, including when a request fails.
 const floatWrap=document.createElement('div');floatWrap.className='guild-float-save';
 const floatLabel=document.createElement('span');floatLabel.className='guild-float-status';floatLabel.id='guild-float-status';
 const floatBtn=document.createElement('button');floatBtn.type='button';floatBtn.className='float-save-btn';floatBtn.textContent='💾';floatBtn.setAttribute('aria-label','保存进度到公会');floatBtn.setAttribute('aria-describedby',floatLabel.id);
 const floatTip=document.createElement('div');floatTip.className='guild-save-tooltip';floatTip.id='guild-save-tooltip';floatTip.setAttribute('role','tooltip');floatTip.hidden=true;
 floatWrap.append(floatLabel,floatBtn,floatTip);document.body.append(floatWrap);
 function updateState(state,message){host.dataset.syncState=state;floatWrap.dataset.syncState=state;floatBtn.dataset.state=state;status.textContent=message;floatTip.textContent=message;floatLabel.textContent={connecting:'连接中',pending:'等待保存',saving:'正在保存',saved:'已保存到本机公会',error:'保存失败 · 点击重试',offline:'仅保存在浏览器',conflict:'存在冲突 · 请处理'}[state]||state;floatBtn.setAttribute('aria-label',floatLabel.textContent+'；保存进度到公会');floatBtn.disabled=state==='saving';save.disabled=!linked||state==='saving'}
 for(const kind of ['mouseenter','focus'])floatBtn.addEventListener(kind,()=>{floatTip.hidden=false});
 for(const kind of ['mouseleave','blur'])floatBtn.addEventListener(kind,()=>{floatTip.hidden=true});
 let revision=0,ready=false,timer=null,flight=null,loadFlight=null,changed=false,conflict=false,restoring=false,remoteSnapshot=null,retryDelay=5000;
 const choices=document.createElement('div');choices.className='guild-actions';choices.hidden=true;const useRemote=document.createElement('button'),keepLocal=document.createElement('button');useRemote.type=keepLocal.type='button';useRemote.textContent='采用公会记录（先导出本机备份）';keepLocal.textContent='保留本机内容并保存为新修订';choices.append(useRemote,keepLocal);host.append(choices);
 const highlightCapable=typeof highlights!=='undefined'&&typeof normalizeHighlights==='function';
 const localHighlights=()=>highlightCapable?highlights:[];
 const snapshot=()=>({done:saved.done,notes:saved.notes,questions:study.questions,...(highlightCapable?{highlights:localHighlights()}:{})});
 function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value}
 function stateSignature(value){return JSON.stringify(stable({...value,done:[...new Set(value.done||[])].sort()}))}
 const signature=()=>stateSignature(snapshot());let lastSignature=signature();
 const baselineKey='paperwork:guild-ack:'+D.source_sha256;
 let baseline=null;try{baseline=localStorage.getItem(baselineKey)}catch{}
 const dirtyKey='paperwork:guild-dirty:'+D.source_sha256;
 function markDirty(){changed=true;try{localStorage.setItem(dirtyKey,'yes')}catch{}}
 function clearDirty(){changed=false;baseline=signature();try{localStorage.setItem(baselineKey,baseline);localStorage.removeItem(dirtyKey)}catch{}}
 async function api(endpoint,body){const options={headers:{'X-Guild-Token':guildRuntimeToken},cache:'no-store',signal:AbortSignal.timeout(8000)};if(body!==undefined){options.method='POST';options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);if(new TextEncoder().encode(options.body).length<=60000)options.keepalive=true}const response=await fetch(base+'/api/'+endpoint,options);const payload=await response.json();if(!response.ok){const message=String(payload.error||'联动未成功');throw Error(/Command failed:|Start-Process|InvalidOperationException|powershell\.exe/i.test(message)?'未能打开公会主页面。请从原公会入口打开；本页记录仍保留。':message)}return payload}
 function pendingMessage(){updateState(linked?'pending':'offline',linked?'本浏览器已保存，等待自动同步到公会。':'离线阅读：进度和笔记保存在本浏览器；从公会地址打开可自动同步。')}
 function restore(progress){restoring=true;try{saved.done=progress.done||[];saved.notes=progress.notes||{};study.questions=progress.questions||[];if(Array.isArray(progress.highlights)&&typeof normalizeHighlights==='function'){highlights=normalizeHighlights(progress.highlights);renderHighlights();saveHighlights()}for(const[id,r]of cardMap)r.input.value=saved.notes[id]||'';update();persist();saveStudy();renderQuestions();lastSignature=signature()}finally{restoring=false}}
 function backupLocal(){downloadStudy(D.source_name.replace(/\.pdf$/i,'')+'.联动前阅读备份.json',JSON.stringify({version:'9.9',source_sha256:D.source_sha256,title:D.title_en,...snapshot(),study},null,2))}
 useRemote.onclick=()=>{if(!remoteSnapshot)return;backupLocal();const seed=!Array.isArray(remoteSnapshot.highlights)&&localHighlights().length>0;restore(remoteSnapshot);revision=remoteSnapshot.revision||0;conflict=false;ready=true;clearDirty();choices.hidden=true;if(seed){markDirty();pendingMessage();schedule(0)}else updateState('saved','已采用公会记录；原本机内容（含高亮）已导出为备份。')};
 keepLocal.onclick=()=>{if(!remoteSnapshot)return;revision=remoteSnapshot.revision||0;conflict=false;ready=true;choices.hidden=true;markDirty();void push()};
 function schedule(delay=1200){clearTimeout(timer);if(linked&&!conflict)timer=setTimeout(()=>void push(),delay)}
 async function load(refresh=false){
  if(!linked){pendingMessage();return false}
  if(loadFlight)return loadFlight;
  updateState('connecting','正在连接同一篇公会文献…');
  loadFlight=(async()=>{try{
   const remote=await api('workbench-progress?id='+encodeURIComponent(paperId));if(remote.sourceSha256!==D.source_sha256)throw Error('公会记录的PDF指纹不同');
   if(remote.progressSchemaVersion!==2)throw Error('本地服务需要重新启动才能保存高亮；浏览器记录保留，请先导出备份');
   revision=remote.progress.revision||0;remoteSnapshot=remote.progress;
   let dirty=false;try{dirty=localStorage.getItem(dirtyKey)==='yes'}catch{}
   const coreHasNotes=v=>Object.keys(v.notes||{}).length||(v.done||[]).length||(v.questions||[]).length;
   const seedHighlights=!Array.isArray(remote.progress.highlights)&&localHighlights().length>0;
   const remoteState={done:remote.progress.done||[],notes:remote.progress.notes||{},questions:remote.progress.questions||[],...(highlightCapable?{highlights:Array.isArray(remote.progress.highlights)?remote.progress.highlights:localHighlights()}:{})};
   const remoteHasNotes=coreHasNotes(remote.progress)||(remote.progress.highlights||[]).length;
   const localHasNotes=coreHasNotes(snapshot())||localHighlights().length;
   const canRestore=((refresh||baseline===signature())&&!dirty)||(!coreHasNotes(snapshot())&&!dirty&&(!localHighlights().length||seedHighlights));
   if((remoteHasNotes||revision>0)&&!canRestore&&signature()!==stateSignature(remoteState)){conflict=true;choices.hidden=false;updateState('conflict','本机笔记或高亮与公会记录不同，请选择保留哪一份；不会自动覆盖。');return false}
   if((remoteHasNotes||revision>0)&&canRestore)restore(remoteState);
   ready=true;retryDelay=5000;lastSignature=signature();title.textContent='研读卷宗 · '+(remote.courierName?remote.courierName+'呈递':'公会档案');
   if(signature()!==stateSignature(remoteState)||dirty||seedHighlights){markDirty();pendingMessage();schedule()}else{clearDirty();updateState('saved','已连接同一篇本机公会文献；进度、笔记、问题与高亮自动保存，云端状态请在公会查看。')}
   return true;
  }catch(error){updateState('error',error.message+'。本机记录仍保留，将自动重试，也可点击保存。');schedule(retryDelay);retryDelay=Math.min(retryDelay*2,60000);return false}finally{loadFlight=null}})();return loadFlight;
 }
 async function push(){
  if(flight)return flight;
  if(!linked){pendingMessage();return false}
  if(conflict){updateState('conflict','请先选择保留本机内容或采用公会记录；不会强制覆盖。');return false}
  if(!ready){if(!await load())return false;if(conflict)return false;if(flight)return flight;}
  clearTimeout(timer);
  if(!changed&&signature()===lastSignature)return true;
  const before=signature(),payload={paperId,sourceSha256:D.source_sha256,baseRevision:revision,...snapshot()};updateState('saving','正在保存到本机公会…');
  flight=api('workbench-progress',payload).then(result=>{revision=result.progress.revision;lastSignature=before;changed=signature()!==before;retryDelay=5000;if(!changed)clearDirty();if(changed)pendingMessage();else updateState('saved','公会进度已保存 · '+result.progress.done.length+'/'+cardMap.size+' 子图；未自动结算委托或奖励。');return true}).catch(async error=>{markDirty();if(/另一窗口/.test(error.message)){conflict=true;try{remoteSnapshot=(await api('workbench-progress?id='+encodeURIComponent(paperId))).progress;choices.hidden=false}catch{}}updateState(conflict?'conflict':'error',error.message+'。本机记录仍保留，请处理提示或导出备份。');if(!conflict){schedule(retryDelay);retryDelay=Math.min(retryDelay*2,60000)}return false}).finally(()=>{flight=null;save.disabled=!linked;floatBtn.disabled=false;if(changed&&!conflict&&signature()!==before)schedule()});return flight;
 }
 save.onclick=floatBtn.onclick=()=>{if(conflict){host.scrollIntoView({behavior:'smooth',block:'center'});useRemote.focus({preventScroll:true});return}void push()};
 globalThis.GuildWorkbenchSave=async()=>{for(let attempt=0;attempt<5;attempt++){if(signature()!==lastSignature)markDirty();const ok=await push();if(!ok||!ready||conflict)break;if(!changed&&signature()===lastSignature)return;}throw Error('最新阅读进度尚未保存，请先处理联动提示再离开或确认完成');};
 // Capture only after original handlers persist state; restore never marks a remote load dirty.
 function track(){if(restoring)return;queueMicrotask(()=>{if(signature()===lastSignature)return;markDirty();if(!conflict){pendingMessage();if(linked)schedule()}})}
 window.addEventListener('paperwork-state-changed',track);
 document.addEventListener('input',event=>{if(event.target.closest('.learning-note,#study-questions'))track()});
 document.addEventListener('click',event=>{if(event.target.closest('.complete-btn,.card-top button,#study-questions button'))track()});
 document.getElementById('import-file')?.addEventListener('change',()=>setTimeout(track,0));
 window.addEventListener('online',()=>{if(linked&&!conflict)schedule(0)});
 function flushOnLeave(){if(signature()!==lastSignature)markDirty();if(changed&&ready&&!flight&&!conflict)void push()}
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushOnLeave();else if(linked&&!conflict&&!flight){if(changed)schedule(0);else void load(true)}});
 window.addEventListener('pagehide',flushOnLeave);
 window.addEventListener('beforeunload',event=>{if(!linked)return;if(signature()!==lastSignature)markDirty();if(changed||flight){flushOnLeave();event.preventDefault();event.returnValue='';}});
 void load();
})();
