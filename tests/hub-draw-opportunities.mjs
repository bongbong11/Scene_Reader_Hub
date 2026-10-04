import assert from 'node:assert/strict';
import {drawOpportunityKey,drawRandom} from '../src/scene/draw-opportunity.js';
import {makeAppearanceOffer,applyAppearanceOffer} from '../src/scene/appearance.js';
import {createDraws} from '../src/scene/draws.js';
import {commitGeneratedActor,generatedActorCandidates} from '../src/scene/generated-cast.js';
import {commitVerifiedPlan} from '../src/scene/state-effects.js';
import {createStateSnapshots} from '../src/lifecycle/snapshots.js';
import {fixture} from './regression/audit-v012.mjs';

const first=[{is_user:true,mes:'At the garden.'}],identity='audit-room';
const key=chat=>drawOpportunityKey({identity,chat});
const original=key(first);
assert.equal(key([{is_user:true,mes:'Edited input.'}]),original,'editing a response slot does not reroll');
const next=[...first,{is_user:false,mes:'A reply.'}];
assert.notEqual(key(next),original,'an assistant reply opens a fresh empty-send opportunity');
assert.equal(key([...first,{is_user:true,mes:'(OOC: explain)'}]),original,'OOC alone is not a draw ticket');
assert.equal(drawOpportunityKey({identity,chat:next,type:'swipe',pendingPlan:{chatCount:1}}),original);
assert.equal(drawOpportunityKey({identity,chat:first,type:'regenerate',pendingPlan:{chatCount:1}}),original);
assert.equal(drawOpportunityKey({identity,chat:first,pendingUserText:'Next'}),key([...first,{is_user:true,mes:'Next'}]),'composer and committed input share the ticket');
assert.notEqual(drawOpportunityKey({identity:'other',chat:first}),original);
for(const channel of ['event','appearance'])assert.equal(drawRandom(original,channel)(),drawRandom(original,channel)());
assert.notEqual(drawRandom(original,'event')(),drawRandom(original,'appearance')());
// Also catches accidentally seeding with the fingerprint length instead of hash.
for(const channel of ['event','appearance']) {
    const samples=Array.from({length:10000},(_,index)=>drawRandom(`sample-${index}`,channel)());
    assert.ok(new Set(samples).size>9900);
    for(const rate of [0.1,0.18,0.35,0.58,0.75])assert.ok(Math.abs(samples.filter(x=>x<rate).length/10000-rate)<0.025);
}

const {prepareProfiles}=createDraws(()=>({id:'current',name:'Current'}));
const prefs={settingsContract:3,developmentStyle:'balanced',advancedEnabled:true,advancedStyle:'very_active',appearanceChance:75,villainEnabled:true};
const eventDecisions=()=>({advanced_route:'create',advanced_element:'objective',advanced_move:'seed',event_route:'none',npc_route:'none',villain_route:'none'});
let eventHits=0,personHits=0;
const rolls=new Set();
for(let index=0;index<30;index++) {
    const chat=Array.from({length:index+1},(_,n)=>({is_user:n%2===0,mes:'RP'})),drawKey=key(chat);
    const rec={preferences:prefs,sceneOpportunity:1,advancedEntities:[],drawOpportunityKey:drawKey};
    prepareProfiles(rec,eventDecisions(),{});rolls.add(rec.lastEventRoll.roll);eventHits+=Boolean(rec.eventProfile);
    const restored=structuredClone(rec);restored.eventProfile=null;
    prepareProfiles(restored,eventDecisions(),{});assert.equal(restored.lastEventRoll.roll,rec.lastEventRoll.roll,'refresh/manual retry cannot redraw');
    if(rec.eventProfile)assert.equal(restored.eventProfile.id,rec.eventProfile.id);
    const person=makeAppearanceOffer(rec,drawKey,drawRandom(drawKey,'appearance'));personHits+=person.passed;
    assert.equal(person.roll,makeAppearanceOffer(structuredClone(rec),drawKey,drawRandom(drawKey,'appearance')).roll);
}
assert.ok(rolls.size>10);assert.ok(eventHits>0&&eventHits<30);assert.ok(personHits>0&&personHits<30);

