import assert from 'node:assert/strict';
import { compilerRequest } from '../src/character/records.js';
import { castCompilerPrompt, validateRecordBundle } from '../src/character/bundles.js';
import { extractJsonObject, validateImport } from '../src/vendor/character-reasoner/index.js';
import { worldCompilerPrompt, parseAdvancedWorld } from '../src/world/advanced.js';
import { characterCopyNotice, worldCopyNotice } from '../src/ui/compiler-copy.js';
import {ADVANCED_ELEMENTS,buildAdvancedQuestions} from '../src/world/advanced-library.js';
import {compilerSources} from '../src/character/compiler-prompt.js';
import {boundedText} from '../src/context/memory.js';

for(const eventElement of Object.keys(ADVANCED_ELEMENTS)) {
    const questions=buildAdvancedQuestions({preferences:{advancedEnabled:true,advancedElements:Object.keys(ADVANCED_ELEMENTS)},hasEvent:true,eventTitle:'Synthetic event',eventElement});
    assert.doesNotMatch(JSON.stringify(questions),/[가-힣]/,'model criteria must not interpolate Korean UI labels');
}
const storedSources=[{id:'S001',origin:'character_sheet',label:'캐릭터 시트',text:'한국어 원문 그대로'},{id:'S002',origin:'lorebook',label:'사용자 제목',text:'원문'}];
const untouched=structuredClone(storedSources), displaySources=compilerSources(storedSources);
assert.deepEqual(storedSources,untouched,'prompt translation must not invalidate saved source fingerprints');
assert.equal(displaySources[0].label,'Character sheet');
assert.equal(displaySources[0].text,storedSources[0].text);
assert.deepEqual(displaySources[1],storedSources[1],'user source labels and text remain intact');
assert.doesNotMatch(boundedText('A'.repeat(1000),200),/[가-힣]/);

for(const kind of ['character','persona','npc']) {
    const basic=compilerRequest({kind,name:'',source:'',selectedLore:[]}).prompt;
    assert.match(basic,/downloadable UTF-8 .json file/);assert.match(basic,/base instruction/);assert.match(basic,/If no source is provided/);
    assert.doesNotMatch(basic,/[가-힣]/,'fixed compiler instructions must be English');
    assert.doesNotMatch(basic,/Copy entity_type and entity_name exactly as supplied/);
    assert.match(basic,/never copy ACTUAL_NAME_FROM_SOURCE/);
    const example=extractJsonObject(basic);
    assert.equal(validateImport(example).output.entity_type,kind,'complete example must match the actual importer');
    const source='SYNTHETIC_SHEET_MARKER: Aster waits before answering.';
    const built=compilerRequest({kind,name:'Aster',source,selectedLore:[{book:'Mock',title:'Gate',content:'SYNTHETIC_LORE_MARKER: The gate is closed.'}]}).prompt;
    assert.equal(built.split(source).length,2,'one copy of the sheet');
    assert.doesNotMatch(built,/[가-힣]/);
    assert.match(built,/S002/);assert.match(built,/SYNTHETIC_LORE_MARKER/);
    assert.equal(validateImport(extractJsonObject(built)).output.entity_name,'Aster');
    if(kind==='persona')assert.match(built,/not reinterpret persona information/);
    for(const name of ['Aster "North"','경로\\별명','Aster\nBriar','Aster $& $$ $`']) {
        const named=compilerRequest({kind,name,source,selectedLore:[]}).prompt;
        assert.equal(extractJsonObject(named).entity_name,name,'names must remain valid JSON strings in the copied example');
    }
}
for(const withSource of [false,true]) {
    const multi=castCompilerPrompt({kind:'character',name:'',source:withSource?'SYNTHETIC_MULTI_MARKER.':'',selectedLore:[],importMode:'multi',castNames:withSource?['Aster','Briar']:[]});
    const section=multi.split('## ONE COMPLETE OUTPUT FILE')[1].split('## INVALID OUTPUT')[0];
    const example=JSON.parse(section.slice(section.indexOf('{')).trim());
    assert.equal(validateRecordBundle(example).outputs.length,2);
    assert.match(multi,/downloadable UTF-8 .json file/);assert.match(multi,/appearance_details/);assert.match(multi,/nine required fields/);
    assert.doesNotMatch(multi,/[가-힣]/);
    if(withSource)assert.equal(multi.split('SYNTHETIC_MULTI_MARKER.').length,2);
    else assert.match(multi,/No source attached/);
}
assert.throws(()=>validateRecordBundle({characters:[{name:'Aster',personality:{traits:['quiet']}}]}),/인물 시트를 정리한 형식/);
assert.throws(()=>validateRecordBundle({entities:[null]}),/인물 1.*객체/);
assert.throws(()=>validateRecordBundle({entities:[{entity_type:'character',entity_name:'Aster'}]}),/인물 1.*records/);
const sampleWorld=JSON.parse(worldCompilerPrompt().split('\n').find(line=>line.startsWith('{"format"')));
assert.equal(parseAdvancedWorld(sampleWorld).version,1);
assert.match(worldCompilerPrompt(),/downloadable UTF-8 .json file/);assert.match(worldCompilerPrompt(),/30,000/);assert.match(worldCompilerPrompt(),/No source attached/);
assert.doesNotMatch(worldCompilerPrompt(),/[가-힣]/);
assert.match(worldCompilerPrompt({name:'Synthetic',text:'SYNTHETIC_WORLD_MARKER'}),/WORLD SOURCE DATA/);

const nodes={'sr-character-source':{value:''},'sr-character-copy-note':{},'sr-world-copy-note':{},'sr-world-profile':{value:'current'},'sr-world-editor':{hidden:true},'sr-world-advanced-edit-id':{value:''}};
const doc={getElementById:id=>nodes[id]};
assert.equal(characterCopyNotice(doc).included,false);
assert.equal(characterCopyNotice(doc,[{content:'Selected'}]).included,true);
assert.match(nodes['sr-character-copy-note'].textContent,/로어북 1개/);
const worlds=[{id:'current',prompt:''},{id:'chosen',name:'Chosen',prompt:'SYNTHETIC_WORLD_MARKER'}];
assert.equal(worldCopyNotice(doc,worlds).source,null);
nodes['sr-world-profile'].value='chosen';assert.equal(worldCopyNotice(doc,worlds).source.text,'SYNTHETIC_WORLD_MARKER');
nodes['sr-world-editor'].hidden=false;nodes['sr-world-edit-prompt']={value:''};
assert.equal(worldCopyNotice(doc,worlds).source,null,'blank draft must not include a previously selected world');
nodes['sr-world-edit-prompt'].value='NEW_DRAFT';assert.equal(worldCopyNotice(doc,worlds).source.text,'NEW_DRAFT');
console.log('Compiler prompts passed: all actor types, basic/included source modes, full importer-valid examples, cast ownership, world schema/limits, source selection and accurate format errors.');
