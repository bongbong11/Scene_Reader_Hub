import assert from 'node:assert/strict';
import {createAnalysisRuntime} from '../src/continuity/analysis-runtime.js';
import {stableFingerprint as fingerprint} from '../src/decision/policy.js';
import {bindAnalysisActions} from '../src/ui/analysis-actions.js';

const empty={result:{protocol:1,coverage:{memory:'complete',characters:'complete',persona:'not_requested'},memory_changes:[],knowledge_changes:[],character_changes:[],deferred_changes:[]}};
function fixture(){
 const ctx={chat:[{is_user:true,mes:'A synthetic question.'},{is_user:false,mes:'A synthetic reply.'}],name2:'Actor'},settings={enabled:true,continuityEnabled:true,reasonerProfileId:'test',continuityInterval:5},records=new Map([['room',{}]]),events=[],requests=[];
 const deps={window:{},hub:{snapshot:()=>({state:{status:'prepared'}})},stateChatKey:()=> 'room',getContext:()=>ctx,settings,characterStore:{characters:[],npcs:[]},record:()=>records.get('room'),chatRecords:records,stateHistoryCache:new Map(),queueWrite:(_key,task)=>task(),loadStateHistory:async()=>[],storagePost:async()=>{},fingerprint,renderAll(){},selectActiveEntries:()=>[],noteDiagnostic:(code,detail)=>events.push({code,...detail}),connectionRequestService:{},requestWithConnectionProfile:async(...args)=>{requests.push(args);return empty;}};
 const analysis=createAnalysisRuntime(deps);return {deps,analysis,ctx,settings,records,events,requests};
}
const f=fixture();
const first=f.analysis.requestManual();assert.equal(first.status,'accepted');
assert.equal(f.analysis.requestManual().status,'busy');
assert.equal((await first.completion).status,'empty');assert.equal(f.requests.length,1,'manual bypasses the five-turn wait and actually calls the profile');
assert.ok(f.events.some(e=>e.code==='analysis_started'));
assert.equal((await f.analysis.requestManual().completion).status,'already_analyzed');assert.equal(f.requests.length,1);
f.records.get('room').analysisRuntimeV1.pendingBatches=[{candidates:[{status:'pending'}]}];
assert.equal((await f.analysis.requestManual().completion).status,'needs_review');assert.equal(f.requests.length,1);
for(const kind of ['disabled','needs_setup','no_source']){
 const x=fixture();if(kind==='disabled')x.settings.continuityEnabled=false;
 if(kind==='needs_setup')x.deps.connectionRequestService=null;
 if(kind==='no_source')x.records.get('room').nonRpOutputIndices=[1];
 assert.equal(x.analysis.requestManual().status,kind);assert.equal(x.requests.length,0);
}
const fail=fixture();fail.deps.requestWithConnectionProfile=async()=>{throw Object.assign(new Error('private provider body'),{code:'PROFILE_TIMEOUT'});};
assert.deepEqual(await fail.analysis.requestManual().completion,{status:'failed',reasonCode:'PROFILE_TIMEOUT'});
assert.ok(!JSON.stringify(fail.events).includes('private provider body'));
const storage=fixture();storage.deps.storagePost=async()=>{throw Object.assign(new Error('private path'),{code:'STORAGE_FAILED'});};
assert.deepEqual(await storage.analysis.requestManual().completion,{status:'failed',reasonCode:'STORAGE_FAILED'});assert.equal(storage.requests.length,0);
const cancel=fixture();let release,entered=false;
cancel.deps.requestWithConnectionProfile=async()=>{entered=true;await new Promise(r=>release=r);return empty;};
const running=cancel.analysis.requestManual();while(!entered)await new Promise(r=>setImmediate(r));cancel.analysis.cancel('generation_stopped');
assert.equal(cancel.analysis.requestManual().status,'busy','an aborted request must settle before a new manual promise can be accepted');release();assert.equal((await running.completion).status,'cancelled');
// Real click binding: immediate receipt, final result, and no toast for another room.
let click,finish,key='one';const notes=[];
const ui={document:{getElementById:id=>id==='sr-analysis-now'?({addEventListener:(_event,fn)=>{click=fn;}}):null},stateChatKey:()=>key,analysis:{requestManual:()=>({status:'accepted',completion:new Promise(r=>finish=r)})}};
bindAnalysisActions(ui,{notify:(level,message)=>notes.push({level,message})});
const pending=click();assert.match(notes[0].message,/요청을 받/);finish({status:'empty'});await pending;assert.match(notes[1].message,/새로 저장할 변화는 없습니다/);
const switched=click();key='two';finish({status:'failed'});await switched;assert.equal(notes.length,3);
ui.analysis.requestManual=()=>({status:'needs_setup'});await click();assert.match(notes.at(-1).message,/연결 프로필/);
console.log('Manual analysis passed: actual profile call, immediate receipt, no source/setup, no duplicates, unusable pending evidence, failure, cancellation, and scoped feedback.');

// A queued observation receives its own result, never the active job's success toast.
{
const {createAnalysisScheduler}=await import('../src/continuity/analysis-scheduler.js');
let release;const queuedScheduler=createAnalysisScheduler();const first=queuedScheduler.request(async()=>{await new Promise(resolve=>{release=resolve;});return {status:'empty'};});await Promise.resolve();const superseded=queuedScheduler.request(async()=>({status:'failed'}));const final=queuedScheduler.request(async()=>({status:'needs_review'}));assert.notEqual(first,final);assert.deepEqual(await superseded,{status:'cancelled'});release();assert.deepEqual(await first,{status:'empty'});assert.deepEqual(await final,{status:'needs_review'});
let finishCancelled;const cancelScheduler=createAnalysisScheduler();const running=cancelScheduler.request(async()=>{await new Promise(resolve=>{finishCancelled=resolve;});return {status:'cancelled'};});await Promise.resolve();const waiting=cancelScheduler.request(async()=>{throw new Error('Cancelled queued work must not execute');});cancelScheduler.cancel();assert.deepEqual(await waiting,{status:'cancelled'});finishCancelled();await running;assert.equal(cancelScheduler.pending,false);
console.log('Queued feedback passed: distinct completion, superseded observation cancelled, no repeated success and no work after cancellation.');
}
