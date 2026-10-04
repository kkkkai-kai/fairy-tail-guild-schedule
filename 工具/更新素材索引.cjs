// Rebuild path aliases after adding assets in an existing categorized folder.
// No dependencies; no file moves; no browser or cloud data access.
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),catalogFile=path.join(root,'素材/目录索引.json'),runtimeFile=path.join(root,'代码/guild-assets.js');
const catalog=JSON.parse(fs.readFileSync(catalogFile,'utf8')),files={};
function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){assert(!e.isSymbolicLink(),'Asset links are not supported');const p=path.join(dir,e.name);if(e.isDirectory())scan(p);else if(/\.(png|webp|jpe?g|ico|svg)$/i.test(e.name)){assert(!files[e.name],'Duplicate filename: '+e.name);files[e.name]=path.relative(root,p).split(path.sep).join('/')}}}
scan(path.join(root,'素材'));
for(const [old,rel] of Object.entries(catalog.files)){assert(fs.existsSync(path.join(root,rel)),'Existing asset was removed: '+rel);if(files[old]&&files[old]!==rel)throw Error('Unexpected asset relocation: '+old)}
catalog.files=Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)));
const runtime=fs.readFileSync(runtimeFile,'utf8');assert(runtime.includes('const files=Object.freeze('));const updated=runtime.replace(/const files=Object\.freeze\([^\n]*\);/,'const files=Object.freeze('+JSON.stringify(catalog.files)+');');
fs.writeFileSync(catalogFile,JSON.stringify(catalog,null,2)+'\n');fs.writeFileSync(runtimeFile,updated);console.log('Indexed '+Object.keys(files).length+' assets. No data or images changed.');
