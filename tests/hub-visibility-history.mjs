import {confirmedStory,resolveRecord} from '../src/storyline/projector.js';
import assert from 'node:assert/strict';
import {createAnalysisRuntime} from '../src/continuity/analysis-runtime.js';
import {createHistoryAnalysis} from '../src/continuity/history-analysis.js';
import {createChangeReview} from '../src/continuity/change-review.js';
import {createVisibilityLifecycle} from '../src/lifecycle/visibility.js';
import {readHistorySources} from '../src/memory/history-sources.js';
import {observeManualWindow,buildAnalysisWindow} from '../src/continuity/analysis-window.js';
import {baselinePage} from '../src/continuity/baseline-coverage.js';
import {confirmedEvolution,effectiveRecord} from '../src/character/evolution.js';
import {notifyAutomaticAnalysis} from '../src/ui/analysis-actions.js';
import {visibilityKey} from '../src/context/visibility.js';
import {MEMORY_REFERENCE_ENABLED} from '../src/context/memory.js';
import {stableFingerprint as hash} from '../src/decision/policy.js';
const empty=(input={})=>({result:{protocol:1,record_reviews:(input.baseline_records||[]).map(b=>({base_ref:b.ref,status:'keep',reason_ko:'변화 근거 없음'})),coverage:{memory:'complete',characters:'complete',persona:'not_requested'},memory_changes:[],knowledge_changes:[],character_changes:[],deferred_changes:[]}});
function fixture(){
 const ctx={chat:[{is_user:true,mes:'Player offers a hand.'},{is_user:false,mes:'Actor accepts the hand and trusts Player.'}],name2:'Actor',characterId:0,characters:[{avatar:'Actor.png',data:{extensions:{world:'Story'}}}]},settings={enabled:true,continuityEnabled:true,reasonerProfileId:'test',continuityInterval:3};
 const bank={analysisId:'original',records:Array.from({length:12},(_,i)=>({type:'relationship',rule:'Actor keeps a wary distance from Player even during ordinary conversation. '+i,target:'Player'}))};
 const store={enabled:true,characters:[{id:'actor',name:'Actor',kind:'character',recordBank:bank}],npcs:[]},records=new Map([['room',{}]]),events=[],requests=[],notes=[];
 const deps={window:{},worldInfoModule:{loadWorldInfo:async()=>({entries:{}})},hub:{snapshot:()=>({state:{status:'prepared'}})},stateChatKey:()=> 'room',getContext:()=>ctx,settings,characterStore:store,record:()=>records.get('room'),chatRecords:records,stateHistoryCache:new Map(),queueWrite:(_key,task)=>task(),loadStateHistory:async()=>[],storagePost:async()=>{},clearInjection:async()=>{},fingerprint:hash,renderAll(){},selectActiveEntries:()=>store.characters,noteDiagnostic:(code,detail)=>events.push({code,...detail}),connectionRequestService:{},requestWithConnectionProfile:async(...args)=>{requests.push(args);return empty(args[3]);},onOutcome:outcome=>notes.push(outcome)};
 deps.analysis=createAnalysisRuntime(deps);deps.historyAnalysis=createHistoryAnalysis(deps);deps.changes=createChangeReview(deps);return {ctx,settings,store,records,events,requests,notes,deps};
}
// Manual scope follows the selected interval, logical continuations share a turn.
const chat=Array.from({length:8},(_,i)=>[{is_user:true,mes:'Question '+i},{is_user:false,mes:'Reply '+i}]).flat();
chat.push({is_user:false,mes:'Continued reply 7'});chat[13].is_system=true;
const runtime=observeManualWindow(null,{chatRef:'room',chat,fingerprint:hash,interval:3});
const range=buildAnalysisWindow(runtime,{chatRef:'room',chat,fingerprint:hash});assert.equal(range.turnCount,3);assert.ok(!range.segments.some(s=>s.identity.messageIndex===13));assert.ok(range.segments.some(s=>s.text==='Reply 4'));assert.ok(range.segments.some(s=>s.text==='Continued reply 7'));
const page=await baselinePage(fixture().store.characters,{fingerprint:hash});assert.equal(page.bases.length,12,'comparison is independent of the eight-record injection limit');
let offset=0,seen=[];do{const p=await baselinePage(fixture().store.characters,{fingerprint:hash,offset,maxRecords:4});seen.push(...p.bases.map(b=>b.baseRef.index));offset=p.nextOffset;}while(offset!==null);assert.deepEqual(seen,[0,1,2,3,4,5,6,7,8,9,10,11]);
// Independent read-only Charm bridge, linked lorebook filters and visible chat.
const f=fixture();let charmReads=0,loreReads=0;f.deps.window.__charmBridge={getCharId:()=> 'Actor',getStoryContext:async()=>{charmReads++;return 'Actor has learned to trust Player after their journey.';},apply(){throw new Error('must never write another extension');}};
f.deps.worldInfoModule={world_info:{},loadWorldInfo:async name=>{assert.equal(name,'Story');loreReads++;return {entries:{one:{content:'A story reference.'},off:{content:'Forbidden disabled source.',disable:true},wrong:{content:'Wrong actor source.',characterFilter:{names:['Other']}}}};}};
f.ctx.chat.push({is_user:false,is_system:true,mes:'Hidden secret must not be read.'});
assert.equal(MEMORY_REFERENCE_ENABLED,false);
const read=await readHistorySources({window:f.deps.window,context:f.ctx,chatRef:'room',worldInfoModule:f.deps.worldInfoModule,fingerprint:hash,isCurrent:()=>true,signal:new AbortController().signal});
assert.equal(charmReads,1);assert.equal(loreReads,1);assert.ok(!JSON.stringify(read.sources).includes('Hidden secret'));assert.ok(!JSON.stringify(read.sources).includes('Forbidden'));assert.ok(!JSON.stringify(read.sources).includes('Wrong actor'));assert.equal(read.sources[0].scope,'character_reference');
const before=JSON.stringify(f.store);
f.deps.requestWithConnectionProfile=async(_c,_p,_s,input)=>{f.requests.push(input);const r=empty(input);r.result.record_reviews.find(r=>r.base_ref==='b9').status='change';r.result.character_changes=[{actor_id:'actor',target_ids:[],base_ref:'b9',op:'replace',record_type:'relationship',compact_rule:'Actor trusts Player after their journey.',state_summary:null,source_type:'world_fact',epistemic:'established',original_ko:'상대를 경계합니다.',replacement_ko:'여정 이후 상대를 신뢰합니다.',reason_ko:'요약에 변화가 있습니다.',evidence:[{ref:'r0',quote:input.source_segments[0].text}]}];return r;};
let request=f.deps.historyAnalysis.request();assert.equal(request.status,'accepted');assert.equal((await request.completion).status,'history_ready');assert.equal(f.records.get('room').characterEvolutionV1,undefined,'retrospective candidates never inject before review');
const candidate=f.records.get('room').historyAnalysisV1.review[0];assert.equal(candidate.data.baseRef.index,9);assert.ok(candidate.reviewText.replacementKo);
await f.deps.changes.approve(candidate.id);assert.equal(JSON.stringify(f.store),before,'source JSON bank is immutable');
let confirmed=confirmedEvolution(f.records.get('room'),{chat:f.ctx.chat,chatRef:'room',fingerprint:hash,store:f.store});assert.equal(confirmed.entries.length,1);
const shared=confirmedStory(f.records.get('room'),{chat:f.ctx.chat,fingerprint:hash,sourceChatRef:'room'}),carried=resolveRecord({}, {}, {}, {id:'checkpoint',state:shared});
assert.equal(confirmedEvolution(carried,{chat:[],chatRef:'next-room',fingerprint:hash,store:f.store}).entries.length,1,'approved reference survives an explicit continuation');
assert.equal(effectiveRecord(f.store.characters[0].recordBank.records[9],f.store.characters[0],confirmed,hash,{actorIds:['actor'],index:9}).rule,'Actor trusts Player after their journey.');
const active=f.deps.changes.list().find(c=>c.location==='active');await assert.rejects(f.deps.changes.save(active.id,'한글 수정'),{code:'CHANGE_LANGUAGE'});await assert.rejects(f.deps.changes.save(active.id,'x'.repeat(4001)),{code:'CHANGE_LENGTH'});
await f.deps.changes.save(active.id,'Actor trusts Player.');assert.equal(f.records.get('room').characterEvolutionV1.entries[0].compactRule,'Actor trusts Player.');
// A manually shortened compact-budget item becomes usable, without modifying the bank.
const budgetEntry=f.records.get('room').characterEvolutionV1.entries[0];Object.assign(budgetEntry,{operation:'add_state',compactStatus:'compact_budget',compactRule:null,stateSummary:'Actor now trusts Player.',status:'needs_review',exportEligible:false});
await assert.rejects(f.deps.changes.save(budgetEntry.id,'x'.repeat(4001)),{code:'CHANGE_LENGTH'});
await f.deps.changes.save(budgetEntry.id,'Actor trusts Player.');
const fixedBudget=f.records.get('room').characterEvolutionV1.entries[0];assert.equal(fixedBudget.status,'active');assert.equal(fixedBudget.compactStatus,'fits');assert.equal(fixedBudget.operation,'exception');assert.equal(fixedBudget.stateSummary,null);assert.equal(JSON.stringify(f.store),before);
assert.equal((await f.deps.historyAnalysis.request().completion).status,'already_analyzed');assert.equal(f.requests.length,1,'no repeated paid analysis for the same completed history');
// New visible chat input is required on normal manual analysis; no bridge read.
f.deps.requestWithConnectionProfile=async(...args)=>{f.requests.push(args);return empty(args[3]);};await f.deps.analysis.requestManual().completion;assert.equal(charmReads,4,'only explicit history requests and source approval reread the bridge');
// Saved checkpoints bound work to three pages and resume with no auto restart.
const long=fixture();long.ctx.chat=Array.from({length:30},(_,i)=>[{is_user:true,mes:'Question '+i+' '+'q'.repeat(1200)},{is_user:false,mes:'Reply '+i+' '+'a'.repeat(1200)}]).flat();
let result=await long.deps.historyAnalysis.request().completion;assert.equal(result.status,'history_partial');assert.equal(long.requests.length,3);const checkpoint=long.records.get('room').historyAnalysisV1.cursor;
assert.ok(checkpoint.source>0);result=await long.deps.historyAnalysis.request().completion;assert.equal(result.status,'history_ready');assert.ok(long.requests.length<=6);assert.equal(long.records.get('room').historyAnalysisV1.cursor,null);
// Hidden evidence cancels in-flight collection without saving its result.
const late=fixture();let entered=false,release;late.deps.requestWithConnectionProfile=async()=>{entered=true;await new Promise(r=>release=r);return empty();};const job=late.deps.analysis.requestManual();while(!entered)await new Promise(r=>setImmediate(r));late.ctx.chat[1].is_system=true;release();assert.equal((await job.completion).status,'cancelled');
// Immediate single/batch hide notification; no model call, old state retained.
const v=fixture(),notes=[];v.records.get('room').lastJudgment={payload:'Hub payload',visibilityKeyV1:visibilityKey(v.ctx.chat)};
const life=createVisibilityLifecycle({...v.deps,invalidateReasonerJobs:()=>v.deps.analysis.cancel('visibility_changed'),notify:message=>notes.push(message)});
await life.check();v.ctx.chat[0].is_system=true;v.ctx.chat[1].is_system=true;await life.check();assert.equal(notes.length,1);assert.equal(v.records.get('room').lastJudgment,null);assert.equal(v.requests.length,0);v.ctx.chat[0].is_system=false;v.ctx.chat[1].is_system=false;await life.check();assert.equal(notes.length,2);
const toast=[];for(const status of ['waiting','empty','saved','failed'])notifyAutomaticAnalysis({}, {status},{notify:(level,message)=>toast.push({level,message})});assert.equal(toast.length,2);assert.equal(toast[1].level,'error');
console.log('Visibility/history passed: 3/5 logical turns, full original pages, isolated read-only references, review-before-apply, length/language limits, immutable files, bounded resume, late cancellation and manual/automatic feedback.');

