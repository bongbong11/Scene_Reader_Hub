import assert from 'node:assert/strict';
import { extractStateBlock, parseProfileStates, stateForEntry, storeStateEvent, latestStateForChat } from '../src/character/state-contract.js';
import { buildLiveCharacterPlan, buildCharacterTurnQuestions, resolveLiveCharacterPlan, buildCharacterInjection } from '../src/character/live.js';
import { stateRoster } from '../src/character/state-collector.js';
import { createOutputEvents } from '../src/lifecycle/output.js';
import { collectProfileOutputState } from '../src/character/state-profile-output.js';
const store={enabled:true,characters:[{id:'a',name:'Aster',kind:'character'}],npcs:[{id:'b',name:'Briar',kind:'npc',trackArousal:false},{id:'c',name:'Cedar',kind:'npc',trackArousal:true}]};
const judgment={characterTrace:[{id:'a',presence:'active'},{id:'b',presence:'active'},{id:'c',presence:'active'}]};
const roster=stateRoster(store,{},judgment);
const block=lines=>extractStateBlock('RP\n[[SR_STATE]]\n'+lines+'\n[[/SR_STATE]]',roster);
const mixed=block('C0|a10|c90|joy20\nC1|a45|c55|anger40\nC2|a35|joy30');
assert.deepEqual(mixed.states.map(state=>state.id),['a','b','c']);
assert.equal(mixed.states[1].values.anger,40);assert.equal(mixed.states[1].values.a,undefined);
assert.equal(mixed.states[2].values.joy,30);assert.equal(mixed.states[2].values.a,undefined);
assert.equal(mixed.diagnostics.partial,2);assert.equal(mixed.diagnostics.rejected,0);
assert.deepEqual(mixed.diagnostics.actors[0].reasons,[]);
assert.deepEqual(mixed.diagnostics.actors[1].reasons,['disabled_field_ignored']);
assert.deepEqual(mixed.diagnostics.actors[2].reasons,['missing_fields_ignored']);
assert.equal(block('C1|a45|c55').states.length,0,'disabled sexual scores cannot fabricate neutral moods');
assert.equal(block('C0|a35').states.length,0,'half a pair alone is not usable state');
const json=parseProfileStates([{code:'C0',a:10,c:90,joy:20},{code:'C1',a:45,c:55,anger:40},{code:'C2',a:35,joy:30}],roster);
assert.deepEqual(json.states,mixed.states,'both collectors use the same per-person safety rules');
assert.equal(parseProfileStates([{code:'C1',a:45,c:55}],roster).states.length,0);
for(const name of ['Aster','Briar','Cedar'])assert.doesNotMatch(JSON.stringify(mixed.diagnostics),new RegExp(name));
const entry=store.npcs[0],prior=stateForEntry(mixed.states[1],entry);
assert.equal(prior.values.a,undefined);assert.equal(prior.values.anger,40);
const plan=buildLiveCharacterPlan([entry],{canonicalOnly:true});plan[0].priorState=prior;
const questions=buildCharacterTurnQuestions(plan);
assert.ok(questions.character_0_affect_anger);assert.equal(questions.character_0_affect_a,undefined);
const resolved=resolveLiveCharacterPlan(plan,{character_0_presence:'active',character_0_affect_anger:'visible'});
assert.match(buildCharacterInjection(resolved).text,/anger 40%/);
assert.doesNotMatch(buildCharacterInjection(resolved).text,/sexual arousal/);
const chat=[{is_user:true,mes:'Continue.'},{is_user:false,mes:'All three answer.\n[[SR_STATE]]\nC0|a10|c90|joy20\nC1|a45|c55|anger40\nC2|a35|joy30\n[[/SR_STATE]]'}];
const record={};let saves=0;
const output=createOutputEvents({
    activeGenerationCycle:{mode:'rp',chatKey:'synthetic-room',stateRoster:roster,stateCaptureEnabled:true,stateCollectorMode:'main-output'},
    stateChatKey:()=> 'synthetic-room',record:()=>record,getContext:()=>({chat}),settings:{enabled:true},
    collectMainOutputState:extractStateBlock,storeStateEvent,latestStateForChat,stableFingerprint:text=>text,
    messageSnapshots:new Map(),messageSnapshot:messages=>messages.map(m=>m.mes),renderAll:()=>{},persistChat:async()=>{saves++;},
});
await output.onCharacterMessageReceived(1);
assert.equal(saves,1);assert.equal(record.characterStateCapture.status,'partial');
assert.deepEqual(record.characterStateCapture.participantIds,['a','b','c']);
assert.equal(chat[1].mes,'All three answer.');
const restored=JSON.parse(JSON.stringify(record));
assert.deepEqual(latestStateForChat(restored,chat,text=>text),record.characterStateEvents[0].states);
assert.equal(restored.characterStateEvents[0].states[1].values.anger,40);
assert.equal(restored.characterStateEvents[0].states[2].values.a,undefined);
const profile=await collectProfileOutputState({service:'synthetic',profileId:'synthetic',output:chat[1].mes,roster,
    request:async()=>({result:{states:[{code:'C0',a:10,c:90,joy:20},{code:'C1',a:45,c:55,anger:40},{code:'C2',a:35,joy:30}]}})});
assert.equal(profile.error,'');
assert.deepEqual(profile.states.map(state=>state.id),mixed.states.map(state=>state.id));
assert.equal(profile.states[0].values.anger,undefined,'an omitted assessment must not be silently converted to zero');
assert.equal(profile.states[1].values.anger,40);assert.equal(profile.states[2].values.joy,30);
assert.ok(profile.states.every(state=>state.coverageVersion===1));
assert.ok(profile.diagnostics.actors.every(actor=>actor.reasons.includes('missing_moods')));
console.log('Mixed emotions passed: three actors, NPC opt-in/out, accidental disabled scores, incomplete sexual pair, preserved ordinary moods, independent diagnostics and next-turn consumption.');
