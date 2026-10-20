import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {envelope,documentKey,ownerRef} from '../src/storage/shared-document.js';
import {normalizeCharacterStore} from '../src/character/store.js';
const require=createRequire(import.meta.url),root=await mkdtemp(path.join(tmpdir(),'sr-room-restore-'));
const tx=require('../server-plugin/storage/transactions.cjs'),b=require('../server-plugin/storage/backups.cjs'),p=require('../server-plugin/storage/paths.cjs'),restore=require('../server-plugin/storage/room-restore.cjs');
const sourceKey='character-avatar:Synthetic.png|chat:original',targetKey='character-avatar:Synthetic.png|chat:imported';
const sk=key=>'legacy:sessions/'+p.hash(key)+'.json',ck=key=>'legacy:characters/'+p.hash(key)+'.json';
try {
 await tx.writeDocument(root,'metadata:migration-v2',{status:'completed',files:[],converted:[]});
 const original={preferences:{developmentStyle:'dynamic'},relationshipState:{trust:'earned'},lastJudgment:{payload:'stale'},pendingPlan:{outputText:'stale'}};
 await tx.writeDocument(root,sk(sourceKey),{chat:original,history:[{old:true}]});
 await tx.writeDocument(root,ck(sourceKey),{characters:[{id:'actor',name:'Synthetic'}]});
 const backup=await b.capture(root,'manual',{characterName:'Synthetic',chatName:'original',chatKey:sourceKey});
 await tx.writeDocument(root,sk(sourceKey),{chat:{preserved:'other-room'},history:[]});
 await tx.writeDocument(root,sk(targetKey),{chat:{before:true},history:[]});
 const rooms=await restore.inventory(root,{id:backup.id,targetChatKey:targetKey});
 assert.equal(rooms.rooms.find(row=>row.ref===p.hash(sourceKey)).sameOwner,true);
 assert.equal(rooms.preferredRef,p.hash(sourceKey),'backup source, not hash iteration order, selects the initial room');
 assert.deepEqual(rooms.rooms.find(row=>row.ref===p.hash(sourceKey)).characterNames,['Synthetic']);
 const request={id:backup.id,sourceRef:p.hash(sourceKey),targetChatKey:targetKey,operationId:p.hash('room-recovery')};
 await restore.restore(root,request);
 const recovered=(await tx.readDocuments(root,[sk(targetKey)])).documents[sk(targetKey)].value;
 assert.equal(recovered.chat.relationshipState.trust,'earned');
 assert.equal(recovered.chat.lastJudgment,null);assert.equal(recovered.chat.pendingPlan,null);assert.deepEqual(recovered.history,[]);
 assert.equal((await tx.readDocuments(root,[sk(sourceKey)])).documents[sk(sourceKey)].value.chat.preserved,'other-room');
 const backupsBefore=(await b.list(root)).length;
 assert.equal((await restore.restore(root,request)).reused,true);assert.equal((await b.list(root)).length,backupsBefore);
 await assert.rejects(restore.restore(root,{...request,targetChatKey:'character-avatar:Other.png|chat:new',operationId:p.hash('cross-owner')}),{code:'RESTORE_OWNER_CONFIRMATION'});
 await restore.restore(root,{...request,targetChatKey:'character-avatar:Other.png|chat:new',operationId:p.hash('cross-owner-confirmed'),confirmOwner:true});
 // Shared story pointers are materialized into a room-local record, not copied.
 const storyId='synthetic-story',baselineId='synthetic-base',assetId='synthetic-asset',checkpointId='synthetic-checkpoint';
 await tx.writeDocument(root,documentKey('asset',assetId),envelope('asset',assetId,{characters:{characters:[{id:'shared-actor'}]}}));
 await tx.writeDocument(root,documentKey('baseline',baselineId+':1'),envelope('baseline',baselineId+':1',{id:baselineId,revision:1,ownerRef:ownerRef(sourceKey),assetId,defaultPreferences:{developmentStyle:'static'}}));
 await tx.writeDocument(root,documentKey('storyline',storyId),envelope('storyline',storyId,{id:storyId,baselineId,baselineRevision:1,activeChatRef:p.hash(sourceKey),epoch:1,headCheckpointId:checkpointId,checkpoints:{[checkpointId]:{id:checkpointId,state:{relationshipState:{trust:'shared'},inheritedCharacterStates:[{id:'shared-actor',fear:10}],continuationContext:{date:'synthetic-date'},companionStores:{knowledgeVaultV1:{cards:[{id:'secret',acquisitions:[{sourceIdentity:{messageIndex:3}}]}]}}}}}}));
 await tx.writeDocument(root,sk(sourceKey),{chat:{sharedLinkV1:{storylineId:storyId,baselineId,baselineRevision:1,checkpointId,chatRef:p.hash(sourceKey),ownerRef:ownerRef(sourceKey),epoch:1},runtime:{preferences:{developmentStyle:'dynamic'}},overlay:{}},history:[]});
 const shared=await b.capture(root,'manual',{characterName:'Synthetic',chatName:'original',chatKey:sourceKey});
 await restore.restore(root,{...request,id:shared.id,operationId:p.hash('shared-recovery')});
 const live=(await tx.readDocuments(root,[sk(targetKey)])).documents[sk(targetKey)].value.chat;
 assert.equal(live.sharedLinkV1,undefined);assert.equal(live.relationshipState.trust,'shared');
 assert.equal(live.preferences.developmentStyle,'dynamic');
 assert.equal(live.legacyCarryReferenceV1.scene.date,'synthetic-date');
 assert.equal(live.companionStores.knowledgeVaultV1.cards[0].acquisitions[0].sourceIdentity.originChatRef,p.hash(sourceKey));
 assert.equal((await tx.readDocuments(root,[ck(targetKey)])).documents[ck(targetKey)].value.characters[0].id,'shared-actor');
 const deletion=require('../server-plugin/storage/story-delete.cjs');
 await tx.writeDocument(root,documentKey('catalog',ownerRef(sourceKey)),envelope('catalog',ownerRef(sourceKey),{ownerRef:ownerRef(sourceKey),stories:[{id:storyId,title:'Synthetic story',baselineId}],rooms:[{chatRef:p.hash(sourceKey),chatKey:sourceKey,storylineId:storyId,title:'original'}]}));
 const preview=await deletion.preview(root,{storylineId:storyId,chatKey:sourceKey});
 assert.equal(preview.rooms.length,1);
 await assert.rejects(deletion.remove(root,{storylineId:storyId,chatKey:sourceKey,token:preview.token}),{code:'STORAGE_CONFIRM_REQUIRED'});
 const removed=await deletion.remove(root,{storylineId:storyId,chatKey:sourceKey,token:preview.token,confirm:true});
 assert.ok(removed.backupId);
 assert.equal(await tx.entry(root,sk(sourceKey)),null);
 assert.ok(await tx.entry(root,sk(targetKey)),'a recovered independent room is not removed with the old story');
 await b.restore(root,await b.get(root,removed.backupId));
 assert.ok(await tx.entry(root,sk(sourceKey)),'pre-deletion backup restores the removed story');
 // Read/merge/CAS use one current snapshot; concurrent settings edits survive.
 await tx.writeDocument(root,'world:version:source',{id:'custom-source',name:'Saved world',prompt:'Saved rules'});
 await tx.writeDocument(root,'world:catalog',{schemaVersion:2,items:{'custom-source':{id:'custom-source',activeVersion:'world:version:source',versions:['world:version:source']}}});
 await tx.writeDocument(root,sk(targetKey),{chat:{preferences:{selectedWorldId:'custom-source'}},history:[]});
 const worldBackup=await b.capture(root,'manual',{chatKey:targetKey,chatName:'imported'});
 await tx.writeDocument(root,'world:catalog',{schemaVersion:2,items:{}});
 await tx.writeDocument(root,'legacy:settings.json',{worldCatalog:true,global:{marker:'initial'}});
 const originalCapture=b.capture;
 b.capture=async(...args)=>{const result=await originalCapture(...args);if(args[1]==='before_restore')await tx.writeDocument(root,'legacy:settings.json',{worldCatalog:true,global:{marker:'concurrent'}});return result;};
 try{await assert.rejects(restore.restore(root,{...request,id:worldBackup.id,sourceRef:p.hash(targetKey),operationId:p.hash('concurrent-world-restore')}),{code:'STORAGE_CONFLICT'});}
 finally{b.capture=originalCapture;}
 assert.equal((await tx.readDocuments(root,['legacy:settings.json'])).documents['legacy:settings.json'].value.global.marker,'concurrent');
 assert.deepEqual((await tx.readDocuments(root,['world:catalog'])).documents['world:catalog'].value.items,{},'conflict must not partly restore world data');
 // Exercise the plugin routes and request lease, not only their implementation.
 const routes=new Map(),router={post:(name,handler)=>routes.set(name,handler),get:()=>{}};
 require('../server-plugin/storage/routes.cjs').register(router,{safeRoot:()=>root,serialize:(_root,task)=>task()});
 let result;await routes.get('/storage/v2/backup/rooms')({body:{id:backup.id,targetChatKey:targetKey}},{json:value=>{result=value;},status(){return this;}});
 assert.equal(result.ok,true);assert.ok(result.rooms.some(row=>row.sameOwner));
 // A deleted original room is not required for restoring its registered files.
 const deletedRoot=path.join(root,'deleted-source');
 await tx.writeDocument(deletedRoot,'metadata:migration-v2',{status:'completed',files:[],converted:[]});
 const bank={analysisId:'synthetic-bank',records:[{rule:'Synthetic record'}]};
 const actor={id:'saved-actor',name:'Saved actor',recordBank:bank,appliedRecordVersion:'saved-version'};
 const savedCharacters={enabled:true,characters:[actor],npcs:[{id:'saved-npc',name:'Saved NPC',recordBank:bank}],persona:{id:'saved-persona',name:'Saved persona',recordBank:bank},
  recordGroups:[{id:'saved-group',kind:'character',name:'Saved actor',versions:[{id:'saved-version',entryId:actor.id,entityName:actor.name,bank}]}]};
 await tx.writeDocument(deletedRoot,sk(sourceKey),{chat:{preferences:{settingsContract:4}},history:[]});
 await tx.writeDocument(deletedRoot,ck(sourceKey),savedCharacters);
 const deletedBackup=await b.capture(deletedRoot,'manual',{chatKey:sourceKey,chatName:'original'});
 const index=await b.allDocuments(deletedRoot);
 delete index[sk(sourceKey)];delete index[ck(sourceKey)];
 await require('../server-plugin/storage/reclaim.cjs').replaceIndex(deletedRoot,index,(await p.read(tx.headFile(deletedRoot))).hash);
 assert.equal(await tx.entry(deletedRoot,sk(sourceKey)),null);
 await restore.restore(deletedRoot,{...request,id:deletedBackup.id,operationId:p.hash('deleted-room-recovery')});
 const restoredFiles=(await tx.readDocuments(deletedRoot,[ck(targetKey)])).documents[ck(targetKey)].value;
 assert.deepEqual(restoredFiles,savedCharacters,'all character, persona, NPC and dated files come from the backup even after original documents are deleted');
 const visibleFiles=normalizeCharacterStore(restoredFiles);
 assert.equal(visibleFiles.characters.length,1);assert.equal(visibleFiles.npcs.length,1);assert.ok(visibleFiles.persona);
 assert.deepEqual(visibleFiles.recordGroups,savedCharacters.recordGroups,'dated file list survives UI normalization');
 // Older backups have only hashed reserved chat documents, including catalogs.
 // Resolve their links from the backup and never offer those documents as rooms.
 const legacyRoot=path.join(root,'legacy-shared'),legacyWrite=async(kind,id,data)=>
  tx.writeDocument(legacyRoot,'legacy:chats/'+p.hash(documentKey(kind,id))+'.json',envelope(kind,id,data));
 await tx.writeDocument(legacyRoot,'metadata:migration-v2',{status:'completed',files:[],converted:[]});
 await legacyWrite('asset',assetId,{characters:savedCharacters});
 await legacyWrite('baseline',baselineId+':1',{id:baselineId,revision:1,assetId});
 await legacyWrite('storyline',storyId,{activeChatRef:p.hash(sourceKey),epoch:1,baselineRevision:1,headCheckpointId:checkpointId,checkpoints:{[checkpointId]:{id:checkpointId,state:{}}}});
 await legacyWrite('catalog',ownerRef(sourceKey),{ownerRef:ownerRef(sourceKey),rooms:[{chatRef:p.hash(sourceKey),title:'Deleted old room',chatKey:sourceKey}]});
 await tx.writeDocument(legacyRoot,sk(sourceKey),{chat:{sharedLinkV1:{storylineId:storyId,baselineId,baselineRevision:1,checkpointId,chatRef:p.hash(sourceKey),ownerRef:ownerRef(sourceKey),epoch:1}},history:[]});
 const legacyBackup=await b.capture(legacyRoot,'manual');
 const legacyRooms=await restore.inventory(legacyRoot,{id:legacyBackup.id,targetChatKey:targetKey});
 assert.equal(legacyRooms.rooms.length,1,'reserved shared documents are not empty room choices');
 assert.equal(legacyRooms.rooms[0].title,'Deleted old room');
 assert.deepEqual(legacyRooms.rooms[0].characterNames,['Saved actor','Saved NPC','Saved persona']);
 assert.ok(legacyRooms.rooms[0].fileCount>0);
 assert.equal(legacyRooms.preferredRef,null,'unknown source must not be guessed');
 await require('../server-plugin/storage/reclaim.cjs').replaceIndex(legacyRoot,{},(await p.read(tx.headFile(legacyRoot))).hash);
 await restore.restore(legacyRoot,{...request,id:legacyBackup.id,operationId:p.hash('legacy-deleted-room')});
 assert.deepEqual((await tx.readDocuments(legacyRoot,[ck(targetKey)])).documents[ck(targetKey)].value,savedCharacters);
 require('../server-plugin/storage/maintenance.cjs').stop(root);
 console.log('Room restore: changed room ID, owner checks/explicit import, unchanged other rooms, idempotent retry, shared record materialization and vault provenance passed.');
}finally{await rm(root,{recursive:true,force:true});}
