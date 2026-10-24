import assert from 'node:assert/strict';
import {CHAT_DEFAULTS} from '../src/storage/contract.js';
import {commitObservedState} from '../src/scene/state-effects.js';
import {progressComparison,observeProgress} from '../src/scene/progress-tracking.js';
import {coordinateDecisions,coordinateActionBudget,deriveDependentDecisions} from '../src/scene/coordinator.js';
import {buildInjection} from '../src/injection/assemble.js';
import {selectActionPlan} from '../src/decision/budget.js';
import {buildVerificationQuestions,pendingPlanEffects} from '../src/decision/policy.js';

const record=()=>({preferences:{...CHAT_DEFAULTS},relationshipState:{},sceneState:{},pacingState:{relationship:{},event:{}},progressionState:null});
const chat=[];const rec=record();
for(let i=0;i<5;i++) {
    chat.push({is_user:true,mes:`New proposal ${i}`},{is_user:false,mes:`Different surface answer ${i}`});
    const comp=progressComparison(chat);
    observeProgress(rec,comp,'stalled',chat);
}
assert.equal(progressComparison(chat).turns.length,5);
assert.equal(rec.progressionState.turnsSinceMeaningfulProgress,4);
assert.equal(observeProgress(rec,progressComparison(chat),'stalled',chat).count,4,'rerun does not add a repeat');
assert.equal(observeProgress(rec,progressComparison(chat),'holding',chat).boost,false);
assert.equal(observeProgress(rec,progressComparison(chat),'flowing',chat).count,0);
assert.equal(observeProgress(rec,progressComparison(chat),'unclear',chat).count,0);
const mixed=record();
commitObservedState(mixed,{relationship_motion:'mixed',trust_signal:'positive',intimacy_signal:'negative'},'mixed-one');
assert.equal(mixed.relationshipState.motion,'mixed');
assert.equal(mixed.pacingState.relationship.closer,1);
assert.equal(mixed.pacingState.relationship.distant,1);
commitObservedState(mixed,{relationship_motion:'mixed',trust_signal:'positive',intimacy_signal:'negative'},'mixed-one');
assert.equal(mixed.pacingState.relationship.closer,1,'same source is not banked twice');
const uncertain=record();
commitObservedState(uncertain,{relationship_motion:'mixed',trust_signal:'mixed',intimacy_signal:'mixed'},'mixed-two');
assert.equal(uncertain.pacingState.relationship.closer,undefined,'mixed alone invents no direction');
for(const state of ['tension','resolving','none']) {
    const r=record(),d={conflict_state:state};r.preferences.fightSustain=true;
    deriveDependentDecisions(r,{},d);
    assert.equal(d.fight_sustain,'no');
}
console.log('Progression flexibility: paired input context, repeat lifecycle, mixed observed facets and conflict scope passed.');
for(const advanced of [false,true]) {
    const r=record();r.preferences.advancedEnabled=advanced;r.preferences.advancedElements=['objective'];
    r.eventProfile={id:'case',source:advanced?'advanced':'ordinary',element:'objective',phase:'active',prompt:'An unresolved inquiry.'};
    const before=structuredClone(r.eventProfile);
    const d={primary_focus:'direct',event_route:advanced?'none':'continue',advanced_route:advanced?'continue':'none',advanced_move:'quiet',progression_move:'hold',relationship_pacing:'hold'};
    coordinateDecisions(r,{},d);
    assert.equal(d.advanced_move,'quiet');assert.equal(d.progression_move,'hold');
    coordinateActionBudget(r,{},d);
    assert.deepEqual(r.eventProfile,before,'quiet routing does not retire the stored story');
    assert.equal(d.progression_move,'hold');assert.equal(d.advanced_move,'quiet');
}
{
    const r=record();const d={primary_focus:'direct',npc_route:'background',npc_role:'gatekeeper',npc_weight:'background',npc_knowledge:'reported',npc_disclosure:'selective'};
    coordinateDecisions(r,{},d,{presentNpc:true});
    const payload=buildInjection({settings:r.preferences,decisions:d,presentSheetNpcNames:['Observer']});
    assert.ok(payload.includes('<NPC_PRESENCE_SCOPE>'));
    assert.ok(!payload.includes('with a practical result'));
    assert.ok(payload.includes('explicitly told'),'background presence retains knowledge limits');
}
for(const readiness of ['core','decisive']) {
    const r=record();r.eventProfile={id:'case'};
    const d={primary_focus:'direct',event_route:'continue',progression_move:'consequence',resolution_pacing:'resolve',resolution_readiness:readiness};
    coordinateActionBudget(r,{},d);
    assert.equal(d.resolution_pacing,readiness==='decisive'?'resolve':'partial');
}
console.log('Event pauses, preserved stored event, background NPC information limits and decisive local closure passed.');
assert.ok(!pendingPlanEffects({event_route:'continue',progression_move:'hold',resolution_pacing:'continue'}).includes('event'),'a selected pause does not ask for an execution it never required');
assert.ok(pendingPlanEffects({event_route:'continue',progression_move:'advance'}).includes('event'));
assert.ok(!pendingPlanEffects({advanced_route:'continue',advanced_move:'quiet'}).includes('event'));
{
    const d={primary_focus:'transition',npc_route:'reuse',npc_role:'participant',npc_weight:'brief',relationship_pacing:'distant_incremental',fight_sustain:'yes'};
    const plan=selectActionPlan({decisions:d,settings:CHAT_DEFAULTS});
    assert.equal(plan.primary.kind,'transition');
    assert.ok(plan.overlays.some(x=>x.kind==='relationship'),'transition retains relevant character context');
    const payload=buildInjection({settings:CHAT_DEFAULTS,decisions:d});
    assert.ok(payload.includes('belong to this transition, not a separate task'));
    assert.ok(payload.includes('<RELATIONSHIP_PACING'),'context is not erased merely to switch scenes');
}
assert.deepEqual(Object.keys(buildVerificationQuestions({outputText:'A revised choice.',effects:['direct']})),['verification_direct'],'no added approval question');
console.log('Transition context, execution-free event pauses and unchanged verification contract passed.');
