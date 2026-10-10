import {checkRecordComparison,sameComparisonBase} from '../src/continuity/record-comparison.js';
import {createChangeReview} from '../src/continuity/change-review.js';
import assert from 'node:assert/strict';
import {validatedDeltaResponse} from '../src/continuity/response-validation.js';
import {ensureReviewTranslations} from '../src/continuity/review-translation.js';
import {analysisContext} from '../src/continuity/analysis-context.js';
import {historyWindow} from '../src/memory/history-sources.js';
import {stableFingerprint as fingerprint} from '../src/decision/policy.js';
import {analysisFixture} from './fixtures/analysis-runtime.mjs';
import {createHistoryAnalysis} from '../src/continuity/history-analysis.js';
import {reviewContent} from '../src/ui/change-review-content.js';
const actor={id:'a',kind:'character',name:'Mira',recordBank:{analysisId:'bank',records:[{type:'relationship',target:'',rule:'Mira distrusts Sol with all shared tasks and keeps personal distance.'}]}};
const source={id:'summary',kind:'charm_summary',scope:'character_reference',hash:'hash',text:'Mira explicitly trusts Sol with routine tasks but keeps personal distance.'};
const window=historyWindow([source],{chatRef:'room-A',checkpointId:'checkpoint',fingerprint});
const context=await analysisContext({},window,{store:{enabled:true,characters:[actor]},allActors:true,fingerprint});context.window=window;context.fingerprint=fingerprint;
const empty=()=>({protocol:1,coverage:{memory:'complete',characters:'complete',persona:'not_requested'},memory_changes:[],knowledge_changes:[],character_changes:[],deferred_changes:[]});
const memo={op:'add',owners:['a'],target_ids:[],kind:'fact',summary:'Mira completed a routine task with Sol.',source_type:'world_fact',epistemic:'established',lifecycle:'active',evidence:[{ref:'r0',quote:source.text}]};
let repairs=0;const onlyMemory={...empty(),memory_changes:[memo]};
let packet=await validatedDeltaResponse({result:onlyMemory},context,{request:async()=>{repairs++;return {result:onlyMemory};},valid:()=>true});
assert.equal(repairs,1);assert.equal(packet.coverage.evolution,'deferred');assert.equal(packet.comparison.missing,1,'a scene recap does not complete the original-record comparison');
const changed={actor_id:'a',base_ref:'b0',target_ids:[],op:'exception',record_type:'relationship',compact_rule:'Mira trusts Sol with routine tasks but keeps personal distance.',source_type:'world_fact',epistemic:'established',evidence:[{ref:'r0',quote:source.text}]};
const raw={...empty(),record_reviews:[{base_ref:'b0',status:'change',reason_ko:'일상 업무에 한해 신뢰가 생김'}],character_changes:[changed]};
packet=await validatedDeltaResponse({result:raw},context,{request:()=>{throw new Error('No second semantic judge');},valid:()=>true});
assert.equal(packet.comparison.changed,1);assert.equal(packet.candidates[0].data.compactStatus,'fits');assert.equal(packet.candidates[0].data.baseRef.index,0);
let translations=0;await ensureReviewTranslations(packet,{request:async(_system,input)=>{translations++;return {result:{translations:input.translations.map(t=>({id:t.id,original_ko:'함께 하는 모든 일에서 상대를 신뢰하지 않고 개인적 거리를 둔다.',replacement_ko:'일상 업무에서는 상대를 신뢰하지만 개인적 거리는 유지한다.',reason_ko:'일상 업무에 한한 신뢰가 명시됨'}))}};},valid:()=>true});
assert.equal(translations,1);assert.equal(packet.translationMissing,0);assert.equal(packet.candidates[0].data.compactRule,changed.compact_rule);
const memoPacket={candidates:[{...packet.candidates[0],type:'memory',baseline:null,data:{label:memo.summary},reviewText:{}}]};
await ensureReviewTranslations(memoPacket,{request:async(_system,input)=>({result:{translations:input.translations.map(t=>({id:t.id,original_ko:null,replacement_ko:'일상 업무를 함께 마쳤다.',reason_ko:'대화에서 확인됨'}))}}),valid:()=>true});assert.equal(memoPacket.translationMissing,0,'new memories still require and receive Korean');
const html=reviewContent(memoPacket.candidates[0],s=>String(s));assert.ok(!html.includes('<strong>원문</strong>'));assert.ok(!html.includes('<strong>변경문</strong>'));assert.ok(!html.includes('한국어 설명이 없으면'));assert.ok(html.indexOf('영어는 바로')>html.indexOf('</textarea>'));
const failure={candidates:[{...packet.candidates[0],reviewText:{}}]};await ensureReviewTranslations(failure,{request:async()=>{throw new Error('Synthetic timeout');},valid:()=>true});assert.equal(failure.translationMissing,1);assert.equal(failure.candidates[0].data.compactRule,changed.compact_rule);
// All original pages are compared with the supplied summary; incomplete pages never advance.
const f=analysisFixture();f.deps.characterStore={enabled:true,characters:[{...actor,recordBank:{analysisId:'many',records:Array.from({length:40},(_,i)=>({...actor.recordBank.records[0],rule:actor.recordBank.records[0].rule+' '+i}))}}],npcs:[]};
f.deps.window.__charmBridge={getStoryContext:async()=>source.text};f.deps.worldInfoModule={};f.deps.historyAnalysis=createHistoryAnalysis(f.deps);const seen=[];
f.deps.requestWithConnectionProfile=async(_c,_p,_s,input)=>{assert.equal(input.source_kinds[0].kind,'charm_summary');seen.push(...input.baseline_records.map(b=>b.record.rule));return {result:{...empty(),record_reviews:input.baseline_records.map(b=>({base_ref:b.ref,status:'keep',reason_ko:'이 구간에서 해당 항목 변화 없음'}))}};};
assert.equal((await f.deps.historyAnalysis.request().completion).status,'history_ready');assert.equal(new Set(seen).size,40);assert.equal(f.deps.record().historyAnalysisV1.comparison.reviewed,40);
f.deps.record().historyAnalysisV1=undefined;f.deps.requestWithConnectionProfile=async()=>({result:empty()});assert.equal((await f.deps.historyAnalysis.request().completion).status,'history_partial');assert.equal(f.deps.record().historyAnalysisV1.baselineOffset,0);assert.equal(f.deps.record().historyAnalysisV1.lastComparison.missing,32);
console.log('Record comparison passed: original-item coverage, recap-only incomplete, linked replacement, Korean defaults/failure, distinct UI, summary input, full paging and no skipped incomplete records.');

