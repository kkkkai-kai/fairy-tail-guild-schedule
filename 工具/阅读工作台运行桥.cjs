'use strict';
// Upgrade only the existing transport script in an archived page. Disk/source hashes stay intact.
module.exports=function renderReadingBridge(html,bridge,token){
 const marker='// Connects the reading page to its existing local guild record; never completes tasks or rewards.';
 const start=html.indexOf(marker),end=html.indexOf('</script>',start);
 if(start<0||end<start||html.indexOf(marker,start+marker.length)>=0)throw Error('旧阅读页无法安全升级保存功能；原文件保持不变，请重新生成工作台');
 if(!/^[a-f0-9]{64}$/.test(token))throw Error('工作台运行令牌无效');
 const replacement=bridge.replace('const guildRuntimeToken="__GUILD_WORKBENCH_TOKEN__";','const guildRuntimeToken='+JSON.stringify(token)+';');
 if(replacement===bridge)throw Error('阅读桥缺少运行令牌位置');
 return html.slice(0,start)+replacement+'\n'+html.slice(end);
};
