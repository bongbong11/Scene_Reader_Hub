import assert from 'node:assert/strict';
import {splitCharacterContext} from '../src/injection/character-context.js';
import {buildCharacterInjection} from '../src/character/live.js';
import {buildContinuityInjection} from '../src/continuity/engine.js';
import {buildInjection} from '../src/injection/assemble.js';
import {createInjectionPreparation} from '../src/injection/prepare.js';
import {routeCharacterMacro} from '../src/injection/character-macro.js';
import {incorporateAdditions} from '../src/injection/opportunity.js';
import {negativePriorityInstruction} from '../src/injection/priority.js';
import {storylineReference,storylineInjection} from '../src/context/storyline-reference.js';
import {CHAT_DEFAULTS} from '../src/storage/contract.js';
import {FALLBACKS} from '../src/decision/answers.js';

const fact={factId:'gate',character:'Alex',source:'told',sourceType:'claim',summary:'The west gate opens at dawn.'};
const promise={id:'promise',label:'Deliver the sealed letter',owners:['alex'],lifecycle:'active',pressure:'at_risk',reason:'The bridge is closed.'};
const shared={id:'shared',label:'The market remains closed',owners:[],lifecycle:'active'};
const dependency={stateId:'promise',pressure:'blocked',reason:'No safe route.'};
const globalPressure={stateId:'relationship:current',pressure:'strained',reason:'An unresolved disagreement.'};
const followup={id:'followup',data:{action:'Ask about the alternate route.'}};
const selected={items:[promise,shared],knowledge:[fact],dependencies:[dependency,globalPressure],followups:[followup]};
const context={id:'knowledge:alex:gate',characterId:'alex',type:'acquired_knowledge',source:'told',sourceType:'claim',subject:'gate',text:fact.summary,occurredAt:''};
const person={id:'alex',name:'Alex',kind:'character',index:0,presence:'active',direction:'none',
    sourceVisibleToMain:true,profileIds:[],profileItems:[],profileCandidates:[],contextIds:[context.id],contextItems:[context],denied:[]};
const snapshot=JSON.stringify({selected,person});
const execution=buildCharacterInjection([person]);
assert.equal(execution.deliveredKnowledge.length,1);
const split=splitCharacterContext(selected,[person],execution.deliveredKnowledge);
assert.equal(split.duplicateKnowledge,1);
assert.deepEqual(split.scene.items,[shared]);
assert.deepEqual(split.scene.dependencies,[],'relationship context moves without inventing a named pair');
assert.match(split.text,/relationship:current remains.*An unresolved disagreement/);
assert.deepEqual(split.scene.knowledge,[]);
assert.match(split.text,/Alex — Deliver the sealed letter: active; pressure=at_risk; The bridge is closed/);
assert.match(split.text,/Alex — promise remains in its established lifecycle/);
assert.doesNotMatch(split.text,/west gate|alternate route/);
assert.equal(JSON.stringify({selected,person}),snapshot,'routing cannot change source or selected state');

const settings={...CHAT_DEFAULTS,negativePriority:true,worldHostility:true};
const scene=buildContinuityInjection(split.scene,followup);
const delivery={};
const full=buildInjection({settings,decisions:FALLBACKS,characterBlock:execution.text,characterContextBlock:split.text,continuityBlock:scene,delivery,hasAdditions:true});
assert.match(delivery.text,/west gate/);
assert.match(delivery.text,/CHARACTER_CONTINUITY/);
assert.doesNotMatch(delivery.scenePayload,/west gate|Deliver the sealed letter|No safe route/);
assert.match(delivery.scenePayload,/alternate route/);
assert.equal(full.split(fact.summary).length-1,1,'one fact in integrated delivery');
for(const mode of ['on','off','missing']) {
    const body={messages:[{role:'system',content:mode==='missing'?'PRESET':'PRESET [SLOT] END'},{role:'system',content:full}]};
    const owner={payload:full,characterDelivery:structuredClone(delivery)};
    routeCharacterMacro(body,owner,{enabled:mode!=='off',marker:'[SLOT]'});
    const output=body.messages.map(m=>m.content).join('\n');
    for(const value of [fact.summary,promise.label,shared.label,followup.data.action,dependency.reason,globalPressure.reason])
        assert.equal(output.split(value).length-1,1,`${mode}: retain exactly one ${value}`);
}
const priority=negativePriorityInstruction(settings);
assert.ok(priority);
for(const additions of [[],[{text:'An established contact sends an invitation.'}]]) {
    assert.equal(incorporateAdditions(full,additions,settings).split(priority).length-1,1,'fixed priority appears once with or without additions');
}
// An omitted or conditional character line cannot erase unconditional continuity.
for(const entry of [{...person,contextItems:[]},{...person,presence:'absent'},{...person,presenceUncertain:true}]) {
    const rendered=buildCharacterInjection([entry]);
    const result=splitCharacterContext(selected,[entry],rendered.deliveredKnowledge);
    assert.equal(result.duplicateKnowledge,0);
    assert.match(result.text,/has told information.*source type=claim/);
}
const limited=buildCharacterInjection([person],{maxChars:0});
assert.deepEqual(limited.deliveredKnowledge,[]);
assert.match(splitCharacterContext(selected,[person],limited.deliveredKnowledge).text,/west gate/);
for(const change of [{sourceType:'belief'},{source:'observed'},{occurredAt:'previous day'},{text:'The gate is closed.'},{subject:'other'}]) {
    assert.equal(splitCharacterContext(selected,[person],[{...context,...change}]).duplicateKnowledge,0,'do not merge different truth/time/source scopes');
}
const ambiguous=splitCharacterContext(selected,[person,{...person,id:'other',name:'Alex'}]);
assert.deepEqual(ambiguous.scene.knowledge,[],'selected knowledge moves without requiring a registered identity');
assert.match(ambiguous.text,/Alex has told information/,'keep the supplied name without choosing an identity');
assert.deepEqual(splitCharacterContext(selected,[]).scene.items,[shared]);
assert.equal(splitCharacterContext(null,[person]).text,'');
const unknown={...promise,owners:['Alex','Unknown']};
assert.match(splitCharacterContext({items:[unknown]},[person]).text,/Alex, Unknown — Deliver/,'shared ownership is retained without another eligibility gate');
const nameless={...promise,owners:[' ']};
assert.deepEqual(splitCharacterContext({items:[nameless]},[person]).scene.items,[nameless],'an empty owner does not manufacture personal attribution');

