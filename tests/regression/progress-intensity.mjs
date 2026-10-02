import assert from 'node:assert/strict';
import { applyPolicy, applyCharacterPolicy } from '../../src/scene/policy.js';
import { normalizeDevelopmentPreferences } from '../../prompt-library.js';
const judge = (key, choice, confidence, intensity) => applyPolicy(key, {choice, confidence}, 'balanced', ['none', 'hold', choice], intensity);
assert.equal(judge('progression_move','advance',0.55,1).effective,'hold');
assert.equal(judge('progression_move','advance',0.55,1.2).effective,'advance');
assert.equal(judge('progression_move','advance',0.70,0.8).effective,'hold');
assert.equal(judge('progression_move','advance',0.70,1).effective,'advance');
for (const [key,choice] of [['scene_state','active'],['npc_knowledge','direct'],['relationship_pacing','closer_significant'],['resolution_readiness','decisive'],['verification_event','fulfilled'],['continuity_candidate_0','accept'],['advanced_entry','open'],['advanced_route','create'],['npc_route','create'],['event_route','retire'],['progression_move','reveal'],['basic_move','continue']]) {
    const base=judge(key,choice,0.65,1);
    for(const intensity of [0.5,1.5]) assert.deepEqual(judge(key,choice,0.65,intensity),base,`${key}/${choice} must not change`);
}
for(const style of ['conservative','balanced','active']) {
    const absent=applyPolicy('event_route',{choice:'continue',confidence:0.6},style,['none','continue']);
    assert.deepEqual(applyPolicy('event_route',{choice:'continue',confidence:0.6},style,['none','continue'],1),absent);
}
const invalid=applyPolicy('basic_move',{choice:'invent',confidence:1},'balanced',['continue','action'],1.5);
assert.equal(invalid.effective,'continue');
assert.equal(applyPolicy('basic_move',undefined,'balanced',['continue','action'],1.5).effective,'continue');
assert.equal(applyCharacterPolicy('character_0_context_access_0',{choice:'yes',confidence:0.6},'active',['none','yes']).effective,'none');
for(const value of [undefined,null,'bad',0,-1]) assert.equal(normalizeDevelopmentPreferences({progressIntensity:value}).progressIntensity,1);
assert.equal(normalizeDevelopmentPreferences({progressIntensity:99}).progressIntensity,1.5);
assert.equal(normalizeDevelopmentPreferences({progressIntensity:0.1}).progressIntensity,0.5);
console.log('Progress intensity passed: baseline parity, selective acceptance, protected evidence/pacing/creation/verification, invalid input.');
