import assert from 'node:assert/strict';
import {applyRecordRelevance} from '../src/decision/answers.js';
import {allocateRecordIds} from '../src/character/record-allocation.js';
import {characterTurnContext} from '../src/character/turn-context.js';
import {compilerRequest} from '../src/character/records.js';
import {castCompilerPrompt} from '../src/character/bundles.js';
import {searchCharacterRecords} from '../src/retrieval/character-search.js';
import {createRecordBank} from '../src/character/records.js';
assert.equal(applyRecordRelevance({type:'noul',noul:.12}).effective,'yes','weak valid usefulness is ranked, not vetoed');
assert.equal(applyRecordRelevance({type:'noul',noul:0}).effective,'no');
assert.equal(applyRecordRelevance({type:'noul',noul:'broken'}).effective,'unavailable','missing assessment differs from irrelevant');
const candidates=[{id:'guard',type:'boundary'},{id:'relation',type:'relationship'},{id:'value',type:'value'}];
assert.deepEqual(allocateRecordIds({index:0,profileCandidates:candidates,profileSlotLimit:2},{character_0_record_0:'yes',character_0_record_1:'yes',character_0_record_2:'yes'},{character_0_record_0:{certainty:.1},character_0_record_1:{certainty:.8},character_0_record_2:{certainty:.7}}),['relation','value']);
for(const kind of ['character','persona','npc']){
    const prompt=compilerRequest({kind,name:'Morgan',source:'Morgan becomes quiet under public criticism but speaks freely to a sibling in private.',selectedLore:[]}).prompt;
    assert.equal(prompt.split('## HUB RECORD SELECTION').length-1,1);
    assert.match(prompt,/not behavior commands or invented psychology/);
    assert.match(prompt,/exactly nine fields/);
}
const bundle=castCompilerPrompt({kind:'character',name:'Pair',castNames:'Morgan,Riley',importMode:'multi',source:'Morgan is quiet. Riley is outgoing.',selectedLore:[]});
assert.equal(bundle.split('## HUB RECORD SELECTION').length-1,1);
const turn=characterTurnContext({transcript:'Morgan refuses the old demand.',pendingUserText:'I have already called the doctor. (OOC: HIDDEN)',categoryHints:['relationship','reaction']});
assert.ok(turn.query.indexOf('already called')<turn.query.indexOf('old demand'));assert.ok(!turn.query.includes('HIDDEN'));
const person={kind:'character',name:'Morgan',id:'m',source:'Morgan cares about family.',selectedLore:[]};person.recordBank=createRecordBank({entity_type:'character',entity_name:'Morgan',records:[{type:'value',target:'',when:['family discussion'],rule:'Morgan values family.',modality:'tendency',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'}]},person,'test');
let sent;
await searchCharacterRecords({entries:[person],priorStates:new Map(),transcript:turn.query,identity:'test',retrieval:{search:async options=>{sent=options;return {status:'ready',indices:[0],sharedVector:true};}}});
assert.equal(sent.sharedTranscript,turn.query,'shared vector receives the new interaction query');
console.log('Character interpretation passed: valid low relevance, distinct invalid results, ranked allocation, all compiler roles, cast policy and actual shared query.');
