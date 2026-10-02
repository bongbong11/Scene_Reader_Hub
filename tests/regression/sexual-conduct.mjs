import assert from 'node:assert/strict';
import {
    PHYSICAL_PACES, SEXUAL_ROUTING_SYSTEM, applySexualChoice, buildSexualInjection,
    buildSexualQuestions, normalizePhysicalPace, resolveSexualConduct, sexualEligible, sexualRoutingState,
} from '../../src/characters/sexual-conduct.js';
import { buildCharacterTurnQuestions } from '../../src/characters/live.js';
import { buildInjection, buildPausedInjection } from '../../prompt-library.js';

const base = { index:0, id:'rowan', name:'Rowan', kind:'character', presence:'active', sexualConductManaged:true, priorState:{values:{a:5,c:80,anger:25},targets:{}}, profileCandidates:[], contextCandidates:[], recordMode:true };
assert.equal(normalizePhysicalPace('unknown'),'medium');
assert.match(SEXUAL_ROUTING_SYSTEM,/high sexual arousal exists as a baseline/);
assert.match(SEXUAL_ROUTING_SYSTEM,/does not overwrite the arousal value stored by the extension/);
assert.match(SEXUAL_ROUTING_SYSTEM,/event progression budget/);
assert.match(SEXUAL_ROUTING_SYSTEM,/Do not invent a new trait or decide another person's desire, reaction, or consent/);

for(const pace of Object.keys(PHYSICAL_PACES)) {
    const questions=buildSexualQuestions([base],pace);
    assert.ok(questions.sexual_0_restraint && questions.sexual_0_route && questions.sexual_0_target);
    assert.equal(Object.hasOwn(questions.sexual_0_route.criteria,'inward'),['glacial','slow'].includes(pace));
    const decisions={sexual_0_restraint:'some',sexual_0_route:['glacial','slow'].includes(pace)?'inward':'controlled',sexual_0_target:'scene_partner'};
    const plan=resolveSexualConduct([base],decisions,pace);
    const result=buildSexualInjection(plan,pace);
    assert.match(result.text,new RegExp(`<SEXUAL_CONDUCT pace="${pace}">`));
    assert.match(result.text,/Do not use emotional relationship progression speed or the event progression budget as permission conditions/);
}

const slow=buildSexualInjection(resolveSexualConduct([base],{sexual_0_restraint:'full',sexual_0_route:'inward',sexual_0_target:'scene_partner'},'slow'),'slow').text;
assert.match(slow,/may want it inwardly without acting/);
assert.match(slow,/do not turn it into a sexual approach or action in this response/);

const inconsistent=resolveSexualConduct([base],{sexual_0_restraint:'little',sexual_0_route:'approach',sexual_0_target:'self'},'fast')[0];
assert.equal(inconsistent.target,'scene_partner');
assert.equal(inconsistent.targetAdjusted,true);
assert.equal(inconsistent.valid,true);

const missing=resolveSexualConduct([base],{},'medium')[0];
assert.equal(missing.valid,false);
assert.equal(buildSexualInjection([missing],'medium').text,'');
assert.equal(applySexualChoice({},['full','some']).effective,'');

assert.equal(sexualEligible({kind:'character'}),true);
assert.equal(sexualEligible({kind:'persona'}),true);
assert.equal(sexualEligible({kind:'npc',trackArousal:false}),false);
assert.equal(sexualEligible({kind:'npc',trackArousal:true}),true);
assert.equal(buildSexualQuestions([{...base,index:1,kind:'npc',trackArousal:false}],'medium').sexual_1_route,undefined);

const state=sexualRoutingState([{...base,intimacyReference:'Rowan has an explicit stored limit.',source:'RAW SHEET MUST NOT CROSS'}],'fast');
assert.equal(state.people[0].intimacy_reference,'Rowan has an explicit stored limit.');
assert.doesNotMatch(JSON.stringify(state),/RAW SHEET MUST NOT CROSS/);

const characterQuestions=buildCharacterTurnQuestions([base]);
assert.equal(characterQuestions.character_0_affect_a,undefined);
assert.ok(characterQuestions.character_0_affect_anger);

const settings={developmentStyle:'balanced',progressionMode:'natural',worldDirection:'natural',relationshipDirection:'dynamic',relationshipPace:'slow',resolutionPace:'slow',physicalIntimacyPace:'fast'};
const decisions={primary_focus:'direct',basic_move:'continue',progress_need:'flowing',direct_execution:'yes',relationship_pacing:'hold',relationship_beat:'none',resolution_pacing:'continue',npc_route:'none',villain_route:'none',fight_sustain:'no'};
const sexualBlock=buildSexualInjection(resolveSexualConduct([base],{sexual_0_restraint:'little',sexual_0_route:'approach',sexual_0_target:'scene_partner'},'fast'),'fast').text;
const full=buildInjection({settings,decisions,sexualBlock});
assert.match(full,/<SEXUAL_CONDUCT pace="fast">/);
assert.ok(full.indexOf('<SEXUAL_CONDUCT')<full.indexOf('Apply these scene directions alongside'));
const paused=buildPausedInjection({settings:{...settings,worldHostility:true,negativePriority:true},activeWorldName:'Test World'});
assert.doesNotMatch(paused,/SEXUAL_CONDUCT/);
assert.match(paused,/NSFW, and character-specific kink instructions already present/);
assert.match(paused,/Active world: Test World\./);
assert.match(paused,/<FIXED_SCENE_SETTINGS>/);
assert.match(paused,/Enabled negative-bias constraints take priority/);
assert.match(paused,/<WORLD_HOSTILITY>/);

console.log('Sexual conduct routing passed: literal policy, five distinct paces, slow inward route, independent arousal handling, NPC opt-in, contradiction repair, bounded state, injection placement, and paused-scene exclusion.');
