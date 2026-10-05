const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {isBackupPath}=require('../storage.cjs');
const {hash,location,atomic,read,safeDirectory,safeFile}=require('./paths.cjs');
const {reader,encode}=require('./chunks.cjs');
const {snapshot,headFile}=require('./transactions.cjs');
const {failure}=require('./limits.cjs');
const backupLabel=require('./backup-label.cjs');
const backupRef=id=>{if(typeof id!=='string'||!/^\d{4}-\d{2}-\d{2}T[\d-]+Z$/.test(id))throw failure('STORAGE_INVALID_ID','백업을 확인하지 못했습니다.');return hash(id);};
const tree=documents=>({schemaVersion:2,documents,storageRefs:Object.values(documents).map(meta=>meta.root)});
async function legacyFiles(root) {
 const files=[];
 for(const folder of ['', 'chats','characters','history','sessions']) {
  const directory=path.join(root,folder);let entries;try{const stat=await fs.lstat(directory);if(stat.isSymbolicLink())throw failure('STORAGE_INVALID_PATH','안전한 저장 위치가 아닙니다.');entries=await fs.readdir(directory,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')continue;throw error;}
  for(const entry of entries){const relative=(folder?folder+'/':'')+entry.name;if(entry.isFile()&&isBackupPath(relative))files.push(relative);}
 }return files.sort();
}
async function allDocuments(root,state=undefined) {
 state ||=await snapshot(root);const nodes=reader(root),documents={};
 for(const ref of Object.values(state.buckets))Object.assign(documents,await nodes.value(ref));return documents;
}
async function capture(root,reason='manual',source) {
 const documents=await allDocuments(root),files=await legacyFiles(root),nodes=reader(root);
 for(const file of files){const key='legacy:'+file;if(!documents[key])documents[key]={root:await encode(root,await read(path.join(root,file))),revision:0};}
 let parts=new Set();for(const meta of Object.values(documents))await nodes.verify(meta.root,parts);
 const createdAt=new Date().toISOString(),id=createdAt.replaceAll(':','-').replace('.','-').replace('Z','-'+crypto.randomInt(1000000000)+'Z');
 const rootRef=await encode(root,tree(documents)),info={schemaVersion:2,id,createdAt,reason,source:backupLabel.source(source),status:'verified',root:rootRef,fileCount:Object.keys(documents).length,partCount:(await nodes.verify(rootRef)).size};
 await atomic(root,location(root,'backups',hash(id)),JSON.stringify(info));return info;
}
async function get(root,id) {let backup=await read(location(root,'backups',backupRef(id)));if(!backup){const old=await read(path.join(root,'backups',id+'.json'));if(old?.schemaVersion===1){require('../storage.cjs').validateSnapshot(old);const documents={};for(const file of old.files)documents['legacy:'+file.path]={root:await encode(root,JSON.parse(file.text)),revision:0};backup={schemaVersion:2,id,createdAt:old.createdAt,reason:old.reason,source:backupLabel.source(old.source),status:'verified',root:await encode(root,tree(documents)),fileCount:old.files.length};await atomic(root,location(root,'backups',hash(id)),JSON.stringify(backup));}}if(!backup||backup.status!=='verified')throw failure('STORAGE_BACKUP_MISSING','백업을 찾지 못했습니다.');return backup;}
async function list(root) {const directory=path.join(root,'storage-v2','backups');let entries;try{entries=await fs.readdir(directory,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return [];throw error;}const rows=[];for(const entry of entries)if(entry.isFile()&&/^[a-f0-9]{64}\.json$/.test(entry.name)){const backup=await read(path.join(directory,entry.name));if(backup?.status==='verified')rows.push(backup);}return rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
async function fromLegacy(root,old){require('../storage.cjs').validateSnapshot(old);const documents={};for(const file of old.files)documents['legacy:'+file.path]={root:await encode(root,JSON.parse(file.text)),revision:0};return {schemaVersion:2,id:old.id,createdAt:old.createdAt,reason:old.reason,source:backupLabel.source(old.source),status:'verified',root:await encode(root,tree(documents))};}
function clean(value,privatePrompt='') {
 if(value?.format==='legacy-browser'&&typeof value.text==='string'){try{return {...value,text:JSON.stringify(clean(JSON.parse(value.text),privatePrompt))};}catch{return {...value,text:''};}}
 if(Array.isArray(value))return value.map(item=>clean(item,privatePrompt));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['payload','worldPayload','privatePrompt','ownerPrompt','ownerUnlocked','jevKey'].includes(key)).map(([key,item])=>[key,clean(item,privatePrompt)]));
 return typeof value==='string'&&privatePrompt?value.replaceAll(privatePrompt,''):value;
}
async function portable(root,backup) {
 const nodes=reader(root),saved=await nodes.value(backup.root),documents={};
 const settings=saved.documents['legacy:settings.json'];const owner=settings?(await nodes.value(settings.root))?.owner?.prompt||'':'';
 for(const [key,meta]of Object.entries(saved.documents)) {
  if(/^legacy:(?:secrets|reasoner-(?:profiles|secrets))\.json$/.test(key))continue;
  let value=await nodes.value(meta.root);value=clean(value,owner);if(key==='legacy:settings.json')delete value.owner;
  if(value?.hubDocument?.data)value.hubDocument.contentHash=require('./canonical.cjs').digest(value.hubDocument.data);
  documents[key]={...meta,root:await encode(root,value)};
 }
 return {...backup,portable:true,root:await encode(root,tree(documents))};
}
async function *frames(root,backup) {
 const safe=await portable(root,backup),nodes=reader(root),parts=await nodes.verify(safe.root);
 yield JSON.stringify({format:'scene-reader-backup',schemaVersion:2,backup:safe,partCount:parts.size})+'\n';
 for(const ref of parts){const text=await fs.readFile(await safeFile(root,location(root,'chunks',ref)),'utf8');if(hash(text)!==ref)throw failure('STORAGE_CORRUPT','백업 조각 검증에 실패했습니다.');yield JSON.stringify({hash:ref,text})+'\n';}
 yield JSON.stringify({complete:true,partCount:parts.size})+'\n';
}
async function stream(root,id,response) {
 const backup=await get(root,id);response.set('Content-Type','application/x-scene-reader-backup').set('Content-Disposition',`attachment; filename="scene-reader-${id}.srbackup"; filename*=UTF-8''${encodeURIComponent(backupLabel.filename(backup))}`);
 for await(const frame of frames(root,backup)){if(response.destroyed)return;if(!response.write(frame))await new Promise((resolve,reject)=>{const done=()=>{response.off('close',closed);resolve();},closed=()=>{response.off('drain',done);reject(failure('STORAGE_CANCELLED','내려받기가 중단됐습니다.'));};response.once('drain',done);response.once('close',closed);});}response.end();
}
async function restore(root,backup,{preserveCredentials=true,receipt}={}) {
 const nodes=reader(root);await nodes.verify(backup.root);const saved=await nodes.value(backup.root);
 if(saved.schemaVersion!==2||!saved.documents||typeof saved.documents!=='object')throw failure('STORAGE_SCHEMA_UNSUPPORTED','지원하지 않는 백업 형식입니다.');
 const documents=saved.documents;
 for(const [key,meta]of Object.entries(documents)){if(!key.startsWith('scene-reader:shared:v1|')&&!key.startsWith('legacy:')&&!key.startsWith('world:')&&!key.startsWith('metadata:'))throw failure('STORAGE_INVALID_ID','지원하지 않는 백업 항목입니다.');if(key.startsWith('legacy:')&&!isBackupPath(key.slice(7)))throw failure('STORAGE_INVALID_PATH','안전하지 않은 백업 경로입니다.');await nodes.verify(meta.root);}
 const {writer,id}=require('./paths.cjs');return writer(root,async()=>{
  const current=await snapshot(root),existing=await allDocuments(root,current);
  if(preserveCredentials)for(const key of ['legacy:secrets.json','legacy:reasoner-secrets.json']){delete documents[key];if(existing[key])documents[key]=existing[key];else if(await read(path.join(root,key.slice(7))))documents[key]={root:await encode(root,await read(path.join(root,key.slice(7)))),revision:0};}
  if(backup.portable||!documents['metadata:migration-v2'])documents['metadata:migration-v2']={root:await encode(root,{schemaVersion:2,status:'completed',files:[],converted:[],restoredBackup:backup.id}),revision:0};
  const buckets={};for(const [key,meta]of Object.entries(documents)){const prefix=id(key).slice(0,2);(buckets[prefix]||={})[key]={...meta,revision:(existing[key]?.revision||0)+1};}
  const next={schemaVersion:2,revision:current.revision+1,buckets:{},previous:(await read(headFile(root)))?.hash||null,operationId:receipt?.operationId||hash('restore:'+backup.id+':'+current.revision)};
  for(const [prefix,bucket]of Object.entries(buckets))next.buckets[prefix]=await encode(root,bucket);
  const ref=await encode(root,next);if(receipt)await atomic(root,location(root,'operations',receipt.operationId),JSON.stringify({...receipt,status:'committing',backupRoot:backup.root,results:{},resultRevision:next.revision,committedRoot:ref}));await atomic(root,headFile(root),JSON.stringify({schemaVersion:2,hash:ref}));return next;
 });
}
module.exports={legacyFiles,allDocuments,capture,get,list,stream,frames,restore,backupRef,clean,fromLegacy};
