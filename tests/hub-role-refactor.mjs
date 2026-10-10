import assert from 'node:assert/strict';
import {validNoul} from '../src/adapters/answer-value.js';
import {createJevClient} from '../src/adapters/jev-client.js';
import {applyRecordRelevance,applyPolicy} from '../src/decision/answers.js';
import {resolveCharacterPresence,participationBasis} from '../src/character/presence.js';
import {buildCharacterTurnQuestions} from '../src/character/live.js';
import {sceneGateRequest,resolveSceneGate} from '../src/scene/intimacy-gate.js';
import {mergeDeltaResponses} from '../src/continuity/delta-conflicts.js';
import {validatedDeltaResponse} from '../src/continuity/response-validation.js';
import {analysisRequestBudget} from '../src/continuity/request-budget.js';
import {clearCollectedTransaction} from '../src/continuity/collection-reset.js';
import {updateReviewedSnapshots} from '../src/continuity/review-snapshots.js';
import {analysisContext} from '../src/continuity/analysis-context.js';
import {stableFingerprint as fingerprint} from '../src/decision/policy.js';
import {messageRef} from '../src/continuity/analysis-window.js';
import {analysisDiagnostic} from '../src/debug/analysis-events.js';
import {wholeDiagnosticReport} from '../src/debug/whole-report.js';

for(const value of [null,undefined,'',' ',false,true,NaN,Infinity,-1,1.1,{},[]]){
 assert.equal(validNoul(value),false);assert.equal(applyRecordRelevance({type:'noul',noul:value}).fallbackApplied,true);
 const client=createJevClient({settings:{jevProvider:'typesafe'},getSavedKey:()=> 'synthetic',getRequestHeaders:()=>({}),StaleRunError:Error,fetch:async()=>({ok:true,json:async()=>({answers:{r:{type:'noul',noul:value}}})})});
 await assert.rejects(()=>client.callJev({questions:{r:{type:'noul'}}}));
}
for(const value of [0,1,.5,'0','0.75'])assert.equal(validNoul(value),true);
const person={id:'a',index:0,name:'Actor',recordMode:true,profileCandidates:[],contextCandidates:[]};
const initial={character_0_presence:{effective:'absent',policyEffective:'absent',fallbackApplied:false}};
resolveCharacterPresence([person],initial,{character_0_participation:{choice:'direct',confidence:.95}});
assert.equal(initial.character_0_presence.effective,'active','contradictory old presence cannot erase observed participation');
for(const basis of ['direct','remote','continuing','reference','departed','unknown']){
 const gate=sceneGateRequest({model:'synthetic',transcript:'[0] USER: A scene.',people:[person]});
 const outcome=resolveSceneGate({scene_participant_0:{choice:basis,confidence:1}},gate);
 const questions=buildCharacterTurnQuestions([person],outcome.participationObservations);
 assert.equal(Object.keys(questions).filter(k=>/presence|participation/.test(k)).length,0,'same scene observation is not asked twice');
 const details={};resolveCharacterPresence([person],details,{},outcome.participationObservations);
 assert.equal(details.character_0_presence.effective,['direct','remote','continuing'].includes(basis)?'active':basis==='unknown'?'background':'absent');
}
const splitParticipation={choice:'direct',confidence:.53,probabilities:{unknown:0,direct:.61,remote:.03,continuing:.35,departed:0,reference:.01}};
assert.equal(participationBasis(splitParticipation),'participating');
assert.deepEqual(resolveSceneGate({scene_participant_0:splitParticipation},sceneGateRequest({model:'test',transcript:'[0] USER: Synthetic scene.',people:[person]})).participantIds,['a']);
const splitDetails={};resolveCharacterPresence([person],splitDetails,{}, {a:splitParticipation});assert.equal(splitDetails.character_0_presence.effective,'active');assert.equal(splitDetails.character_0_presence.presenceResolution,'participation_group');
for(const bad of [{choice:'direct',confidence:.1},{...splitParticipation,probabilities:{...splitParticipation.probabilities,unknown:1}},{choice:'reference',confidence:.4,probabilities:splitParticipation.probabilities},{choice:'direct',confidence:.4,probabilities:{unknown:.25,direct:.4,remote:.05,continuing:.05,departed:.05,reference:.2}}])assert.equal(participationBasis(bad),'unknown');
assert.equal(applyPolicy('relationship_pacing',{choice:'closer_incremental',confidence:.7},'balanced',['hold','closer_incremental']).effective,'closer_incremental');
assert.equal(applyPolicy('relationship_pacing',{choice:'closer_significant',confidence:.7},'balanced',['hold','closer_significant']).effective,'hold');
assert.equal(applyPolicy('event_route',{choice:'retire',confidence:.7},'balanced',['none','retire']).effective,'none');
assert.equal(applyPolicy('basic_move',{choice:'invented',confidence:1},'balanced',['continue','action']).effective,'continue');

