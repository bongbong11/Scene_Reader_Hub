import assert from 'node:assert/strict';
import {makeOpportunities,rememberOpportunity} from '../src/scene/opportunities.js';
import {resolveOpportunities,opportunityDetail} from '../src/scene/opportunity-policy.js';
import {commitOpportunityState} from '../src/scene/opportunity-state.js';
import {opportunitySummary,safeOpportunityPlan} from '../src/debug/opportunity-events.js';
import {additionBlocks,incorporateAdditions} from '../src/injection/opportunity.js';
import {createPromptObserver} from '../src/injection/receipt.js';
import {EVENTS,PEOPLE,ADVANCED_TEMPLATES} from '../src/scene/opportunity-catalog.js';
import {createStateSnapshots} from '../src/lifecycle/snapshots.js';
import {buildInjection} from '../prompt-library.js';
import {FALLBACKS} from '../src/decision/answers.js';
import {selectActionPlan} from '../src/decision/action-budget.js';
import {fixture} from './regression/audit-v012.mjs';
import {restoreOpportunityPreferences} from '../src/scene/opportunity-settings.js';

{
    const rec={preferences:{},opportunityPreferences:{newGenerationEnabled:false,spontaneousMode:'both'}};
    restoreOpportunityPreferences(rec,{});
    assert.equal(rec.preferences.newGenerationEnabled,false);
    assert.equal(rec.preferences.spontaneousMode,'both');
    restoreOpportunityPreferences(rec,{newGenerationEnabled:true,spontaneousMode:'person'});
    assert.deepEqual(rec.opportunityPreferences,{newGenerationEnabled:true,spontaneousMode:'person'});
    restoreOpportunityPreferences(rec,{newGenerationEnabled:false,spontaneousMode:'bad-value'});
    assert.deepEqual(rec.opportunityPreferences,{newGenerationEnabled:false,spontaneousMode:'off'});
}

