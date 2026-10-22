import assert from 'node:assert/strict';
import {auxiliaryFixture,emptyResponse} from './fixtures/auxiliary-runtime.mjs';
import {requestWithConnectionProfile} from '../src/adapters/connection-profile.js';
import {wholeDiagnosticReport} from '../src/debug/whole-report.js';
import {createContinuityView} from '../src/ui/results/continuity.js';
import {createCurrentStatusModel} from '../src/ui/current-status-model.js';
import {safeAnalysisInfo} from '../src/continuity/failure.js';

const secret='synthetic-private-response-sk-abc123';
const good=JSON.stringify(emptyResponse().result);
const wire=[];
const f=auxiliaryFixture();
let reply=good,throwRequest=null,model='synthetic-one';
f.deps.connectionRequestService={getProfile:()=>({id:'synthetic',name:secret,model}),validateProfile(){},async sendRequest(){if(throwRequest)throw throwRequest;return reply;}};
f.deps.requestWithConnectionProfile=(...args)=>requestWithConnectionProfile(...args.slice(0,4),{...args[4],onDiagnostic:detail=>wire.push(detail)});
async function run(){const rec=f.records.get('room-A');if(rec.auxiliaryStateV1)rec.auxiliaryStateV1.retryAfter=0;await f.turn(secret);await f.turn();await f.turn();return f.records.get('room-A');}
function report(record){return wholeDiagnosticReport({record:structuredClone(record),execution:{events:[]}});}
function render(record){const root={innerHTML:''};createContinuityView({document:{getElementById:()=>root},readState:()=>({settings:{continuityEnabled:true},reasonerProfiles:[]}),record:()=>record,escapeHtml:String,continuityLabel:String}).renderContinuity();return root.innerHTML;}

let rec=await run();
assert.equal(rec.lastContinuityTrace.status,'empty');
const firstModel=report(rec).continuityDiagnostics.attempt.modelHash;
model='synthetic-two';rec=await run();
assert.notEqual(report(rec).continuityDiagnostics.attempt.modelHash,firstModel,'same profile ID records the actual model used by the host service');
assert.equal(report(rec).continuityDiagnostics.attempt.profileHash,report(f.stored[0].chat).continuityDiagnostics.attempt.profileHash);

for(const [response,code]of [
 ['', 'PROFILE_EMPTY_RESPONSE'],
 [{content:null},'PROFILE_EMPTY_RESPONSE'],
 ['{"new_items":[','PROFILE_UNFINISHED_JSON'],
 [{content:'{"new_items":[',finish_reason:'length'},'PROFILE_TRUNCATED_RESPONSE'],
 ['{"a":true} {"b":false}','PROFILE_MULTIPLE_JSON'],
 [secret,'PROFILE_JSON_NOT_FOUND'],
 ['{"new_items":oops}','PROFILE_INVALID_JSON'],
 ['{"topic_fixation":null}','CONTINUITY_SECTIONS_MISSING'],
]){
 reply=response;rec=await run();const log=report(rec),failure=log.continuityFailure;
 assert.equal(failure.code,code);assert.equal(failure.phase,'response');
 assert.equal(log.continuityDiagnostics.attempt.status,'fallback');
 assert.equal(log.continuityDiagnostics.attempt.persisted,true);
 assert.equal(log.continuityDiagnostics.attempt.responseReceived,true);
 assert.equal(log.continuityDiagnostics.attempt.continuityIncluded,true);
 assert.equal(log.continuityDiagnostics.attempt.repetitionStatus,'model_unavailable');
 assert.ok(log.continuityDiagnostics.attempt.maxTokens>0);
 assert.ok(log.continuityDiagnostics.attempt.inputChars>0);
 assert.ok(log.continuityDiagnostics.attempt.sourceIndices.length>0);
 assert.ok(!JSON.stringify(log).includes(secret),'retained/reloaded report contains no original dialogue, profile name or provider body');
 assert.match(render(rec),/모델 응답 해석 실패/);assert.ok(render(rec).includes(code));
}
for(const [error,code,status]of [
 [Object.assign(new Error(secret),{status:401}),'PROFILE_AUTH_FAILED',401],
 [Object.assign(new Error(secret),{status:429}),'PROFILE_RATE_LIMIT',429],
 [Object.assign(new Error(secret),{status:502}),'PROFILE_SERVER_ERROR',502],
 [new TypeError('Failed to fetch '+secret),'PROFILE_NETWORK_ERROR',0],
 [new TypeError(secret),'PROFILE_REQUEST_FAILED',0],
 [new Error(secret),'PROFILE_REQUEST_FAILED',0],
]){
 throwRequest=error;rec=await run();const log=report(rec);
 assert.equal(log.continuityFailure.code,code);assert.equal(log.continuityFailure.phase,'request');assert.equal(log.continuityFailure.httpStatus,status);
 assert.equal(log.continuityDiagnostics.attempt.responseReceived,false);
 assert.match(render(rec),/모델 요청 실패/);assert.ok(!JSON.stringify(log).includes(secret));
}
throwRequest=null;reply=good;rec=await run();
assert.equal(rec.lastContinuityTrace.status,'empty');assert.equal(report(rec).continuityFailure,null);
assert.equal(report(rec).continuityDiagnostics.lastFailure.code,'PROFILE_REQUEST_FAILED','last failure survives later successful runs with its own timestamp');
assert.ok(report(rec).continuityDiagnostics.history.length<=6);
assert.ok(!JSON.stringify(wire).includes(secret),'transport diagnostics never contain response text or profile names');