const base={actorId:'a',baseRef:{analysisId:'b',recordDigest:'d'},scope:{targetIds:['b']},compactRule:'Scoped trust.'};
const proposal={id:'one',type:'character',section:'evolution',status:'pending',data:base};
const packet={coverage:{continuity:'complete',evolution:'complete'},candidates:[proposal],invalid:{}};
const conflict=mergeDeltaResponses(packet,{...packet,candidates:[{...proposal,id:'two',data:{...base,compactRule:'Scoped distrust.'}}]});
assert.equal(conflict.candidates.length,2);assert.ok(conflict.candidates.every(c=>c.status==='needs_review'));
assert.equal(mergeDeltaResponses(packet,{...packet,candidates:[{...proposal,id:'duplicate'}]}).candidates.length,1);

const chat=[{is_user:true,mes:'A synthetic question.'},{is_user:false,mes:'A synthetic answer.'}];
const proof=messageRef('room',chat,1,fingerprint),window={sourceRefs:[proof],persona:false,segments:[{ref:'r1',identity:proof,text:chat[1].mes}]};
const response={result:{protocol:1,coverage:{memory:'complete',characters:'complete',persona:'not_requested'},memory_changes:[{op:'add',kind:'fact',owners:['a'],summary:'A remembered detail.',lifecycle:'active',source_type:'world_fact',epistemic:'established',evidence:[{ref:'r1',quote:'A synthetic answer.'}]}],knowledge_changes:[],character_changes:[]}};
let repairs=0;
const retained=await validatedDeltaResponse(response,{window,actors:[{id:'a'}],bases:[],state:{},evolution:{entries:[]},fingerprint},{valid:()=>true,request:async()=>{repairs++;throw Object.assign(new Error('Synthetic repair failure'),{code:'PROFILE_TIMEOUT'});}});
assert.equal(repairs,1);assert.equal(retained.candidates.length,1);assert.equal(retained.coverage.evolution,'deferred');

let clock=0,calls=0;const durations=[];const limited=analysisRequestBudget(async(...args)=>{calls++;durations.push(args[4].timeoutMs);},{maxRequests:2,totalMs:150,now:()=>clock});
await limited(null,null,null,null,{timeoutMs:120});clock=100;await limited(null,null,null,null,{timeoutMs:120});assert.deepEqual(durations,[120,50]);assert.throws(()=>limited(),e=>e.code==='ANALYSIS_REQUEST_BUDGET');assert.equal(calls,2);

