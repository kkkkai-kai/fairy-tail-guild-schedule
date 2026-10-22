/* One journal entry point, shared by calendar, farewell and weekly review. */
(function(){
 'use strict';
 const core=globalThis.GuildJournalCore,DRAFTS='fairytail-guild-journal-drafts-v2';
 let dialog,date,departure=false,mode='entries',dirty=false,timer,baseRevision=null,resolveParents=null;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n};
 const button=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b};
 const json=key=>{try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return{}}};
 const store=()=>core.normalize(json(core.KEY));
 const todayDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const groups=[['data','数据与整理',[['handled','处理的内容'],['output','产出与文件位置'],['check','待核对事项'],['next','下一步']]],['reading','学习与文献',[['read','阅读或学习的内容'],['takeaway','我的收获'],['question','留下的问题'],['next','下一步']]],['communication','沟通与事务',[['handled','处理的事情'],['confirmed','已确认'],['waiting','仍在等待'],['next','后续跟进']]],['life','生活与休息',[['care','如何照顾自己'],['bright','一件小开心'],['tomorrow','留给明天的话']]]];
 function status(text){dialog.querySelector('[data-journal-status]').textContent=text}
 function field(parent,label,value,key){const l=el('label',label),t=el('textarea');t.rows=2;t.value=value||'';t.dataset.field=key;l.append(t);parent.append(l);return t}
 function changed(){document.dispatchEvent(new CustomEvent('guild-journal-changed'))}
 function facts(){try{return completionRecords()}catch{return[]}}
 function collect(){
  if(mode==='reports')return{date:core.week(date),text:dialog.querySelector('[data-report-text]').value,sources:dialog._sources||[],status:'saved'};
  const entry={date,templates:{},experiments:[],freeText:dialog.querySelector('[data-journal-free]').value,continuity:{},status:'saved'};
  dialog.querySelectorAll('[data-group]').forEach(g=>{const values={};g.querySelectorAll('[data-field]').forEach(t=>values[t.dataset.field]=t.value);entry.templates[g.dataset.group]=values});
  dialog.querySelectorAll('[data-experiment]').forEach(g=>{const values={id:g.dataset.experiment};g.querySelectorAll('[data-field]').forEach(t=>values[t.dataset.field]=t.value);entry.experiments.push(values)});
  dialog.querySelectorAll('[data-continuity] textarea').forEach(t=>entry.continuity[t.dataset.field]=t.value);return entry;
 }
 function draft(){
  clearTimeout(timer);if(!dirty||!dialog?.open)return true;
  try{const all=json(DRAFTS);all[mode+':'+date]={record:collect(),baseRevision,updatedAt:new Date().toISOString()};localStorage.setItem(DRAFTS,JSON.stringify(all));dirty=false;status('草稿已留在本设备；保存手记后参与云端同步。');return true}catch{status('暂存失败，请保留此窗口并复制内容。');return false}
 }
 function clearDraft(){const all=json(DRAFTS);delete all[mode+':'+date];localStorage.setItem(DRAFTS,JSON.stringify(all))}
 function save(){
  const record=collect();if(mode==='entries'&&!core.hasContent(record)||mode==='reports'&&!record.text.trim()){status('请先填写内容，或暂存后继续。');return false}
  try{const latest=store(),key=mode==='reports'?core.week(date):date;record.savedAt=new Date().toISOString();const next=core.put(latest,mode,key,record,{parents:resolveParents||(baseRevision?[baseRevision]:[])});localStorage.setItem(core.KEY,JSON.stringify(next));baseRevision=next[mode][key].revisionId;dirty=false;try{clearDraft()}catch{}changed();status('已保存到本机，云端状态请看页面同步提示。');return true}catch{status('保存失败，内容仍在窗口内。');return false}
 }
 function close(){if(draft())dialog.close()}
 function experiment(parent,record={}){
  const box=el('fieldset');box.dataset.experiment=record.id||crypto.randomUUID();const legend=el('legend','实验记录');
  const remove=button('移除此条',()=>{box.remove();dirty=true;draft()});legend.append(remove);box.append(legend);const fields=el('div',null,'gdj-fields');
  for(const [key,label]of [['name','实验/记录名称'],['done','今天实际做了什么'],['progress','目前进展'],['observation','观察或遇到的问题'],['location','原始记录/文件位置'],['next','下次先做什么']])field(fields,label,record[key],key);
  box.append(fields);parent.append(box);
 }
 function load(){
  const body=dialog.querySelector('.gdj-body');body.replaceChildren();resolveParents=null;const key=mode==='reports'?core.week(date):date,s=store(),saved=s[mode][key],d=json(DRAFTS)[mode+':'+date];baseRevision=d?d.baseRevision:saved?.revisionId||null;
  const entry=d?.record||saved||{};const bar=el('div',null,'gdj-toolbar'),input=el('input');input.type='date';input.max=todayDate();input.value=date;input.setAttribute('aria-label','记录日期');input.onchange=()=>{if(!core.validDate(input.value)||input.value>todayDate()){input.value=date;return}if(!draft()){input.value=date;return}date=input.value;load()};
  bar.append(input,button(mode==='entries'?'查看本周研究周报':'返回当日手记',()=>{if(!draft())return;mode=mode==='entries'?'reports':'entries';load()}));body.append(bar);
  const privacy=el('details');privacy.className='gdj-privacy';privacy.append(el('summary','保存与隐私'),el('p','自动暂存的草稿只在本设备。主动保存的手记参与现有公会云同步，内容会进入你配置的云端存储；不同设备的同日修改保留版本和冲突副本。云端确认不代表另一台设备已经读取。'));body.append(privacy);
  if(saved?.conflicts?.length){const conflict=el('details');conflict.append(el('summary','另有 '+saved.conflicts.length+' 份同日修改，副本均已保留'));for(const id of [saved.revisionId,...saved.conflicts]){const r=s.revisions[id],pre=el('pre',JSON.stringify(r,null,2));conflict.append(el('strong',r.updatedAt),pre)}conflict.append(button('已对照以上副本，以当前编辑内容合并保存',()=>{resolveParents=[saved.revisionId,...saved.conflicts];if(save())load()}));body.append(conflict)}
  if(mode==='reports'){
   body.append(el('p','根据本周已保存手记和真实完成账本整理；结果与结论由你核对补充。'));
   const generated=core.report(s,date,facts());dialog._sources=entry.sources||generated.sources;const area=el('textarea');area.dataset.reportText='';area.rows=20;area.value=entry.text||generated.text;body.append(area);
   body.append(button('用最新记录重新整理（替换当前文字）',()=>{const box=el('div','重新整理会替换编辑区文字，已保存的历史版本仍保留。');box.append(button('确认重新整理',()=>{const g=core.report(store(),date,facts());area.value=g.text;dialog._sources=g.sources;dirty=true;box.remove()}),button('取消',()=>box.remove()));body.append(box)}));
   const refs=el('details');refs.append(el('summary','来源记录'));for(const source of dialog._sources){if(source.id.startsWith('journal:'))refs.append(button(source.date+' 手记',()=>{if(!draft())return;date=source.date;mode='entries';load()}));else refs.append(el('p',source.date+' · '+(source.title||source.id)))}body.append(refs);
  }else{
   const factual=el('details');factual.append(el('summary','今天实际完成的事项'));const rows=facts().filter(f=>f.day===date);for(const f of rows)factual.append(el('p',f.title));if(!rows.length)factual.append(el('p','这一天没有账本完成记录。'));body.append(factual);
   const experiments=el('div');experiments.dataset.experiments='';body.append(experiments);const records=entry.experiments|| (entry.templates?.experiment?[{...entry.templates.experiment,id:'legacy-experiment'}]:[]);records.forEach(r=>experiment(experiments,r));body.append(button('＋ 记一条实验',()=>{experiment(experiments);dirty=true}));
   for(const [id,title,fields]of groups){const g=el('details');g.dataset.group=id;g.append(el('summary',title));const grid=el('div',null,'gdj-fields');fields.forEach(([key,label])=>field(grid,label,entry.templates?.[id]?.[key],key));g.append(grid);g.open=Object.values(entry.templates?.[id]||{}).some(Boolean);body.append(g)}
   const next=el('fieldset');next.dataset.continuity='';next.append(el('legend','留给明天'));field(next,'卡在哪里 / 等待什么',entry.continuity?.blocker,'blocker');field(next,'明天最先做的一步',entry.continuity?.next,'next');body.append(next);
   field(body,'其他记录',entry.freeText,'freeText').dataset.journalFree='';
  }
  const note=el('p',d?'已恢复本设备草稿。':saved?'已有记录，可以继续补充。':'内容由你填写；不会自动完成任务或发放奖励。');note.dataset.journalStatus='';note.setAttribute('role','status');body.append(note);
  const footer=dialog.querySelector('footer');footer.replaceChildren();if(departure&&date===todayDate()&&mode==='entries')footer.append(button('先不写，直接散场',()=>{if(!draft())return;dialog.close();beginGuildHallFarewell()}));footer.append(button('暂存并关闭',close),button(departure&&date===todayDate()&&mode==='entries'?'保存并散场':'保存记录',()=>{if(!save())return;if(departure&&date===todayDate()&&mode==='entries'){dialog.close();beginGuildHallFarewell()}else load()}));dirty=false;
 }
 function open(options={}){
  if(dialog?.open){if(!draft())return;dialog.close()}
  if(!dialog){dialog=el('dialog',null,'guild-daily-journal');dialog.id='guildDailyJournalDialog';dialog.setAttribute('aria-label','公会收工手记与研究周报');const header=el('header');header.append(el('strong','公会手记 · 研究记录'),button('×',close));dialog.append(header,el('div',null,'gdj-body'),el('footer'));document.body.append(dialog);dialog.addEventListener('cancel',e=>{e.preventDefault();close()});dialog.addEventListener('click',e=>{if(e.target===dialog)close()});dialog.addEventListener('input',e=>{if(e.target.type==='date')return;dirty=true;clearTimeout(timer);timer=setTimeout(draft,650)});dialog.addEventListener('close',()=>clearTimeout(timer))}
  date=core.validDate(options.date)?options.date:todayDate();if(date>todayDate())date=todayDate();mode=options.report?'reports':'entries';departure=!!options.departure;load();dialog.showModal();
 }
 function renderCarryover(host){host.querySelector('[data-journal-carryover]')?.remove();const rows=core.carryover(store(),todayDate());if(!rows.length)return;const wrap=el('details');wrap.dataset.journalCarryover='';wrap.append(el('summary','昨日留下的下一步 · '+rows.length+' 项'));for(const row of rows){const line=el('div',row.text);line.append(button('带入登记草稿',()=>stageNextStepDraft({category:row.category,outcome:{nextStep:row.text}})));wrap.append(line)}host.append(wrap)}
 let noticeTimer;
 function notice(text,undo){let n=document.getElementById('guildActionReceipt');if(!n){n=el('aside');n.id='guildActionReceipt';n.setAttribute('role','status');document.body.append(n)}clearTimeout(noticeTimer);n.replaceChildren(el('span',text));n.hidden=false;if(undo)n.append(button('撤销',()=>{const result=undo();n.replaceChildren(el('span',result===false?'内容已再次修改，未覆盖新的操作。':'已撤销'));noticeTimer=setTimeout(()=>n.hidden=true,2500)}));noticeTimer=setTimeout(()=>n.hidden=true,8000)}
 window.GuildJournal={open,store,renderCarryover,notice};
 window.addEventListener('storage',e=>{if(e.key===core.KEY)changed()});
 document.addEventListener('guild-journal-changed',()=>{if(dialog?.open)status('记录有更新。当前编辑内容已保留，保存时会保留其他设备的修改副本。');const host=document.querySelector('#todayExpedition .today-expedition-list');if(host)renderCarryover(host)});
})();