const preferences={settingsContract:3,newGenerationEnabled:true,spontaneousMode:'both',advancedEnabled:false,advancedStyle:'very_active',appearanceChance:75,villainEnabled:false,developmentStyle:'balanced',worldDirection:'natural'};
const makeRecord=overrides=>({preferences:{...preferences,...overrides},pacingState:{event:{qualifiedSteps:0,evidence:[]}}});
const choose=(offers,choice='candidate_1')=>resolveOpportunities(offers,{event_opportunity:{choice,confidence:0.01},person_opportunity:{choice,confidence:0.01}});
const histRec=makeRecord();
let eventHits=0,personHits=0,both=0,maxPrompt=0;
const eventIds=new Set(),personIds=new Set();
for(let i=0;i<10000;i++) {
    const offers=makeOpportunities(histRec,`population-${i}`),selected=choose(offers);
    eventHits+=selected.some(x=>x.feature==='event');personHits+=selected.some(x=>x.feature==='person');both+=selected.length===2;
    assert.ok(selected.length<=2);
    assert.equal(new Set(selected.map(x=>x.feature)).size,selected.length);
    for(const item of selected){(item.feature==='event'?eventIds:personIds).add(item.templateId);rememberOpportunity(histRec,item,'request_included');}
    const blocks=additionBlocks(selected,preferences,false),payload=incorporateAdditions(buildInjection({settings:preferences,decisions:FALLBACKS}),blocks,preferences);
    for(const b of blocks)assert.ok(payload.includes(b.text),'both winners reach the actual injection');
    maxPrompt=Math.max(maxPrompt,payload.length);
    assert.ok(histRec.opportunities.offered.length<=32);
}
assert.ok(Math.abs(eventHits/10000-.75)<.025);assert.ok(Math.abs(personHits/10000-.75)<.025);
assert.ok(Math.abs(both/10000-.5625)<.025,'channels must remain independent');
assert.equal(eventIds.size,EVENTS.length);assert.equal(personIds.size,PEOPLE.length);
for(const rate of [18,35,58,75]) {
    const r=makeRecord({advancedStyle:({18:'conservative',35:'balanced',58:'active',75:'very_active'})[rate]});
    let passed=0;
    for(let i=0;i<3000;i++){const o=makeOpportunities(r,`rate-${i}`);passed+=choose(o).some(x=>x.feature==='event');}
    assert.ok(Math.abs(passed/3000-rate/100)<.035);
}
// Explicit impossibility and invalid output are reported; weak preference confidence
// is not another event lottery or permission to weaken fact verification.
for(const block of ['blocked_access','blocked_world','blocked_user_constraint','blocked_prerequisite','invalid']) {
    const r=makeRecord({appearanceChance:100});let o;
    for(let n=0;!(o?.event.passed);n++)o=makeOpportunities(r,`blocks-${n}`);
    assert.equal(choose(o,block).length,0);assert.equal(o.event.reasonCode,block==='invalid'?'invalid_selection':block);
}
assert.equal(opportunityDetail({choice:'candidate_1',confidence:0.01},{candidates:[EVENTS[0]]}).effective,'candidate_1');
// Retry/refresh retain material and rolls even when diversity history changes.
const retry=makeRecord({appearanceChance:100}),a=makeOpportunities(retry,'fixed-ticket');
const selected=choose(a);for(const x of selected)rememberOpportunity(retry,x,'request_included');
const b=makeOpportunities(JSON.parse(JSON.stringify(retry)),'fixed-ticket');
assert.deepEqual(b.person.candidates,a.person.candidates);assert.equal(b.person.roll,a.person.roll);
const disabled=makeOpportunities(makeRecord({newGenerationEnabled:false}),'off');
assert.equal(choose(disabled).length,0);assert.equal(disabled.event.roll,null);assert.equal(disabled.person.roll,null);
const ongoing=makeRecord({spontaneousMode:'both'});ongoing.eventProfile={id:'original',phase:'active'};
for(let i=0;i<100;i++) {
    const o=makeOpportunities(ongoing,`ongoing-${i}`);assert.equal(o.event.scope,'local');
    assert.ok(o.event.candidates.every(x=>!x.element));
}
const pending=makeRecord({advancedEnabled:true,spontaneousMode:'off'});
pending.pendingPlan={outputText:'A synthetic occurrence begins.',additions:[{feature:'event',scope:'central'}]};
assert.equal(makeOpportunities(pending,'unverified-event').event.reasonCode,'existing_event');
// A direct-response budget formerly excluded independent new routes. Explicit
// additions reach the prompt even with this same ongoing budget unchanged.
const priorBudget=selectActionPlan({settings:{...preferences,advancedEnabled:true},decisions:{...FALLBACKS,primary_focus:'direct',secondary_focus:'none',advanced_route:'create',advanced_move:'seed',npc_route:'create'},allowUnpreparedCreates:true});
assert.ok(priorBudget.excluded.some(x=>x.id==='advanced_event'));
const bothRecord=makeRecord({appearanceChance:100});let bothOffers;
for(let i=0;!bothOffers?.event.passed;i++)bothOffers=makeOpportunities(bothRecord,`both-${i}`);
const winners=choose(bothOffers),bothBlocks=additionBlocks(winners,preferences,false);
assert.equal(winners.length,2);assert.ok(bothBlocks.every(x=>incorporateAdditions(buildInjection({settings:preferences,decisions:FALLBACKS}),bothBlocks,preferences).includes(x.text)));
assert.equal(resolveOpportunities(bothOffers,{person_opportunity:{choice:'candidate_1'}}).length,1,'one invalid answer cannot erase the other valid addition');
const horror=makeRecord({spontaneousMode:'off',advancedEnabled:true,advancedElements:['horror']});
for(let i=0;i<100;i++)assert.ok(makeOpportunities(horror,`horror-${i}`).event.candidates.every(x=>!['A_horror_03','A_horror_05'].includes(x.id)));
for(let i=0;i<100;i++) {
    const record=makeRecord({advancedEnabled:true,advancedElements:['objective']});
    const offer=makeOpportunities(record,`local-${i}`),items=choose(offer);
    for(const x of items.filter(x=>x.feature==='event'&&!x.candidate.element)){assert.equal(x.scope,'local');assert.equal(x.profile,undefined);}
}
// Long use does not accumulate new central threads, active actor slots or
// unbounded diagnostic diversity history. Older actors remain stored for reuse.
const longUse=makeRecord({appearanceChance:100});longUse.eventProfile={id:'ongoing',phase:'active'};
for(let i=0;i<200;i++) {
    const items=choose(makeOpportunities(longUse,`long-use-${i}`));
    commitOpportunityState(longUse,{additions:items,outputIndex:i,outputFingerprint:`output-${i}`},Object.fromEntries(items.map((x,n)=>[`verification_addition_${n}`,'fulfilled'])));
    assert.equal(longUse.eventProfile.id,'ongoing');assert.ok(items.length<=2);
    assert.ok(longUse.opportunities.confirmed.length<=32);
}
assert.equal(longUse.generatedCast.length,199);assert.equal(new Set(longUse.generatedCast.map(x=>x.profile.id)).size,199);
// Output verification: no prepared fact becomes established on missed/partial person.
const person=selected.find(x=>x.feature==='person'),snapshots=createStateSnapshots({});
for(const verdict of ['missed','partial','not_applicable','fulfilled']) {
    const r=makeRecord();r.npcProfile={id:'previous',role:'witness'};const before=snapshots.reversibleStateSnapshot(r);
    commitOpportunityState(r,{additions:[person]}, {verification_addition_0:verdict});
    assert.equal(r.npcProfile.id,verdict==='fulfilled'?person.profile.id:'previous');
    if(verdict==='fulfilled'){assert.equal(r.generatedCast[0].profile.id,'previous');snapshots.restoreReversibleState(r,before);assert.equal(r.npcProfile.id,'previous');}
}
// Receipts use actual send content, never assembly success as proof of sending.
const receiver=makeRecord(),blocks=additionBlocks([person],preferences,false),payload=incorporateAdditions(buildInjection({settings:preferences,decisions:FALLBACKS}),blocks,preferences);
receiver.lastJudgment={payload,opportunityPlan:opportunitySummary(a,[person])};
const expected={payload,additionBlocks:blocks},reports=[];
assert.throws(()=>incorporateAdditions('Malformed assembly',blocks,preferences),/조립 형식/);
assert.equal(incorporateAdditions(payload,[],preferences),payload,'no additions preserve the existing assembly byte for byte');
const observer=createPromptObserver({getExpected:()=>expected,getNames:()=>({}),getCycleId:()=> 'cycle',getRecord:()=>receiver,report:(stage,event,detail)=>reports.push({stage,event,detail}),updateActivity:()=>{},updateStatus:()=>{}});
const messages=[{role:'system',content:payload}];observer.start('normal');observer.observe({prompt:messages});
assert.equal(receiver.opportunities,undefined);
observer.observeRequest({messages});assert.equal(receiver.lastJudgment.opportunityPlan.additions[0].delivery,'request_included');
assert.equal(receiver.opportunities.offered.length,1);
observer.verifyRequest({messages});assert.equal(receiver.opportunities.offered.length,1);
observer.start('normal');observer.verifyRequest({messages:[{role:'system',content:'Synthetic missing payload.'}]});
assert.equal(receiver.lastJudgment.opportunityPlan.additions[0].delivery,'request_missing');
assert.ok(!JSON.stringify(reports).includes('Selected action:'));
const unsafe={...opportunitySummary(a,[person]),dialogue:'PRIVATE_FIXTURE',candidates:[{action:'PRIVATE_FIXTURE'}],additions:[{...person,profile:{name:'PRIVATE_FIXTURE'}}]};
assert.ok(!JSON.stringify(safeOpportunityPlan(unsafe)).includes('PRIVATE_FIXTURE'));
assert.ok(!Object.hasOwn(retry.opportunities.current.person,'candidates'),'retry cache stores IDs, not duplicated prompt packages');

