import assert from 'node:assert/strict';
import {fixture} from './regression/audit-v012.mjs';
import {createRecordBank} from '../src/character/records.js';
import {FALLBACKS} from '../src/decision/answers.js';
import {castBeats,castQuestions,resolveCastBindings} from '../src/scene/cast-binding.js';
import {selectEventCast} from '../src/character/selection.js';
import {buildEventCastInjection} from '../src/injection/npc-execution.js';
import {negativePriorityInstruction} from '../src/injection/priority.js';
import {eventFollowups} from '../src/continuity/candidates.js';
import {wholeDiagnosticReport} from '../src/debug/whole-report.js';
import {observePromptReceipt,createPromptObserver} from '../src/injection/receipt.js';
import {createDecisionVerification} from '../src/decision/verification.js';
import {buildVerificationQuestions} from '../src/decision/policy.js';

function person(kind,name,rule) {
 const entry={id:name.toLowerCase(),kind,name,source:`Name: ${name}`,sourceVisibleToMain:false};
 entry.recordBank=createRecordBank({entity_type:kind,entity_name:name,records:[{type:'relationship',target:'Morgan',when:['general'],rule,modality:'tendency',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'}]},entry,'cast-test');
 return entry;
}
const main=person('character','Morgan','Morgan weighs professional duties against personal promises.');
const rival=person('npc','Blair','Blair competes for Morgan’s attention through invitations and pointed requests; never acts as an obedient helper.');
const unrelated=person('npc','Avery','Avery repairs bicycles and knows the local workshop.');
assert.equal(selectEventCast([unrelated,rival],'Morgan competes attention invitations')[0].id,rival.id);
const stale=structuredClone(rival);stale.source='replaced source';
assert.deepEqual(selectEventCast([stale],'Morgan'),[],'stale records cannot supply a prospective actor');

for(const advanced of [true,false])for(const personChance of [0,100]) {
 const f=fixture(),requests=[];
 f.ctx.name2='Morgan';f.ctx.chat=[{is_user:true,name:'User',mes:'Morgan and I discuss the upcoming public reception.'}];
 f.sandbox.people=[structuredClone(main),structuredClone(rival)];
 f.sandbox.options={advanced,personChance};
 f.run(`record(true);Object.assign(record().preferences,{advancedEnabled:options.advanced,advancedElements:['relationship'],newGenerationEnabled:true,advancedStyle:'very_active',appearanceChance:options.personChance,spontaneousMode:'off',socialEnabled:false});
 characterStore={enabled:true,characters:[people[0]],npcs:[people[1]],persona:null};`);
 f.sandbox.reply=async body=>{
  requests.push(body);
  return {answers:Object.fromEntries(Object.entries(body.questions).map(([key,q])=>{
   if(q.type==='noul')return [key,{type:'noul',noul:0.9}];
   let choice=Object.hasOwn(q.criteria,FALLBACKS[key])?FALLBACKS[key]:Object.keys(q.criteria)[0];
   if(key.startsWith('scene_participant_')||key.endsWith('_participation'))choice='direct';
   if(key.endsWith('_opportunity'))choice='candidate_1';
   if(/^event_cast_\d+$/.test(key))choice='sheet_0';
   if(/^event_cast_\d+_action$/.test(key))choice='obstruction';
   return [key,{choice,confidence:0}];
  }))};
 };
 f.run('callJev=reply');
 let result,attempt=0;
 do {
  await f.run(`runJudge({force:true,pendingUserText:${JSON.stringify('Discuss the reception option '+attempt)}})`);
  result=JSON.parse(f.run('JSON.stringify(record().lastJudgment)'));attempt++;
 }while(advanced&&!result?.cast?.length&&attempt<20);
 assert.ok(result,'pipeline commits');assert.equal(requests.length,2*attempt,'no extra Jev call for cast');
 const request=requests.at(-1);
 if(advanced){
  assert.ok(request.questions.event_cast_0.criteria.sheet_0);
  assert.ok(request.state.character_profiles.people.some(p=>p.name==='Blair'&&p.plannedOnly));
  assert.ok(!request.questions.character_1_participation,'prospective cast is not judged as already present');
  assert.ok(!Object.keys(request.questions).some(key=>key.startsWith('sexual_1')));
  assert.equal(result.cast[0].actorId,'blair');
  assert.match(result.payload,/Event actor: Blair/);
  assert.match(result.payload,/actually obstruct/);
  assert.ok(result.payload.includes(rival.recordBank.records[0].rule),'acting NPC gets actual stored characterization');
  assert.ok(!result.characterTrace.some(p=>p.id==='blair'),'planned actor never becomes observed participation');
  assert.equal(result.castRecordCounts[0].injected,1);
  assert.equal(result.opportunityPlan.person.chance,personChance);
  assert.equal(result.opportunityPlan.additions.filter(x=>x.feature==='person').length,personChance?1:0);
  const log=wholeDiagnosticReport({judgment:result,record:{},execution:{}});
  assert.ok(!JSON.stringify(log).includes('Blair'));
  assert.equal(log.eventCast[0].action,'obstruction');
 }else assert.equal(result.cast.length,0);
 // Final-request receipt sees the complete assembled cast prompt, not only the base scene.
 const receipt=observePromptReceipt({messages:[{role:'system',content:result.payload}]},{payload:result.payload});
 assert.equal(receipt.scene,'confirmed');
 if(advanced&&personChance===0){
  f.ctx.chat.push({is_user:false,name:'Morgan',mes:'Morgan sends the reception invitation.'});
  f.run(`record().continuity={items:[],knowledge:[],dependencies:[],revision:0,followups:[{id:'invite-step',action:'Send the reception invitation',character:'Morgan',relatedStateId:'event:current',status:'available',executed:false,lastOffered:null}]};
    Object.assign(record().pendingPlan,{outputText:getContext().chat[1].mes,outputIndex:1,outputFingerprint:stableFingerprint(getContext().chat[1].mes),eventFollowups:[{id:'invite-step',action:'Send the reception invitation'}]});`);
  await f.run('runJudge({force:true,pendingUserText:"Morgan waits for the answer."})');
  assert.equal(f.run('record().continuity.followups.find(item=>item.id==="invite-step").executed'),false,'retired continuity steps are no longer executed or verified');
  assert.ok(!f.run('JSON.stringify(record().lastJudgment.actionPlan)').includes('invite-step'),'a step verified complete cannot be offered again in that same preparation cycle');
 }
}

const beats=[{key:'A_relationship_01',text:'A rival makes a concrete move.',element:'relationship',title:'Rival intervention'}];
const questions=castQuestions(beats,[rival],[],{newPersonAllowed:false});
assert.equal(questions.event_cast_0.criteria.new_person,undefined);
const additions=[{feature:'event',templateId:beats[0].key,candidate:{effect:'Concrete pressure.'}}];
let bound=resolveCastBindings({beats,sheets:[rival],answers:{event_cast_0:{choice:'new_person'}},additions});
assert.equal(bound[0].reason,'new_person_not_selected');
assert.doesNotMatch(buildEventCastInjection(bound),/Event actor: the selected new participant/);
const personAddition={feature:'person',profile:{id:'new-id',role:'Contact'},candidate:{action:'An ordinary contact arrives.'}};
bound=resolveCastBindings({beats,sheets:[],answers:{event_cast_0:{choice:'new_person'},event_cast_0_action:{choice:'manipulation'}},additions:[...additions,personAddition]});
assert.equal(bound[0].kind,'new');assert.equal(personAddition.boundEvent,beats[0].key);
assert.match(personAddition.candidate.action,/rival makes/);
assert.match(buildEventCastInjection(bound),/actually know|known facts/);
assert.equal(castBeats(null,{source:'advanced',phase:'active',prompt:'Keep negotiating.'})[0].key,'ongoing');
assert.equal(castBeats(null,{source:'advanced',phase:'aftermath'}).length,0);
for(const [choice,kind] of [['generated_0','generated'],['scene_existing','scene_existing'],['current_cast','current_cast'],['no_access','unresolved'],['sheet_99','unresolved']]) {
 const bindings=resolveCastBindings({beats,sheets:[rival],generated:[{id:'known',role:'Established contact'}],answers:{event_cast_0:{choice}},additions});
 assert.equal(bindings[0].kind,kind);
 assert.equal(bindings[0].verification,'awaiting_output');
 assert.equal(bindings[0].action,'character_driven','missing action selects a concrete default, not another rejection');
 assert.equal(additions.length,1,'cast selection cannot remove the selected event');
}
const ongoingBeats=castBeats(null,{source:'advanced',phase:'active',prompt:'Keep negotiating.'});
assert.equal(resolveCastBindings({beats:ongoingBeats,decisions:{advanced_route:'continue',advanced_move:'quiet'}}).length,0);
assert.equal(resolveCastBindings({beats:ongoingBeats,decisions:{advanced_route:'pause',advanced_move:'contact'}}).length,0);
assert.equal(resolveCastBindings({beats:ongoingBeats,answers:{event_cast_0:{choice:'current_cast'}},decisions:{advanced_route:'continue',advanced_move:'contact'}})[0].kind,'current_cast');

// Preparing/delivering a direction is never proof that its action happened.
for(const verdict of ['missed','partial','fulfilled']) {
 const rec={continuity:{revision:0,followups:[{id:'step',status:'available',executed:false}]},pendingPlan:{inputKey:'test',outputText:'Synthetic completed output',outputIndex:1,effects:[],additions:[],decisions:{},eventFollowups:[{id:'step',action:'Send the agreed invitation'}],cast:[{beatKey:'ongoing',kind:'sheet',actorId:'blair',name:'Blair',action:'obstruction',delivery:'request_included'}]}};
 const history=[], diagnostics=[];
 const questions=buildVerificationQuestions(rec.pendingPlan);
 assert.match(questions.verification_event_actor_0.instructions,/Inner thoughts/);
 assert.equal(questions.verification_event_followup_0,undefined,'retired followup questions cannot return from an old pending plan');
 const verifier=createDecisionVerification({stateChatKey:()=> 'synthetic',verificationSummary:()=>({}),reversibleStateSnapshot:()=>({}),commitVerifiedPlan:()=>({committed:false,committedEffects:{}}),loadStateHistory:async()=>history,saveStateHistory:async value=>history.push(...value),noteDiagnostic:(stage,detail)=>diagnostics.push({stage,...detail})});
 await verifier.commitPriorVerification(rec,{verification_event_actor_0:verdict,verification_event_followup_0:verdict});
 assert.equal(rec.continuity.followups[0].executed,false);
 assert.equal(rec.lastVerification.cast[0].verification,verdict);
 assert.equal(history[0].castVerification[0].verification,verdict);
 assert.ok(!JSON.stringify(diagnostics).includes('Blair'));
 assert.equal(rec.pendingPlan,null);
}
assert.ok(negativePriorityInstruction({negativePriority:true,socialEnabled:true},'',{npc_autonomy:'yes'}));
assert.equal(negativePriorityInstruction({negativePriority:true,socialEnabled:true},'',{}),'');
assert.ok(negativePriorityInstruction({negativePriority:true},'',{fight_sustain:'yes'}));
assert.equal(eventFollowups([{type:'followup',data:{relatedStateId:'event:current'}}],{id:'event-1'}).length,1);
assert.equal(eventFollowups([{type:'followup',data:{relatedStateId:'other-event'}}],{id:'event-1'}).length,0);
console.log('Event cast passed: prospective applied NPC records, zero-chance reuse, concrete action, same-event new actor, independent current presence, two-request pipeline and private diagnostics.');

// Delivery is observed separately from the immutable persisted judgment.
const judgment={inputKey:'input',sourceKey:'source',payload:'Synthetic event direction',cast:[{kind:'sheet',actorId:'blair',name:'Blair',action:'obstruction',delivery:'prepared'}]};
const record={lastJudgment:judgment,pendingPlan:{inputKey:'input',cast:structuredClone(judgment.cast),judgment:structuredClone(judgment)}};
const saved=JSON.stringify(judgment),events=[];
const observer=createPromptObserver({getExpected:()=>judgment,getNames:()=>({}),getCycleId:()=> 'cycle',getRecord:()=>record,report:(stage,code,detail)=>events.push({stage,code,...detail}),updateStatus(){},updateActivity(){}});
observer.start('normal');observer.inspectPrepared({messages:[{role:'system',content:judgment.payload}]});
assert.equal(record.pendingPlan.cast[0].delivery,'prepared');
observer.verifyRequest({messages:[{role:'system',content:judgment.payload}]});assert.equal(record.pendingPlan.cast[0].delivery,'request_included');assert.equal(JSON.stringify(judgment),saved);
observer.verifyRequest({messages:[{role:'system',content:'No event direction'}]});assert.equal(record.pendingPlan.cast[0].delivery,'request_missing');assert.ok(!JSON.stringify(events).includes('Blair'));
