'use strict';
const path=require('node:path'),fs=require('node:fs'),{fileURLToPath}=require('node:url');
// Never send a percent-encoded file URL to Start-Process as a file path.
module.exports=async function openGuild({url,root,execFile=require('node:child_process').execFile,exists=fs.existsSync}){
 const u=new URL(url),target=fileURLToPath(u);
 const allowed=['index.html','每日日程表.html'].map(name=>path.resolve(root,name));
 if(!allowed.includes(path.resolve(target))||u.search||!exists(target))throw Error('公会入口文件不存在或不匹配，请从原公会目录打开。');
 let executable,args;
 if(u.hash){
  if(!/^#reading-paper=/.test(u.hash))throw Error('公会返回位置无效。');
  executable=[process.env['ProgramFiles(x86)'],process.env.ProgramFiles].filter(Boolean).map(p=>path.join(p,'Microsoft/Edge/Application/msedge.exe')).find(exists);
  if(!executable)throw Error('未找到用于打开研读角的浏览器，请从公会主页面进入。');
  args=[u.href];
 }else{
  executable='powershell.exe';
  const script="$ErrorActionPreference='Stop'; Start-Process -FilePath '"+target.replace(/'/g,"''")+"'";
  args=['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')];
 }
 try{await new Promise((resolve,reject)=>execFile(executable,args,{windowsHide:true,timeout:10000},error=>error?reject(error):resolve()));}
 catch{throw Error('未能打开公会主页面，请从原公会入口打开后重试。本页记录仍保留。');}
};