const r=analysisFixture();r.deps.characterStore={enabled:true,characters:[actor],npcs:[]};r.deps.historyAnalysis=createHistoryAnalysis(r.deps);
const pending={...structuredClone(packet.candidates[0]),status:'history_review',reviewText:{}};r.deps.record().historyAnalysisV1={review:[pending],translationMissing:1};
r.deps.requestWithConnectionProfile=async(_c,_p,_system,input)=>({result:{english:input.draft,original_ko:'상대를 신뢰하지 않는다.',replacement_ko:'일상 업무에서 상대를 신뢰하되 거리를 유지한다.',reason_ko:'일상 업무에서의 신뢰가 확인됨'}});
const changes=createChangeReview(r.deps);const translated=await changes.translate(pending.id,null,{reviewOnly:true}).completion;assert.equal(translated.status,'translated');assert.equal(r.deps.record().historyAnalysisV1.review[0].reviewText.status,'complete');assert.equal(r.deps.record().historyAnalysisV1.review[0].data.compactRule,changed.compact_rule);assert.equal(r.deps.record().historyAnalysisV1.translationMissing,0);
console.log('Review translation retry passed: persisted Korean, original English unchanged, no automatic application.');

const duplicateBase={...context.bases[0],ref:'b1',baseRef:{...context.bases[0].baseRef,index:1}};
assert.equal(sameComparisonBase(context.bases[0].baseRef,duplicateBase.baseRef),false);
const duplicatePacket=checkRecordComparison({record_reviews:[{base_ref:'b0',status:'change'},{base_ref:'b1',status:'keep'}]},structuredClone(packet),{...context,bases:[context.bases[0],duplicateBase]});
assert.equal(duplicatePacket.comparison.missing,0,'same text at different original indexes is compared separately; optional review explanation never blocks collection');