function setup(overrides={}) {
    const f=fixture(),calls=[];f.ctx.chat=[{is_user:true,mes:'A participant is speaking during a shared task in a public garden.'}];
    f.sandbox.testPreferences={...preferences,...overrides};
    f.run('record(true);Object.assign(record().preferences,testPreferences);settings.continuityEnabled=false;');
    const picks={scene_level:'0',scene_phase:'normal',scene_evidence:'none',basic_move:'dialogue',primary_focus:'direct',secondary_focus:'none',event_opportunity:'candidate_1',person_opportunity:'candidate_1'};
    f.sandbox.testJev=async request=>{calls.push(request);return {answers:Object.fromEntries(Object.entries(request.questions).map(([key,q])=>[key,q.type==='noul'?{type:'noul',noul:0.9}:{choice:key.startsWith('verification_addition_')?'fulfilled':Object.hasOwn(q.criteria,picks[key])?picks[key]:Object.hasOwn(q.criteria,FALLBACKS[key])?FALLBACKS[key]:Object.keys(q.criteria)[0],confidence:key.endsWith('_opportunity')?0.01:1}]))};};
    f.run('callJev=testJev');return {f,calls,picks};
}
// Creation off preserves existing execution, including ongoing events, NPCs
// and supported relationship movement rather than shutting down the story.
for(const kind of ['event','npc','relationship']) {
    const {f,calls,picks}=setup({newGenerationEnabled:false,advancedEnabled:kind==='event'});
    if(kind==='event'){
        f.run('record().eventProfile={id:"established-event",source:"advanced",element:"objective",title:"A shared task",goal:"Finish the task",trigger:"A present activity",pressure:"Limited resources",phase:"active",prompt:"Take one practical step.",worldId:"current"};');
        Object.assign(picks,{primary_focus:'event',event_state:'active',advanced_entry:'open',advanced_route:'continue',advanced_cause:'existing',advanced_element:'objective',advanced_move:'advance'});
    }
    if(kind==='npc'){
        f.run('record().npcProfile={id:"established-npc",role:"witness",aim:"Their own purpose",status:"active"};');
        Object.assign(picks,{primary_focus:'npc',npc_route:'reuse',npc_target:'stored_generated',npc_role:'participant',npc_weight:'brief',npc_presence:'present'});
    }
    if(kind==='relationship')Object.assign(picks,{primary_focus:'relationship',relationship_motion:'closer',trust_signal:'positive',intimacy_signal:'positive',romance_evidence:'attraction',counterevidence:'none',relationship_pacing:'closer_incremental',relationship_beat:'vulnerability'});
    await f.run('runJudge({force:true})');
    const judgment=f.run('record().lastJudgment');assert.equal(judgment.additionBlocks.length,0);assert.equal(calls.length,2);
    assert.match(judgment.payload,({event:/<ADVANCED_PROGRESSION/,npc:/<NPC_SCENE_EXECUTION/,relationship:/<RELATIONSHIP_PACING/})[kind]);
}
// Full production pipeline: modes, core styles, direction and creation off.
let runs=0;
for(const mode of ['off','event','person','both'])for(const enabled of [false,true])for(const style of ['static','balanced','dynamic']) {
    const {f,calls}=setup({spontaneousMode:mode,newGenerationEnabled:enabled,developmentStyle:style,appearanceChance:100});
    await f.run('runJudge({force:true})');runs++;
    assert.equal(calls.length,2,'only existing gate + decision requests, no opportunity request');
    assert.ok(!calls.at(-1).state.appearance_offer?.candidates,'the creation criteria must not be sent twice');
    const plan=f.run('record().pendingPlan'),judgment=f.run('record().lastJudgment');
    assert.ok(plan.additions.length<=2);
    if(!enabled)assert.equal(plan.additions.length,0);
    else assert.equal(plan.additions.filter(x=>x.feature==='person').length,1);
    assert.equal(Boolean(f.run('record().npcProfile')),false);
    assert.equal(Boolean(f.run('record().eventProfile')),false);
    for(const item of judgment.additionBlocks)assert.ok(judgment.payload.includes(item.text));
    if(judgment.additionBlocks.length)assert.equal((judgment.payload.match(/Silent scene directions for this IC response/g)||[]).length,1);
    await f.run('runJudge({force:true})');
    assert.equal(f.run('record().pendingPlan.additions.find(x=>x.feature==="person")?.profile.id'),plan.additions.find(x=>x.feature==='person')?.profile.id);
    if(enabled) {
        const prior=f.run('record().pendingPlan.additions.find(x=>x.feature==="person").profile.id');
        f.ctx.chat.push({is_user:false,mes:'A synthetic stranger makes accessible contact and performs the selected task.'});await f.run('onCharacterMessageReceived(1)');
        f.ctx.chat.push({is_user:true,mes:'The current conversation continues.'});await f.run('runJudge({force:true})');
        assert.equal(f.run('record().npcProfile.id'),prior,'only verified output commits the prepared actor');
    }
}
// Cancel a delayed decision then release it: no late injection/fact commit or restart.
{
    const {f}=setup({appearanceChance:100});const messages=[];
    f.sandbox.testMessages=messages;f.run('updateActivity=(message,options)=>testMessages.push({message,...options});');
    const normal=f.sandbox.testJev;
    f.sandbox.invalidJev=async request=>{const result=await normal(request);delete result.answers.person_opportunity;return result;};
    f.run('callJev=invalidJev');await f.run('runJudge({force:true})');
    assert.equal(f.run('record().lastJudgment.opportunityPlan.person.reasonCode'),'invalid_selection');
    assert.equal(f.run('record().pendingPlan.additions.some(x=>x.feature==="person")'),false);
    assert.ok(messages.some(x=>x.error&&/인물 선택 응답 오류/.test(x.message)));
    assert.match(f.run('record().lastJudgment.payload'),/<BASIC_DEVELOPMENT tendency=/);
}
{
    const {f,calls}=setup({appearanceChance:100});let enter,release;
    const entered=new Promise(r=>enter=r),held=new Promise(r=>release=r),normal=f.sandbox.testJev;
    f.sandbox.heldJev=async request=>{if(request.questions.person_opportunity){enter();await held;}return normal(request);};
    f.run('callJev=heldJev');const running=f.run('runJudge({force:true})');await entered;f.run('hub.invalidate("generation_stopped")');
    await running;release();await new Promise(r=>setTimeout(r,20));
    assert.equal(f.run('record().lastJudgment'),null);assert.equal(f.run('record().pendingPlan'),null);
    assert.equal(Boolean(f.run('record().npcProfile')),false);assert.equal(calls.length,2);
    f.run('callJev=testJev');await f.run('runJudge({force:true})');assert.ok(f.run('record().pendingPlan'));
}
console.log(JSON.stringify({population:10000,eventHits,personHits,both,eventPackages:eventIds.size,personPackages:personIds.size,advancedPackages:ADVANCED_TEMPLATES.length,maxPromptChars:maxPrompt,fullPipelineModes:runs,verified:true}));
