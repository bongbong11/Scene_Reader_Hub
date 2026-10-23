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
await restarted.resume();await restarted.completion;
assert.equal(received.earlier_unprocessed_turns.length,2);assert.equal(f.deps.record().auxiliaryStateV1.pending.turns.length,0);
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
console.log('Continuity recovery passed: partial values, durable missed turns, reload recovery without three-turn delay, deduplication and failed persistence.');