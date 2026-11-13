'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function writeShortcut({pdfPath,paperId,sourceSha256,base='http://127.0.0.1:18765'}){
 if(!pdfPath||!paperId||!/^[a-f0-9]{64}$/.test(sourceSha256||''))throw Error('需要已登记的PDF、文献ID和源指纹');
 const origin=new URL(base);if(origin.protocol!=='http:'||origin.hostname!=='127.0.0.1')throw Error('快捷方式仅指向本机');
 const pdf=path.resolve(pdfPath),stat=await fs.lstat(pdf);if(stat.isSymbolicLink()||!stat.isFile()||path.extname(pdf).toLowerCase()!=='.pdf')throw Error('源文件必须是普通PDF');
 const data=await fs.readFile(pdf);if(crypto.createHash('sha256').update(data).digest('hex')!==sourceSha256)throw Error('原PDF指纹变化，未创建快捷方式');
 const target=pdf.slice(0,-4)+'.阅读工作台.url',url=new URL('/workbench',origin);url.searchParams.set('id',paperId);
 const content='[InternetShortcut]\r\nURL='+url.href+'\r\n';
 try{const previous=await fs.lstat(target);if(previous.isSymbolicLink()||!previous.isFile())throw Error('快捷方式位置已有非普通文件');const old=await fs.readFile(target,'utf8'),match=/^URL=(.+)$/m.exec(old.replace(/\r/g,''));if(match?.[1]!==url.href)throw Error('已有快捷方式指向不同地址，未覆盖');if(old.charCodeAt(0)===0xFEFF){await fs.writeFile(target,content,{encoding:'ascii'});return{ok:true,created:false,repairedEncoding:true,path:target,url:url.href}}return{ok:true,created:false,path:target,url:url.href}}catch(error){if(error.code!=='ENOENT')throw error}
 await fs.writeFile(target,content,{encoding:'ascii',flag:'wx'});return{ok:true,created:true,path:target,url:url.href};
}
module.exports={writeShortcut};
if(require.main===module)(async()=>{const library=path.resolve(process.argv[2]||path.join(require('node:os').homedir(),'Desktop','RNA自噬文献','_管理','文献记录.json')),data=JSON.parse(await fs.readFile(library,'utf8')),results=[];for(const p of data.papers.filter(p=>p.workbench&&!p.discardedAt)){const html=await fs.readFile(p.workbench.htmlPath);if(crypto.createHash('sha256').update(html).digest('hex')!==p.workbench.htmlSha256)throw Error('工作台归档指纹变化，未补建入口');results.push(await writeShortcut({pdfPath:p.pdf.path,paperId:p.id,sourceSha256:p.workbench.sourceSha256}))}console.log(JSON.stringify(results))})().catch(e=>{console.error(e.message);process.exitCode=1});
