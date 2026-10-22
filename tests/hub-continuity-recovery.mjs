import assert from 'node:assert/strict';
import {auxiliaryFixture,emptyResponse} from './fixtures/auxiliary-runtime.mjs';
import {createAuxiliaryRuntime} from '../src/continuity/auxiliary-runtime.js';
import {validateReasonerResult} from '../src/continuity/engine.js';
import {pendingAnalysisReceipt} from '../src/continuity/pending-analysis.js';
import {analysisDiagnostic} from '../src/debug/analysis-events.js';
import {safeDetail} from '../src/debug/events.js';
import {wholeDiagnosticReport} from '../src/debug/whole-report.js';
import {createContinuityView} from '../src/ui/results/continuity.js';

const promise={kind:'commitment',label:'Bring the key at noon',lifecycle:'active',owners:['Actor'],source_type:'promise',evidence:'I will bring the key at noon.'};
const second={...promise,label:'Call the porter',evidence:'I will call the porter.'};
const response=items=>({result:{...emptyResponse().result,new_items:items}});
const options={sourceText:promise.evidence,continuity:{items:[]},sourceIdentity:{outputFingerprint:'test'},actors:['Actor'],stateRefs:[]};
// Quiet, ordinary answers still qualify: no event-importance or Jev gate.
{
 const normal=auxiliaryFixture();
 for(let n=1;n<=2;n++){
  await normal.turn('He waits.');
  const event=normal.events.at(-1);
  assert.equal(event.code,'auxiliary_usage');assert.equal(event.reasonCode,'interval_pending');
  assert.equal(event.turnCount,n);assert.equal(event.requiredTurns,3);assert.equal(normal.requests.length,0);
 }
 await normal.turn('He waits.');assert.equal(normal.requests.length,1,'third ordinary RP output triggers the model without a separate eligibility judgment');
 assert.equal(normal.events.find(event=>event.code==='analysis_started').continuityIncluded,true);
 assert.equal(normal.events.at(-1).continuityIncluded,true);
 assert.equal(normal.events.at(-1).code,'analysis_result');assert.equal(normal.events.at(-1).status,'succeeded');
 await normal.analysis.queue(5);assert.equal(normal.requests.length,1);assert.equal(normal.events.at(-1).reasonCode,'already_analyzed');
 const disabled=auxiliaryFixture({settings:{continuityEnabled:false}});await disabled.turn();
 assert.equal(disabled.requests.length,0);assert.equal(disabled.events.at(-1).reasonCode,'analysis_disabled');
 const unconfigured=auxiliaryFixture({settings:{reasonerProfileId:''}});
 await unconfigured.turn();await unconfigured.turn();await unconfigured.turn();
 assert.equal(unconfigured.events.at(-1).reasonCode,'profile_not_configured');assert.equal(unconfigured.requests.length,0);
 const ooc=auxiliaryFixture({chat:[{is_system:true,mes:'OOC note.'}]});await ooc.analysis.queue(0);
 assert.equal(ooc.events.at(-1).reasonCode,'no_rp_output');
}
const counts={};
assert.equal(validateReasonerResult({new_items:[promise,promise,promise]}, {...options,diagnostics:counts}).length,2);
assert.equal(counts.candidateCount,3);assert.equal(counts.limitOmittedCount,1);assert.equal(counts.invalidCount,0,'selection cap is not a validation error');
let diagnostic;
analysisDiagnostic((_code,detail)=>{diagnostic=safeDetail(detail);},'analysis_result',{invalidEvidenceTypeCount:1,continuityIncluded:false,sourceText:'private',evidence:'private'});
assert.equal(diagnostic.continuityIncluded,false);assert.equal(diagnostic.invalidEvidenceTypeCount,1);assert.ok(!JSON.stringify(diagnostic).includes('private'));
for(const [value,reason] of [
 [{...promise,evidence:'An invented statement.'},'invalidEvidenceCount'],
 [{...promise,source_type:'invented'},'invalidEvidenceTypeCount'],
 [{...promise,lifecycle:'completed'},'invalidLifecycleCount'],
 [{...promise,kind:'unknown'},'invalidShapeCount'],
]) {
 const diagnostics={};assert.equal(validateReasonerResult({new_items:[value]},{...options,diagnostics}).length,0);
 assert.equal(diagnostics.invalidCount,1);assert.equal(diagnostics[reason],1);
}
for(const [field,value,reason] of [
 ['affected',{state_id:'missing',relation:'changed'},'invalidStateCount'],
 ['knowledge_updates',{fact_id:'key',character:'Unknown',source:'told'},'invalidActorCount'],
]) {
 const diagnostics={};validateReasonerResult({[field]:[{...value,evidence:promise.evidence,source_type:'world_fact'}]},{...options,diagnostics});assert.equal(diagnostics[reason],1);
}

