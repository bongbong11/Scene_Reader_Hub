import assert from 'node:assert/strict';
import {fixture} from './regression/audit-v012.mjs';
import {createRecordBank} from '../src/character/records.js';
import {stableFingerprint as hash} from '../src/decision/policy.js';
import {baseRecordRef} from '../src/character/evolution.js';
import {messageRef} from '../src/continuity/analysis-window.js';
import {FALLBACKS} from '../src/scene/policy.js';

const actor={id:'a',name:'Arden',kind:'character',npcRole:'',source:'Arden distrusts Blake.',sourceVisibleToMain:true};
const rule={type:'relationship',target:'Blake',when:['always'],rule:'Arden distrusts Blake even when sharing practical tasks.',modality:'tendency',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'};
actor.recordBank=createRecordBank({entity_type:'character',entity_name:'Arden',records:[rule]},actor,'integration');
for(const route of ['normal','paused']){
 const f=fixture({analysis:true}),requests=[];f.ctx.name2='Arden';
 f.ctx.chat=[{is_user:true,mes:'Blake offers help.'},{is_user:false,mes:'Arden says, "I trust Blake with this task."'},{is_user:true,mes:'Arden and Blake continue their discussion.'}];
 f.sandbox.actor=structuredClone(actor);
 f.run('settings.continuityEnabled=true;settings.reasonerProfileId="synthetic";characterStore={enabled:true,characters:[actor],npcs:[{id:"b",name:"Blake",kind:"npc",source:"Blake helps Arden."}],persona:null};record(true);');
 const key=f.run('stateChatKey()'),proof=messageRef(key,f.ctx.chat,1,hash);
 const candidate={id:'proposal',type:'character',section:'evolution',status:'pending',attempts:0,sourceIndex:1,evidence:[{identity:proof,quote:'I trust Blake with this task.'}],baseline:rule,prior:null,
  data:{actorId:'a',baseRef:baseRecordRef(actor.recordBank,rule,0,hash),existingId:null,operation:'exception',category:'relationship',compactRule:'Arden trusts Blake with this task.',stateSummary:null,compactStatus:'fits',exportEligible:true,scope:{actorId:'a',targetIds:['b']},sourceType:'world_fact',epistemic:'established'}};
 f.sandbox.batch={id:'batch',refs:[proof],coverage:{continuity:'complete',evolution:'complete',persona:'not_requested'},candidates:[candidate],status:'pending'};
 let profileCalls=0;
 f.sandbox.mockProfile=async(_service,_profile,_system,input)=>{
  profileCalls++;const base=input.baseline_records.find(b=>b.actorId==='a'),segment=input.source_segments.find(s=>s.role==='assistant');
  return {result:{protocol:1,record_reviews:input.baseline_records.map(b=>({base_ref:b.ref,status:'change',reason_ko:'일정 범위의 신뢰가 확인됨'})),coverage:{memory:'complete',characters:'complete',persona:'not_requested'},memory_changes:[],knowledge_changes:[],deferred_changes:[],character_changes:[{actor_id:'a',base_ref:base.ref,record_type:rule.type,target_ids:['b'],op:'exception',compact_rule:candidate.data.compactRule,original_ko:'함께 하는 일에서도 신뢰하지 않는다.',replacement_ko:'이 일에서는 상대를 신뢰한다.',reason_ko:'대사에 명확한 근거가 있다.',source_type:'world_fact',epistemic:'established',evidence:[{ref:segment.ref,quote:'I trust Blake with this task.'}]}]}};
 };
 f.run('connectionRequestService={};requestWithConnectionProfile=mockProfile;');
 const collected=await f.run('analysis.requestManual().completion');
 assert.equal(collected.status,'saved');assert.equal(profileCalls,1);

 f.sandbox.mockJev=async body=>{
  requests.push(body);const answers={};
  for(const [key,q]of Object.entries(body.questions)){
   if(q.type==='noul'){answers[key]={type:'noul',noul:0.85};continue;}
   let choice=Object.hasOwn(q.criteria,FALLBACKS[key])?FALLBACKS[key]:Object.keys(q.criteria)[0];
   assert.ok(!key.startsWith('continuity_delta_'),'collection is not rejudged by Jev');
   if(key.startsWith('scene_participant_'))choice='direct';
   if(key==='scene_phase')choice=route==='paused'?'active':'normal';
   if(key==='scene_level')choice=route==='paused'?'4':'0';
   if(key==='scene_evidence')choice=Object.keys(q.criteria).filter(k=>k!=='none').at(-1);
   if(/^character_\d+_presence$/.test(key))choice='active';
   if(/^character_\d+_participation$/.test(key))choice='direct';
   answers[key]={choice,confidence:0.95};
   if(key==='scene_participant_0')answers[key]={choice:'direct',confidence:.53,probabilities:{unknown:0,direct:.61,remote:.03,continuing:.35,departed:0,reference:.01}};
  }
  return {answers};
 };
 f.run('callJev=mockJev;');
 await f.run('runJudge({force:true})');
 const saved=JSON.parse(f.run('JSON.stringify(record())'));
 assert.equal(saved.characterEvolutionV1.entries[0].compactRule,candidate.data.compactRule,'profile collection commits through actual storage before the next judgment');
 assert.ok(requests.every(r=>!Object.keys(r.questions).some(k=>k.startsWith('continuity_delta_'))));
 if(route==='normal'){
  const selection=requests.find(r=>r.state.character_profiles);
  assert.ok(selection.questions.character_0_record_0.instructions.includes(candidate.data.compactRule));
  assert.ok(!selection.questions.character_0_record_0.instructions.includes(rule.rule));
  assert.ok(saved.lastJudgment.payload.includes(candidate.data.compactRule));assert.ok(!saved.lastJudgment.payload.includes(rule.rule));
 }
 if(route==='paused'){assert.equal(saved.sceneIntimacy.route,'paused');assert.ok(saved.lastJudgment.payload.includes(candidate.data.compactRule));assert.ok(!saved.lastJudgment.payload.includes(rule.rule));}
 assert.deepEqual(JSON.parse(f.run('JSON.stringify(characterStore.characters[0].recordBank.records)')),[rule]);
 f.run('analysis.cancel("test_complete");');await f.run('analysis.completion');
}

// Production output hook: a normal answer starts a detached job, while stopped
// and OOC outputs do not collect. The caller resolves before provider completion.
const f=fixture({analysis:true});let finish,called=0;
f.sandbox.heldProfile=async()=>{called++;await new Promise(r=>finish=r);return {result:{protocol:1,coverage:{memory:'complete',characters:'complete',persona:'not_requested'},memory_changes:[],knowledge_changes:[],character_changes:[],deferred_changes:[],topic_fixation:null}};};
f.run('settings.continuityEnabled=true;settings.continuityInterval=3;settings.reasonerProfileId="synthetic";connectionRequestService={};requestWithConnectionProfile=heldProfile;record(true);');
for(let i=0;i<3;i++){
 f.ctx.chat.push({is_user:true,mes:'A synthetic question.'},{is_user:false,mes:'A synthetic answer.'});
 f.run('activeGenerationCycle={mode:"rp",chatKey:stateChatKey(),startedAt:"synthetic"};pendingGenerationType="normal";');
 await f.run(`onCharacterMessageReceived(${f.ctx.chat.length-1})`);
 if(i<2)await f.run('analysis.completion');
}
for(let i=0;i<20&&!finish;i++)await new Promise(r=>setImmediate(r));
assert.equal(called,1);assert.equal(typeof finish,'function','RP completion returned while auxiliary request was still pending');
f.run('invalidateReasonerJobs({reason:"generation_stopped"});');finish();await f.run('analysis.completion');
assert.ok(!f.run('record().characterEvolutionV1'),'cancelled late result cannot commit');
f.ctx.chat.push({is_user:true,mes:'[OOC: setup]'},{is_user:false,mes:'[OOC: done]'});
f.run('activeGenerationCycle={mode:"ooc",startedAt:"synthetic"};');await f.run(`onCharacterMessageReceived(${f.ctx.chat.length-1})`);
assert.equal(called,1);
console.log('Cumulative production integration passed: existing gate/selection/storage, immutable originals, detached completed-output collection, stop and OOC boundaries.');

// Cancellation during output persistence must not restart a stopped analysis.
const mid=fixture({analysis:true});let resume,entered=false;
mid.ctx.chat=[{is_user:true,mes:'Synthetic input'},{is_user:false,mes:'Synthetic completed reply'}];
mid.sandbox.waitingSave=async()=>{entered=true;await new Promise(r=>resume=r);};
mid.run('settings.continuityEnabled=true;settings.reasonerProfileId="synthetic";record(true).pendingPlan={inputKey:"input",chatCount:1};persistChat=waitingSave;activeGenerationCycle={mode:"rp",chatKey:stateChatKey(),inputKey:"input",startedAt:"test"};pendingGenerationType="normal";');
const receiving=mid.run('onCharacterMessageReceived(1)');while(!entered)await new Promise(r=>setImmediate(r));
mid.run('invalidateReasonerJobs({reason:"generation_stopped"});activeGenerationCycle={mode:"rp",startedAt:""};');resume();await receiving;await mid.run('analysis.completion');
assert.equal(mid.run('record().analysisRuntimeV1'),undefined,'a cancelled output save cannot reset the analysis stop flag');
console.log('Production cancellation during output persistence passed.');
