import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,readdir,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {documentKey,envelope} from '../src/storage/shared-document.js';
import {persistCleanChatMetadata} from '../src/storage/chat-cleanup.js';
import {createMaintenanceClient} from '../src/storage/maintenance-client.js';
const require=createRequire(import.meta.url),p=require('../server-plugin/storage/paths.cjs'),tx=require('../server-plugin/storage/transactions.cjs');
const chunks=require('../server-plugin/storage/chunks.cjs'),{reclaim}=require('../server-plugin/storage/reclaim.cjs');
const maintenance=require('../server-plugin/storage/maintenance.cjs'),rooms=require('../server-plugin/storage/room-cleanup.cjs'),backups=require('../server-plugin/storage/backups.cjs');
const base=await mkdtemp(path.join(tmpdir(),'sr-maintenance-')),DAY=86400000,roots=[];
const init=async name=>{const root=path.join(base,name);roots.push(root);await tx.writeDocument(root,'metadata:migration-v2',{status:'completed',files:[],converted:[]});return root;};
const save=(root,kind,id,data)=>tx.writeDocument(root,documentKey(kind,id),envelope(kind,id,data));
const value=async(root,key)=>(await tx.readDocuments(root,[key])).documents[key]?.value;
try{
 const root=await init('stale');
 await tx.writeDocument(root,'metadata:live',{unchanged:true});
 const live=await value(root,'metadata:live');
 for(let i=0;i<4;i++)await tx.begin(root,{operationId:p.hash('superseded-'+i),writes:[{key:'metadata:live',expectedRevision:0}]});
 const orphan=await chunks.encode(root,'obsolete');await writeFile(p.location(root,'chunks',orphan),'broken orphan');
 const invalid=p.location(root,'operations',p.hash('invalid'));await writeFile(invalid,'broken receipt');
 const invalidNull=p.location(root,'operations',p.hash('invalid-null'));await writeFile(invalidNull,'null');
 const cleaned=await reclaim(root,{now:Date.now()+2*DAY});
 assert.equal(cleaned.cancelledOperations,4);assert.ok(cleaned.operationFiles>=5);assert.ok(cleaned.deleted>0);
 assert.deepEqual(await value(root,'metadata:live'),live);
 await assert.rejects(readFile(invalidNull),{code:'ENOENT'});
 await assert.rejects(readFile(p.location(root,'chunks',orphan)),{code:'ENOENT'});
 // Valid unfinished uploads retain chunks, but not unrelated old receipts.
 const pending=p.hash('valid-pending');await tx.begin(root,{operationId:pending,writes:[{key:'metadata:new',expectedRevision:0}]});
 const kept=await chunks.encode(root,'may be reused by pending upload');
 const oldTime=new Date(Date.now()-8*DAY),file=p.location(root,'operations',pending),op=JSON.parse(await readFile(file));
 op.createdAt=oldTime.toISOString();op.updatedAt=oldTime.toISOString();await writeFile(file,JSON.stringify(op));await utimes(file,oldTime,oldTime);
 await tx.touch(root,pending);
 assert.equal((await reclaim(root,{grace:0})).reason,'pending_upload');assert.ok(await readFile(p.location(root,'chunks',kept)));
 // A manual request drains more than one deletion batch and persists its mode.
 const batches=await init('batches');
 await backups.capture(batches);
 const archive=require('../server-plugin/storage/backup-archive.cjs'),verifyStored=archive.verifyStored;let checks=0;
 archive.verifyStored=async(...args)=>{checks++;return verifyStored(...args);};
 for(let i=0;i<530;i++)await chunks.encode(batches,'unreferenced-'+i);
 await maintenance.configure(batches,{mode:'manual',chatKey:'character-avatar:A.png|chat:one'});
 await maintenance.start(batches,{chatKey:'character-avatar:A.png|chat:one'});
 const deadline=Date.now()+60000;let state;
 do{state=await maintenance.inspect(batches);if(!state.requested&&state.status!=='running')break;await new Promise(resolve=>setTimeout(resolve,10));}while(Date.now()<deadline);
 assert.equal(state.status,'completed');assert.ok(state.deleted>=530);assert.equal(state.hasMore,false);
 archive.verifyStored=verifyStored;assert.equal(checks,1,'maintenance drains its queue without verifying the backup again per 256 chunks');
 maintenance.stop(batches);assert.equal((await maintenance.inspect(batches)).mode,'manual');
 // Foreground writes interrupt an in-progress sweep, preserving their value.
 for(let i=0;i<300;i++)await chunks.encode(batches,'interrupt-'+i);
 await maintenance.start(batches,{chatKey:'character-avatar:A.png|chat:one'});
 while(maintenance.status(batches).status!=='running')await new Promise(resolve=>setImmediate(resolve));
 await maintenance.run(batches,()=>tx.writeDocument(batches,'metadata:foreground',{saved:true}));
 assert.deepEqual(await value(batches,'metadata:foreground'),{saved:true});
 assert.equal(maintenance.status(batches).requested,true,'interrupted manual sweep remains queued');
 await maintenance.configure(batches,{mode:'manual'});
 await assert.rejects(maintenance.start(batches,{chatKey:'character-avatar:A.png|chat:unsaved'}),{code:'STORAGE_NOT_READY'});
 // Character cleanup cannot prune another character's unused logical versions.
 const scoped=await init('scope');
 for(const owner of ['A','B']){
  for(const rev of [1,2]){await save(scoped,'asset',owner+rev,{characters:{characters:[{id:owner,rev}]}});await save(scoped,'baseline',owner+':'+rev,{id:owner,ownerRef:owner,revision:rev,assetId:owner+rev});}
  await save(scoped,'baseline_head',owner,{baselineId:owner,revision:2,revisions:[1,2]});
  await save(scoped,'catalog',owner,{ownerRef:owner,rooms:[],stories:[]});
 }
 await reclaim(scoped,{ownerRef:'A',now:Date.now()+2*DAY});
 assert.equal(await tx.entry(scoped,documentKey('asset','A1')),null);
 assert.ok(await tx.entry(scoped,documentKey('asset','B1')));assert.ok(await tx.entry(scoped,documentKey('asset','B2')));
 // Deleting a room preserves a shared story and creates a usable backup first.
 const roomRoot=await init('rooms'),a='character-avatar:A.png|chat:old',b='character-avatar:A.png|chat:new';
 const sk=key=>'legacy:sessions/'+p.hash(key)+'.json',owner=p.hash('character-avatar:A.png');
 await save(roomRoot,'storyline','story',{id:'story',baselineId:'base',baselineRevision:1,checkpoints:{head:{id:'head',state:{kept:true}}},headCheckpointId:'head'});
 await save(roomRoot,'catalog',owner,{ownerRef:owner,rooms:[a,b].map(chatKey=>({chatKey,chatRef:p.hash(chatKey),title:chatKey.split('|chat:')[1],storylineId:'story'})),stories:[{id:'story',baselineId:'base'}]});
 for(const chatKey of [a,b]){const committed=await tx.writeDocument(roomRoot,sk(chatKey),{chat:{sharedLinkV1:{storylineId:'story'},marker:chatKey}});await rooms.rememberCommitted(roomRoot,chatKey,committed);}
 assert.ok(await tx.entry(roomRoot,'metadata:room-label:'+p.hash(a)),'first committed save records the room without reopening it');
 assert.equal((await rooms.inventory(roomRoot,{deletedName:'old'})).rooms[0].chatKey,a);
 const stale=await rooms.preview(roomRoot,{chatKey:a});await tx.writeDocument(roomRoot,'metadata:changed',{value:1});
 await assert.rejects(rooms.remove(roomRoot,{chatKey:a,token:stale.token,confirm:true}),{code:'STORAGE_CONFLICT'});
 const before=await value(roomRoot,sk(b)),preview=await rooms.preview(roomRoot,{chatKey:a});
 const deleted=await rooms.remove(roomRoot,{chatKey:a,token:preview.token,confirm:true,source:{chatKey:a,chatName:'old',characterName:'A'}});
 assert.equal(deleted.sharedStoryPreserved,true);assert.equal(await tx.entry(roomRoot,sk(a)),null);assert.deepEqual(await value(roomRoot,sk(b)),before);
 assert.ok(await tx.entry(roomRoot,documentKey('storyline','story')));
 await backups.restore(roomRoot,await backups.get(roomRoot,deleted.backupId));assert.ok(await tx.entry(roomRoot,sk(a)));
 // Explicit metadata cleanup uses the host API, never changes message fields.
 let saved=0;const ctx={chatId:'one',chatMetadata:{anotherExtension:{log:'keep'}},chat:[{mes:'keep',extra:{error:'also keep'}}],saveMetadata:async()=>{saved++;}};
 const beforeCtx=JSON.stringify(ctx);await persistCleanChatMetadata({getContext:()=>ctx,ready:()=>true,isBusy:()=>false});assert.equal(saved,1);assert.equal(JSON.stringify(ctx),beforeCtx);
 ctx.chatMetadata.sceneReader={legacy:true};await assert.rejects(persistCleanChatMetadata({getContext:()=>ctx,ready:()=>true,isBusy:()=>false}));assert.equal(saved,1);
 // A room change during configuration must eventually send the new identity.
 let key=a,release;const calls=[];const client=createMaintenanceClient({scope:()=>1,chatKey:()=>key,isBusy:()=>false,post:async(route,body)=>{
  if(route==='v2/capabilities')return {features:['scoped-reclaim']};calls.push(body.chatKey);if(calls.length===1)await new Promise(resolve=>{release=resolve;});return {maintenance:{mode:'manual'}};
 }});
 const refreshing=client.refreshContext();while(!release)await new Promise(resolve=>setImmediate(resolve));key=b;release();await refreshing;assert.deepEqual(calls,[a,b]);
 console.log('Storage maintenance: stale uploads, corruption, batch drain, mode persistence, scope, room backup/delete and metadata safety passed.');
}finally{for(const root of roots)maintenance.stop(root);await rm(base,{recursive:true,force:true});}