const rec={preferences:{...prefs,appearanceChance:100,villainEnabled:false},npcProfile:{id:'old',role:'witness',status:'active'}};
rec.appearanceOffer=makeAppearanceOffer(rec,'new',()=>0.1);assert.equal(rec.appearanceOffer.passed,true);
const decisions={npc_route:'reuse',npc_target:'stored_generated',arrival_mode:'visit'};
applyAppearanceOffer(rec,{},decisions);assert.equal(decisions.npc_route,'create');assert.equal(rec.npcProfile.id,'old');
const staged={...structuredClone(rec),npcProfile:{id:'new',role:'visitor'}};
const plan={inputKey:'turn',decisions:{npc_route:'create'},preparedStateSnapshot:staged};
for(const verdict of ['missed','partial']){const copy=structuredClone(rec);commitVerifiedPlan(copy,plan,{npc:verdict});assert.equal(copy.npcProfile.id,'old');assert.equal(copy.generatedCast,undefined);}
const snapshots=createStateSnapshots({}),before=snapshots.reversibleStateSnapshot(rec);
commitVerifiedPlan(rec,plan,{npc:'fulfilled'});assert.equal(rec.npcProfile.id,'new');assert.equal(generatedActorCandidates(rec,'npc')[0].id,'old');
const roundtrip=JSON.parse(JSON.stringify(rec));commitGeneratedActor(roundtrip,'npc',generatedActorCandidates(roundtrip,'npc')[0]);assert.equal(roundtrip.npcProfile.id,'old');assert.equal(generatedActorCandidates(roundtrip,'npc')[0].id,'new');
snapshots.restoreReversibleState(rec,before);assert.equal(rec.npcProfile.id,'old');assert.equal(rec.generatedCast,undefined,'rollback removes uncommitted future actors');
commitGeneratedActor(rec,'villain',{id:'v1',motive:'first'});commitGeneratedActor(rec,'villain',{id:'v2',motive:'second'});assert.equal(generatedActorCandidates(rec,'villain')[0].id,'v1');

