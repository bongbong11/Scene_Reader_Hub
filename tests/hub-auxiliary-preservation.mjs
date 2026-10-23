import assert from 'node:assert/strict';
import {auxiliaryFixture,emptyResponse} from './fixtures/auxiliary-runtime.mjs';
import {createSessionTransaction} from '../src/storage/session-transaction.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const f=auxiliaryFixture();await f.turn();await f.turn();assert.equal(f.requests.length,2);
assert.equal(f.deps.record().lastContinuityTrace.status,'verified');assert.equal(f.deps.record().characterEvolutionV1,undefined);assert.equal(f.deps.record().analysisRuntimeV1,undefined);
assert.doesNotMatch(f.requests[0][2],/character_changes|baseline_records|record_reviews|new_items|possible_followups/);
await f.analysis.queue(3);assert.equal(f.requests.length,2);
for(const settings of [{enabled:false},{continuityEnabled:false},{reasonerProfileId:''}]){const disabled=auxiliaryFixture({settings});await disabled.turn();assert.equal(disabled.requests.length,0);}
for(const message of [{is_user:true,mes:'User'},{is_user:false,is_hidden:true,mes:'Hidden'},{is_user:false,mes:'(OOC: Explain this.)'},{is_user:false,mes:'',extra:{ooc_chat:true}}]){const skip=auxiliaryFixture({chat:[message]});await skip.analysis.queue(0);assert.equal(skip.requests.length,0);}
for(const enabled of [false,true]){
 let commits=0,failures=0;const vault=auxiliaryFixture({settings:{continuityEnabled:enabled}});
 vault.deps.window.KnowledgeVaultV1={version:'0.1.0',isEnabled:()=>true,beginAnalysis:()=>({token:'token',input:{cards:[]},system:'VAULT_AUDIT',count:1}),analysisCurrent:()=>true,commitAnalysis:async()=>{commits++;return {status:'succeeded'};},abandonAnalysis(){},failAnalysis(){failures++;}};
 vault.deps.requestWithConnectionProfile=async(...args)=>{vault.requests.push(args);return {result:{vault_results:[]}};};
 await vault.turn();assert.equal(commits,1,'valid Vault results survive an independent continuity-format failure');assert.equal(failures,0);
 assert.equal(vault.requests.length,1);assert.equal(Boolean(vault.deps.record().lastContinuityTrace),enabled);
 vault.deps.record().auxiliaryStateV1={retryAfter:Date.now()+30000,pending:{turns:[]}};
 await vault.turn();assert.equal(commits,2,'continuity backoff must not change Vault cadence');
}
for(const operation of ['edit','hide','switch','stop']){
 const r=auxiliaryFixture();let resolve;r.deps.requestWithConnectionProfile=()=>new Promise(done=>resolve=done);
 const run=r.turn();while(!resolve)await tick();
 if(operation==='edit')r.context.chat[1].mes='Changed';if(operation==='hide')r.context.chat[1].is_hidden=true;
 if(operation==='switch')r.deps.stateChatKey=()=> 'room-B';if(operation==='stop')r.analysis.cancel('generation_stopped');
 resolve(emptyResponse());assert.equal((await run).status,'cancelled');assert.equal(r.records.get('room-A').continuity.context,undefined);
 assert.equal(r.events.some(event=>event.code==='analysis_cancelled'),operation!=='switch');
 assert.ok(!r.events.some(event=>event.code==='analysis_result'&&event.status==='succeeded'));
}
for(const kind of ['network','storage']){
 const r=auxiliaryFixture();r.deps.record().relationshipState={trust:'keep'};
 if(kind==='network')r.deps.requestWithConnectionProfile=async()=>{throw new Error('Synthetic failure');};else r.deps.storagePost=async()=>{throw new Error('Synthetic failure');};
 assert.equal((await r.turn()).status,'failed');assert.equal(r.analysis.busy,false);assert.deepEqual(r.deps.record().relationshipState,{trust:'keep'});
}
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

console.log('Auxiliary preservation passed: per-turn work, no evolution, independent Vault, cancellation, failure and serialized transaction ownership.');