// Confirmed memory and legacy/current knowledge stay independently editable.
const {confirmedContinuity,selectActiveContinuity}=await import('../src/continuity/selection.js');const {continuityView}=await import('../src/continuity/state-adapter.js');
const editing=fixture(),sourceRefs=[{originChatRef:'room',messageIndex:1,role:'assistant',swipeId:0,contentHash:hash(editing.ctx.chat[1].mes)}];editing.records.set('room',{continuity:{items:[{id:'memory',label:'Actor remembers the shared journey.',owners:['actor'],sourceRefs}]},characterState:{knowledge:[{character:'actor',factId:'journey',summary:'Actor knows the route.',sourceRefs},{character:'other',factId:'journey',summary:'Other knows a different route.',sourceRefs}]}});assert.equal(new Set(editing.deps.changes.list().map(c=>c.id)).size,3);await editing.deps.changes.save('memory','Actor remembers the promise.');await editing.deps.changes.save('knowledge:actor:journey','Actor knows the destination.');assert.equal(editing.records.get('room').characterState.knowledge[0].summary,'Actor knows the destination.');assert.equal(editing.records.get('room').characterState.knowledge[1].summary,'Other knows a different route.');await editing.deps.changes.exclude('memory');await editing.deps.changes.exclude('knowledge:actor:journey');const view=continuityView(editing.records.get('room'));assert.equal(confirmedContinuity(view,{record:editing.records.get('room'),chatRef:'room',chat:editing.ctx.chat,fingerprint:hash}).items.length,0);assert.equal(selectActiveContinuity(view,'Actor remembers the promise and knows the destination.',{actorIds:['actor']}).knowledge.length,0);assert.equal(editing.deps.changes.list().length,1);console.log('Confirmed review passed: saved edits, separate legacy knowledge owners, persistent exclusion and no excluded-state injection.');

