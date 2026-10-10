import assert from 'node:assert/strict';
import {validNoul} from '../src/adapters/answer-value.js';
import {createJevClient} from '../src/adapters/jev-client.js';
import {applyRecordRelevance,applyPolicy} from '../src/decision/answers.js';
import {resolveCharacterPresence,participationBasis} from '../src/character/presence.js';
import {buildCharacterTurnQuestions} from '../src/character/live.js';
import {sceneGateRequest,resolveSceneGate} from '../src/scene/intimacy-gate.js';
import {analysisRequestBudget} from '../src/continuity/request-budget.js';
import {stableFingerprint as fingerprint} from '../src/decision/policy.js';
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

let clock=0,calls=0;const durations=[];const limited=analysisRequestBudget(async(...args)=>{calls++;durations.push(args[4].timeoutMs);},{maxRequests:2,totalMs:150,now:()=>clock});
await limited(null,null,null,null,{timeoutMs:120});clock=100;await limited(null,null,null,null,{timeoutMs:120});assert.deepEqual(durations,[120,50]);assert.throws(()=>limited(),e=>e.code==='ANALYSIS_REQUEST_BUDGET');assert.equal(calls,2);

const diagnostic=[];analysisDiagnostic((_code,detail)=>diagnostic.push(detail),'analysis_result',{status:'succeeded',baselineCount:12,baselineTotal:42,repairCount:1,invalidCount:2,original:'PRIVATE_SENTINEL'});assert.equal(diagnostic[0].baselineTotal,42);assert.equal(diagnostic[0].repairCount,1);assert.ok(!JSON.stringify(diagnostic).includes('SENTINEL'));
const report=wholeDiagnosticReport({execution:{},record:{analysisJournalV1:[{raw:'PRIVATE_SENTINEL'}]},chat:[],fingerprint});
assert.ok(!JSON.stringify(report).includes('SENTINEL'));
console.log('Role refactor passed: malformed answers, authoritative participation, bounded routing, finite request budget and source privacy.');
