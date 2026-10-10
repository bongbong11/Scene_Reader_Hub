import assert from 'node:assert/strict';
import {auxiliaryFixture,emptyResponse} from './fixtures/auxiliary-runtime.mjs';
import {createSessionTransaction} from '../src/storage/session-transaction.js';
const f=auxiliaryFixture();await f.turn();await f.turn();assert.equal(f.requests.length,0);
f.deps.requestWithConnectionProfile=async(...args)=>{f.requests.push(args);return {result:{...emptyResponse().result,new_items:[{kind:'commitment',label:'Meet at noon',lifecycle:'active',owners:['Actor'],source_type:'promise',evidence:'I will meet you at noon.'}]}};};
await f.turn('I will meet you at noon.');assert.equal(f.requests.length,1);
const rec=f.records.get('room-A');assert.equal(rec.pendingContinuityCandidates.length,1);assert.equal(rec.pendingContinuityCandidates[0].sourceIdentity.sourceRevision,'source');
assert.equal(rec.characterEvolutionV1,undefined);assert.equal(rec.analysisRuntimeV1,undefined);
assert.doesNotMatch(f.requests[0][2],/character_changes|baseline_records|record_reviews/);
await f.analysis.queue(5);assert.equal(f.requests.length,1,'duplicate completion is not billed twice');
for(const settings of [{enabled:false},{continuityEnabled:false},{reasonerProfileId:''}]){const disabled=auxiliaryFixture({settings});await disabled.turn();await disabled.turn();await disabled.turn();assert.equal(disabled.requests.length,0);}
for(const message of [{is_user:true,mes:'User'},{is_user:false,is_hidden:true,mes:'Hidden'},{is_user:false,mes:'(OOC: Explain this.)'},{is_user:false,mes:'',extra:{ooc_chat:true}}]){const skip=auxiliaryFixture({chat:[message]});await skip.analysis.queue(0);assert.equal(skip.requests.length,0);}
// The optional vault keeps its per-output call, even with continuity off.
let commits=0,abandons=0;const vault=auxiliaryFixture({settings:{continuityEnabled:false}});
vault.deps.window.KnowledgeVaultV1={version:'0.1.0',isEnabled:()=>true,beginAnalysis:()=>({token:'token',input:{cards:[]},system:'VAULT_AUDIT',count:1}),analysisCurrent:()=>true,commitAnalysis:async()=>{commits++;return {status:'succeeded'};},abandonAnalysis:()=>abandons++};
await vault.turn();assert.equal(vault.requests.length,1);assert.equal(commits,1);assert.equal(abandons,1);assert.match(vault.requests[0][2],/VAULT_AUDIT/);assert.doesNotMatch(vault.requests[0][2],/CONTINUITY_REASONER/);
vault.deps.window.KnowledgeVaultV1.isEnabled=()=>false;await vault.turn();assert.equal(vault.requests.length,1);
// A malformed ordinary section may not delete the prior valid candidates.
const malformed=auxiliaryFixture();const pending=[{id:'ordinary'}];malformed.records.get('room-A').pendingContinuityCandidates=pending;
malformed.deps.requestWithConnectionProfile=async()=>({result:{topic_fixation:null}});await malformed.turn();await malformed.turn();await malformed.turn();assert.deepEqual(malformed.records.get('room-A').pendingContinuityCandidates,pending);
// Edits, hide, stop and room switch while a real request is pending discard its result.
for(const operation of ['edit','hide','switch','stop']){
 const r=auxiliaryFixture();let resolve;await r.turn();await r.turn();
 r.deps.requestWithConnectionProfile=()=>new Promise(done=>{resolve=done;});
 const run=r.turn();while(!resolve)await new Promise(done=>setImmediate(done));
 if(operation==='edit')r.context.chat[5].mes='Changed';
 if(operation==='hide')r.context.chat[5].is_hidden=true;
 if(operation==='switch')r.deps.stateChatKey=()=> 'room-B';
 if(operation==='stop')r.analysis.cancel('generation_stopped');
 resolve(emptyResponse());assert.equal((await run).status,'cancelled');assert.equal(r.stored.length,0);
}
// Network and persistence failures retain the last good state and terminate.
for(const kind of ['network','storage']){const r=auxiliaryFixture();r.records.get('room-A').relationshipState={trust:'keep'};if(kind==='network')r.deps.requestWithConnectionProfile=async()=>{throw new Error('failure');};else r.deps.storagePost=async()=>{throw new Error('failure');};await r.turn();await r.turn();assert.equal((await r.turn()).status,'failed');assert.equal(r.analysis.busy,false);assert.deepEqual(r.records.get('room-A').relationshipState,{trust:'keep'});}
// Failed/stale writes cannot publish or erase the current ordinary state.
for(const scenario of ['normal','invalid','save-failed','stale-after-save']){
 const run=async(factory)=>{const r=auxiliaryFixture();let valid=true;r.records.get('room-A').preferences={keep:true};const write=r.deps.storagePost;r.deps.storagePost=async(route,body)=>{if(scenario==='save-failed')throw new Error('fail');await write(route,body);if(scenario==='stale-after-save')valid=false;};
 const service=factory(r.deps),commit=service.commitSession||service.commitDeltaTransaction;let result;
 try{result=await commit('room-A',({current,history})=>{current.visibilityStateV1={status:'applied'};return {chat:current,history};},()=>scenario!=='invalid'&&valid);}catch{result='failed';}
 return {result,record:r.records.get('room-A'),writes:r.stored};};
 const outcome=await run(createSessionTransaction);
 assert.equal(outcome.result,scenario==='normal'?true:scenario==='save-failed'?'failed':false,scenario);
 assert.deepEqual(outcome.record.preferences,{keep:true});
 assert.equal(outcome.record.visibilityStateV1?.status,scenario==='normal'?'applied':undefined);
 assert.equal(outcome.writes.length,scenario==='normal'?1:scenario==='stale-after-save'?2:0);
}
assert.ok(!JSON.stringify(f.events).includes('meet you'));
console.log('Auxiliary preservation passed: ordinary continuity, no evolution, disabled/OOC/hidden, vault independence, cancellation, failure, deduplication and transaction equivalence.');
