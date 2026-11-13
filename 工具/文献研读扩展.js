'use strict';
let readingServiceReady=false,readingPdfAttachmentReady=false;
function appendReadingLifecycle(card,p){
 const section=el('section',undefined,'receipt');section.append(el('h3','✦ 研读进度与公会回执'));
 const state=GuildReadingCore.view(data.readingCloud,p.id),count=state?.progress?.done?.length||0,total=p.workbench?.panelIds?.length||0;
 section.append(el('p',(p.status==='read'?'已确认研读':p.status==='reading'?'研读中':'尚未确认研读')+(total?' · 子图 '+count+'/'+total:'')+' · '+(data.syncStatus?.message||'目录和笔记同步，PDF留在电脑')));
 if(state?.completion?.takeaway)section.append(el('p','研读收获：'+state.completion.takeaway));
 const row=el('div',undefined,'actions');
 const record=el('button','填写收获 · 确认完成');record.disabled=!readingServiceReady||!p.saved||p.status==='read';record.onclick=()=>{const panel=$('reward-paper').closest('details');panel.open=true;$('reward-paper').value=p.id;renderTrialReceipts();panel.scrollIntoView({block:'nearest'});$('reward-takeaway').focus({preventScroll:true});};
 const meta=el('button','联网补全题录'),metrics=el('button','更新期刊指标');meta.disabled=!readingServiceReady||!p.doi;metrics.disabled=!readingServiceReady;meta.onclick=()=>action(async()=>say((await api('enrich-metadata',{id:p.id})).message));metrics.onclick=()=>action(async()=>say((await api('enrich-metric',{id:p.id})).message));row.append(record,meta,metrics);section.append(row);
 const instruction=el('button',p.titleZh?'复制题录与分区核对指令':'复制中文译名与指标补全指令');
 instruction.onclick=async()=>{const message=['使用 paper-reading-workbench 技能的补全流程，核对这篇文献：',p.title,p.doi||'无DOI：需要先核对原PDF','文献ID：'+p.id,'先补自然准确的中文译名；联网核对JIF指标年度、SCI/JCR各学科分区、中科院大类/小类及新锐分区。保留来源URL、原网页摘录和独立年度。出版社没有提供就标为公开参考；不要用影响因子推算分区。','通过技能 scripts/enrich_guild.cjs 写回同一篇文献，不新建文献或改NPC、已读状态和奖励。'].join('\n');try{await navigator.clipboard.writeText(message);say('补全指令已复制')}catch{const box=el('textarea',undefined,'notes');box.value=message;section.append(box);box.select();}};section.append(instruction);
 if(p.readingCloudDiscardRequestedAt)section.append(el('p','另一设备已略过此篇。确认不需要后，使用本页“删除资料”清理电脑PDF。'));
 for(const conflict of state?.conflicts||[]){const detail=el('details');detail.append(el('summary','不同设备有'+conflict.versions.length+'份'+({notes:'笔记',research:'研究札记',progress:'子图进度'}[conflict.kind]||'记录')+'，请对照'));
  for(const version of conflict.versions){const box=el('div');box.append(el('small',new Date(version.at).toLocaleString('zh-CN')),el('p',version.kind==='notes'?version.payload.text:JSON.stringify(version.payload)));const use=el('button','采用这份 · 保留修订历史');use.onclick=()=>action(async()=>say((await api('reading-resolve',{id:p.id,revisionId:version.id})).message));box.append(use);detail.append(box);}section.append(detail);
 }card.append(section);
}
document.addEventListener('DOMContentLoaded',()=>{
 const button=document.createElement('button');button.textContent='同步研读记录';button.type='button';button.onclick=()=>action(async()=>{say((await api('reading-sync',{})).message)});document.querySelector('header').append(button);
 // Refresh cloud at opening, then obtain state. Do not periodically redraw an active note editor.
 void fetch('/api/workbench-capabilities',{cache:'no-store'}).then(r=>r.json()).then(async cap=>{readingServiceReady=cap.readingVersion>=2;readingPdfAttachmentReady=cap.pdfAttachment===true;button.disabled=!readingServiceReady;if(!readingServiceReady){say('本机文献服务仍运行旧版，请关闭旧服务后重新运行“工具/启动公会文献站.ps1”。公会页面上的同步研读仍可使用。');if(data)renderTrialReceipts();return;}const result=await api('reading-sync',{});say(result.message);if(!busy){await refresh();notify();}}).catch(error=>say(error.message));
});