// Partial success survives a failed request and a runtime restart. The next
// ordinary call includes the unfinished source and skips an exact saved entry.
const f=auxiliaryFixture();let calls=0;
f.deps.requestWithConnectionProfile=async(...args)=>{f.requests.push(args);calls++;return response([promise,{...second,evidence:'Fabricated quote.'}]);};
await f.turn(promise.evidence);await f.turn(second.evidence);await f.turn('He closes the door.');
let rec=f.records.get('room-A');
assert.equal(calls,1);assert.equal(rec.continuity.items.length,1);assert.equal(rec.lastContinuityTrace.invalidEvidenceCount,1);
assert.ok(rec.auxiliaryStateV1.pending.groups.length);assert.equal(rec.lastContinuityTrace.retryPending,true);
assert.equal(rec.auxiliaryStateV1.pending.receipts.length,1);
assert.equal(wholeDiagnosticReport({record:rec}).auxiliary.invalidEvidenceCount,1);
assert.equal(wholeDiagnosticReport({record:rec}).auxiliary.retryPending,true);
const display={innerHTML:''};
createContinuityView({document:{getElementById:()=>display},readState:()=>({settings:{continuityEnabled:true},reasonerProfiles:[]}),record:()=>rec,escapeHtml:String,continuityLabel:String}).renderContinuity();
assert.match(display.innerHTML,/원문 근거 불일치 1건/);assert.match(display.innerHTML,/다음 판독에 다시 포함/);
await f.analysis.queue(5);assert.equal(calls,1,'no immediate or duplicate output retry');
rec.auxiliaryStateV1.retryAfter=0;
f.deps.requestWithConnectionProfile=async()=>{calls++;throw new Error('Synthetic network failure');};
await f.turn('He waits by the door.');await f.turn('He listens.');assert.equal(calls,1,'partial results keep the ordinary three-output cadence');assert.equal(f.events.at(-1).reasonCode,'retry_interval_pending');assert.equal(f.events.at(-1).turnCount,2);await f.turn('He waits a little longer.');rec=f.records.get('room-A');assert.equal(rec.continuity.items.length,1);assert.equal(rec.auxiliaryStateV1.pending.receipts.length,1);
rec.auxiliaryStateV1.retryAfter=0;
f.analysis.cancel('test_restart');const restarted=createAuxiliaryRuntime(f.deps);
f.deps.requestWithConnectionProfile=async(...args)=>{calls++;f.requests.push(args);return response([second,promise]);};
for(let i=0;i<3;i++){f.context.chat.push({is_user:true,mes:'Continue.'},{is_user:false,mes:'He looks at the clock.'});await restarted.queue(f.context.chat.length-1);}
rec=f.records.get('room-A');
assert.match(f.requests.at(-1)[3].source_rp,/I will call the porter/);
assert.equal(rec.continuity.items.length,2,'reordered response must neither duplicate nor overwrite the valid promise');
assert.equal(rec.lastContinuityTrace.reusedCount,1);assert.equal(rec.lastContinuityTrace.status,'verified');assert.equal(rec.auxiliaryStateV1.pending,undefined);
assert.ok(f.requests.at(-1)[3].active_continuity.items.some(item=>item.id===rec.continuity.items[0].id),'the model receives the exact ID it can update');
assert.ok(!JSON.stringify(f.events).includes('porter'),'no dialogue in diagnostics');

