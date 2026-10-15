import assert from 'node:assert/strict';
import {waitForIdle,createJobScope} from '../src/lifecycle/jobs.js';
import {auxiliaryFixture,emptyResponse} from './fixtures/auxiliary-runtime.mjs';
import {fixture} from './regression/audit-v012.mjs';
import {createEmbeddingMaintenance} from '../src/retrieval/maintenance.js';
import {bindCharacterPages} from '../src/storage/character-pages.js';
import {createSourceRevision} from '../src/context/source-revision.js';
import {stableFingerprint} from '../src/decision/policy.js';
import {searchCharacterRecords} from '../src/retrieval/character-search.js';
import {createRecordBank} from '../src/character/records.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const within=async task=>{let timer;try{return await Promise.race([task,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('operation blocked')),3000))]);}finally{clearTimeout(timer);}};
let busy=true;const aborter=new AbortController();
const waiting=waitForIdle({isBusy:()=>busy,signal:aborter.signal});aborter.abort();await assert.rejects(waiting,{name:'AbortError'});
await assert.rejects(waitForIdle({isBusy:()=>true,timeoutMs:10}),{code:'ANALYSIS_BUSY_TIMEOUT'});
busy=false;await waitForIdle({isBusy:()=>busy});

// Real generation preparation must finish while an emotion request remains pending.
const f=fixture();f.ctx.chat=[{is_user:false,mes:'Morgan closes the folder.'}];
let finishEmotion,finishJev;let jevCalls=0;
f.sandbox.emotionRequest=()=>new Promise(resolve=>{finishEmotion=resolve;});
f.sandbox.jevRequest=async()=>{jevCalls++;if(jevCalls===1)await new Promise(resolve=>{finishJev=resolve;});throw Error('synthetic Jev unavailable');};
f.run('record(true).preferences.profileEmotionJudgment=true; characterStore.enabled=true; settings.reasonerProfileId="test"; connectionRequestService={}; requestWithConnectionProfile=emotionRequest; callJev=jevRequest;');
const collection=f.run('scheduleProfileStateCollection({chatKey:stateChatKey(),outputIndex:0,text:getContext().chat[0].mes,roster:[{id:"morgan",code:"C0",kind:"character",name:"Morgan"}]})');
await tick();assert.ok(finishEmotion);
const generation=f.run('onBeforeGeneration("normal",{},false)');
await within((async()=>{while(!finishJev)await tick();})());
finishEmotion({result:{states:[{code:'C0',a:0,c:90,anger:0,joy:30,fear:0,sadness:0}]}});
await tick();assert.equal(f.run('record().characterStateCapture.status'),'collecting','foreground owns the record until preparation and host generation finish');
finishJev();await within(generation);
assert.equal(f.run('record().characterStateCapture.status'),'collecting','prepared prompt does not wait for emotion persistence');
f.run('pendingGenerationType=""');await within(collection);
assert.notEqual(f.run('record().characterStateCapture.status'),'collecting');

// A detached response arriving during foreground activity waits without clearing its injection.
for(const failed of [false,true]){
 const a=auxiliaryFixture();let finish,hostBusy=false,clears=0;
 a.deps.isGenerationBusy=()=>hostBusy;a.deps.clearInjection=async()=>{assert.equal(hostBusy,false);clears++;};
 a.deps.requestWithConnectionProfile=()=>new Promise((resolve,reject)=>{finish=()=>failed?reject(Error('synthetic failure')):resolve(emptyResponse());});
 await a.turn();await a.turn();const task=a.turn();while(!finish)await tick();
 hostBusy=true;finish();await tick();assert.equal(a.stored.length,0);assert.equal(clears,0);
 a.records.get('room-A').lastJudgment={inputKey:'newer-foreground'};
 hostBusy=false;await within(task);assert.ok(a.stored.length);
 if(failed)assert.equal(a.records.get('room-A').lastJudgment.inputKey,'newer-foreground');
}