const {DELTA_EXAMPLE_INPUT,DELTA_EXAMPLE_OUTPUT}=await import('../src/continuity/delta-prompt-example.js');
const {buildDeltaSystem}=await import('../src/continuity/delta-prompts.js');
const ex=DELTA_EXAMPLE_INPUT,exampleWindow=historyWindow([{...source,text:ex.source_segments[0].text}],{chatRef:'sample-room',checkpointId:'sample',fingerprint});
const exampleContext=await analysisContext({},exampleWindow,{store:{enabled:true,characters:[{...ex.actors[0],recordBank:{analysisId:'sample-bank',records:ex.baseline_records.map(b=>b.record)}}],persona:ex.actors[1]},allActors:true,fingerprint});
const examplePacket=await validatedDeltaResponse({result:DELTA_EXAMPLE_OUTPUT},{...exampleContext,window:exampleWindow,fingerprint},{request:()=>{throw new Error('Prompt example must validate without repair');},valid:()=>true});
assert.equal(examplePacket.repairCount,0);assert.equal(examplePacket.candidates.length,1);assert.equal(examplePacket.comparison.reviewed,2);assert.equal(examplePacket.candidates[0].data.compactStatus,'fits');
assert.ok(buildDeltaSystem().includes(JSON.stringify(DELTA_EXAMPLE_OUTPUT)));assert.ok(buildDeltaSystem().includes('INPUT MAP'));
console.log('Actual prompt example passed: complete response shape, exact proof, actor/target/original mapping, bounded rule and Korean review.');

const {mergeDeltaResponses}=await import('../src/continuity/delta-conflicts.js');
const firstGood={...structuredClone(packet),candidates:[{...structuredClone(packet.candidates[0]),status:'pending'}]};
const rephrased={...firstGood,candidates:[{...structuredClone(firstGood.candidates[0]),id:'repair-rephrase',data:{...firstGood.candidates[0].data,compactRule:'Mira trusts Sol in routine tasks but stays distant.'}}]};
const repairedOnce=mergeDeltaResponses(firstGood,rephrased,{formatRepair:true});
assert.equal(repairedOnce.candidates.length,1);assert.equal(repairedOnce.candidates[0].data.compactRule,firstGood.candidates[0].data.compactRule);assert.equal(repairedOnce.candidates[0].status,'pending');
console.log('Selective repair passed: a valid original-item change is preserved rather than duplicated or falsely conflicted.');

const {sameRuleMeaningText}=await import('../src/continuity/record-comparison.js');
assert.equal(sameRuleMeaningText('Mira trusts {{user}}.', 'Mira trusts Sol.',{user:'Sol'}),true);
assert.equal(sameRuleMeaningText('Mira distrusts {{user}}.', 'Mira trusts Sol.',{user:'Sol'}),false);
const namedOnly={...structuredClone(raw),character_changes:[{...raw.character_changes[0],compact_rule:context.bases[0].record.rule}]};
const namedPacket=await validatedDeltaResponse({result:namedOnly},context,{request:async()=>({result:namedOnly}),valid:()=>true});assert.equal(namedPacket.candidates.length,0);assert.equal(namedPacket.comparison.missing,1,'unchanged original or name-only edits cannot count as character development');

const evolvedContext={...context,evolution:{entries:[{id:'already-applied',actorId:'a',baseRef:context.bases[0].baseRef,compactRule:changed.compact_rule,scope:{targetIds:[]}}]}};
const repeatApplied={...structuredClone(raw),character_changes:[{...raw.character_changes[0],existing_change_id:'already-applied'}]};
const already=await validatedDeltaResponse({result:repeatApplied},evolvedContext,{request:async()=>({result:repeatApplied}),valid:()=>true});assert.equal(already.candidates.length,0,'already reflected development is not collected twice');
const returnedToBaseline={...repeatApplied,character_changes:[{...repeatApplied.character_changes[0],compact_rule:context.bases[0].record.rule}]};
const returnPacket=await validatedDeltaResponse({result:returnedToBaseline},evolvedContext,{request:()=>{throw new Error('a supported return to the original is a valid new update');},valid:()=>true});assert.equal(returnPacket.candidates.length,1);assert.equal(returnPacket.candidates[0].data.existingId,'already-applied');
console.log('Cumulative comparison passed: current applied state prevents duplicate collection and permits a supported later reversal.');

// Preserve role placeholders while enforcing the same relationship target.
const macroActor={...actor,recordBank:{analysisId:'macro-bank',records:[{type:'relationship',target:'{{user}}',rule:'Mira distrusts {{user}} with all shared tasks and keeps personal distance.'}]}};
const macroContext=await analysisContext({},window,{store:{enabled:true,characters:[macroActor],persona:{id:'sol',name:'Sol',kind:'persona'}},userName:'Sol',allActors:true,fingerprint});
const macroRaw={...raw,character_changes:[{...changed,target_ids:['sol'],compact_rule:'Mira trusts {{user}} with routine tasks but keeps personal distance.'}]};
const macroPacket=await validatedDeltaResponse({result:macroRaw},{...macroContext,window,fingerprint},{request:()=>{throw new Error('Role placeholder must not cause a needless repair');},valid:()=>true});
assert.equal(macroPacket.candidates.length,1);assert.equal(macroPacket.repairCount,0);
const missingTarget={...macroRaw,character_changes:[{...macroRaw.character_changes[0],target_ids:[]}]};
const {validateDeltaPacket}=await import('../src/continuity/delta-validation.js');
assert.equal(validateDeltaPacket(missingTarget,{...macroContext,window,fingerprint}).rejections[0].code,'missing_target_id');

