import assert from 'node:assert/strict';
import {auxiliaryFixture,emptyResponse} from './fixtures/auxiliary-runtime.mjs';
import {fixture as makeHub} from './regression/audit-v012.mjs';
import {messageRef} from '../src/continuity/source-refs.js';
import {confirmedContinuity,selectActiveContinuity} from '../src/continuity/selection.js';
import {continuityActors} from '../src/continuity/actors.js';
import {continuityAnalysisContext} from '../src/continuity/analysis-context.js';
import {applyContinuityVerdicts,buildContinuityInjection,validateReasonerResult} from '../src/continuity/engine.js';
import {candidateDecisions} from '../src/continuity/candidates.js';
import {commitAnalyzedContinuity} from '../src/continuity/commit-analysis.js';
import {createContinuityView} from '../src/ui/results/continuity.js';

const promise={kind:'commitment',label:'Aster will bring the spare key at noon',lifecycle:'active',owners:['Aster'],time:'noon',impact:'The delivery remains pending.',source_type:'promise',evidence:'I will bring the spare key at noon.'};
// Actual output event -> auxiliary request adapter -> saved state -> Hub injection.
const hub=makeHub({analysis:true}),requests=[],jev=[];
hub.ctx.name2='Aster';
hub.sandbox.syntheticJev=async body=>{
 jev.push(body);
 const choices={scene_status:'ordinary',scene_level:'0',scene_phase:'normal',scene_evidence:'none'};
 return {answers:Object.fromEntries(Object.entries(body.questions).map(([key,q])=>[key,q.type==='noul'?{type:'noul',noul:.9}:{choice:Object.hasOwn(q.criteria,choices[key])?choices[key]:Object.hasOwn(q.criteria,'none')?'none':Object.keys(q.criteria)[0],confidence:1}]))};
};
hub.sandbox.syntheticService={getProfile:()=>({name:'Synthetic',model:'fixture'}),validateProfile(){},async sendRequest(id,messages,maxTokens){
 requests.push({id,messages,maxTokens});
 return {content:JSON.stringify({...emptyResponse().result,new_items:[promise]})};
}};
hub.run("record(true);settings.continuityEnabled=true;settings.reasonerProfileId='synthetic';connectionRequestService=syntheticService;callJev=syntheticJev;");
for(const text of ['He puts the basin away. "I will bring the spare key at noon."','He closes the drawer.','He leaves the kitchen.']) {
 hub.ctx.chat.push({is_user:true,mes:'Continue.'});
 await hub.run("onBeforeGeneration('normal',{},false)");
 hub.ctx.chat.push({is_user:false,mes:text});
 await hub.run(`onCharacterMessageReceived(${hub.ctx.chat.length-1})`);
 await hub.run('analysis.completion');
}
assert.equal(requests.length,1,'one auxiliary request per three finished replies, without Jev permission');
const input=JSON.parse(requests[0].messages.at(-1).content);
assert.match(input.source_rp,/bring the spare key/);assert.match(input.source_rp,/leaves the kitchen/);
assert.ok(input.actor_names.includes('Aster'));
assert.equal(hub.run('record().continuity.items.length'),1);
hub.ctx.chat.push({is_user:true,mes:'She waits near the door.'});
await hub.run('runJudge({force:true})');
assert.match(hub.run('record().lastJudgment.payload'),/bring the spare key at noon/,'pronoun-only scene still retrieves the primary character commitment');
assert.match(hub.run('activeInjectionPayload'),/bring the spare key/);
assert.match(hub.run('activeInjectionPayload'),/time=noon/);
assert.match(hub.run('activeInjectionPayload'),/delivery remains pending/);
assert.ok(jev.every(body=>!body.questions.continuity_trigger));
assert.ok(jev.every(body=>!String(body.state.scope).includes('Only advanced progression')),'old event restriction must not contradict valid event offers');

// Empty-input continuations are separate finished outputs, not one overwritten user group.
const empty=auxiliaryFixture({chat:[{is_user:true,mes:'Go on.'}]});
for(const text of ['First reply.','Second reply.','Third reply.']){empty.context.chat.push({is_user:false,mes:text});await empty.analysis.queue(empty.context.chat.length-1);}
assert.equal(empty.requests.length,1);assert.match(empty.requests[0][3].source_rp,/First reply/);assert.match(empty.requests[0][3].source_rp,/Third reply/);
// Room switches/cancellation retain already finished, valid pending sources.
const switched=auxiliaryFixture();await switched.turn();await switched.turn();switched.analysis.cancel('domain_state_changed');await switched.turn();assert.equal(switched.requests.length,1);
// A queued output must compute its window after the earlier request commits.
const overlap=auxiliaryFixture();await overlap.turn();await overlap.turn();let release;
overlap.deps.requestWithConnectionProfile=async(...args)=>{overlap.requests.push(args);return new Promise(resolve=>{release=resolve;});};
const first=overlap.turn();while(!release)await new Promise(resolve=>setImmediate(resolve));
const next=overlap.turn();release(emptyResponse());await first;await next;
assert.equal(overlap.requests.length,1,'queued completion does not analyze the same three outputs twice');

