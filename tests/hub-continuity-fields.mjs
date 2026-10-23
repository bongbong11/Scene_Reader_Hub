import assert from 'node:assert/strict';
import {COMPACT_SYSTEM,readCompactResult,applyCompactContext,compactValues} from '../src/continuity/compact-context.js';
import {parseProfileStates} from '../src/character/state-contract.js';
for(const situation of ['He answers without repeating a name.','A. B. C. D.','She said “I will try”; this remains her statement.','The room is quiet, but the earlier disagreement remains.']){
 const result=readCompactResult({current_situation:situation,remaining_effects:''});
 assert.equal(result.values.current_situation,situation);assert.equal(result.partial,false);
}
for(const value of [undefined,null,[],{},4,true]){
 const result=readCompactResult({current_situation:'Supported context.',remaining_effects:value});
 assert.equal(result.partial,true);assert.deepEqual(result.invalidFields,['remaining_effects']);
}
const rec={characterState:{knowledge:[{character:'Aster',summary:'Existing learned knowledge.'}]}};
let previous=applyCompactContext(rec,readCompactResult({current_situation:'Aster answers.',remaining_effects:'Briar still doubts the claim.'}),{refs:[],key:'one',outputIndex:1});
applyCompactContext(rec,readCompactResult({current_situation:'Aster clarifies.'}),{refs:[],key:'two',outputIndex:3},previous);
assert.equal(rec.continuity.context.remaining_effects,'Briar still doubts the claim.');
assert.equal(rec.characterState.knowledge.length,1);
previous=rec.continuity.context;applyCompactContext(rec,readCompactResult({current_situation:'',remaining_effects:''}),{refs:[],key:'three',outputIndex:5},previous);
assert.deepEqual(compactValues(rec.continuity.context),{current_situation:'',remaining_effects:''});
assert.throws(()=>readCompactResult({new_items:[],affected:[],knowledge_updates:[],possible_followups:[]}),{code:'CONTINUITY_FIELDS_MISSING'});
assert.ok(COMPACT_SYSTEM.length<4000);assert.match(COMPACT_SYSTEM,/Statements, suspicions and promises remain/);assert.match(COMPACT_SYSTEM,/Do not prescribe the next action/);
const roster=[{id:'mira',code:'C1',name:'Mira',trackArousal:false}];
const moods=parseProfileStates([{code:'C1',anger:20,joy:0,fear:10.5,sadness:'invalid'}],roster,{completeMoods:true});
assert.deepEqual(moods.states[0].values,{anger:20,joy:0,fear:11});assert.equal(moods.diagnostics.partial,1);
console.log('Continuity fields passed: compact prose, no semantic revalidation, missing versus empty, partial preservation, retired arrays and independent mood values.');