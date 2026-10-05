const fs=require('node:fs/promises'),path=require('node:path');
const {read,hash,atomic,writer,safeFile}=require('./paths.cjs');
const {legacyFiles,capture,get}=require('./backups.cjs');
const {encode,reader}=require('./chunks.cjs');
const {entry,writeDocument}=require('./transactions.cjs');
const {failure}=require('./limits.cjs');
 const key='metadata:migration-v2';
async function progress(root){const meta=await entry(root,key);return meta?await reader(root).value(meta.root):{status:(await legacyFiles(root)).some(file=>!file.includes('secrets'))?'eligible':'empty'};}
async function migrate(root,{signal}={}) {
 let journal=await progress(root);if(['completed','cleaned'].includes(journal.status))return journal;
 if(!journal.backupId){const backup=await capture(root,'before_migration');journal={schemaVersion:2,status:'running',backupId:backup.id,files:await legacyFiles(root),converted:[],createdAt:new Date().toISOString()};await writeDocument(root,key,journal);}
 for(const file of journal.files){signal?.throwIfAborted();if(journal.converted.some(item=>item.file===file))continue;if(!require('../storage.cjs').isBackupPath(file))throw failure('STORAGE_INVALID_PATH','이관 원본 경로가 올바르지 않습니다.');const text=await fs.readFile(await safeFile(root,path.join(root,file)),'utf8');let value=JSON.parse(text);if(file==='settings.json'&&Array.isArray(value.worlds))value=await require('./world-library.cjs').project(root,value);if(file.startsWith('characters/'))value=await require('./character-packer.cjs').packStore(root,value);const ref=await encode(root,value);
  const current=await entry(root,'legacy:'+file);if(current){if(current.root!==ref)throw failure('STORAGE_CONFLICT','이관 중 원본이 바뀌었습니다. 원본과 백업은 보존했습니다.',409);}else await writeDocument(root,'legacy:'+file,value,{expectedRevision:0});
  const saved=await entry(root,'legacy:'+file);if(saved.root!==ref)throw failure('STORAGE_CORRUPT','이관 결과를 확인하지 못했습니다.');
  journal.converted.push({file,sourceHash:hash(text),root:ref});await writeDocument(root,key,journal);
 }
 for(const item of journal.converted){const current=await entry(root,'legacy:'+item.file);if(current?.root!==item.root||hash(await fs.readFile(await safeFile(root,path.join(root,item.file)),'utf8'))!==item.sourceHash)throw failure('STORAGE_CONFLICT','이관한 자료가 바뀌었습니다. 완료로 처리하지 않았습니다.',409);await reader(root).verify(item.root);}
 signal?.throwIfAborted();journal.status='completed';journal.completedAt=new Date().toISOString();await writeDocument(root,key,journal);return journal;
}
async function cleanup(root) {
 return writer(root,async()=>{const journal=await progress(root);if(!['completed','cleaned'].includes(journal.status))throw failure('STORAGE_NOT_READY','자료 이관을 먼저 완료하세요.');if(!journal.converted?.length&&!journal.backupId)return {...journal,status:'cleaned'};const backup=await get(root,journal.backupId);await reader(root).verify(backup.root);
  for(const item of journal.converted){if(!require('../storage.cjs').isBackupPath(item.file))throw failure('STORAGE_INVALID_PATH','이전 자료 경로를 확인하지 못했습니다.');if(/(?:^|\/)(?:secrets|reasoner-secrets)\.json$/.test(item.file))continue;
   const stored=await entry(root,'legacy:'+item.file);if(!stored)throw failure('STORAGE_PART_MISSING','옮긴 자료를 확인하지 못했습니다.');await reader(root).verify(stored.root);
   const file=path.join(root,item.file);let text;try{text=await fs.readFile(await safeFile(root,file),'utf8');}catch(error){if(error.code==='ENOENT')continue;throw error;}if(hash(text)!==item.sourceHash)throw failure('STORAGE_CONFLICT','이전 파일이 변경되어 삭제하지 않았습니다.',409);
   await fs.unlink(file);
  }return {...journal,status:'cleaned'};
 });
}
module.exports={progress,migrate,cleanup};