// Named evidence is not required, but fabricated evidence and invalid fields remain rejected.
const f=auxiliaryFixture();await f.turn('He says, "I will bring the spare key at noon."');await f.turn('A quiet reply.');
f.deps.requestWithConnectionProfile=async()=>({result:{new_items:[promise],affected:'invalid'}});
await f.turn('Another reply.');const rec=f.records.get('room-A');
assert.equal(rec.continuity.items.length,1);assert.equal(rec.lastContinuityTrace.status,'partial');assert.equal(rec.lastContinuityTrace.invalidCount,1);
assert.deepEqual(rec.continuity.items[0].sourceRefs.map(ref=>ref.messageIndex),[0,1]);
f.context.chat[3].is_hidden=true;
const options={record:rec,chatRef:'room-A',chat:f.context.chat,fingerprint:f.deps.fingerprint};
assert.equal(confirmedContinuity(rec.continuity,options).items.length,1,'hiding an unrelated reply does not hide the promise');
f.context.chat[1].is_hidden=true;assert.equal(confirmedContinuity(rec.continuity,options).items.length,0);
f.context.chat[1].is_hidden=false;

// A completion's visibility controls completion, independently of the original promise.
f.context.chat.push({is_user:true,mes:'Did you bring it?'},{is_user:false,mes:'He places the spare key in her hand.'});
const source={chatKey:'room-A',assistantIndex:7,outputFingerprint:'completion',refs:[messageRef('room-A',f.context.chat,7,f.deps.fingerprint)]};
const changes=validateReasonerResult({affected:[{state_id:rec.continuity.items[0].id,relation:'changed',lifecycle:'completed',pressure:'none',reason:'The spare key has been delivered.',source_type:'completed_action',evidence:'He places the spare key in her hand.'}]},{sourceText:f.context.chat[7].mes,continuity:rec.continuity,sourceIdentity:source});
const finished=applyContinuityVerdicts(rec.continuity,changes,candidateDecisions(changes)).continuity;
assert.equal(confirmedContinuity(finished,options).items[0].lifecycle,'completed');
f.context.chat[7].is_hidden=true;assert.equal(confirmedContinuity(finished,options).items[0].lifecycle,'active');
f.context.chat[7].is_hidden=false;f.context.chat[7].mes='He leaves without the key.';assert.equal(confirmedContinuity(finished,options).items[0].lifecycle,'active');
const display={innerHTML:''};
createContinuityView({document:{getElementById:()=>display},readState:()=>({settings:{continuityEnabled:true},reasonerProfiles:[]}),record:()=>({...rec,continuity:finished}),stateChatKey:()=>options.chatRef,getContext:()=>f.context,stableFingerprint:f.deps.fingerprint,escapeHtml:String,continuityLabel:String}).renderContinuity();
assert.match(display.innerHTML,/유효 · 압력 없음/);assert.doesNotMatch(display.innerHTML,/완료 · 압력/,'UI uses the same visible state as injection');

// Why an obstacle matters must survive into the actual instruction, without asserting completion.
const pressured={items:[],knowledge:[],followups:[],dependencies:[{stateId:'event:current',pressure:'blocked',reason:'The flooded bridge blocks the route to the appointment.'}]};
assert.match(buildContinuityInjection(pressured),/flooded bridge/);
const names=continuityActors({enabled:false,characters:[],npcs:[]},{name1:'Rowan',name2:'Aster'},'He watches her.');
assert.equal(selectActiveContinuity({items:[{...promise,owners:['aster']}]},'He watches her.',{actorIds:names}).items.length,1);
assert.ok(!JSON.stringify(continuityAnalysisContext({items:finished.items})).includes('stateUpdates'));

// Every valid section entry is stored; the separate injection selection is still bounded.
const evidence='The clerk confirms the appointment.';
const many={new_items:[0,1].map(i=>({...promise,label:`Plan ${i}`,evidence,source_type:'world_fact'})),affected:[0,1,2].map(i=>({state_id:`id${i}`,relation:'pressured',pressure:'blocked',reason:'Blocked',evidence,source_type:'world_fact'})),knowledge_updates:[0,1,2,3].map(i=>({fact_id:`fact${i}`,character:'Aster',source:'told',summary:'The appointment is confirmed.',evidence,source_type:'world_fact'})),possible_followups:[0,1].map(i=>({related_state_id:`id${i}`,action:'Confirm the route.',reason:'Appointment',evidence,source_type:'world_fact'}))};
const candidates=validateReasonerResult(many,{sourceText:evidence,continuity:{items:[0,1,2].map(i=>({id:`id${i}`}))},sourceIdentity:{outputFingerprint:'many'}});
assert.equal(candidates.length,11);
const history=[{assistantIndex:1,before:{},after:{}},{assistantIndex:5,before:{},after:{}}];
commitAnalyzedContinuity({},history,[{id:'early',type:'new_item',data:promise,sourceIdentity:{assistantIndex:1}},{id:'late',type:'new_item',data:promise,sourceIdentity:{assistantIndex:5}}]);
assert.equal(history[0].after.continuity.items.length,1);assert.equal(history[1].before.continuity.items.length,1);assert.equal(history[1].after.continuity.items.length,2);
assert.ok(!JSON.stringify(f.events).includes('spare key'),'diagnostics contain counts, not source prose');
console.log('Continuity output checks passed: completed RP reaches the profile and next injection; empty inputs, overlapping jobs, pronouns, field coverage, source hide/edit, state rollback, short context and snapshot timing.');