// All matching current rules survive paging, even beyond the former last-12 cap.
const manyActor={...actor,recordBank:{analysisId:'current-bank',records:Array.from({length:20},(_,i)=>({type:'relationship',target:'Sol',rule:'Mira distrusts Sol on shared task '+i+' and keeps personal distance.'}))}};
const {baseRecordRef,effectiveRecord}=await import('../src/character/evolution.js');
const evidenceRef={...window.sourceRefs[0],quote:source.text};
const currentEntries=manyActor.recordBank.records.map((record,index)=>({id:'current-'+index,actorId:manyActor.id,baseRef:baseRecordRef(manyActor.recordBank,record,index,fingerprint),status:'active',compactStatus:'fits',compactRule:'Mira trusts Sol on task '+index+' but keeps personal distance.',scope:{targetIds:['sol']},evidenceRefs:[evidenceRef],updatedOrdinal:index}));
const currentRecord={characterEvolutionV1:{entries:currentEntries},approvedHistorySourcesV1:[{id:evidenceRef.sourceId,hash:evidenceRef.contentHash,checkpointId:evidenceRef.checkpointId}]};
const currentContext=await analysisContext(currentRecord,window,{store:{enabled:true,characters:[manyActor],persona:{id:'sol',name:'Sol',kind:'persona'}},allActors:true,fingerprint});
assert.equal(currentContext.input.baseline_records.length,20);
for(const [index,base]of currentContext.input.baseline_records.entries()){assert.equal(base.current_changes[0].id,'current-'+index);assert.equal(base.current_changes[0].compactRule,currentEntries[index].compactRule);}
const originalCopy=structuredClone(manyActor.recordBank.records);
const effective=effectiveRecord(manyActor.recordBank.records[0],manyActor,currentRecord.characterEvolutionV1,fingerprint,{actorIds:['sol'],index:0});
assert.equal(effective.rule,currentEntries[0].compactRule);assert.deepEqual(manyActor.recordBank.records,originalCopy,'effective injection must not mutate the original file');
assert.equal(effective.rule.includes('distrusts'),false,'replace original instead of appending a contradictory rule');
const repeatedActor={...manyActor,recordBank:{...manyActor.recordBank,records:[originalCopy[0],structuredClone(originalCopy[0])]}};
assert.equal(effectiveRecord(repeatedActor.recordBank.records[1],repeatedActor,{entries:[currentEntries[0]]},fingerprint,{actorIds:['sol'],index:1}).rule,originalCopy[0].rule,'identical text in a different JSON item must not inherit the first item change');

const {deltaRepairFeedback,deltaRepairInput,applyDeltaRepairs}=await import('../src/continuity/delta-repair.js');
const {stageDeltaCommit}=await import('../src/continuity/delta-commit.js');
const {evolutionRuleBudget}=await import('../src/character/evolution-budget.js');
const budget=evolutionRuleBudget(context.bases[0].record);
// Modest growth is valid. No shortening request, no lost qualification.
const longerRule='Mira now trusts Sol with routine shared tasks, but still keeps personal matters private.';
assert.ok(longerRule.length>context.bases[0].record.rule.length);
const longerRaw={...raw,character_changes:[{...changed,compact_rule:longerRule}]};
const longerPacket=await validatedDeltaResponse({result:longerRaw},context,{request:()=>{throw new Error('Length-only retries must not run');},valid:()=>true});
assert.equal(longerPacket.repairCount,0);assert.equal(longerPacket.candidates[0].data.compactRule,longerRule);
const longerRecord=stageDeltaCommit({},longerPacket.candidates,{continuity_delta_0:{choice:'supported'}}).record;
assert.equal(effectiveRecord(actor.recordBank.records[0],actor,longerRecord.characterEvolutionV1,fingerprint,{index:0}).rule,longerRule,'longer faithful wording survives through actual injection');
assert.equal(actor.recordBank.records[0].rule,context.bases[0].record.rule,'the immutable original still controls identity and baseline');
assert.equal(context.input.baseline_records[0].rule_max_chars,budget.maxChars);
// An abnormal payload remains a review item without forced truncation or a length-only call.
const oversized={...raw,character_changes:[{...changed,compact_rule:'x'.repeat(budget.maxChars+1),state_summary:'Mira trusts Sol at work but remains personally guarded.'}]};
const oversizedPacket=await validatedDeltaResponse({result:oversized},context,{request:()=>{throw new Error('No automatic length rewriting');},valid:()=>true});
assert.equal(oversizedPacket.repairCount,0);assert.equal(oversizedPacket.candidates[0].data.compactStatus,'compact_budget');
const budgetRecord=stageDeltaCommit({},oversizedPacket.candidates,{continuity_delta_0:{choice:'supported'}}).record;
assert.equal(budgetRecord.characterEvolutionV1.entries[0].status,'needs_review');
assert.equal(effectiveRecord(actor.recordBank.records[0],actor,budgetRecord.characterEvolutionV1,fingerprint,{index:0}).rule,actor.recordBank.records[0].rule);
console.log('Concise writing policy passed: natural growth accepted without a second request, original immutable, only abnormal payloads retained for review.');

