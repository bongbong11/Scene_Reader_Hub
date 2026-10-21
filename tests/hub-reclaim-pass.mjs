import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),p=require('../server-plugin/storage/paths.cjs');
const tx=require('../server-plugin/storage/transactions.cjs'),chunks=require('../server-plugin/storage/chunks.cjs');
const backups=require('../server-plugin/storage/backups.cjs'),archive=require('../server-plugin/storage/backup-archive.cjs');
const {reclaim}=require('../server-plugin/storage/reclaim.cjs');
const base=await fs.mkdtemp(path.join(tmpdir(),'sr-reclaim-pass-')),now=Date.now()+2*86400000;
const originalReadDir=fs.readdir,originalVerify=archive.verifyStored;
try{
 const seed=path.join(base,'seed');
 await tx.writeDocument(seed,'metadata:migration-v2',{status:'completed',files:[],converted:[]});
 const refs=[];
 for(let i=0;i<180;i++)refs.push(await chunks.encode(seed,{retained:i}));
 await tx.writeDocument(seed,'metadata:live',{storageRefs:refs,marker:'preserved'});
 const backup=await backups.capture(seed);
 const orphans=[];
 for(let i=0;i<1025;i++)orphans.push(await chunks.encode(seed,{unused:i}));
 for(let i=0;i<520;i++)await fs.writeFile(p.location(seed,'operations',p.hash('receipt-'+i)),JSON.stringify({status:'cancelled'}));
 for(let i=0;i<70;i++)await fs.writeFile(p.location(seed,'chunks',p.hash('temp-'+i))+'.00000000-0000-0000-0000-'+String(i).padStart(12,'0')+'.tmp','unused temp');
 const limited=path.join(base,'limited'),drained=path.join(base,'drained');
 await fs.cp(seed,limited,{recursive:true});await fs.cp(seed,drained,{recursive:true});
 async function measure(root,drain){
  const stats={passes:0,chunkListings:0,backupChecks:0,deleted:0,operationFiles:0,temporaryFiles:0,bytes:0};
  fs.readdir=async(file,...args)=>{if(file===path.join(root,'storage-v2','chunks'))stats.chunkListings++;return originalReadDir.call(fs,file,...args);};
  archive.verifyStored=async(...args)=>{stats.backupChecks++;return originalVerify(...args);};
  const started=performance.now();let result;
  try{do{result=await reclaim(root,{now,drain});stats.passes++;for(const key of ['deleted','operationFiles','temporaryFiles','bytes'])stats[key]+=result[key]||0;}while(result.hasMore);}
  finally{fs.readdir=originalReadDir;archive.verifyStored=originalVerify;}
  stats.ms=Math.round(performance.now()-started);return stats;
 }
 const before=await measure(limited,false),after=await measure(drained,true);
 assert.ok(before.passes>=5);assert.equal(after.passes,1);
 assert.equal(after.backupChecks,1);assert.equal(after.chunkListings,2,'one chunk sweep and one temporary-file scan');
 for(const key of ['deleted','operationFiles','temporaryFiles','bytes'])assert.equal(after[key],before[key],key+' must match bounded collection');
 for(const folder of ['chunks','operations']){
  const original=await fs.readdir(path.join(seed,'storage-v2',folder));
  const remainingBefore=new Set(await fs.readdir(path.join(limited,'storage-v2',folder)));
  const remainingAfter=new Set(await fs.readdir(path.join(drained,'storage-v2',folder)));
  assert.deepEqual(original.filter(file=>!remainingAfter.has(file)).sort(),original.filter(file=>!remainingBefore.has(file)).sort(),folder+' deletion identities');
 }
 assert.ok(after.deleted>=1025);assert.ok(after.operationFiles>=520);assert.equal(after.temporaryFiles,70);
 const residue=await reclaim(drained,{now,drain:true});
 for(const key of ['deleted','operationFiles','temporaryFiles'])assert.equal(residue[key],0,'no disposable '+key+' left after the completed pass');
 const live=await tx.readDocuments(drained,['metadata:live']);assert.equal(live.documents['metadata:live'].value.marker,'preserved');
 for(const ref of refs)await chunks.reader(drained).verify(ref);
 await backups.restore(drained,backup);assert.equal((await tx.readDocuments(drained,['metadata:live'])).documents['metadata:live'].value.marker,'preserved');
 // No verified roots survive cancellation. A newly referenced survivor is live
 // on the next invocation, even though it was garbage in the aborted pass.
 const interrupted=path.join(base,'interrupted');await fs.cp(seed,interrupted,{recursive:true});
 const controller=new AbortController();let deleted=0;
 await assert.rejects(reclaim(interrupted,{now,drain:true,signal:controller.signal,onProgress:value=>{deleted=value.deleted;if(deleted>=12)controller.abort();}}),{name:'AbortError'});
 assert.equal(deleted,12);
 const remaining=new Set(await fs.readdir(path.join(interrupted,'storage-v2','chunks')));
 const survivor=orphans.find(ref=>remaining.has(ref+'.json'));assert.ok(survivor);
 await tx.writeDocument(interrupted,'metadata:rescued',{storageRefs:[survivor]});
 await reclaim(interrupted,{now,drain:true});await chunks.reader(interrupted).verify(survivor);
 // Both live corruption and backup corruption still stop before orphan removal.
 const orphan=await chunks.encode(drained,'must survive failed validation');
 const liveRef=(await tx.entry(drained,'metadata:live')).root,file=p.location(drained,'chunks',liveRef),saved=await fs.readFile(file);
 await fs.writeFile(file,'broken');await assert.rejects(reclaim(drained,{now,drain:true}),{code:'STORAGE_CORRUPT'});
 await fs.access(p.location(drained,'chunks',orphan));await fs.writeFile(file,saved);
 const backupFile=archive.filename(drained,backup.id);await fs.writeFile(backupFile,'broken');
 await assert.rejects(reclaim(drained,{now,drain:true}),{code:'STORAGE_CORRUPT'});await fs.access(p.location(drained,'chunks',orphan));
 console.log('Single-pass reclamation:',JSON.stringify({before,after}));
 console.log('Identical deletion set, retained data, backup restore, cancellation/new references and corruption protection passed.');
}finally{fs.readdir=originalReadDir;archive.verifyStored=originalVerify;await fs.rm(base,{recursive:true,force:true});}
