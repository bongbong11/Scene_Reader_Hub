import assert from 'node:assert/strict';
import {auxiliaryFixture} from './fixtures/auxiliary-runtime.mjs';
import {fixture} from './regression/audit-v012.mjs';
import {createVisibilityLifecycle} from '../src/lifecycle/visibility.js';
import {messageRef} from '../src/continuity/source-refs.js';
import {confirmedContinuity} from '../src/continuity/selection.js';

const a=auxiliaryFixture();let writes=0,failed=true;
const life=createVisibilityLifecycle({...a.deps,invalidateReasonerJobs(){},storagePost:async()=>{writes++;if(failed)throw new Error('Synthetic save failure');}});
a.context.chat.push({is_user:false,mes:'Aster reads.'});await life.check();
a.context.chat[0].is_hidden=true;await life.check();failed=false;await life.check();
assert.equal(writes,2);assert.equal(a.records.get('room-A').visibilityStateV1.status,'applied');

const f=fixture();
f.ctx.chat=[{is_user:false,is_system:true,mes:'OOC: a note.'},{is_user:false,mes:'Aster knows the library hours.'}];
f.run(`record(true).nonRpOutputIndices=[0];record().characterStateEvents=[{outputIndex:1,swipeId:0,fingerprint:stableFingerprint(getContext().chat[1].mes),states:[{id:'a',values:{joy:20}}]}];messageSnapshots.set(stateChatKey(),messageSnapshot(getContext().chat));`);
const key=f.run('stateChatKey()');
f.sandbox.syntheticRef=messageRef(key,f.ctx.chat,1,f.sandbox.stableFingerprint);
f.run(`record().continuity={items:[],knowledge:[{factId:'hours',character:'Aster',sourceRefs:[syntheticRef]}],dependencies:[],followups:[]};`);
f.ctx.chat.splice(0,1);await f.run(`rollbackChangedOutput(0,'deleted')`);
const rec=JSON.parse(f.run('JSON.stringify(record())'));
assert.equal(rec.characterStateEvents[0].outputIndex,0);
assert.equal(confirmedContinuity(rec.continuity,{record:rec,chatRef:key,chat:f.ctx.chat,fingerprint:f.sandbox.stableFingerprint}).knowledge.length,1);

f.ctx.chat=[{is_user:false,mes:'Aster answers.',swipe_id:0}];
let resolveRequest;
f.sandbox.syntheticEmotionRequest=()=>new Promise(resolve=>resolveRequest=resolve);
f.run(`record(true).preferences.profileEmotionJudgment=true;characterStore={enabled:true,characters:[{id:'a',kind:'character',name:'Aster'}],npcs:[]};settings.reasonerProfileId='synthetic';connectionRequestService={};requestWithConnectionProfile=syntheticEmotionRequest;`);
const task=f.run(`scheduleProfileStateCollection({chatKey:stateChatKey(),outputIndex:0,text:getContext().chat[0].mes,roster:[{id:'a',code:'C0',kind:'character',name:'Aster',trackArousal:true}]})`);
await new Promise(resolve=>setImmediate(resolve));
f.run(`invalidateReasonerJobs({reason:'generation_stopped'})`);
assert.equal(f.run('record().characterStateCapture.status'),'cancelled');
resolveRequest({result:{states:[]}});await task;
assert.equal(f.run('pendingProfileStateRequests.size'),0);
assert.equal(f.run('record().characterStateCapture.status'),'cancelled');
console.log('Message recovery passed: retry unchanged hidden state, rebase excluded deletion, retain RP evidence/emotions and finish cancelled capture.');