// Per-item reasons and original array positions remain available after reload.
const partial=auxiliaryFixture();
partial.deps.requestWithConnectionProfile=async()=>({result:{...emptyResponse().result,new_items:[{kind:'schedule',label:'Return the key',source_type:'promise',source_indices:[999]}],affected:'invalid'}});
await partial.turn();await partial.turn();await partial.turn();
const partialReport=report(partial.records.get('room-A'));
assert.equal(partialReport.continuityFailure.phase,'items');
assert.deepEqual(partialReport.continuityDiagnostics.attempt.rejections,[{type:'new_item',index:0,reason:'invalidEvidenceCount',field:'source_indices'},{type:'section',index:1,reason:'invalidShapeCount',field:'affected'}]);

// An item-processing exception is not reported as a failed transport request.
const broken=auxiliaryFixture();
broken.deps.requestWithConnectionProfile=async()=>({result:{...emptyResponse().result,new_items:[new Proxy({},{get(){throw new Error(secret);}})]}});
await broken.turn();await broken.turn();await broken.turn();
assert.equal(report(broken.records.get('room-A')).continuityFailure.phase,'items');
assert.match(render(broken.records.get('room-A')),/연속성 항목 처리 실패/);

// Both a recoverable save failure and failure to save the diagnostics are explicit.
for(const permanent of [false,true]){
 const storage=auxiliaryFixture();let writes=0;
 storage.deps.storagePost=async()=>{writes++;if(permanent||writes===1)throw Object.assign(new Error(secret),{code:'STORAGE_SYNTHETIC',status:503});};
 await storage.turn();await storage.turn();await storage.turn();
 const saved=storage.records.get('room-A'),log=report(saved);
 assert.equal(log.continuityFailure.phase,'storage');assert.equal(log.continuityFailure.code,'STORAGE_SYNTHETIC');
 assert.equal(log.continuityFailure.httpStatus,503);
 assert.equal(log.continuityDiagnostics.attempt.persisted,!permanent);
 assert.equal(saved.continuity.items.length,0);
 assert.match(render(saved),/연속성 저장 실패/);
 if(permanent){assert.match(render(saved),/오류 기록도 저장하지 못했습니다/);assert.equal(log.continuityDiagnosticWriteFailure.code,'STORAGE_SYNTHETIC');}
 assert.ok(!JSON.stringify(log).includes(secret));
}
// Failure before save and the save failure are both retained.
const both=auxiliaryFixture();both.deps.requestWithConnectionProfile=async()=>{throw Object.assign(new Error(secret),{code:'PROFILE_TIMEOUT'});};
let writes=0;both.deps.storagePost=async()=>{if(++writes===1)throw Object.assign(new Error(secret),{code:'STORAGE_SYNTHETIC'});};
await both.turn();await both.turn();await both.turn();
assert.equal(report(both.records.get('room-A')).continuityPriorFailure.code,'PROFILE_TIMEOUT');

const status=createCurrentStatusModel();
for(const [phase,text]of [['request','모델 요청 실패'],['response','모델 응답 해석 실패'],['items','연속성 항목 처리 실패'],['storage','연속성 저장 실패']]){
 status.accept({stage:'analysis_failed',status:'failed',continuityIncluded:true,phase,reasonCode:'ANALYSIS_FAILED'});
 assert.equal(status.snapshot().rows.find(row=>row.id==='continuity').message,text);
}
assert.match(render({continuity:{items:[],knowledge:[],followups:[],dependencies:[]},lastContinuityTrace:{status:'fallback'}}),/이전 버전에 실패 원인이 남아 있지 않습니다/);
assert.deepEqual(safeAnalysisInfo({code:secret,phase:secret,module:secret,modelHash:'https://private/path',outputChars:NaN,sectionCounts:{private:secret},rejections:[{type:secret,index:0,reason:secret}]}),{sectionCounts:{},rejections:[]});
console.log('Continuity diagnostics passed: request/parse/sections/items/save distinctions, model identity, bounded anonymous history, reload retention, failed diagnostic writes and UI reasons.');
