import assert from 'node:assert/strict';
import { selectExecutionCorrectionKeys, EXECUTION_CORRECTION_LIMIT } from '../../src/scene/correction-selection.js';
import { selectExecutionCorrections, buildInjection } from '../../prompt-library.js';
import { buildContinuityInjection } from '../../continuity-engine.js';
import { buildLiveCharacterPlan, resolveLiveCharacterPlan, buildCharacterInjection } from '../../src/characters/live.js';
import { createRecordBank } from '../../src/characters/records.js';
import { selectActiveEntries } from '../../src/characters/selection.js';
import { npcRecordLimit } from '../../src/characters/volume.js';
import { selectRecordCandidates } from '../../src/characters/record-selection.js';

const diagnoses = {npc_knowledge_fit:'overreach', directive_followthrough:'missed', action_evasion:'yes', scene_cutoff:'yes', user_handoff:'yes', circularity:'yes', refusal_stall:'yes', input_echo:'yes', repetitive_ending:'yes', hesitation_drag:'yes', npc_followthrough:'partial'};
const keys=Object.keys(diagnoses), protectedKeys=['npc_knowledge_fit','refusal_stall','user_handoff','repetitive_ending'];
for(let mask=0;mask<2**keys.length;mask++) {
    const decisions=Object.fromEntries(keys.filter((_,index)=>mask & (1<<index)).map(key=>[key,diagnoses[key]]));
    const selected=selectExecutionCorrectionKeys(decisions);
    assert.equal(selected.selectedKeys.length,Math.min(Object.keys(decisions).length,EXECUTION_CORRECTION_LIMIT));
    for(const key of protectedKeys)if(decisions[key])assert.ok(selected.selectedKeys.includes(key));
    assert.deepEqual(new Set([...selected.selectedKeys,...selected.omittedKeys]),new Set(Object.keys(decisions)));
    assert.deepEqual(selected,selectExecutionCorrectionKeys(decisions));
}
const scored=selectExecutionCorrectionKeys(diagnoses,{hesitation_drag:{certainty:0.99},scene_cutoff:{certainty:0.95},directive_followthrough:{certainty:0.1}});
assert.ok(scored.selectedKeys.includes('hesitation_drag') && scored.selectedKeys.includes('scene_cutoff'));
assert.ok(scored.omittedKeys.includes('directive_followthrough'));
const selection=selectExecutionCorrections(diagnoses);
const payload=buildInjection({settings:{progressionMode:'off'},decisions:diagnoses});
for(const line of selection.lines)assert.ok(payload.includes(line),'selected corrections are included whole');

const label='A'.repeat(139)+'.', summary='B'.repeat(159)+'.', name='C'.repeat(80);
const continuity=buildContinuityInjection({items:[{label,lifecycle:'active'}],knowledge:[{summary,character:name,source:'reported'}]});
assert.ok(continuity.includes(label) && continuity.includes(summary) && continuity.includes(name),'accepted saved lengths remain eligible for complete injection');