// Three ordinary windows carry a promise through a changed time to completion.
const flow=auxiliaryFixture();let phase=0;
flow.deps.requestWithConnectionProfile=async(...args)=>{
 flow.requests.push(args);const state=args[3].active_continuity.items[0];
 if(phase++===0)return response([promise]);
 assert.ok(state?.id,'updates must receive the actual stored ID');
 const done=phase===3;
 return {result:{...emptyResponse().result,affected:[{state_id:state.id,relation:'changed',lifecycle:done?'completed':'active',pressure:'none',reason:done?'The key was delivered.':'The meeting moves to evening.',source_type:done?'completed_action':'promise',evidence:done?'He hands over the key.':'I will bring it this evening instead.'}]}};
};
for(const text of [promise.evidence,'A quiet reply.','He waits.','I will bring it this evening instead.','She nods.','He leaves.','He hands over the key.','She takes it.','He steps back.'])await flow.turn(text);
const completed=flow.records.get('room-A');
assert.equal(flow.requests.length,3);assert.equal(completed.continuity.items.length,1);
assert.equal(completed.continuity.items[0].lifecycle,'completed');assert.equal(completed.continuity.items[0].stateUpdates.length,2);
assert.equal(completed.lastContinuityTrace.status,'verified');

// An array position formerly occupied by another accepted entry needs a fresh ID.
const identity={...options.sourceIdentity,refs:rec.continuity.items[0].sourceRefs};
const old=validateReasonerResult({new_items:[promise]},{...options,sourceIdentity:identity});
const receiptOptions={chatRef:'room-A',chat:f.context.chat,fingerprint:f.deps.fingerprint};
const initial=pendingAnalysisReceipt(old,null,receiptOptions);
const different=validateReasonerResult({new_items:[second]},{...options,sourceText:second.evidence,sourceIdentity:identity});
const repaired=pendingAnalysisReceipt(different,initial,receiptOptions);
assert.notEqual(repaired.candidates[0].id,old[0].id);

// A valid empty result and a limit omission finish normally, without retry state.
for(const items of [[],[promise,promise,promise]]) {
 const r=auxiliaryFixture();r.deps.requestWithConnectionProfile=async()=>response(items);
 await r.turn(promise.evidence);await r.turn();await r.turn();
 assert.equal(r.records.get('room-A').lastContinuityTrace.invalidCount,0);
 assert.equal(r.records.get('room-A').auxiliaryStateV1.pending,undefined);
}
// Restoring pending references cannot resurrect edited/deleted/hidden RP.
for(const operation of ['edit','hide','delete']) {
 const r=auxiliaryFixture();r.deps.requestWithConnectionProfile=async()=>response([{...promise,evidence:'Wrong quote.'}]);
 await r.turn(promise.evidence);await r.turn();await r.turn();r.records.get('room-A').auxiliaryStateV1.retryAfter=0;
 if(operation==='edit')r.context.chat[1].mes='He makes no promise.';
 if(operation==='hide')r.context.chat[1].is_hidden=true;
 if(operation==='delete')r.context.chat.splice(0,2);
 const fresh=createAuxiliaryRuntime(r.deps);let input;
 r.deps.requestWithConnectionProfile=async(...args)=>{input=args[3];return emptyResponse();};
 for(let i=0;i<3;i++){r.context.chat.push({is_user:true,mes:'Continue.'},{is_user:false,mes:'Another reply.'});await fresh.queue(r.context.chat.length-1);}
 assert.ok(input);assert.doesNotMatch(input.source_rp,/I will bring the key at noon/);
}
console.log('Continuity recovery passed: rejection reasons, limits, partial preservation, next-output retry, restart, deduplication, ID collisions and source invalidation.');
