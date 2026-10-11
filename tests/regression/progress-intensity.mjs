import assert from 'node:assert/strict';
import { applyPolicy, applyCharacterPolicy } from '../../src/scene/policy.js';
import { normalizeDevelopmentPreferences } from '../../prompt-library.js';
import {buildInjection} from '../../prompt-library.js';
import {progressIntensityInstruction} from '../../src/injection/progress-intensity.js';
import {opportunitySettings} from '../../src/scene/opportunity-settings.js';
const judge = (key, choice, confidence, intensity) => applyPolicy(key, {choice, confidence}, 'balanced', ['none', 'hold', choice], intensity);
assert.equal(judge('progression_move','advance',0.55,1).effective,'advance');
assert.equal(judge('progression_move','advance',0.55,1.2).effective,'advance');
assert.equal(judge('progression_move','advance',0.70,0.8).effective,'advance');
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
assert.equal(applyCharacterPolicy('character_0_context_access_0',{choice:'yes',confidence:0.6},'active',['none','yes']).effective,'yes');
for(const value of [undefined,null,'bad',0,-1]) assert.equal(normalizeDevelopmentPreferences({progressIntensity:value}).progressIntensity,1);
assert.equal(normalizeDevelopmentPreferences({progressIntensity:99}).progressIntensity,1.5);
assert.equal(normalizeDevelopmentPreferences({progressIntensity:0.1}).progressIntensity,0.5);
const decisions={primary_focus:'direct',basic_move:'dialogue',direct_execution:'yes',relationship_pacing:'closer_incremental',relationship_beat:'vulnerability',event_route:'continue',progression_move:'advance'};
const before=JSON.stringify(decisions),outputs=[];
for(const intensity of [.5,1,1.5]){
 const settings=normalizeDevelopmentPreferences({progressIntensity:intensity,relationshipPace:'slow',resolutionPace:'slow',advancedStyle:'very_active',appearanceChance:75});
 const output=buildInjection({settings,decisions});outputs.push(output);
 assert.equal(JSON.stringify(decisions),before,'expression does not change classification or route');
 assert.equal(opportunitySettings(settings).eventChance,75);assert.equal(opportunitySettings(settings).personChance,75);
 for(const block of ['<DIRECT_SCENE_EXECUTION>','<RELATIONSHIP_BEAT','<RP_PROGRESSION'])assert.ok(output.includes(block),'selected conduct remains present at every intensity');
 assert.equal(output.replace(/<PROGRESS_EXPRESSION[\s\S]*?<\/PROGRESS_EXPRESSION>\n\n/,''),outputs[1]||outputs[0].replace(/<PROGRESS_EXPRESSION[\s\S]*?<\/PROGRESS_EXPRESSION>\n\n/,''),'only the expression wrapper changes');
}
assert.notEqual(outputs[0],outputs[1]);assert.notEqual(outputs[1],outputs[2]);
assert.match(outputs[0],/restrained but concrete/);assert.match(outputs[2],/more direct and decisive/);
for(const intensity of [.5,1.5]){const instruction=progressIntensityInstruction(intensity);assert.ok(instruction.length<750);assert.match(instruction,/Do not invent success, increase harm, or add another event/);}
assert.equal(progressIntensityInstruction(1),'');assert.equal(progressIntensityInstruction('invalid'),'');
console.log('Progress intensity passed: valid classifications unchanged, actual expression adjustment, protected pace/creation/knowledge/user choice, invalid input.');
