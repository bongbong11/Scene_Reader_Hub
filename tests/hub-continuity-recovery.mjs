import assert from 'node:assert/strict';
import {auxiliaryFixture} from './fixtures/auxiliary-runtime.mjs';
import {createAuxiliaryRuntime} from '../src/continuity/auxiliary-runtime.js';
const f=auxiliaryFixture();
f.deps.requestWithConnectionProfile=async()=>({result:{current_situation:'Aster asks about the note.',remaining_effects:'Doubt remains.'}});await f.turn();
const prior=structuredClone(f.deps.record().continuity.context);
f.deps.requestWithConnectionProfile=async()=>({result:{current_situation:'Aster clarifies.'}});await f.turn();
assert.equal(f.deps.record().continuity.context.remaining_effects,prior.remaining_effects);assert.equal(f.deps.record().lastContinuityTrace.status,'partial');
f.deps.record().auxiliaryStateV1.retryAfter=0;
f.deps.requestWithConnectionProfile=async()=>{throw Object.assign(new Error('Synthetic request failure'),{code:'PROFILE_TIMEOUT'});};await f.turn('A third reply.');await f.turn('A fourth reply.');
assert.equal(f.deps.record().auxiliaryStateV1.pending.turns.length,3);
const restarted=createAuxiliaryRuntime(f.deps);f.deps.record().auxiliaryStateV1.retryAfter=0;let received;
f.deps.requestWithConnectionProfile=async(_a,_b,_c,input)=>{received=input;return {result:{current_situation:'They discuss the note.',remaining_effects:''}};};
const beforeRestore=structuredClone(f.deps.record());
 restarted.restore();restarted.restore();await restarted.completion;
 assert.deepEqual(f.deps.record(),beforeRestore,'room restoration cannot change stored context or pending work');
 assert.equal(restarted.state.status,'deferred');
 assert.equal(received,undefined);
 f.context.chat.push({is_user:true,mes:'What now?'},{is_user:false,mes:'They continue discussing the note.'});
 await restarted.observe(f.context.chat.length-1);await restarted.completion;
assert.equal(received.earlier_unprocessed_turns.length,3);assert.equal(f.deps.record().auxiliaryStateV1.pending.turns.length,0);
assert.equal(f.deps.record().continuity.context.remaining_effects,'');
const calls=[];f.deps.requestWithConnectionProfile=async(...args)=>{calls.push(args);return {result:{current_situation:'They continue.',remaining_effects:''}};};
await restarted.queue(f.context.chat.length-1);assert.equal(calls.length,0);
for(const permanent of [false,true]){
 const a=auxiliaryFixture();let writes=0;
 a.deps.storagePost=async()=>{if(permanent||++writes===2)throw Object.assign(new Error('Synthetic save failure'),{code:'STORAGE_SYNTHETIC'});};
 await a.turn();assert.equal(a.deps.record().lastContinuityTrace.failure.phase,'storage');
 assert.equal(a.deps.record().continuity.context,undefined);
 assert.equal(a.deps.record().continuityDiagnosticsV1.attempt.persisted,!permanent);
}
console.log('Continuity recovery passed: partial values, durable missed turns, read-only reload and next-completed-turn recovery, deduplication and failed persistence.');
// Opening a room never performs inference, writes, or optional-extension work.
for(const mode of ['new','complete','pending','failed','disabled','hidden','edited']){
 const a=auxiliaryFixture();
 if(mode!=='new')await a.turn();
 if(['pending','failed','disabled','hidden','edited'].includes(mode)){
  a.deps.requestWithConnectionProfile=async()=>{throw Object.assign(new Error('Synthetic failure'),{code:'PROFILE_TIMEOUT'});};
  await a.turn('Unprocessed answer.');
 }
 if(mode==='disabled')a.deps.settings.continuityEnabled=false;
 if(mode==='hidden')a.context.chat[3].is_hidden=true;
 if(mode==='edited')a.context.chat[3].mes='Edited answer.';
 let vaultCalls=0,modelCalls=0;
 a.deps.window.KnowledgeVaultV1={version:'0.1.0',isEnabled:()=>true,beginAnalysis(){vaultCalls++;return null;}};
 a.deps.requestWithConnectionProfile=async()=>{modelCalls++;return {result:{current_situation:'Updated.',remaining_effects:''}};};
 const saved=structuredClone(a.deps.record()),writes=a.stored.length,entered=createAuxiliaryRuntime(a.deps);
 for(let i=0;i<3;i++){entered.cancel('chat_changed');entered.restore();await entered.completion;}
 assert.equal(modelCalls,0,mode);assert.equal(vaultCalls,0,mode);assert.equal(a.stored.length,writes,mode);
 assert.deepEqual(a.deps.record(),saved,mode);assert.equal(entered.busy,false);
 if(['pending','failed','edited'].includes(mode))assert.equal(entered.state.status,'deferred',mode);
 if(mode==='complete')assert.equal(entered.state.status,'restored');
 if(mode==='disabled'||mode==='new')assert.equal(entered.state,null);
}
console.log('Room restore passed: no model/Vault calls or writes; pending, failure, disabled and changed-source records preserved.');
