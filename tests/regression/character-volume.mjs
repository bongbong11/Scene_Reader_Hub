import assert from 'node:assert/strict';
import { createRecordBank } from '../../src/characters/records.js';
import { buildLiveCharacterPlan, buildCharacterTurnQuestions, resolveLiveCharacterPlan, buildCharacterInjection } from '../../src/characters/live.js';

const record=(index,rule)=>({type:index%2?'relationship':'expression',target:'self',when:['general conversation'],rule,modality:'habit',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'});
const entry={id:'c',kind:'character',name:'Casey',source:'Casey has established speech and relationship habits.',selectedLore:[],sourceVisibleToMain:true};
entry.recordBank=createRecordBank({entity_type:'character',entity_name:'Casey',records:Array.from({length:30},(_,index)=>record(index,`Casey uses speech pattern ${index}.`))},entry,'many');
for(const [volume,slots] of [['basic',4],['generous',6],['detailed',8]]) {
    const plan=buildLiveCharacterPlan([entry],{canonicalOnly:true,volume,transcript:'Casey speaks to a friend.'});
    const questions=buildCharacterTurnQuestions(plan);
    assert.equal(plan[0].profileCandidates.length,slots+8,'candidate count grows with selected volume');
    assert.equal(Object.keys(questions).filter(key=>/_record_\d+$/.test(key)).length,slots+8);
    const decisions={character_0_presence:'active'};
    for(let index=0;index<slots;index++)decisions[`character_0_record_${index}`]='yes';
    const resolved=resolveLiveCharacterPlan(plan,decisions);
    const injected=buildCharacterInjection(resolved,{volume});
    assert.equal(resolved[0].profileIds.length,slots);
    assert.ok(injected.text.length<=({basic:3000,generous:5000,detailed:8000})[volume]);
    assert.equal(injected.traces[0].storedRecordCount,30);
    assert.equal(injected.traces[0].candidateCount,slots+8);
}

const longPeople=Array.from({length:3},(_,index)=>({index,id:`p${index}`,name:`Person${index}`,kind:'character',presence:'active',sourceVisibleToMain:true,
    core:{excerpts:[]},denied:[],profileIds:[`r${index}a`,`r${index}b`,`r${index}c`],profileCandidates:[],contextIds:[],contextItems:[],recordMode:true,recordStatus:'current',direction:'none',
    profileItems:['a','b','c'].map((suffix,order)=>({id:`r${index}${suffix}`,type:'expression',target:'self',when:[],modality:'habit',basis:'explicit',rule:`Person${index} ${suffix} ${String.fromCharCode(65+index)} `.repeat(30+order)}))}));
const bounded=buildCharacterInjection(longPeople,{volume:'basic'});
assert.ok(bounded.text.length<=3000);
assert.ok(bounded.traces.every(item=>item.injectedRuleIds.length>=1),'each active person receives a selected record before extras fill the budget');
assert.ok(bounded.traces.some(item=>item.omittedRuleIds.length),'long extra records are omitted whole');
for(const person of longPeople)for(const item of person.profileItems)if(bounded.text.includes(item.rule.slice(0,30)))assert.ok(bounded.text.includes(item.rule),'no rule is cut mid-sentence');
console.log('Character volume passed: 4/6/8 injected records, bounded Jev relevance candidates, 3/5/8k limits, fair distribution and whole-record omission.');
