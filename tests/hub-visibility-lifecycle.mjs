import assert from 'node:assert/strict';
import {auxiliaryFixture} from './fixtures/auxiliary-runtime.mjs';
import {createVisibilityLifecycle} from '../src/lifecycle/visibility.js';
import {visibilityKey} from '../src/context/visibility.js';
import {confirmedContinuity} from '../src/continuity/selection.js';
import {messageRef} from '../src/continuity/source-refs.js';
for(const afterSend of [false,true]){
 const f=auxiliaryFixture({chat:[{is_user:true,mes:'A promise?'},{is_user:false,mes:'I will return.'}]}),notes=[];
 const rec=f.records.get('room-A');rec.lastJudgment={visibilityKeyV1:visibilityKey(f.context.chat),payload:'old'};rec.continuity.items=[{id:'ordinary',label:'A promise',sourceRefs:[messageRef('room-A',f.context.chat,1,f.deps.fingerprint)]}];rec.relationshipState={trust:'keep'};
 const life=createVisibilityLifecycle({...f.deps,invalidateReasonerJobs:()=>f.analysis.cancel('visibility_changed'),getInjection:()=>({requestSent:afterSend}),notify:m=>notes.push(m)});
 await life.check();assert.equal(f.stored.length,0);
 f.context.chat[1].is_system=true;await life.check();
 assert.equal(f.records.get('room-A').lastJudgment,null);assert.equal(notes.length,1);assert.equal(f.requests.length,0);
 assert.deepEqual(f.records.get('room-A').relationshipState,{trust:'keep'});
 assert.equal(f.records.get('room-A').continuity.items.length,1,'hide retains data');
 const visible=()=>confirmedContinuity(f.records.get('room-A').continuity,{record:f.records.get('room-A'),chatRef:'room-A',chat:f.context.chat,fingerprint:f.deps.fingerprint});
 assert.equal(visible().items.length,0,'hide excludes its evidence');
 f.context.chat[1].is_system=false;await life.check();assert.equal(visible().items.length,1);assert.equal(notes.length,2);
 await life.check();assert.equal(notes.length,2,'unchanged visibility is free');
}
for(const mode of ['failed-save','switch']){
 const f=auxiliaryFixture({chat:[{is_user:false,mes:'Visible'}]}),events=[];let release,writes=0;
 const life=createVisibilityLifecycle({...f.deps,stateChatKey:()=>f.deps.stateChatKey(),noteDiagnostic:(c,d)=>events.push(d),invalidateReasonerJobs(){},storagePost:async()=>{if(mode==='failed-save')throw new Error('synthetic');if(!writes++)await new Promise(r=>release=r);}});
 await life.check();f.context.chat[0].is_hidden=true;const job=life.check();
 if(mode==='switch'){while(!release)await new Promise(r=>setImmediate(r));f.deps.stateChatKey=()=> 'room-B';release();}
 await job;assert.equal(f.records.get('room-A').visibilityStateV1,undefined);if(mode==='failed-save')assert.ok(events.some(e=>e.code==='VISIBILITY_FAILED'));
}
console.log('Visibility lifecycle passed: hide/unhide retains ordinary state, excludes evidence, clears stale injection, no model call, deduplication and failed-save isolation.');
