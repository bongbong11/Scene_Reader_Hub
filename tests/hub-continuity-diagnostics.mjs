import assert from 'node:assert/strict';
import {auxiliaryFixture,emptyResponse} from './fixtures/auxiliary-runtime.mjs';
import {requestWithConnectionProfile} from '../src/adapters/connection-profile.js';
import {wholeDiagnosticReport} from '../src/debug/whole-report.js';
import {createContinuityView} from '../src/ui/results/continuity.js';
import {safeAnalysisInfo} from '../src/continuity/failure.js';
const secret='synthetic-private-response-sk-abc123',good=JSON.stringify(emptyResponse().result),wire=[];
const f=auxiliaryFixture();let reply=good,throwRequest=null,model='synthetic-one';
f.deps.connectionRequestService={getProfile:()=>({id:'synthetic',name:secret,model}),validateProfile(){},async sendRequest(){if(throwRequest)throw throwRequest;return reply;}};
f.deps.requestWithConnectionProfile=(...args)=>requestWithConnectionProfile(...args.slice(0,4),{...args[4],onDiagnostic:detail=>wire.push(detail)});
async function run(){if(f.deps.record().auxiliaryStateV1)f.deps.record().auxiliaryStateV1.retryAfter=0;await f.turn(secret);return f.deps.record();}
const report=record=>wholeDiagnosticReport({record:structuredClone(record),execution:{events:[]}});
function render(record){const root={innerHTML:''};createContinuityView({document:{getElementById:()=>root},readState:()=>({settings:{continuityEnabled:true},reasonerProfiles:[]}),record:()=>record,escapeHtml:String,getContext:()=>f.context,stateChatKey:()=> 'room-A',stableFingerprint:f.deps.fingerprint}).renderContinuity();return root.innerHTML;}
let rec=await run();assert.equal(rec.lastContinuityTrace.status,'verified');const firstModel=report(rec).continuityDiagnostics.attempt.modelHash;
model='synthetic-two';rec=await run();assert.notEqual(report(rec).continuityDiagnostics.attempt.modelHash,firstModel);
for(const [response,code]of [['','PROFILE_EMPTY_RESPONSE'],[{content:null},'PROFILE_EMPTY_RESPONSE'],['{"current_situation":','PROFILE_UNFINISHED_JSON'],[{content:'{"current_situation":',finish_reason:'length'},'PROFILE_TRUNCATED_RESPONSE'],['{"a":true} {"b":false}','PROFILE_MULTIPLE_JSON'],[secret,'PROFILE_JSON_NOT_FOUND'],['{"current_situation":oops}','PROFILE_INVALID_JSON'],['{"new_items":[]}','CONTINUITY_FIELDS_MISSING']]){
 reply=response;rec=await run();const log=report(rec);
 assert.equal(log.continuityFailure.code,code);assert.equal(log.continuityFailure.phase,'response');
 assert.equal(log.continuityDiagnostics.attempt.status,'failed');assert.equal(log.continuityDiagnostics.attempt.persisted,true);assert.equal(log.continuityDiagnostics.attempt.responseReceived,true);
 assert.ok(log.continuityDiagnostics.attempt.maxTokens>0);assert.ok(log.continuityDiagnostics.attempt.inputChars>0);
 assert.ok(!JSON.stringify(log).includes(secret));assert.match(render(rec),/모델 응답 해석 실패/);assert.ok(render(rec).includes(code));
}
for(const [error,code,status]of [[Object.assign(new Error(secret),{status:401}),'PROFILE_AUTH_FAILED',401],[Object.assign(new Error(secret),{status:429}),'PROFILE_RATE_LIMIT',429],[Object.assign(new Error(secret),{status:502}),'PROFILE_SERVER_ERROR',502],[new TypeError('Failed to fetch '+secret),'PROFILE_NETWORK_ERROR',0],[new Error(secret),'PROFILE_REQUEST_FAILED',0]]){
 throwRequest=error;rec=await run();const log=report(rec);
 assert.equal(log.continuityFailure.code,code);assert.equal(log.continuityFailure.phase,'request');assert.equal(log.continuityFailure.httpStatus,status);
 assert.equal(log.continuityDiagnostics.attempt.responseReceived,false);assert.match(render(rec),/모델 요청 실패/);assert.ok(!JSON.stringify(log).includes(secret));
}
throwRequest=null;reply=good;rec=await run();assert.equal(report(rec).continuityFailure,null);assert.equal(report(rec).continuityDiagnostics.lastFailure.code,'PROFILE_REQUEST_FAILED');assert.ok(report(rec).continuityDiagnostics.history.length<=6);
assert.ok(!JSON.stringify(wire).includes(secret));
const partial=auxiliaryFixture();partial.deps.requestWithConnectionProfile=async()=>({result:{current_situation:'Aster replies.',remaining_effects:null}});await partial.turn();
assert.equal(report(partial.deps.record()).continuityFailure.code,'CONTINUITY_PARTIAL_RESULT');assert.equal(report(partial.deps.record()).continuityDiagnostics.attempt.invalidCount,1);
assert.deepEqual(safeAnalysisInfo({code:secret,phase:secret,module:secret,modelHash:'https://private/path',outputChars:NaN,sectionCounts:{private:secret},rejections:[{type:secret,index:0,reason:secret}]}),{sectionCounts:{},rejections:[]});
console.log('Continuity diagnostics passed: actual adapter request/response failures, model identity, partial fields, retained anonymous history, current success and privacy.');