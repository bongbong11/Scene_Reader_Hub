const fs=require('node:fs/promises'),path=require('node:path');
const {safeDirectory,safeFile,read}=require('./paths.cjs');
// Explicit maintenance only. Current documents, chunks, backups and resumable
// uploads are never deleted by this bounded staging cleanup.
async function cleanup(root,{now=Date.now(),active=new Set()}={}){
 const directory=path.join(root,'storage-v2','operations');await safeDirectory(root,directory);let deleted=0,examined=0;
 const rows=await fs.readdir(directory,{withFileTypes:true});
 for(const row of rows){if(deleted>=64)break;if(!row.isFile()||!/^[a-f0-9]{64}\.json$/.test(row.name)||active.has(row.name.slice(0,64)))continue;examined++;
  const file=await safeFile(root,path.join(directory,row.name)),job=await read(file);if(now-Date.parse(job?.createdAt)<7*86400000||!Number.isFinite(Date.parse(job?.createdAt)))continue;
  if(job.status!=='cancelled'&&job.kind!=='character_export')continue;
  for(const target of [file+'.upload',file]){try{await fs.unlink(await safeFile(root,target));}catch(error){if(error.code!=='ENOENT')throw error;}}deleted++;
 }
 return {deleted,examined};
}
module.exports={cleanup};