const person=(kind,id)=>{
    const entry={id,kind,name:id,source:'Established source.',selectedLore:[],sourceVisibleToMain:kind!=='npc'};
    entry.recordBank=createRecordBank({entity_type:kind,entity_name:id,records:Array.from({length:20},(_,i)=>({type:'expression',target:'self',when:['general conversation'],rule:`${id} speaks in established manner ${i}.`,modality:'habit',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'}))},entry,'limit-test');
    return entry;
};
const entries=[person('character','Casey'),person('persona','Reader'),person('npc','Morgan')];
for(const volume of ['basic','generous','detailed'])for(const npcSlots of [2,3,4]) {
    const plan=buildLiveCharacterPlan(entries,{canonicalOnly:true,volume,npcSlots});
    const expected={basic:4,generous:6,detailed:8}[volume];
    assert.deepEqual(plan.map(p=>p.profileSlotLimit),[expected,expected,npcSlots]);
    const decisions={};
    for(const p of plan){decisions[`character_${p.index}_presence`]='active';p.profileCandidates.forEach((_,i)=>decisions[`character_${p.index}_record_${i}`]='yes');}
    const resolved=resolveLiveCharacterPlan(plan,decisions);
    assert.deepEqual(resolved.map(p=>p.profileIds.length),[expected,expected,npcSlots]);
    const injection=buildCharacterInjection(resolved,{volume});
    assert.equal(injection.traces[2].omittedBySlotRuleIds.length,8);
    assert.equal(injection.traces[2].jevSelectedRuleIds.length,npcSlots+8);
    assert.ok(injection.text.length<=injection.charLimit);
}
assert.equal(npcRecordLimit(undefined),3);assert.equal(npcRecordLimit(99),3);assert.equal(npcRecordLimit('2'),2);

// A selected boundary or explicit ignorance cannot lose a record slot to expression.
const plan=buildLiveCharacterPlan([entries[0]],{canonicalOnly:true,volume:'basic'});
plan[0].profileCandidates.at(-1).type='boundary';
plan[0].profileCandidates.at(-2).type='knowledge';plan[0].profileCandidates.at(-2).knowledge_state='does_not_know';
const decisions={character_0_presence:'active'},details={};
plan[0].profileCandidates.forEach((_,i)=>{decisions[`character_0_record_${i}`]='yes';details[`character_0_record_${i}`]={certainty:i<4?0.99:0.6};});
const resolved=resolveLiveCharacterPlan(plan,decisions);
assert.ok(resolved[0].profileIds.includes(plan[0].profileCandidates.at(-1).id));
assert.ok(resolved[0].profileIds.includes(plan[0].profileCandidates.at(-2).id));

const protectedEntry=structuredClone(entries[0]);
protectedEntry.recordBank.records.at(-1).type='boundary';
protectedEntry.recordBank.records.at(-2).type='knowledge';
protectedEntry.recordBank.records.at(-2).knowledge_state='does_not_know';
protectedEntry.recordBank.records.at(-2).knowledge_domain='world';
for(const semanticIndices of [[],Array.from({length:12},(_,i)=>i)]) {
    const candidates=selectRecordCandidates(protectedEntry,'Casey speaks in established manner.',{limit:10,semanticIndices});
    assert.ok(candidates.some(r=>r.type==='boundary'),'boundary anchor cannot be squeezed out by same-type search hits');
    assert.ok(candidates.some(r=>r.knowledge_state==='does_not_know'),'ignorance anchor reaches Jev without becoming an automatic selection');
    assert.ok(candidates.length<=10);
}
const inactive=resolveLiveCharacterPlan(plan,{...decisions,character_0_presence:'absent'});
const inactiveTrace=buildCharacterInjection(inactive).traces[0];
assert.equal(inactiveTrace.jevSelectedRuleIds.length,plan[0].profileCandidates.length);
assert.equal(inactiveTrace.injectedRuleIds.length,0);
assert.equal(inactiveTrace.omittedBySlotRuleIds.length,0,'absent participation is not mislabeled as the count limit');
assert.equal(inactiveTrace.excludedByPresenceRuleIds.length,plan[0].profileCandidates.length);

// Six-person scenes keep identity and denied-access notices ahead of optional detail.
const crowded=Array.from({length:6},(_,i)=>({index:i,id:`npc${i}`,name:`NPC${i}`,kind:'npc',presence:'active',sourceVisibleToMain:false,core:{excerpts:[]},denied:[{id:`secret${i}`}],profileIds:[`record${i}`],profileCandidates:[],contextIds:[],contextItems:[],recordMode:true,recordStatus:'current',direction:'none',profileItems:[{id:`record${i}`,type:'expression',target:'self',when:[],modality:'habit',basis:'explicit',rule:'Established detailed speech. '.repeat(30)}]}));
const packed=buildCharacterInjection(crowded,{volume:'basic'});
assert.ok(packed.text.length<=3000);
for(const p of crowded){assert.ok(packed.text.includes(`Registered person: ${p.name}.`));assert.ok(packed.text.includes(`${p.name}: Do not treat unshared`));}
const oversizedIdentity=structuredClone(crowded);
for(const p of oversizedIdentity)p.profileCandidates=[{id:`identity${p.index}`,type:'fact',when:['always'],target:'self',modality:'fact',basis:'explicit',rule:'Long established identity detail. '.repeat(110)}];
const identityPacked=buildCharacterInjection(oversizedIdentity,{volume:'basic'});
assert.ok(identityPacked.text.length<=3000);
assert.ok(identityPacked.traces.every(trace=>trace.identityFallback && trace.omittedMandatoryCount===0));
for(const p of oversizedIdentity)assert.ok(identityPacked.text.includes(`Registered person: ${p.name}.`),'oversized automatic core uses existing intact identity fallback, never loses the person');
const store={enabled:true,characters:[entries[0]],npcs:Array.from({length:5},(_,i)=>person('npc',`NamedNPC${i}`))};
assert.equal(selectActiveEntries(store,'Casey NamedNPC0 NamedNPC1 NamedNPC2 NamedNPC3 NamedNPC4','Casey').length,6);
console.log('Injection limits passed: 2,048 correction combinations, confidence ordering, intact continuity, independent NPC slots, protected records, mandatory notices and six-person eligibility.');