// Upgrade/manual interval changes revisit recent gaps without duplicating scans.
const interval=fixture();interval.ctx.chat=Array.from({length:5},(_,i)=>[{is_user:true,mes:'Input '+i},{is_user:false,mes:'Output '+i}]).flat();
interval.records.set('room',{analysisRuntimeV1:{coveredThrough:9,anchor:{chatRef:'room',startIndex:8},turnRefs:[],rangeLedger:[],sections:{},pendingBatches:[]}});
await interval.deps.analysis.requestManual().completion;assert.equal(interval.requests.length,1);assert.equal(interval.requests[0][3].source_segments.filter(s=>s.role==='assistant').length,3,'legacy single-turn coverage cannot suppress a selected three-turn window');
await interval.deps.analysis.requestManual().completion;assert.equal(interval.requests.length,1,'recent compact coverage prevents duplicate paid collection');
interval.settings.continuityInterval=5;await interval.deps.analysis.requestManual().completion;assert.equal(interval.requests.length,2);assert.deepEqual(interval.requests[1][3].source_segments.filter(s=>s.role==='assistant').map(s=>s.text),['Output 0','Output 1'],'increasing to five reads only the two missed turns');
await interval.deps.analysis.requestManual().completion;assert.equal(interval.requests.length,2);assert.ok(interval.records.get('room').analysisRuntimeV1.recentCoverageV1.length<=32);console.log('Manual interval upgrade passed: recent three/five-turn gaps, compact completion proof and zero duplicate scans.');

const {invalidateDeltasFrom}=await import('../src/continuity/delta-commit.js');const rescanned=interval.records.get('room');invalidateDeltasFrom(rescanned,6,{chatRef:'room'});assert.ok(rescanned.analysisRuntimeV1.recentCoverageV1.every(r=>r.refs.every(ref=>ref.messageIndex<6)));console.log('Recent completion proof invalidation passed: edit/delete/swipe rollback removes affected scan markers.');

const mutationGuard=fixture();mutationGuard.records.set('room',{continuity:{items:[{id:'memory',label:'A confirmed fact.',sourceRefs}]}});mutationGuard.deps.hub.snapshot=()=>({state:{status:'running'}});const mutationBefore=hash(mutationGuard.records.get('room'));await assert.rejects(mutationGuard.deps.changes.save('memory','A changed fact.'),{code:'CHANGE_BUSY'});await assert.rejects(mutationGuard.deps.changes.exclude('memory'),{code:'CHANGE_BUSY'});await assert.rejects(mutationGuard.deps.historyAnalysis.approve('unused'),{code:'CHANGE_BUSY'});assert.equal(hash(mutationGuard.records.get('room')),mutationBefore);console.log('Mutation guard passed: user changes wait for active Hub preparation without altering RP or saved data.');
