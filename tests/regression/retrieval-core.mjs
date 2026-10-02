import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRecordBank, currentRecords, compilerRequest, recordBankIsCurrent } from '../../src/characters/records.js';
import { currentProfileItems, buildLiveCharacterPlan, normalizeCharacterStore } from '../../character-library.js';
import { validateImport, compileResult } from '../../src/vendor/character-reasoner/index.js';
import { fixture } from './audit-v012.mjs';

const entry={id:'rowan',kind:'npc',name:'Rowan',source:'Rowan does not know the plan.',sourceVisibleToMain:true,selectedLore:[{book:'Secrets',title:'The plan',content:'Rowan suspects Anna is hiding something.'}]};
const record={type:'knowledge',target:'Anna',when:['hidden plan'],rule:'Rowan suspects Anna is hiding something.',modality:'possibility',basis:'explicit',source_ids:['S002'],knowledge_domain:'secret',knowledge_state:'suspects'};
const output={entity_type:'npc',entity_name:'Rowan',records:[record]};
const bank=createRecordBank(output,entry,'analysis');
const saved={...entry,recordBank:bank};
assert.deepEqual(currentRecords(saved),[record]);
assert.equal(recordBankIsCurrent({...saved,recordBank:{...bank,coreFingerprint:'188587338d3f4cad54d8e6f217418d13b437b18b0ddaaa3ca6d60ee724685783',compilerVersion:'1.1.0'}}),true,'NPC guidance edits preserve existing saved banks');
assert.deepEqual(currentProfileItems(saved),[],'records must not enter legacy Jev');
assert.equal(buildLiveCharacterPlan([saved])[0].profileCandidates.length,1);
assert.equal(normalizeCharacterStore({npcs:[saved]}).npcs[0].recordBank.records[0].knowledge_state,'suspects');
for(const changed of [ {...saved,source:entry.source+' Changed.'}, {...saved,name:'Luke'}, {...saved,selectedLore:[]}, {...saved,recordBank:{...bank,recordVersion:999}}, {...saved,recordBank:{...bank,coreFingerprint:'outdated-engine'}} ]) assert.equal(recordBankIsCurrent(changed),false);
assert.equal(recordBankIsCurrent({...saved,recordBank:{...bank,intimacy_reference:{text:'Unsourced instruction.',source_ids:[]}}}),false);
assert.equal(recordBankIsCurrent({...saved,recordBank:{...bank,intimacy_reference:{text:'Unsourced instruction.',source_ids:['S999']}}}),false);
assert.throws(()=>createRecordBank({...output,records:[{...record,source_ids:['S999']}]},entry,'bad'),/존재하지/);
assert.throws(()=>createRecordBank({...output,entity_name:'Anna'},entry,'bad'),/인물 종류/);
assert.throws(()=>createRecordBank({...output,records:[{...record,knowledge_state:'none'}]},entry,'bad'),/knowledge/);
assert.throws(()=>createRecordBank({...output,records:[{...record,type:'fact'}]},entry,'bad'),/knowledge/);
assert.equal(createRecordBank({...output,records:[]},entry,'empty').records.length,0);
assert.equal(createRecordBank({...output,records:Array.from({length:25},()=>({...record}))},entry,'many').records.length,25,'old ten-item ceiling removed');
assert.equal(validateImport({...output,records:[{...record,source_ids:['external-id']}]}).import_log.source_validation,'structural source IDs only');
assert.match(compilerRequest({...entry,kind:'persona'}).prompt,/not reinterpret persona information/);
assert.match(compilerRequest(entry).prompt,/No one else knows X/);
assert.throws(()=>compileResult('truncated {',compilerRequest(entry).draft),/JSON/);
const bytes=await readFile(new URL('../../src/vendor/character-reasoner/index.js',import.meta.url));
const lock=JSON.parse(await readFile(new URL('../../src/vendor/character-reasoner/sync.json',import.meta.url),'utf8'));
assert.equal(createHash('sha256').update(bytes).digest('hex'),lock.sha256);

function setup() {
    const f=fixture(), fields=new Map();
    f.sandbox.document.getElementById=id=>{
        if(!fields.has(id)) fields.set(id,{value:'',checked:false,hidden:false,textContent:'',innerHTML:'',dataset:{},scrollIntoView(){}});
        return fields.get(id);
    };
    f.sandbox.window.toastr={success(){},error(){}};
    f.run('renderCharacterStore=()=>{}; persistChat=async()=>{}; clearInjection=async()=>{}; loadReasonerProfiles=async()=>{}; saveCharacterStore=async()=>{}; record(true); showCharacterEditor("npc"); settings.reasonerProfileId="p"; connectionRequestService={}');
    fields.get('sr-character-name').value='Rowan'; fields.get('sr-character-source').value=entry.source;
    fields.get('sr-character-source-visible').checked=true;
    f.sandbox.mockExtract=async()=>({result:{...output,records:[{...record,source_ids:['S001']}]}});
    f.run('requestWithConnectionProfile=mockExtract');
    return {f,fields};
}
{
    const {f,fields}=setup();
    await f.run('saveCharacterEntry()');
    await f.run('analyzeAndSaveCharacter()');
    const original=f.run('JSON.stringify(characterStore.npcs[0].recordBank)');
    f.run('showCharacterEditor("npc",characterStore.npcs[0])');
    f.sandbox.mockExtract=async()=>({result:{...output,records:[{...record,source_ids:['BAD']}]}});
    f.run('requestWithConnectionProfile=mockExtract');
    await assert.rejects(f.run('analyzeAndSaveCharacter()'),/존재하지/);
    assert.equal(f.run('JSON.stringify(characterStore.npcs[0].recordBank)'),original);
    f.sandbox.mockExtract=async()=>({result:{...output,records:[]}});
    f.run('requestWithConnectionProfile=mockExtract');
    f.run('saveCharacterStore=async()=>{throw new Error("disk failure")}');
    await assert.rejects(f.run('analyzeAndSaveCharacter()'),/disk failure/);
    assert.equal(f.run('JSON.stringify(characterStore.npcs[0].recordBank)'),original);
    f.run('saveCharacterStore=async()=>{}');
    f.sandbox.mockExtract=async()=>{
        fields.get('sr-character-source').value='Changed during inference';
        return {result:{...output,records:[]}};
    };
    f.run('requestWithConnectionProfile=mockExtract');
    await f.run('analyzeAndSaveCharacter()');
    assert.equal(f.run('JSON.stringify(characterStore.npcs[0].recordBank)'),original,'stale response cannot replace saved bank');
}
{
    const {f,fields}=setup();
    await f.run('saveCharacterEntry()');
    f.run('persistChat=async()=>{throw new Error("session write failure")};');
    await assert.rejects(f.run('analyzeAndSaveCharacter()'),/session write failure/);
    assert.ok(f.run('characterStore.npcs[0].recordBank'),'the character bank was successfully saved before session failure');
    assert.match(fields.get('sr-character-task-status').textContent,/저장 완료/,'post-save failure must not claim that the old bank was retained');
}
console.log('Retrieval core passed: provenance, versions, knowledge contract, >10 records, zero records, legacy isolation, failed/stale save preservation, accurate post-save errors.');
