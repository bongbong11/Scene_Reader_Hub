import assert from 'node:assert/strict';
import {auxiliaryFixture} from './fixtures/auxiliary-runtime.mjs';
import {fixture} from './regression/audit-v012.mjs';
import {createAuxiliaryRuntime} from '../src/continuity/auxiliary-runtime.js';
import {compactContext,readCompactResult,compactInjection,COMPACT_CONTRACT,commitCompactContext} from '../src/continuity/compact-context.js';
import {selectTurnContinuity,turnContinuityInput} from '../src/continuity/turn-context.js';
import {createStateSnapshots} from '../src/lifecycle/snapshots.js';
import {rebaseExcludedDeletion} from '../src/lifecycle/message-rebase.js';
import {normalizeContinuity} from '../src/continuity/engine.js';
import {buildVerificationQuestions} from '../src/decision/policy.js';
import {createContinuityView} from '../src/ui/results/continuity.js';
import {confirmedStory,resolveRecord} from '../src/storyline/projector.js';
import {sourceRefsKey} from '../src/continuity/source-refs.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const reply=(situation='Aster is reading.',effects='Briar still doubts the explanation.')=>({result:{current_situation:situation,remaining_effects:effects}});
function setup(options){const f=auxiliaryFixture(options);f.deps.requestWithConnectionProfile=async(...args)=>{f.requests.push(args);return reply();};return f;}
const opts=f=>({record:f.deps.record(),chatRef:'room-A',chat:f.context.chat,fingerprint:f.deps.fingerprint,inherited:false});
const context=f=>f.deps.record().continuity.context;
{
 const f=setup();await f.turn();const refs=context(f).turnRefs;
 const reordered=refs.map(ref=>Object.fromEntries(Object.entries(ref).reverse()));
 assert.equal(sourceRefsKey(refs,f.deps.fingerprint),sourceRefsKey(reordered,f.deps.fingerprint),'storage field ordering cannot create a new completed-turn identity');
}
{
 const f=setup();f.deps.record().characterState={knowledge:[{character:'Aster',summary:'The library closes at dusk.'}]};
 await f.turn();assert.equal(f.requests.length,1);assert.equal(context(f).contract,COMPACT_CONTRACT);
 assert.equal(f.requests[0][3].current_turn.character,'Actor answers.');
 assert.deepEqual(Object.keys(f.requests[0][3].previous_context),['current_situation','remaining_effects']);
 assert.ok(!JSON.stringify(f.requests[0][3]).includes('new_items'));
 assert.equal(f.deps.record().characterState.knowledge.length,1);
 await f.analysis.queue(1);assert.equal(f.requests.length,1,'duplicate completion is reused');
 await f.turn('Aster answers again.');assert.equal(f.requests.length,2);
 assert.equal(f.requests[1][3].previous_context.current_situation,'Aster is reading.');
 assert.equal(f.deps.record().auxiliaryStateV1.pending.turns.length,0);
 const fieldBefore=context(f).remaining_effects;
 f.deps.requestWithConnectionProfile=async()=>({result:{current_situation:'Aster puts the book down.'}});
 await f.turn();assert.equal(context(f).remaining_effects,fieldBefore);assert.equal(f.deps.record().lastContinuityTrace.status,'partial');
 f.deps.record().auxiliaryStateV1.retryAfter=0;
 f.deps.requestWithConnectionProfile=async()=>reply('','');await f.turn();assert.equal(context(f).remaining_effects,'');assert.equal(compactInjection(context(f)),'');
 assert.equal(readCompactResult({current_situation:'A. B. C. D.',remaining_effects:''}).partial,false,'sentence count is not an admission gate');
 assert.throws(()=>readCompactResult({current_situation:[],remaining_effects:null}),{code:'CONTINUITY_FIELDS_MISSING'});
}
{
 const f=setup();await f.turn();const previous=structuredClone(context(f));
 f.deps.requestWithConnectionProfile=async()=>{throw Object.assign(new Error('Synthetic request failure'),{code:'PROFILE_AUTH_FAILED'});};
 await f.turn('Briar objects.');assert.equal(context(f).current_situation,previous.current_situation);
 assert.equal(f.deps.record().lastContinuityTrace.failure.phase,'request');
 assert.equal(f.deps.record().lastContinuityTrace.errorCode,'PROFILE_AUTH_FAILED');
 assert.equal(f.deps.record().continuity.references,undefined,'failure cannot invent code-only facts or duplicate recent RP');
 await f.turn('Aster replies.');assert.equal(f.deps.record().auxiliaryStateV1.pending.turns.length,2);
 f.deps.record().auxiliaryStateV1.retryAfter=0;
 const restarted=createAuxiliaryRuntime(f.deps);let input;
 f.deps.requestWithConnectionProfile=async(_a,_b,_c,value)=>{input=value;return reply('They discuss the objection.','Doubt remains.');};
 await restarted.resume();await restarted.completion;
 assert.equal(input.earlier_unprocessed_turns.length,1);assert.equal(f.deps.record().auxiliaryStateV1.pending.turns.length,0);
 assert.equal(f.deps.record().lastContinuityTrace.status,'verified');
}
{
 const f=setup();await f.turn('A'.repeat(40000));
 assert.equal(f.requests.length,0);assert.equal(f.deps.record().lastContinuityTrace.errorCode,'CONTINUITY_INPUT_TOO_LARGE');
 f.deps.record().auxiliaryStateV1.retryAfter=0;await f.turn('Aster reads a short note.');
 assert.equal(f.requests.length,1,'an oversized earlier turn must not starve a new turn');
 assert.equal(f.deps.record().auxiliaryStateV1.pending.turns.length,1,'unread source remains pending');
}
{
 const f=setup();let release;const calls=[];
 f.deps.requestWithConnectionProfile=async(_a,_b,_c,input)=>{calls.push(input.current_turn.character);if(calls.length===1)await new Promise(resolve=>release=resolve);return reply(input.current_turn.character,'');};
 const first=f.turn('First completed reply.');while(!release)await tick();
 const second=f.turn('Second completed reply.'),third=f.turn('Third completed reply.');
 await tick();assert.equal(f.deps.record().auxiliaryStateV1.pending.turns.length,3,'all completed references are durable while the first request is held');
 release();await Promise.all([first,second,third]);
 assert.deepEqual(calls,['First completed reply.','Second completed reply.','Third completed reply.']);
 assert.equal(context(f).current_situation,'Third completed reply.');
}
{
 const f=setup();let release;
 f.deps.requestWithConnectionProfile=async()=>{await new Promise(resolve=>release=resolve);return reply('Obsolete.','');};
 const old=f.turn();while(!release)await tick();f.analysis.cancel('profile_changed');
 f.deps.requestWithConnectionProfile=async()=>reply('Current.','');await f.turn('New reply.');release();await old;
 assert.equal(context(f).current_situation,'Current.');assert.equal(f.analysis.state.status,'success');
}
{
 const f=setup();let busy=false,release;
 f.deps.isGenerationBusy=()=>busy;
 f.deps.requestWithConnectionProfile=async()=>{await new Promise(resolve=>release=resolve);return reply();};
 const task=f.turn();while(!release)await tick();busy=true;release();await tick();
 assert.equal(context(f),undefined,'a result arriving during foreground generation waits');
 busy=false;await task;assert.ok(context(f));
}
{
 const f=setup();f.context.chat.push({is_user:false,is_system:true,mes:'OOC only.'});await f.analysis.queue(0);
 f.context.chat.push({is_user:false,is_hidden:true,mes:'Hidden RP.'});await f.analysis.queue(1);
 assert.equal(f.requests.length,0);
 const off=setup({settings:{continuityEnabled:false}});await off.turn();assert.equal(off.requests.length,0);
}
{
 const f=setup();await f.turn();const before=structuredClone(context(f));
 f.context.chat[1].is_hidden=true;const hidden=compactContext(f.deps.record(),opts(f));
 assert.equal(hidden.current_situation,'');assert.equal(hidden.fieldStatus.current_situation,'unavailable');
 assert.deepEqual(context(f),before);f.context.chat[1].is_hidden=false;
 assert.equal(compactContext(f.deps.record(),opts(f)).current_situation,before.current_situation);
 f.context.chat[1].mes='Edited RP.';assert.equal(compactContext(f.deps.record(),opts(f)).current_situation,'');
}
{
 const f=setup({chat:[{is_user:false,is_system:true,mes:'OOC note.'}]});await f.turn();
 const rec=f.deps.record(),history=[{assistantIndex:4,before:{},after:{}}];
 rec.nonRpOutputIndices=[0];f.context.chat.shift();rebaseExcludedDeletion(rec,history,0,f.deps.fingerprint);
 assert.equal(context(f).outputIndex,1);assert.equal(context(f).sourceRefs[1].messageIndex,1,'shared references must be shifted exactly once');
 assert.equal(compactContext(rec,opts(f)).current_situation,'Aster is reading.');
 const calls=f.requests.length;await f.analysis.queue(1);assert.equal(f.requests.length,calls,'coordinate-only movement does not recollect the same RP');
}
{
 const f=setup();await f.turn();const rec=f.deps.record();
 rec.continuity.items=[{id:'old-task',label:'Promise tracking must stay retired.'}];rec.continuity.followups=[{id:'old-step',action:'Force the next action.'}];
 rec.characterState={knowledge:[{character:'Aster',summary:'Aster was told the library closes at dusk.'}]};
 const selected=selectTurnContinuity({...rec.continuity,knowledge:rec.characterState.knowledge},opts(f),{enabled:true});
 assert.equal(selected.items.length,0);assert.equal(selected.followups.length,0);assert.equal(selected.knowledge.length,1);
 assert.equal(turnContinuityInput(selected).current_situation,'Aster is reading.');
 assert.ok(!JSON.stringify(buildVerificationQuestions({outputText:'Aster answers.',effects:['continuity'],eventFollowups:[{action:'Force action.'}]})).includes('continuity'));
 const normalized=normalizeContinuity(JSON.parse(JSON.stringify(rec.continuity)));assert.deepEqual(normalized.context,context(f));
 rec.pendingPlan={stateSnapshot:{continuity:{items:[],knowledge:[],revision:0}},outputIndex:1,outputText:'Completed output.'};
 const story=confirmedStory(rec,{chat:f.context.chat,fingerprint:f.deps.fingerprint,sourceChatRef:'room-A'});
 assert.equal(story.continuity.context.current_situation,'Aster is reading.','a pending progression snapshot cannot erase completed compact collection');
 const linked=resolveRecord({}, {defaultPreferences:{}},{},{id:'synthetic',state:story});
 assert.equal(linked.continuity.context.current_situation,'Aster is reading.');
 const snapshots=createStateSnapshots({}),snapshot=snapshots.reversibleStateSnapshot(rec),restored={};snapshots.restoreReversibleState(restored,snapshot);assert.deepEqual(restored.continuity.context,context(f));
 restored.continuityDiagnosticsV1={marker:'current'};restored.auxiliaryStateV1={marker:'pending'};
 snapshots.restoreReversibleState(restored,{...snapshot,continuityDiagnosticsV1:{marker:'obsolete'},auxiliaryStateV1:{marker:'obsolete'},characterStateCapture:{status:'collecting',requestId:'retired'}});
 assert.equal(restored.continuityDiagnosticsV1.marker,'current');assert.equal(restored.auxiliaryStateV1.marker,'pending');assert.equal(restored.characterStateCapture.status,'cancelled');
 const history=[{assistantIndex:0,before:{},after:{}},{assistantIndex:4,before:{},after:{}}];
 commitCompactContext(rec,history,readCompactResult(reply().result),{refs:[],key:'test',outputIndex:2},context(f));
 assert.equal(history[0].after.continuity,undefined);assert.equal(history[1].before.continuity.context.current_situation,'Aster is reading.');
}
{
 const f=setup();await f.turn();const rec=f.deps.record(),root={innerHTML:''};
 const view=createContinuityView({document:{getElementById:id=>id==='sr-continuity-results'?root:null},readState:()=>({settings:f.deps.settings,reasonerProfiles:[]}),record:()=>rec,stateChatKey:()=> 'room-A',getContext:()=>f.context,stableFingerprint:f.deps.fingerprint,escapeHtml:value=>String(value),getAnalysisState:()=>f.analysis.state});
 view.renderContinuity();assert.match(root.innerHTML,/현재 상황/);assert.match(root.innerHTML,/남은 여파/);assert.doesNotMatch(root.innerHTML,/약속·일정|후속 후보|소재 편중|3개마다/);
 assert.ok(!JSON.stringify(f.events).includes('Aster is reading.'),'diagnostics cannot contain collected RP prose');
}
{
 const f=fixture();f.ctx.chat=[{is_user:true,mes:'What does the note say?'},{is_user:false,mes:'Aster reads the note.'}];f.run(`record(true).continuity={items:[{label:'RETIRE_TASK'}],followups:[{action:'RETIRE_ACTION'}],context:{contract:6,current_situation:'Aster is discussing a note.',remaining_effects:'Doubt remains.',sourceRefs:[],fieldSources:{},processedKeys:[]}};settings.continuityEnabled=true;`);
 f.sandbox.syntheticJev=async body=>({answers:Object.fromEntries(Object.entries(body.questions).map(([key,question])=>[key,question.type==='noul'?{noul:0}:{choice:key==='scene_status'?'ordinary':Object.keys(question.criteria||{})[0],confidence:0.8}]))});
 f.run('callJev=syntheticJev;');
 const result=await f.run('runJudge({force:true})');
 assert.match(result.payload,/Current situation: Aster is discussing a note/);
 assert.doesNotMatch(result.payload,/RETIRE_TASK|RETIRE_ACTION|sourceRefs|processedKeys/);
}
console.log('Compact continuity passed: per-turn collection, partial/empty values, durable FIFO, failure recovery, no starvation, cancellation, foreground boundary, source validity, rebase, knowledge preservation, snapshots, UI and actual next-turn injection.');
