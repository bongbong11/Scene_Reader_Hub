import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createEmotionStorage} from '../src/storage/emotions.js';
import {createEmotionRuntime} from '../src/character/emotion-runtime.js';
import {storeStateEvent,latestStateForChat,latestStateEventForChat,selectedStateSwipe} from '../src/character/state-contract.js';
import {createOutputEvents} from '../src/lifecycle/output.js';
import {createSessionTransaction} from '../src/storage/session-transaction.js';
import {createWriteQueue} from '../src/lifecycle/jobs.js';
import {chatRef,documentKey,decode,envelope} from '../src/storage/shared-document.js';
const require=createRequire(import.meta.url),tx=require('../server-plugin/storage/transactions.cjs'),chunks=require('../server-plugin/storage/chunks.cjs'),backups=require('../server-plugin/storage/backups.cjs'),roomRestore=require('../server-plugin/storage/room-restore.cjs'),cleanup=require('../server-plugin/storage/room-cleanup.cjs');
const root=await mkdtemp(path.join(tmpdir(),'sr-emotion-independent-'));
const room='character-avatar:Test.png|chat:one',other='character-avatar:Test.png|chat:two';let current=room,sessionHook=async()=>{};
const sk=k=>'legacy:sessions/'+chatRef(k)+'.json',ek=k=>documentKey('emotion',chatRef(k));
const calls=[];
async function backend(route,b={}){
 calls.push([route,b]);
 if(route==='v2/capabilities')return {schemaVersion:2,features:['emotion-storage']};
 if(route==='bootstrap')return {storageV2:{active:true},chat:(await tx.readDocuments(root,[sk(b.chatKey)])).documents[sk(b.chatKey)]?.value?.chat};
 if(route==='chat'||route==='transaction'){await sessionHook();await tx.writeDocument(root,sk(b.chatKey),{chat:b.chat||b.value,history:b.history||[]});return {ok:true};}
 if(route==='v2/metadata'){const documents={};for(const k of b.keys)documents[k]=await tx.entry(root,k);return {documents};}
 if(route==='v2/operations/begin')return {operation:await tx.begin(root,b)};
 if(route==='v2/operations/part'){await chunks.put(root,b.hash,b.text);return {ok:true};}
 if(route==='v2/operations/commit')return {operation:await tx.commit(root,b.operationId,b.roots)};
 if(route==='v2/operations/status')return {operation:await tx.status(root,b.operationId)};
 throw new Error(route);
}
const realParts=async hashes=>{const {readFile}=await import('node:fs/promises');const p=require('../server-plugin/storage/paths.cjs');return Promise.all(hashes.map(async hash=>({hash,text:await readFile(p.location(root,'chunks',hash),'utf8')})));};
const post=async(route,b)=>route==='v2/parts/read'?{parts:await realParts(b.hashes)}:backend(route,b);
try{
 await tx.writeDocument(root,'metadata:migration-v2',{status:'completed',files:[],converted:[]});
 const legacy={preferences:{profileEmotionJudgment:true},characterStateEvents:[],characterStateCapture:null};
 await tx.writeDocument(root,sk(room),{chat:legacy,history:[]});
 const queueWrite=createWriteQueue(),store=createEmotionStorage({post,queueWrite,stateChatKey:()=>current});
 const rec=(await store.post('bootstrap',{chatKey:room})).chat;
 assert.ok(!Object.hasOwn(rec,'characterStateEvents'),'session record no longer owns live emotion fields');
 const storedRead=async key=>(await tx.readDocuments(root,[key])).documents[key]?.value;
 const sessionRevision=async()=>(await tx.entry(root,sk(room))).revision;
 const emotions=store.state(rec),chat=[{is_user:false,mes:'Test answers.',swipe_id:0}];
 let resolveEmotion;
 const deps={settings:{enabled:true,reasonerProfileId:'profile'},characterStore:{enabled:true,characters:[],npcs:[]},connectionRequestService:{},stateChatKey:()=>current,getContext:()=>({chat}),record:()=>rec,emotionStorage:store,stableFingerprint:JSON.stringify,selectedStateSwipe,stateCollectorMode:()=> 'profile-output',pendingProfileStateRequests:new Map(),profileStateSequence:0,collectProfileOutputState:()=>new Promise(resolve=>resolveEmotion=resolve),waitForOutputChanges:async()=>{},hub:{snapshot:()=>({state:{status:'running'}})},storeStateEvent,latestStateForChat,latestStateEventForChat,renderAll(){},renderCharacterTurnResults(){},notifySceneReaderToast(){},noteDiagnostic(){},persistChat(){throw new Error('emotion must never persist whole session');}};
 const runtime=createEmotionRuntime(deps),records=new Map([[room,rec]]),histories=new Map();
 const transaction=createSessionTransaction({queueWrite,chatRecords:records,stateHistoryCache:histories,loadStateHistory:async()=>[],fingerprint:JSON.stringify,storagePost:store.post});
 const task=runtime.scheduleProfileStateCollection({chatKey:room,outputIndex:0,text:chat[0].mes,roster:[{id:'test',code:'C0',trackArousal:false,coverageVersion:2}]});
 const before=await sessionRevision(),original=JSON.stringify(rec);
 sessionHook=async()=>{sessionHook=async()=>{};resolveEmotion({states:[{id:'test',coverageVersion:2,values:{anger:0,joy:24,fear:0,sadness:0,shame:0,interest:30}}],diagnostics:{actors:[]}});await task;assert.equal(JSON.stringify(rec),original,'emotion progress/completion cannot mutate session during continuity commit');};
 assert.equal(await transaction.commitSession(room,({current,history})=>({chat:{...current,continuity:{context:{current_situation:'The scene continues.'}}},history})),true);
 assert.equal(await sessionRevision(),before+1,'only continuity changed the session revision');
 assert.equal((await storedRead(sk(room))).chat.continuity.context.current_situation,'The scene continues.');
 const saved=decode(await storedRead(ek(room)),'emotion',chatRef(room)).data;
 assert.equal(saved.characterStateCapture.status,'collected');assert.equal(saved.characterStateEvents[0].states[0].values.joy,24);
 assert.equal((await tx.entry(root,ek(room))).revision,2,'migration and emotion save are independent document commits');
 // Manual missing-field recovery must not leak a scene revision into its read projection.
 const repair=runtime.scheduleProfileStateCollection({chatKey:room,outputIndex:0,text:chat[0].mes,roster:[{id:'test',code:'C0',trackArousal:true,coverageVersion:2}],missingOnly:true});
 resolveEmotion({states:[{id:'test',coverageVersion:2,values:{a:15,c:80}}],diagnostics:{actors:[]}});await repair;
 assert.equal(store.view(rec).characterStateRevision,undefined);assert.equal(store.view(rec).characterStateEvents[0].states[0].values.joy,24);
 // Frozen read projection keeps the same values through an in-flight judgment.
 const frozen=store.view(records.get(room));emotions.characterStateEvents[0].states[0].values.joy=67;await store.save();
 assert.equal(frozen.characterStateEvents[0].states[0].values.joy,24);assert.equal(store.view(rec).characterStateEvents[0].states[0].values.joy,67);
 const revision=await sessionRevision();await store.save();assert.equal(await sessionRevision(),revision);
 // Reload authoritative sidecar, never resurrect legacy fields after an empty reset.
 store.clear();const reload=(await store.post('bootstrap',{chatKey:room})).chat;assert.equal(store.view(reload).characterStateEvents[0].states[0].values.joy,67);
 await store.restore(room,{characterStateEvents:[],characterStateCapture:null});store.clear();await store.post('bootstrap',{chatKey:room});assert.deepEqual(store.state(rec).characterStateEvents,[]);
 // Full backup restores both domains to one snapshot. Room import intentionally resets turn-local emotions.
 store.state(rec).characterStateEvents=saved.characterStateEvents;await store.save();
 const backup=await backups.capture(root,'manual',{chatKey:room,chatName:'one'});
 await tx.writeDocument(root,sk(other),{chat:{preferences:{}},history:[]});await tx.writeDocument(root,ek(other),envelope('emotion',chatRef(other),saved));
 await roomRestore.restore(root,{id:backup.id,targetChatKey:other,sourceRef:chatRef(room),operationId:chatRef('restore-emotion')});
 assert.deepEqual(decode(await storedRead(ek(other)),'emotion',chatRef(other)).data.characterStateEvents,[]);
 await backups.restore(root,await backups.get(root,backup.id));
 assert.equal(decode(await storedRead(ek(room)),'emotion',chatRef(room)).data.characterStateEvents[0].states[0].values.joy,24);
 // Recreate the target after full restore, then test deleting only that room.
 await tx.writeDocument(root,sk(other),{chat:{preferences:{fresh:true}},history:[]});await tx.writeDocument(root,ek(other),envelope('emotion',chatRef(other),saved),{operationId:chatRef('after-full-restore')});
 const preview=await cleanup.preview(root,{chatKey:other});await cleanup.remove(root,{chatKey:other,token:preview.token,confirm:true});
 assert.equal(await storedRead(ek(other)),undefined);assert.ok(await storedRead(ek(room)),'other room deletion keeps source emotion');
 // Reusing a host room for a different storyline must not attach old feelings.
 store.clear();await store.post('bootstrap',{chatKey:room});
 const newStory={sharedSource:{storylineId:'new-story',epoch:2}};
 const loadNew=async(route,b)=>route==='bootstrap'?{storageV2:{active:true},chat:newStory}:post(route,b);
 const switched=createEmotionStorage({post:loadNew,queueWrite,stateChatKey:()=>room});await switched.post('bootstrap',{chatKey:room});
 assert.deepEqual(switched.state(newStory).characterStateEvents,[]);
 // A room switch cannot start a queued old-room write.
 current=other;await assert.rejects(store.save(room),{code:'EMOTION_SOURCE_CHANGED'});
 // Restore may replace the emotion object while retaining an old request ID.
 // A late pre-restore response must not publish into that new object.
 current=room;let owned={characterStateEvents:[]},lateResolve,saves=0;
 const isolated={...deps,emotionStorage:{state:()=>owned,enabled:()=>true,blocked:()=>false,save:async()=>{saves++;}},collectProfileOutputState:()=>new Promise(resolve=>lateResolve=resolve),pendingProfileStateRequests:new Map()};
 const pending=createEmotionRuntime(isolated).scheduleProfileStateCollection({chatKey:room,outputIndex:0,text:chat[0].mes,roster:[{id:'test',code:'C0',trackArousal:false,coverageVersion:2}]});
 owned=structuredClone(owned);const restored=JSON.stringify(owned);
 lateResolve({states:[{id:'test',values:{joy:99}}],diagnostics:{actors:[]}});await pending;
 assert.equal(JSON.stringify(owned),restored);assert.equal(saves,0);
 // Corrupt emotion data is isolated: session/continuity still load and legacy data are not discarded.
 current=room;await tx.writeDocument(root,ek(room),{invalid:true});
 const faults=[];const broken=createEmotionStorage({post,queueWrite,stateChatKey:()=>current,noteDiagnostic:(stage,event)=>faults.push({stage,...event})});
 const usable=await broken.post('bootstrap',{chatKey:room});assert.ok(usable.chat.continuity);assert.equal(broken.blocked(),true);
 await assert.rejects(broken.save(),{code:'EMOTION_STORAGE_NOT_READY'});assert.ok(faults.some(event=>event.errorKind==='SHARED_DOCUMENT_INVALID'));
 // Main-output collection failure must not prevent continuity from observing the finished reply.
 const base={nonRpOutputIndices:[]},emotionState={characterStateEvents:[]},output={is_user:false,mes:'finished'};let observed=0;
 const outputDeps={stateChatKey:()=>room,record:()=>base,emotionStorage:{state:()=>emotionState,enabled:()=>true,save:async()=>{throw Object.assign(Error('synthetic save failure'),{code:'EMOTION_STORAGE_FAILED'});}},activeGenerationCycle:{mode:'rp',startedAt:'now',chatKey:room,stateRoster:[{id:'test'}],stateCollectorMode:'main-output',stateCaptureEnabled:true},getContext:()=>({chat:[output]}),collectMainOutputState:()=>({found:true,text:'finished',states:[{id:'test',values:{joy:25}}],diagnostics:{}}),storeStateEvent,latestStateForChat,stableFingerprint:JSON.stringify,renderAll(){},noteDiagnostic(){},messageSnapshots:new Map(),messageSnapshot:()=>[],settings:{enabled:true},persistChat:async()=>{},analysis:{cancellationToken:0,observe:async()=>{observed++;}}};
 await createOutputEvents(outputDeps).onCharacterMessageReceived(0);assert.equal(observed,1);assert.equal(emotionState.characterStateCapture.status,'save_failed');assert.equal(base.characterStateCapture,undefined);
 console.log('Independent emotion storage passed: real runtime + real CAS storage, concurrent continuity commit, frozen reads, reload, reset, room import/delete and stale ownership.');
}finally{await rm(root,{recursive:true,force:true});}
