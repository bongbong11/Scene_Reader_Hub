import assert from 'node:assert/strict';
import {fixture} from './regression/audit-v012.mjs';
import {completeVaultAudit} from '../src/integration/vault-completion.js';
import {createRecordRepository} from '../src/storage/record.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function emotionFixture(){
    const f=fixture(),calls=[];f.ctx.chat=[{is_user:false,mes:'Aster answers.',swipe_id:0}];
    f.sandbox.syntheticEmotionRequest=()=>new Promise((resolve,reject)=>calls.push({resolve,reject}));
    f.run(`record(true).preferences.profileEmotionJudgment=true;characterStore={enabled:true,characters:[{id:'a',kind:'character',name:'Aster'}],npcs:[]};settings.reasonerProfileId='synthetic';connectionRequestService={};requestWithConnectionProfile=syntheticEmotionRequest;`);
    return {f,calls,start:()=>f.run(`scheduleProfileStateCollection({chatKey:stateChatKey(),outputIndex:0,text:getContext().chat[0].mes,roster:[{id:'a',code:'C0',kind:'character',name:'Aster',trackArousal:true}]})`)};
}
{
    const {f,calls}=emotionFixture();
    f.run(`storeStateEvent(record(),{outputIndex:0,swipeId:0,fingerprint:stableFingerprint(getContext().chat[0].mes),states:[],capture:{participantIds:['a'],status:'empty',diagnostics:{actors:[{rosterIndex:0,accepted:false,reasons:['not_participating']}]}}});`);
    const task=f.run('collectCurrentEmotion()');await tick();assert.equal(calls.length,1);
    calls[0].resolve({result:{states:[{code:'C0',a:0,c:90,anger:0,joy:20,fear:0,sadness:0,shame:0,interest:0}]}});await task;
    assert.equal(f.run('record().characterStateCapture.status'),'collected');
}
{
    const {f,calls,start}=emotionFixture();const task=start();await tick();
    calls[0].reject(Object.assign(new Error('Synthetic authentication failure'),{code:'HTTP_401'}));await task;
    assert.equal(f.run('record().characterStateCapture.errorKind'),'HTTP_401');
}
{
    const {f,calls,start}=emotionFixture();let saves=0;f.sandbox.syntheticPersist=async()=>saves++;
    const task=start();await tick();
    f.run(`persistChat=syntheticPersist;waitForOutputChanges=async()=>{throw Object.assign(new Error('Synthetic queue failure'),{code:'OUTPUT_QUEUE_FAILED'});}`);
    calls[0].resolve({result:{states:[{code:'C0',anger:0,joy:20,fear:0,sadness:0,shame:0,interest:0}]}});await task;
    assert.equal(saves,0);assert.equal(f.run('record().characterStateCapture.status'),'processing_failed');
    assert.equal(f.run('record().characterStateCapture.phase'),'source');
}
{
    let saved=false;
    const repo=createRecordRepository({saveServerChat:async()=>{saved=true;},reconcileInjection:async()=>{throw new Error('Synthetic cleanup failure');},stateChatKey:()=> 'synthetic'});
    await assert.rejects(repo.persistChat('synthetic',{}),error=>error.storageSaved&&error.code==='INJECTION_RECONCILE_FAILED');
    assert.equal(saved,true);
}
{
    const events=[],signal=new AbortController().signal;let committed=false;
    const bridge={analysisCurrent:()=>true,repairAnalysis:()=>({system:'synthetic',input:{},cardIds:['one']}),commitAnalysis:async()=>{committed=true;return {status:'succeeded'};}};
    await completeVaultAudit({bridge,vault:{token:'synthetic'},result:{vault_results:[]},sourceText:'Synthetic RP.',request:async()=>{throw Object.assign(new Error('Synthetic request failure'),{code:'PROFILE_AUTH_FAILED'});},signal,valid:()=>true,idle:async()=>{},report:(_code,event)=>events.push(event)});
    assert.equal(committed,true,'repair failure does not discard independently valid original results');
    assert.ok(events.some(event=>event.phase==='request'&&event.reasonCode==='VAULT_REPAIR_REQUEST_FAILED'&&event.errorKind==='PROFILE_AUTH_FAILED'));
    bridge.repairAnalysis=()=>{throw new Error('Synthetic prepare failure');};
    await completeVaultAudit({bridge,vault:{token:'synthetic'},result:{},signal,valid:()=>true,report:(_code,event)=>events.push(event)});
    assert.equal(events.at(-1).reasonCode,'VAULT_PREPARE_FAILED');
}
console.log('Emotion isolation passed: recheck absent actors, retain root cause, distinguish processing/save failure, and isolate optional repair failures.');