// Run the real Hub pipeline with controlled model answers, including both
// occupied actor slots. This tests the final prompt and deferred persistence.
const f=fixture(),requests=[];
f.ctx.chat=first;
f.run(`record(true);settings.recentTurns=3;record().preferences.appearanceChance=100;record().preferences.villainEnabled=false;record().preferences.advancedEnabled=false;record().npcProfile={id:'old-person',role:'witness',aim:'watch',status:'active'};`);
f.sandbox.testJev=async body=>{
    requests.push(body);
    const choices={scene_level:'0',scene_phase:'normal',scene_evidence:'none',primary_focus:'npc',secondary_focus:'none',npc_route:'reuse',npc_target:'stored_generated',person_opportunity:'candidate_1',arrival_mode:'visit',npc_role:'participant',npc_weight:'brief',npc_presence:'present',verification_npc:'fulfilled',verification_addition_0:'fulfilled'};
    return {answers:Object.fromEntries(Object.entries(body.questions).map(([key,q])=>[key,q.type==='noul'?{type:'noul',noul:0.9}:{choice:Object.hasOwn(q.criteria,choices[key])?choices[key]:Object.hasOwn(q.criteria,'none')?'none':Object.keys(q.criteria)[0],confidence:1}]))};
};
f.run('callJev=testJev');await f.run('runJudge({force:true})');
assert.equal(f.run('record().lastJudgment.decisions.npc_route'),'reuse');
assert.equal(f.run('record().lastJudgment.drawDiagnostics.person.status'),'planned');
const candidate=f.run('record().pendingPlan.additions.find(x=>x.feature==="person").profile.id');
assert.equal(f.run('record().npcProfile.id'),'old-person','planning must not replace established data');
await f.run('runJudge({force:true})');assert.equal(f.run('record().pendingPlan.additions.find(x=>x.feature==="person").profile.id'),candidate);
f.ctx.chat.push({is_user:false,mes:'The visitor arrives and greets the witness.'});await f.run('onCharacterMessageReceived(1)');
f.ctx.chat.push({is_user:true,mes:'Welcome the visitor.'});await f.run('runJudge({force:true})');
assert.equal(f.run('record().npcProfile.id'),candidate);assert.equal(f.run('record().generatedCast[0].profile.id'),'old-person');
assert.notEqual(f.run('record().pendingPlan.additions.find(x=>x.feature==="person").profile.id'),candidate,'continued RP permits another candidate with an active NPC');
await f.run('runJudge({force:true})');
assert.ok(requests.at(-1).questions.npc_target.criteria.generated_0,'preserved actor remains selectable');
assert.equal(requests.at(-1).state.previously_generated_people.npcs[0].id,'old-person');
const priorKey=f.run('record().drawOpportunityKey');
f.ctx.chat.push({is_user:false,mes:'Another visitor arrives.'});await f.run('onCharacterMessageReceived(3)');
await f.run("onBeforeGeneration('normal',{},false)");
assert.notEqual(f.run('record().drawOpportunityKey'),priorKey,'empty send after new RP gets a fresh ticket');
assert.ok(f.run('record().pendingPlan'),'empty send must stage a plan even with the same user-input key');
const blankCandidate=f.run('record().pendingPlan.additions.find(x=>x.feature==="person").profile.id');
f.ctx.chat.push({is_user:false,mes:'The next visitor joins the conversation.'});await f.run('onCharacterMessageReceived(4)');
f.run('hub.endCycle()');await f.run("onBeforeGeneration('normal',{},false)");
assert.equal(f.run('record().npcProfile.id'),blankCandidate,'blank-send arrivals commit after output verification');
// Reusing a preserved actor must reach the actual prompt, and changing the
// decision before output must replace the pending plan as well as the display.
f.run("record().preferences.newGenerationEnabled=false;");
f.ctx.chat.push({is_user:true,mes:'Ask the original witness to answer.'});
f.sandbox.testReuse=async body=>({answers:Object.fromEntries(Object.entries(body.questions).map(([key,q])=>{
    const picks={scene_level:'0',scene_phase:'normal',scene_evidence:'none',primary_focus:'npc',secondary_focus:'none',npc_route:'reuse',npc_target:'generated_0',arrival_mode:'none',npc_role:'participant',npc_weight:'brief',npc_presence:'present',verification_npc:'missed'};
    return [key,q.type==='noul'?{type:'noul',noul:0.9}:{choice:Object.hasOwn(q.criteria,picks[key])?picks[key]:Object.hasOwn(q.criteria,'none')?'none':Object.keys(q.criteria)[0],confidence:1}];
}))});
f.run('callJev=testReuse');await f.run('runJudge({force:true})');
const reused=f.run('record().pendingPlan.preparedStateSnapshot.npcProfile');
assert.equal(f.run('record().lastJudgment.decisions.npc_route'),'reuse');
assert.equal(reused.id,f.run('record().generatedCast.find(item=>item.profile.id!==record().npcProfile.id).profile.id'));
assert.ok(f.run('record().lastJudgment.payload').includes(reused.role));
// A selected event must cross the full judge/storage/injection boundary.
const e=fixture();e.run("record(true);Object.assign(record().preferences,{advancedEnabled:true,advancedElements:['objective'],advancedStyle:'very_active',appearanceChance:1});");
e.ctx.chat=[{is_user:true,mes:'Explore the public square.'}];
while(drawRandom(drawOpportunityKey({identity:e.run('stateChatKey()'),chat:e.ctx.chat}),'event')()>0.75)e.ctx.chat.push({is_user:false,mes:'The conversation continues in the square.'});
e.sandbox.eventJev=async body=>({answers:Object.fromEntries(Object.entries(body.questions).map(([key,q])=>{
    const picks={scene_level:'0',scene_phase:'normal',scene_evidence:'none',primary_focus:'new_event',secondary_focus:'none',event_opportunity:'candidate_1',advanced_entry:'open',advanced_route:'create',advanced_cause:'location',advanced_element:'objective',advanced_move:'seed',arrival_mode:'none',verification_event:'fulfilled'};
    return [key,q.type==='noul'?{type:'noul',noul:0.9}:{choice:Object.hasOwn(q.criteria,picks[key])?picks[key]:Object.hasOwn(q.criteria,'none')?'none':Object.keys(q.criteria)[0],confidence:1}];
}))});
e.run('callJev=eventJev');await e.run('runJudge({force:true})');
assert.equal(e.run('record().lastJudgment.drawDiagnostics.event.status'),'planned');
assert.match(e.run('record().lastJudgment.payload'),/<ADVANCED_PROGRESSION/);
assert.ok(e.run("record().pendingPlan.additions.find(x=>x.feature==='event').profile"));
assert.equal(Boolean(e.run('record().eventProfile')),false,'event remains planned until output verification');
e.sandbox.eventJev=async body=>({answers:Object.fromEntries(Object.entries(body.questions).map(([key,q])=>[key,q.type==='noul'?{type:'noul',noul:0.9}:{choice:key==='event_opportunity'?'blocked_user_constraint':Object.hasOwn(q.criteria,'none')?'none':Object.keys(q.criteria)[0],confidence:1}]))});
e.run('callJev=eventJev');await e.run('runJudge({force:true})');
assert.equal(e.run('record().lastJudgment.decisions.advanced_route'),'none');
assert.equal(e.run('record().pendingPlan.decisions.advanced_route'),'none','manual rejudge must replace the unconsumed prior plan');

console.log(`Draw opportunities passed: role-based tickets, OOC, swipe/regenerate/refresh, separate uniform channels, 30 same-scene slots (${eventHits} events / ${personHits} person offers), occupied actors, output verification, durable reuse and rollback.`);