// Paged maintenance uses bounded pages and ignores mutable search-cache records.
const entry={id:'npc-a',kind:'npc',name:'Actor',source:'Actor works at a workshop.'};
entry.recordBank=createRecordBank({entity_type:'npc',entity_name:'Actor',records:[{type:'knowledge',target:'workshop',when:['work'],rule:'Actor knows the workshop tools.',modality:'fact',basis:'explicit',source_ids:['S001'],knowledge_domain:'professional',knowledge_state:'knows'}]},entry,'test');
const bank=entry.recordBank;bank.pagedRecords={schemaVersion:2,root:'r1',indexRoot:'i1',count:2,bankId:'paged-npc'};
bank.seedRecords=bank.records;bank.seedIndices=[0];bank.recordIndices=[0];
const offsets=[];bindCharacterPages(async(_path,body)=>{offsets.push(body.offset);assert.equal(body.all,false);return {records:[bank.seedRecords[0]],indices:[body.offset],nextOffset:body.offset===0?1:null};});
let paged=0;const maintenance=createEmbeddingMaintenance({characterStore:{characters:[],npcs:[entry]},stateChatKey:()=> 'room',chatReadyKey:'room',selectedWorld:()=>null,jobs:createJobScope(()=> 'room'),invalidateReasonerJobs(){},clearInjection:async()=>{},noteDiagnostic(){},vectorRetrieval:{config:()=>({source:'transformers'}),clear(){},rebuild:()=>{throw Error('paged bank flattened');},async rebuildPaged({pages,validate}){paged++;let count=0;for await(const page of pages){count+=page.records.length;bank.records=[...bank.records,...page.records];validate();}return {status:'rebuilt',generatedCount:count,reusedCount:0};}}});
const result=await maintenance.rebuild();assert.equal(paged,1);assert.deepEqual(offsets,[0,1]);assert.equal(result.recordCount,2);
console.log('Background boundaries passed: foreground never waits for emotion; detached commits wait for generation; cancellation, timeout, failure and paged index ownership remain bounded.');

const source=createSourceRevision({settings:{},characterStore:{enabled:true,characters:[],npcs:[entry]},stableFingerprint,getContext:()=>({chat:[]}),window:{}});
const beforePage=source.sourceRevisionKey({preferences:{}},null);bank.records=[];bank.recordIndices=[];
assert.equal(source.sourceRevisionKey({preferences:{}},null),beforePage,'page retrieval is not a source replacement');
bank.pagedRecords.root='new-root';assert.notEqual(source.sourceRevisionKey({preferences:{}},null),beforePage);
const ordinary=structuredClone(entry);delete ordinary.recordBank.pagedRecords;ordinary.recordBank.records=bank.seedRecords;
let searches=0;const other={...ordinary,id:'other'};
const results=await searchCharacterRecords({entries:[ordinary,other],priorStates:new Map(),transcript:'workshop',identity:'room',retrieval:{search:async()=>++searches===1?{status:'fallback',code:'EMBEDDING_INDEX_PENDING',indices:[]}:{status:'ready',indices:[0]}}});
assert.equal(searches,2);assert.equal(results.get('other').status,'ready','one pending bank does not disable an already indexed bank');

// Applying a small file prepares only that bank, without cancelling foreground work.
{
 const events=[],rebuilt=[];let invalidations=0,clears=0,finishIndex;
 const store={characters:[],npcs:[ordinary,other]};
 const deps={characterStore:store,stateChatKey:()=> 'room',chatReadyKey:'room',selectedWorld:()=>null,jobs:createJobScope(()=> 'room'),invalidateReasonerJobs(){invalidations++;},clearInjection:async()=>{clears++;},noteDiagnostic:(stage,data)=>events.push({stage,...data}),vectorRetrieval:{config:()=>({source:'transformers'}),clear(){},async rebuild(request){rebuilt.push(request);await new Promise(resolve=>{finishIndex=resolve;});request.validate();return {status:'rebuilt',generatedCount:1,reusedCount:0};}}};
 const index=createEmbeddingMaintenance(deps);
 const preparing=index.prepareApplied([other.id]);await tick();
 assert.equal(index.isBusy(),true);assert.equal(rebuilt.length,1);assert.equal(rebuilt[0].entryId,other.id);
 assert.equal(rebuilt[0].background,true,'background preparation must not take over foreground toast progress');
 assert.equal(invalidations,0);assert.equal(clears,0);
 await index.prepareApplied([ordinary.id]);assert.equal(rebuilt.length,1,'no overlapping background index jobs');
 finishIndex();await preparing;assert.equal(index.isBusy(),false);
 const saved=JSON.stringify(store);
 const cancelled=index.prepareApplied([other.id]);await tick();index.cancel();finishIndex();await cancelled;
 assert.equal(JSON.stringify(store),saved,'cancelled index preparation never changes source records');
 deps.chatReadyKey='different-room';await index.prepareApplied([other.id]);
 assert.ok(events.some(event=>event.phase==='index_sync'&&event.status==='failed'),'preflight failures are visible and do not reject successful file application');
 deps.chatReadyKey='room';store.npcs=[entry];
 await index.prepareApplied([entry.id]);assert.equal(events.at(-1).code,'EMBEDDING_INDEX_PENDING','paged banks require explicit maintenance');
 assert.equal(rebuilt.length,2);
}
