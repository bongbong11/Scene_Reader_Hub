import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readdir,readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {envelope,documentKey} from '../src/storage/shared-document.js';
const require=createRequire(import.meta.url);
const tx=require('../server-plugin/storage/transactions.cjs'),chunks=require('../server-plugin/storage/chunks.cjs');
const backups=require('../server-plugin/storage/backups.cjs'),archive=require('../server-plugin/storage/backup-archive.cjs');
const {reclaim}=require('../server-plugin/storage/reclaim.cjs'),p=require('../server-plugin/storage/paths.cjs');
const base=await mkdtemp(path.join(tmpdir(),'sr-reclaim-'));
try {
 const root=path.join(base,'main'),key='legacy:sessions/'+p.hash('synthetic-room')+'.json';
 await tx.writeDocument(root,'metadata:migration-v2',{status:'completed',files:[],converted:[]});
 await tx.writeDocument(root,key,{chat:{marker:'backup-only'},history:[]});
 const oldRoot=(await tx.entry(root,key)).root;
 const backup=await backups.capture(root);
 assert.ok(backup.archive?.bytes>0);await archive.inspect(root,backup);
 for(let n=0;n<18;n++)await tx.writeDocument(root,key,{chat:{marker:'current-'+n},history:[n]});
 const current=(await tx.readDocuments(root,[key])).documents[key].value;
 const countBefore=(await readdir(path.join(root,'storage-v2','chunks'))).length;
 const cleaned=await reclaim(root,{now:Date.now()+2*86400000});
 assert.equal(cleaned.status,'completed');assert.ok(cleaned.deleted>0);
 assert.deepEqual((await tx.readDocuments(root,[key])).documents[key].value,current);
 assert.ok((await readdir(path.join(root,'storage-v2','chunks'))).length<countBefore);
 await assert.rejects(readFile(p.location(root,'chunks',oldRoot)),{code:'ENOENT'},'backup-only chunks are released from the active store');
 await backups.restore(root,backup);
 assert.equal((await tx.readDocuments(root,[key])).documents[key].value.chat.marker,'backup-only','independent archive restores without its old live chunks');
 const archivePath=archive.filename(root,backup.id);
 const beforeDelete=(await tx.readDocuments(root,[key])).documents[key].value;
 await backups.remove(root,backup.id);
 await assert.rejects(stat(archivePath),{code:'ENOENT'});
 assert.deepEqual((await tx.readDocuments(root,[key])).documents[key].value,beforeDelete,'deleting backup does not delete live data');
 // Interrupted conversion keeps the reference backup and every source chunk.
 const old=await backups.capture(root),oldIndex=p.location(root,'backups',p.hash(old.id));
 await archive.remove(root,old.id);delete old.archive;await writeFile(oldIndex,JSON.stringify(old));
 const ctrl=new AbortController();ctrl.abort();
 await assert.rejects(backups.makeIndependent(root,old,{signal:ctrl.signal}),{name:'AbortError'});
 assert.equal(JSON.parse(await readFile(oldIndex)).archive,undefined);
 await chunks.reader(root).verify(old.root);
 await reclaim(root,{now:Date.now()+2*86400000});
 const converted=JSON.parse(await readFile(oldIndex));assert.ok(converted.archive);
 await archive.inspect(root,converted);
 const archiveFile=archive.filename(root,converted.id),validArchive=await readFile(archiveFile);
 await writeFile(archiveFile,'corrupt archive');
 const priorRestore=await tx.snapshot(root);
 await assert.rejects(backups.restore(root,converted),{code:'STORAGE_CORRUPT'});
 assert.deepEqual(await tx.snapshot(root),priorRestore,'corrupt archive must not change live index');
 await assert.rejects(reclaim(root,{now:Date.now()+2*86400000}),{code:'STORAGE_CORRUPT'});
 await writeFile(archiveFile,validArchive);
 // Corrupt current data makes collection fail closed before deleting garbage.
 const orphan=await chunks.encode(root,'unreferenced but protected on failed validation');
 const meta=await tx.entry(root,key),activeFile=p.location(root,'chunks',meta.root),valid=await readFile(activeFile);
 await writeFile(activeFile,'broken');
 await assert.rejects(reclaim(root,{now:Date.now()+2*86400000}));
 assert.ok(await stat(p.location(root,'chunks',orphan)));
 await writeFile(activeFile,valid);
 // Pending multipart writes prevent reclamation.
 await tx.begin(root,{operationId:p.hash('pending'),writes:[{key:'legacy:settings.json',expectedRevision:0}]});
 assert.equal((await reclaim(root)).reason,'pending_upload');
 const graph=path.join(base,'graph');
 await tx.writeDocument(graph,'metadata:migration-v2',{status:'completed',files:[],converted:[]});
 const save=async(kind,id,data)=>tx.writeDocument(graph,documentKey(kind,id),envelope(kind,id,data));
 for(let version=0;version<=3;version++){
  await save('asset','asset-'+version,{characters:{characters:[{id:'actor',version}]}});
  await save('baseline','base:'+version,{id:'base',revision:version,assetId:'asset-'+version,defaultPreferences:{}});
 }
 await save('baseline_head','base',{baselineId:'base',revision:3,revisions:[0,1,2,3]});
 await save('storyline','one',{id:'one',baselineId:'base',baselineRevision:1,checkpoints:{head:{id:'head',state:{}}},headCheckpointId:'head'});
 await save('storyline','two',{id:'two',baselineId:'base',baselineRevision:2,checkpoints:{head:{id:'head',state:{}}},headCheckpointId:'head'});
 await save('catalog','owner',{ownerRef:'owner',stories:[{id:'one',baselineId:'base'},{id:'two',baselineId:'base'}],rooms:[]});
 await save('story_history','one:obsolete',{id:'obsolete',state:{old:true}});
 await save('story_history','one:head',{id:'head',state:{}});
 await tx.writeDocument(graph,'world:version:old',{id:'custom-one',prompt:'old'});
 await tx.writeDocument(graph,'world:version:current',{id:'custom-one',prompt:'current'});
 await tx.writeDocument(graph,'world:catalog',{schemaVersion:2,items:{'custom-one':{id:'custom-one',activeVersion:'world:version:current',versions:['world:version:old','world:version:current']}}});
 await reclaim(graph,{now:Date.now()+2*86400000});
 for(const version of [1,2,3])assert.ok(await tx.entry(graph,documentKey('asset','asset-'+version)),'another story or current default keeps its asset');
 assert.equal(await tx.entry(graph,documentKey('asset','asset-0')),null);
 assert.equal(await tx.entry(graph,documentKey('story_history','one:obsolete')),null);
 assert.ok(await tx.entry(graph,documentKey('story_history','one:head')));
 assert.equal(await tx.entry(graph,'world:version:old'),null);
 assert.ok(await tx.entry(graph,'world:version:current'));
 const head=(await tx.readDocuments(graph,[documentKey('baseline_head','base')])).documents[documentKey('baseline_head','base')].value;
 assert.deepEqual(head.hubDocument.data.revisions,[1,2,3]);
 // Recover a lost commit receipt before detaching the old head chain.
 const receipt=await tx.writeDocument(graph,'metadata:receipt',{kept:true});
 await p.atomic(graph,p.location(graph,'operations',receipt.operationId),JSON.stringify({...receipt,status:'committing'}));
 await reclaim(graph);
 assert.equal((await tx.status(graph,receipt.operationId))?.status,'committed');
 // v1 backup conversion publishes a verified archive before deleting its duplicate.
 const legacyId='2026-01-01T00-00-00-000-123Z',legacyFolder=path.join(graph,'backups');
 await mkdir(legacyFolder,{recursive:true});
 await writeFile(path.join(legacyFolder,legacyId+'.json'),JSON.stringify({schemaVersion:1,id:legacyId,createdAt:'2026-01-01T00:00:00Z',files:[{path:'settings.json',text:JSON.stringify({global:{preserved:true}})}]}));
 await backups.convertLegacy(graph);
 await assert.rejects(stat(path.join(legacyFolder,legacyId+'.json')),{code:'ENOENT'});
 const legacyBackup=await backups.get(graph,legacyId);await archive.inspect(graph,legacyBackup);
 const downloaded=[];for await(const frame of backups.frames(graph,legacyBackup))downloaded.push(JSON.parse(frame));
 assert.equal(downloaded[0].backup.archive,undefined,'portable downloads never depend on a server archive path');
 assert.equal(downloaded.at(-1).complete,true);
 // A new backup must not revive a deleted room from unmigrated rollback copies.
 await mkdir(path.join(graph,'sessions'),{recursive:true});
 await writeFile(path.join(graph,'sessions',p.hash('deleted-room')+'.json'),JSON.stringify({chat:{obsolete:true}}));
 const fresh=await backups.capture(graph),snap=await chunks.reader(graph).value(fresh.root);
 assert.equal(snap.documents['legacy:sessions/'+p.hash('deleted-room')+'.json'],undefined);
 const obsoletePath='sessions/'+p.hash('deleted-room')+'.json',obsoleteText=await readFile(path.join(graph,obsoletePath),'utf8');
 await tx.writeDocument(graph,'metadata:migration-v2',{status:'completed',backupId:'2026-01-01T00-00-00-000-999Z',files:[obsoletePath],converted:[{file:obsoletePath,sourceHash:p.hash(obsoleteText)}]});
 const cleanedLegacy=await require('../server-plugin/storage/migration.cjs').cleanup(graph);
 assert.equal(cleanedLegacy.status,'cleaned');
 await assert.rejects(stat(path.join(graph,obsoletePath)),{code:'ENOENT'},'deleted rooms do not leave undeletable pre-migration files');
 assert.ok((await backups.list(graph)).some(item=>item.reason==='before_cleanup'),'deleted migration backup is replaced before removing originals');
 const maintenance=require('../server-plugin/storage/maintenance.cjs'),collector=require('../server-plugin/storage/reclaim.cjs');
 const realTimer=globalThis.setTimeout,realReclaim=collector.reclaim;
 let scheduled,entered,aborted=false;
 const started=new Promise(resolve=>entered=resolve);
 try{
  globalThis.setTimeout=(callback,delay)=>{assert.ok(delay>=45000);scheduled=callback;return {unref(){}};};
  collector.reclaim=async(_root,{signal})=>{entered();await new Promise(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve();},{once:true}));};
  maintenance.schedule(graph);globalThis.setTimeout=realTimer;scheduled();await started;
  await maintenance.run(graph,async()=>assert.equal(aborted,true,'foreground storage cancels and joins idle cleanup before reading or writing'));
 }finally{globalThis.setTimeout=realTimer;collector.reclaim=realReclaim;maintenance.stop(graph);}
 const interrupted=new AbortController(),reader=chunks.reader(graph,{signal:interrupted.signal});interrupted.abort();
 await assert.rejects(reader.value(fresh.root),{name:'AbortError'});
 console.log('Storage reclamation: independent archive, restore after chunk removal, live-data preservation, backup deletion, interrupted conversion, corruption and pending upload guards passed.');
} finally {await rm(base,{recursive:true,force:true});}