const record={sharedSource:{id:'previous'},sharedReference:{summary:'An ongoing trip.'},continuity:structuredClone(selected)};
const recordBefore=JSON.stringify(record),before=storylineReference(record);
const carried=storylineInjection(record,split.moved);
assert.doesNotMatch(carried,/Deliver the sealed letter|west gate/);
assert.match(carried,/market/);
assert.match(carried,/ongoing trip/);
assert.deepEqual(storylineReference(record),before);
assert.equal(JSON.stringify(record),recordBefore);
assert.match(storylineInjection(record,{items:[{...promise,lifecycle:'completed'}]}),/Deliver the sealed letter/,'do not remove a different state with the same ID');
{
    const prior={...record,relationshipState:{tension:'high'},sharedReference:{...record.sharedReference,characterStates:[{id:'alex',name:'Alex',fear:30}]}};
    const parts={};
    assert.equal(storylineInjection(prior,{},parts),storylineInjection(prior),'splitting carry-over does not change integrated output');
    assert.match(parts.text,/tension: high/);
    assert.match(parts.text,/Alex — prior feelings: fear: 30/);
    assert.match(parts.text,/west gate|Deliver the sealed letter/);
    assert.doesNotMatch(parts.scene,/west gate|Deliver the sealed letter|tension: high|fear: 30/);
    assert.match(parts.scene,/market|ongoing trip/);
}

// Actual preparation must connect the split to saved and pending delivery.
const diagnostics=[];
const deps={characterStore:{enabled:true,characters:[person],npcs:[]},settings:{continuityEnabled:true},
    fixedDecision:selected=>({selected,effective:selected}),resolveLiveCharacterPlan:people=>people,
    buildCharacterInjection,buildContinuityInjection,buildInjection,
    noteDiagnostic:(stage,data)=>diagnostics.push({stage,...data}),getContext:()=>({chat:[]}),
    stableFingerprint:JSON.stringify,ownerPrompt:()=>'',actionPlanSummary:()=>({}),pendingPlanEffects:()=>({}),
    isVisibleRoleplayMessage:()=>true,reversibleStateSnapshot:()=>({}),JEV_MODEL:'synthetic'};
const frame={details:{},prefs:settings,decisions:{...FALLBACKS},liveCharacters:[person],continuityContext:selected,
    chosenContinuity:followup,chosenEventFollowups:[],rec:{...record,relationshipState:{tension:'high'}},questions:{},data:{answers:{}},
    staged:{},memory:{status:'unused'},context:{contextKey:'synthetic'},additions:[],npcTargets:[]};
await createInjectionPreparation(deps).prepareInjection({identity:'synthetic'},frame);
assert.ok(frame.rec.lastJudgment.characterDelivery.text.includes(promise.label));
assert.match(frame.rec.lastJudgment.characterDelivery.text,/tension: high/);
assert.doesNotMatch(frame.rec.lastJudgment.characterDelivery.scenePayload,/tension: high/);
assert.ok(frame.rec.pendingPlan.judgment.characterDelivery.text.includes(promise.label));
assert.equal(frame.payload.split(fact.summary).length-1,1);
assert.ok(!frame.characterDelivery.scenePayload.includes(promise.label));
assert.ok(frame.characterDelivery.scenePayload.includes(followup.data.action));
assert.equal(diagnostics.find(e=>e.stage==='character_context_prepared').deduplicatedKnowledgeCount,1);
assert.ok(!JSON.stringify(diagnostics).includes(fact.summary),'diagnostics contain counts, not content');
deps.settings.continuityEnabled=false;
const offFrame={...frame,rec:{},details:{},characterDelivery:{},decisions:{...FALLBACKS}};
await createInjectionPreparation(deps).prepareInjection({identity:'synthetic'},offFrame);
assert.ok(!offFrame.payload.includes(promise.label),'continuity off does not revive stored context');
console.log('Character context routing passed: scoped ownership, exact knowledge deduplication, budget/ambiguity fallback, unchanged story storage, actual preparation and macro on/off/missing delivery.');
