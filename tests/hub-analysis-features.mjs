import assert from 'node:assert/strict';
import {createRecordBank} from '../src/character/records.js';
import {stableFingerprint as hash} from '../src/decision/policy.js';
import {baseRecordRef,effectiveRecord,confirmedEvolution,validateCompactRecord} from '../src/character/evolution.js';
import {normalizeAnalysisRuntime} from '../src/continuity/analysis-contract.js';
import {observeCompletedTurn,buildAnalysisWindow,pendingTurnCount,validateSourceRefs,pruneAnalysisRuntime} from '../src/continuity/analysis-window.js';
import {validateDeltaPacket} from '../src/continuity/delta-validation.js';
import {stageDeltaCommit,invalidateDeltasFrom,createDeltaCommit} from '../src/continuity/delta-commit.js';
import {pendingDeltas,commitFrameDeltas} from '../src/continuity/delta-verification.js';
import {buildLiveCharacterPlan,buildCharacterInjection,resolveLiveCharacterPlan} from '../src/character/live.js';
import {buildMemoryStateBlock} from '../src/injection/memory-state.js';
import {createAnalysisScheduler} from '../src/continuity/analysis-scheduler.js';
import {createAnalysisRuntime} from '../src/continuity/analysis-runtime.js';
import {continuityView,migrateKnowledge} from '../src/continuity/state-adapter.js';
import {confirmedStory,resetRuntime} from '../src/storyline/projector.js';
import {wholeDiagnosticReport} from '../src/debug/whole-report.js';