const ordinary={id:'ordinary',label:'Normal state survives.',owners:['a'],sourceRefs:[proof]},before={id:'modified',label:'Original ordinary state.',owners:['a']};
const record={continuity:{items:[ordinary,{id:'continuity:delta:new',label:'Collected new fact.',collectionOriginV1:{before:null}},{...before,label:'Collected update.',collectionOriginV1:{before}}],knowledge:[],dependencies:[{stateId:'continuity:delta:new'},{stateId:'ordinary'}],followups:[{relatedStateId:'continuity:delta:new'}]},characterEvolutionV1:{entries:[{id:'change'}]},analysisJournalV1:[]};
const history=[{before:structuredClone(record),after:structuredClone(record)}];record.pendingPlan={stateSnapshot:structuredClone(record)};
clearCollectedTransaction(record,history,{chatRef:'room',startIndex:2,interval:3});
for(const current of [record,history[0].before,history[0].after,record.pendingPlan.stateSnapshot]){
 assert.deepEqual(current.continuity.items.map(i=>i.label),['Normal state survives.','Original ordinary state.']);assert.equal(current.continuity.dependencies.length,1);assert.equal(current.continuity.followups.length,0);assert.equal(current.characterEvolutionV1.entries.length,0);
}
const legacyBefore={id:'legacy',label:'Ordinary prior'},legacyAfter={...legacyBefore,label:'Collected update'};
const legacy={continuity:{items:[legacyAfter,{id:'continuity:delta:journal',label:'Journal-created'}],knowledge:[],dependencies:[{stateId:'continuity:delta:journal'}]},analysisJournalV1:[{type:'memory',key:'legacy',before:legacyBefore,after:legacyAfter},{type:'memory',key:'continuity:delta:journal',before:null,after:{id:'continuity:delta:journal',label:'Journal-created'}}]};
clearCollectedTransaction(legacy,[],{chatRef:'room',startIndex:2,interval:3});
assert.deepEqual(legacy.continuity.items,[legacyBefore]);assert.equal(legacy.continuity.dependencies.length,0);
const newer={continuity:{items:[{...legacyBefore,label:'Newer ordinary update'}],knowledge:[]},analysisJournalV1:[{type:'memory',key:'legacy',before:legacyBefore,after:legacyAfter}]};
clearCollectedTransaction(newer,[],{chatRef:'room',startIndex:2,interval:3});assert.equal(newer.continuity.items[0].label,'Newer ordinary update');
const edit={continuity:{items:[ordinary]},pendingPlan:{stateSnapshot:{continuity:{items:[structuredClone(ordinary)]}}}},edits=[{before:{continuity:{items:[structuredClone(ordinary)]}},after:{continuity:{items:[structuredClone(ordinary)]}}}];
updateReviewedSnapshots(edit,edits,{id:'ordinary',type:'memory',data:ordinary},{label:'Edited once.',userExcluded:true});
assert.ok(edits.every(e=>e.before.continuity.items[0].userExcluded&&e.after.continuity.items[0].label==='Edited once.'));assert.equal(edit.pendingPlan.stateSnapshot.continuity.items[0].userExcluded,true);

const hiddenChat=structuredClone(chat);hiddenChat[1].is_hidden=true;
const hiddenRecord={continuity:{items:[{...ordinary,label:'HIDDEN_SOURCE_SENTINEL'}]}};
const context=await analysisContext(hiddenRecord,{...window,segments:[{...window.segments[0],text:'New source.'}]},{store:{enabled:true,characters:[{id:'a'}]},selectActiveEntries:()=>[{id:'a'}],chat:hiddenChat,fingerprint});
assert.ok(!JSON.stringify(context.input).includes('HIDDEN_SOURCE_SENTINEL'));
const diagnostic=[];analysisDiagnostic((_code,detail)=>diagnostic.push(detail),'analysis_result',{status:'succeeded',baselineCount:12,baselineTotal:42,repairCount:1,invalidCount:2,original:'PRIVATE_SENTINEL'});assert.equal(diagnostic[0].baselineTotal,42);assert.equal(diagnostic[0].repairCount,1);assert.ok(!JSON.stringify(diagnostic).includes('SENTINEL'));
const report=wholeDiagnosticReport({execution:{},record:{...hiddenRecord,analysisJournalV1:[{raw:'PRIVATE_SENTINEL'}]},chat,fingerprint});
assert.ok(!JSON.stringify(report).includes('SENTINEL'));
console.log('Role refactor passed: malformed answers, authoritative participation, bounded routing, conflicting repairs, retained partial results, finite request budget, scoped reset, snapshot edits and source privacy.');