const badSource={...raw,character_changes:[{...changed,source_type:'unknown'}]};
const invalidPacket=validateDeltaPacket(badSource,context);
const feedback=deltaRepairFeedback(badSource,context,invalidPacket);
assert.equal(feedback.items[0].code,'invalid_source_type');assert.equal(feedback.mode,'patch');
const repairedDraft={...changed,original_ko:'미라는 솔을 불신한다.',replacement_ko:'일상 업무에서는 신뢰하되 거리를 둔다.',reason_ko:'업무 신뢰가 바뀌었다.'};
const patches={repairs:[{field:'character_changes',index:0,value:repairedDraft},{field:'settings',index:0,value:{enabled:false}}],record_reviews:raw.record_reviews};
const patched=applyDeltaRepairs(badSource,patches,feedback);
assert.equal(patched.character_changes[0].source_type,'world_fact');assert.equal(patched.settings,undefined);
assert.equal(badSource.character_changes[0].source_type,'unknown');
assert.equal(applyDeltaRepairs(badSource,{repairs:[{field:'character_changes',index:0,value:null}]},feedback).character_changes.length,1,'a format failure cannot silently delete a finding');
const patchedPacket=await validatedDeltaResponse({result:badSource},context,{request:async()=>({result:patches}),valid:()=>true});
assert.equal(patchedPacket.candidates.length,1);assert.equal(patchedPacket.comparison.missing,0);assert.equal(patchedPacket.invalid.evolution,0);assert.equal(patchedPacket.repairCount,1);
const missingRow={...structuredClone(DELTA_EXAMPLE_OUTPUT),record_reviews:DELTA_EXAMPLE_OUTPUT.record_reviews.slice(0,1)};
const repairKeepsAll={...empty(),record_reviews:exampleContext.bases.map(b=>({base_ref:b.ref,status:'keep'}))};
const retained=await validatedDeltaResponse({result:missingRow},{...exampleContext,window:exampleWindow,fingerprint},{request:async()=>({result:repairKeepsAll}),valid:()=>true});
assert.equal(retained.candidates.length,1);assert.equal(retained.comparison.changed,1);assert.equal(retained.comparison.kept,1);assert.equal(retained.comparison.missing,0);
assert.equal(retained.candidates[0].status,'pending');
const crowdedInput={...context.input,baseline_records:[...context.input.baseline_records,{ref:'unrelated',record:{rule:'x'.repeat(40000)}}]};
const scopedRepair=deltaRepairInput(crowdedInput,feedback);
assert.equal(scopedRepair.baseline_records.length,1);assert.equal(scopedRepair.repair_feedback.items.length,feedback.items.length);
assert.deepEqual(scopedRepair.source_segments,context.input.source_segments);
assert.throws(()=>deltaRepairInput({...context.input,source_segments:[{ref:'r0',text:'x'.repeat(40000)}]},feedback),error=>error.code==='ANALYSIS_REPAIR_INPUT_LIMIT');
const repairEvents=[];
const capacityPacket=await validatedDeltaResponse({result:missingRow},{...exampleContext,window:exampleWindow,fingerprint},{request:async feedback=>deltaRepairInput({...exampleContext.input,source_segments:[{ref:'r0',text:'x'.repeat(40000)}]},feedback),valid:()=>true,report:(code,meta)=>repairEvents.push({code,...meta})});
assert.equal(capacityPacket.repairFailed,true);assert.equal(capacityPacket.candidates.length,1);
assert.ok(repairEvents.some(event=>event.reasonCode==='ANALYSIS_REPAIR_INPUT_LIMIT'));
console.log('Selective format repair passed: complete feedback, original results preserved, explicit capacity fallback, no hidden semantic rejudgment.');