const original={type:'relationship',target:'Blake',when:['always'],rule:'Tends to distrust Blake and keeps distance from Blake even while cooperating.',modality:'tendency',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'};
const arden={id:'a',kind:'character',name:'Arden',source:'Arden distrusts Blake even while cooperating.',sourceVisibleToMain:true};
arden.recordBank=createRecordBank({entity_type:'character',entity_name:'Arden',intimacy_reference:{text:'',source_ids:[]},records:[original]},arden,'baseline-A');
const blake={id:'b',name:'Blake',kind:'character',source:''},casey={id:'c',name:'Casey',kind:'character',source:''};
const store={enabled:true,characters:[arden,blake,casey],npcs:[],persona:null};
const chat=[{is_user:true,mes:'I help Arden with the task.'},{is_user:false,mes:'Arden says, "Blake, I trust you with this task."'}];
const opts={chatRef:'room',chat,fingerprint:hash,outputIndex:1,generationType:'normal'};
const runtime=observeCompletedTurn(null,opts),window=buildAnalysisWindow(runtime,opts);
const base={ref:'b0',actorId:'a',baseRef:baseRecordRef(arden.recordBank,original,0,hash),record:original};
const raw={protocol:1,coverage:{memory:'complete',characters:'complete',persona:'not_requested'},memory_changes:[],knowledge_changes:[],deferred_changes:[],character_changes:[{actor_id:'a',target_ids:['b'],base_ref:'b0',op:'exception',record_type:'relationship',compact_rule:'Trusts Blake with this task; still guards private matters.',state_summary:null,epistemic:'established',source_type:'world_fact',evidence:[{ref:'r1',quote:'Blake, I trust you with this task.'}]}]};
const validate=value=>validateDeltaPacket(value,{window,actors:[arden,blake,casey],bases:[base],state:{items:[],knowledge:[]},evolution:{entries:[]},fingerprint:hash});
const packet=validate(raw);assert.equal(packet.candidates.length,1);
const initial={analysisRuntimeV1:{...runtime,pendingBatches:[packet]},continuity:{items:[],knowledge:[],dependencies:[],followups:[],revision:0},characterState:{knowledge:[],revision:0}};
const accepted=stageDeltaCommit(initial,packet.candidates,{continuity_delta_0:{choice:'supported',confidence:0.2}}).record;
assert.equal(accepted.characterEvolutionV1.entries.length,1,'evidenced Jev answer does not get discarded by an unrelated confidence threshold');
assert.equal(stageDeltaCommit(accepted,packet.candidates,{continuity_delta_0:{choice:'supported'}}).accepted.length,0,'idempotent confirmation');
assert.deepEqual(arden.recordBank.records,[original],'canonical bank is immutable');
assert.equal(effectiveRecord(original,arden,accepted.characterEvolutionV1,hash,{actorIds:['a','b']}).rule,raw.character_changes[0].compact_rule);
assert.equal(effectiveRecord(original,arden,accepted.characterEvolutionV1,hash,{actorIds:['a','c']}).rule,original.rule,'A-to-B exception never applies to C');
assert.equal(effectiveRecord(original,{...arden,recordBank:{...arden.recordBank,analysisId:'replacement'}},accepted.characterEvolutionV1,hash,{actorIds:['b']}).rule,original.rule,'replaced file invalidates old changes');
assert.equal(validateCompactRecord(original,'x'.repeat(original.rule.length+1)),false);
assert.equal(validateCompactRecord(original,'界'.repeat(60)),false,'UTF-8 bound as well as character count');
const longer=structuredClone(raw);longer.character_changes[0].compact_rule='x'.repeat(200);longer.character_changes[0].state_summary='Arden trusted Blake for one task.';
const longPacket=validate(longer),longResult=stageDeltaCommit({...initial,analysisRuntimeV1:{...runtime,pendingBatches:[longPacket]}},longPacket.candidates,{continuity_delta_0:{choice:'supported'}}).record;
assert.equal(longResult.characterEvolutionV1.entries[0].status,'needs_review','over-budget rewrite is never a second conflicting instruction');
assert.equal(buildMemoryStateBlock(longResult,{actors:[arden,blake],store}).text,'');
const wrong=structuredClone(raw);wrong.character_changes[0].actor_id='c';assert.equal(validate(wrong).candidates.length,0);
const unscoped=structuredClone(raw);unscoped.character_changes[0].compact_rule='Now trusts everyone completely.';assert.equal(validate(unscoped).candidates.length,0);
const misplaced=structuredClone(raw);misplaced.character_changes[0].target_ids=['c'];misplaced.character_changes[0].compact_rule='Trusts Casey with this task.';assert.equal(validate(misplaced).candidates.length,0,'a Blake baseline cannot be assigned to Casey');
const forged=structuredClone(raw);forged.character_changes[0].evidence[0].quote='Never said this';assert.equal(validate(forged).candidates.length,0);
const plan=buildLiveCharacterPlan([arden,blake],{canonicalOnly:true,transcript:'Arden and Blake discuss work.',evolution:accepted.characterEvolutionV1,fingerprint:hash});
const decisions={character_0_presence:'active',character_0_record_0:'yes',character_1_presence:'absent'};
const injection=buildCharacterInjection(resolveLiveCharacterPlan(plan,decisions)).text;
assert.ok(injection.includes(raw.character_changes[0].compact_rule));assert.ok(!injection.includes(original.rule));
assert.equal(buildMemoryStateBlock(accepted,{actors:[arden,blake],store}).text,'','same changed rule is not repeated as an overlay');
const unchanged=buildCharacterInjection(resolveLiveCharacterPlan(buildLiveCharacterPlan([arden],{canonicalOnly:true,transcript:'Arden discusses work.'}),decisions)).text;
assert.ok(unchanged.includes(original.rule),'feature off keeps canonical behavior');
const refs=packet.candidates[0].evidence.map(e=>e.identity);
assert.ok(validateSourceRefs(refs,opts));chat[1].is_hidden=true;
assert.equal(validateSourceRefs(refs,opts),false);assert.ok(validateSourceRefs(refs,{...opts,allowHidden:true}),'already confirmed hidden facts survive');
chat[1].is_hidden=false;const old=chat[1].mes;chat[1].mes='Arden refuses.';
assert.equal(confirmedEvolution(accepted,{...opts,store}).entries.length,0,'stale proof cannot inject even after a failed cancellation save');chat[1].mes=old;
const reverted=structuredClone(accepted);invalidateDeltasFrom(reverted,1,{chatRef:'room'});assert.equal(reverted.characterEvolutionV1.entries.length,0);
const imported=confirmedStory({...accepted,pendingPlan:{stateSnapshot:{characterEvolutionV1:accepted.characterEvolutionV1}}},{chat,fingerprint:hash,sourceChatRef:'room'});
assert.equal(imported.characterEvolutionV1.entries.length,1);assert.ok(!('analysisRuntimeV1' in imported));assert.ok(!('characterEvolutionV1' in resetRuntime(accepted)));
const large={continuity:{knowledge:Array.from({length:75},(_,i)=>({factId:String(i),character:'a'}))}};migrateKnowledge(large);assert.equal(large.characterState.knowledge.length,75);

// Logical turns, reroll/continue, blank input, OOC and partial source coverage.
let turns=null;const transcript=[];
for(let i=0;i<5;i++){transcript.push({is_user:true,mes:i===2?'':`User ${i}`},{is_user:false,mes:`Answer ${i}`});turns=observeCompletedTurn(turns,{chatRef:'t',chat:transcript,outputIndex:transcript.length-1,fingerprint:hash,generationType:'normal'});}
assert.equal(turns.turnRefs.length,5);assert.equal(pendingTurnCount(turns,{chat:transcript}),5);
turns=observeCompletedTurn(turns,{chatRef:'t',chat:transcript,outputIndex:9,fingerprint:hash,generationType:'swipe'});assert.equal(turns.turnRefs.length,5);
transcript[9].mes+=' continued';turns=observeCompletedTurn(turns,{chatRef:'t',chat:transcript,outputIndex:9,fingerprint:hash,generationType:'continue'});assert.equal(turns.turnRefs.length,5);
const longChat=[{is_user:true,mes:'Question'},{is_user:false,mes:'a'.repeat(50000)}];let carry=observeCompletedTurn(null,{chatRef:'long',chat:longChat,outputIndex:1,generationType:'normal',fingerprint:hash});
for(let i=0;i<4;i++){const w=buildAnalysisWindow(carry,{chatRef:'long',chat:longChat,fingerprint:hash});assert.ok(w.segments.map(s=>s.text).join('').length<=18000);if(!w.segments.length)break;carry.rangeLedger.push({refs:w.sourceRefs,coverage:{continuity:'complete',evolution:'complete',persona:'not_requested'}});}
assert.equal(pendingTurnCount(carry,{chat:longChat}),0);carry=pruneAnalysisRuntime(carry,{chat:longChat});assert.equal(carry.turnRefs.length,0);assert.equal(carry.rangeLedger.length,0);
const hole=normalizeAnalysisRuntime(runtime);hole.rangeLedger=[{refs:[{...window.sourceRefs[1],part:{start:5,end:500}}],coverage:{continuity:'complete',evolution:'complete'}}];assert.equal(pendingTurnCount(hole,{chat}),1,'a later range cannot conceal an earlier gap');
assert.equal(observeCompletedTurn(null,{...opts,chat:[{is_user:false,mes:'Greeting'}],outputIndex:0,generationType:'',cycleId:'incidental'}).turnRefs.length,0);
assert.equal(observeCompletedTurn(null,{...opts,chat:[{is_user:true,mes:'[OOC: instructions]'},{is_user:false,mes:'[OOC: answer]'}]}).turnRefs.length,0);

// Publish-after-save, concurrent UI edit preservation, and failed durable save.
let live=structuredClone(initial),durable=structuredClone(live),fail=false,hold=null;
const records=new Map([['room',live]]),historyCache=new Map([['room',[]]]);
const commit=createDeltaCommit({queueWrite:(_key,task)=>task(),chatRecords:records,stateHistoryCache:historyCache,fingerprint:hash,loadStateHistory:async()=>[],storagePost:async(_route,data)=>{if(fail)throw new Error('Synthetic failure');if(hold){const wait=hold;hold=null;await wait;}durable=structuredClone(data.chat);}}).commitDeltaTransaction;
fail=true;await assert.rejects(commit('room',({current,history})=>({chat:{...current,test:1},history})));assert.ok(!records.get('room').test);fail=false;
let release;hold=new Promise(r=>release=r);const saving=commit('room',({current,history})=>({chat:{...current,test:1},history}));await new Promise(r=>setImmediate(r));records.get('room').userSetting='new';release();assert.equal(await saving,false);assert.equal(durable.userSetting,'new');assert.ok(!durable.test);
const privateReport=wholeDiagnosticReport({execution:{},judgment:null,record:accepted,chat,fingerprint:hash});assert.equal(JSON.stringify(privateReport).includes('Blake'),false);assert.equal(JSON.stringify(privateReport).includes('trust you'),false);

// Detached scheduling, provider failures and collection without Jev triggers.
function environment(interval=3){
 const ctx={chat:[],name2:'Arden'},settings={enabled:true,continuityEnabled:true,continuityInterval:interval,collectPersonaChanges:false,reasonerProfileId:'synthetic'};
 const map=new Map([['runtime',{continuity:{items:[],knowledge:[],dependencies:[],followups:[],revision:0}}]]),events=[],requests=[];let networkFail=false;
 const deps={settings,characterStore:{enabled:false,characters:[],npcs:[],persona:null},window:{},stateChatKey:()=> 'runtime',getContext:()=>ctx,record:()=>map.get('runtime'),chatRecords:map,stateHistoryCache:new Map(),queueWrite:(_key,task)=>task(),loadStateHistory:async()=>[],storagePost:async()=>{},fingerprint:hash,renderAll(){},selectActiveEntries:()=>[],hub:{snapshot:()=>({state:{status:'prepared'}}),subscribe:()=>()=>{}},noteDiagnostic:(stage,detail)=>events.push({stage,...detail}),connectionRequestService:{},requestWithConnectionProfile:async(_service,_profile,system,input,options)=>{requests.push({system,input,options});if(networkFail)throw Object.assign(new Error('Synthetic timeout'),{code:'PROFILE_TIMEOUT'});return {result:{protocol:1,coverage:{memory:'complete',characters:'complete',persona:'not_requested'},memory_changes:[],knowledge_changes:[],character_changes:[],deferred_changes:[],topic_fixation:null}};}};
 return {ctx,settings,map,events,requests,analysis:createAnalysisRuntime(deps),fail(){networkFail=true;}};
}
for(const interval of [3,5]){const f=environment(interval);for(let i=1;i<=interval;i++){f.ctx.chat.push({is_user:true,mes:`User ${i}`},{is_user:false,mes:`Answer ${i}`});await f.analysis.queue(f.ctx.chat.length-1,{generationType:'normal'});assert.equal(f.requests.length,i===interval?1:0);}assert.equal(f.requests[0].options.maxTokens,8192);assert.equal(f.requests[0].options.timeoutMs,120000);assert.equal(f.map.get('runtime').analysisRuntimeV1.lastRun.status,'empty');assert.equal(f.map.get('runtime').analysisRuntimeV1.turnRefs.length,0);}
const off=environment();off.settings.continuityEnabled=false;off.ctx.chat=structuredClone(chat);await off.analysis.queue(1,{generationType:'normal',manual:true});assert.equal(off.requests.length,0);assert.equal(off.map.get('runtime').analysisRuntimeV1,undefined);
const failure=environment();failure.fail();for(let i=0;i<3;i++){failure.ctx.chat.push({is_user:true,mes:'Hi'},{is_user:false,mes:'Reply'});await failure.analysis.queue(failure.ctx.chat.length-1,{generationType:'normal'});}assert.equal(failure.map.get('runtime').analysisRuntimeV1.lastRun.reasonCode,'PROFILE_TIMEOUT');assert.equal(failure.map.get('runtime').analysisRuntimeV1.turnRefs.length,3);assert.ok(!failure.map.get('runtime').characterEvolutionV1);
let finish,aborted=false;const scheduler=createAnalysisScheduler();const pending=scheduler.request(async({signal})=>{await new Promise(resolve=>{finish=resolve;signal.addEventListener('abort',()=>{aborted=true;resolve();});});});await Promise.resolve();scheduler.cancel();await pending;assert.ok(aborted);assert.equal(scheduler.busy,false);
assert.equal(pendingDeltas(initial,{...opts,store,enabled:true}).length,1);
const frame={rec:structuredClone(initial)},run={history:[{assistantIndex:1,before:{},after:{}},{assistantIndex:3,before:{},after:{}}]};commitFrameDeltas(frame,run,packet.candidates,{continuity_delta_0:{choice:'supported'}});assert.ok(!run.history[0].before.characterEvolutionV1?.entries.length);assert.equal(run.history[0].after.characterEvolutionV1.entries.length,1);
console.log('Cumulative analysis: compact replacement, scopes, no duplicates, proof invalidation, logical turns, partial coverage, atomic save, portability, privacy, 3/5 scheduling and isolated failures passed.');

const brokenObservers=createAnalysisScheduler({onError(){throw new Error('Synthetic observer failure');},onSettled(){throw new Error('Synthetic rendering failure');}});await assert.doesNotReject(brokenObservers.request(async()=>{throw new Error('Synthetic network failure');}));assert.equal(brokenObservers.busy,false);

const newer=structuredClone(accepted),older=structuredClone(packet.candidates[0]);newer.analysisJournalV1=[];newer.characterEvolutionV1.entries[0].evidenceRefs[0].messageIndex=5;older.id='older-proposal';older.prior=structuredClone(newer.characterEvolutionV1.entries[0]);older.data.existingId=older.prior.id;newer.analysisRuntimeV1.pendingBatches[0].candidates=[older];
const chronological=stageDeltaCommit(newer,[older],{continuity_delta_0:{choice:'supported'}});assert.equal(chronological.accepted.length,0);assert.equal(chronological.record.analysisRuntimeV1.pendingBatches[0].candidates[0].reasonCode,'older_source');assert.deepEqual(chronological.record.characterEvolutionV1.entries,newer.characterEvolutionV1.entries,'recovered old evidence cannot revert a newer confirmed change');
