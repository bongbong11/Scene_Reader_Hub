import assert from 'node:assert/strict';
import {fixture} from './regression/audit-v012.mjs';
import {createRecordBank,recordBankIsCurrent} from '../src/character/records.js';
import {ensureNpcIndex,addNpcReferenceQuestions,resolveNpcReferences} from '../src/character/npc-index.js';
import {selectReferencedCast,selectEventCast} from '../src/character/selection.js';
import {archiveRecordVersion,applyRecordVersion,deleteRecordVersion,bankOutput} from '../src/character/versions.js';
import {FALLBACKS} from '../src/decision/answers.js';
import {makeOpportunities,previewOpportunities} from '../src/scene/opportunities.js';
import {packCharacterStore,bindCharacterPages} from '../src/storage/character-pages.js';

function person(kind,name,rule){
    const entry={id:name.toLowerCase(),kind,name,source:`Name: ${name}`,aliases:[],npcRole:kind==='npc'?'mixed':'',antagonist:false};
    entry.recordBank=createRecordBank({entity_type:kind,entity_name:name,records:[{type:'relationship',target:'Morgan',when:['reception'],rule,modality:'tendency',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'}]},entry,`${name}-v1`);
    return entry;
}
const main=person('character','Morgan','Morgan balances work and personal promises.');
const npcs=[person('npc','Blair','Blair competes for Morgan’s attention at receptions.'),person('npc','Avery','Avery repairs bicycles at the workshop.'),person('npc','Casey','Casey runs a remote laboratory and studies rocks.')];
const beats=[{key:'direction',text:'A rival intervenes at the reception.'}];
assert.equal(main.recordBank.npcIndex,undefined,'character records stay unchanged');
assert.ok(recordBankIsCurrent(npcs[0]),'derived metadata does not invalidate records');
assert.equal(bankOutput(npcs[0].recordBank).npcIndex,undefined,'exported JSON format stays unchanged');
const old=structuredClone(npcs[0]);delete old.recordBank.npcIndex;
assert.equal(ensureNpcIndex(old.recordBank).excerpts[0].rule,npcs[0].recordBank.records[0].rule);
const stale=structuredClone(npcs[1]);stale.recordBank.npcIndex=structuredClone(npcs[0].recordBank.npcIndex);
assert.equal(ensureNpcIndex(stale.recordBank).entityName,'Avery','a different file cannot lend its cached identity');
const nextBank=structuredClone(old.recordBank);nextBank.analysisId='changed';nextBank.records=[{...nextBank.records[0],rule:'Blair is now Morgan’s colleague, not a rival.'}];
assert.match(ensureNpcIndex(nextBank).excerpts[0].rule,/colleague/);
assert.doesNotMatch(JSON.stringify(ensureNpcIndex(nextBank)),/competes/);

const request={state:{scope:'Latest exchange only for scene_status.'},questions:{}};
const candidates=addNpcReferenceQuestions(request,npcs,beats);
const answers=Object.fromEntries(candidates.map(({key},index)=>[key,{choice:index===0?'reference':'skip'}]));
let refs=resolveNpcReferences(candidates,answers);
assert.deepEqual(selectReferencedCast(npcs,'reception',refs).map(entry=>entry.id),['blair']);
assert.equal(selectReferencedCast(npcs,'reception',new Map(npcs.map(entry=>[entry.id,'skip']))).length,0,'never fill a minimum headcount');
assert.equal(selectReferencedCast(npcs,'reception',new Map(npcs.map(entry=>[entry.id,'reference']))).length,3,'multiple references can be selected');
assert.deepEqual(selectReferencedCast(npcs,'reception',resolveNpcReferences(candidates,{})),selectEventCast(npcs,'reception'),'missing responses keep legacy retrieval');
assert.equal(addNpcReferenceQuestions({state:{},questions:{}},npcs,beats,{currentIds:npcs.map(entry=>entry.id)}).length,0,'present actors are not re-screened');

// Applied-version changes and deletion carry or remove the matching index.
const store={enabled:true,characters:[main],npcs:[structuredClone(npcs[0])],persona:null,recordGroups:[]};
const first=archiveRecordVersion(store,store.npcs[0],'Blair');store.npcs[0].recordBank=nextBank;
const second=archiveRecordVersion(store,store.npcs[0],'Blair');
const restored=applyRecordVersion(store,store.recordGroups[0].id,first.id);
assert.match(ensureNpcIndex(restored.entry.recordBank).excerpts[0].rule,/competes/);
const replaced=applyRecordVersion(store,store.recordGroups[0].id,second.id);
assert.match(ensureNpcIndex(replaced.entry.recordBank).excerpts[0].rule,/colleague/);
assert.equal(deleteRecordVersion(replaced.store,store.recordGroups[0].id,second.id).npcs[0].recordBank,undefined);

// Packing does not create an extra plugin endpoint or require page hydration.
const large=structuredClone(npcs[0]);large.recordBank.records=Array.from({length:520},(_,i)=>({...large.recordBank.records[0],rule:`Blair has established obligation ${i}.`}));delete large.recordBank.npcIndex;
let reads=0;bindCharacterPages(async()=>{reads++;throw Error('unexpected read');});
const packed=await packCharacterStore({npcs:[large],characters:[]},async()=>{});
const bank=packed.npcs[0].recordBank;
assert.ok(bank.pagedRecords);assert.ok(ensureNpcIndex(bank));assert.equal(reads,0);
delete bank.npcIndex;assert.equal(ensureNpcIndex(bank),null,'old paged seeds cannot masquerade as a full-file index');assert.equal(reads,0);
assert.equal(selectReferencedCast([packed.npcs[0]],'obligation',new Map()).length,1,'unindexed paged file retains old fallback');

const rec={preferences:{settingsContract:3,newGenerationEnabled:true,advancedEnabled:true,advancedElements:['relationship'],advancedStyle:'very_active',appearanceChance:100,spontaneousMode:'off'}};
const before=JSON.stringify(rec),draft=previewOpportunities(rec,'same-cycle',{});
assert.equal(JSON.stringify(rec),before,'preview never commits draw state, including on NSFW pause');
assert.deepEqual(draft.offers,makeOpportunities(structuredClone(rec),'same-cycle',{}),'same offers, same rolls');

async function runScenario(mode){
    const f=fixture(),requests=[],searches=[];
    f.ctx.name2='Morgan';f.ctx.chat=[{is_user:true,name:'User',mes:mode==='present'?'Morgan and Avery are speaking together at the reception.':'Morgan and I discuss the reception.'}];
    f.sandbox.people=structuredClone([main,...npcs]);
    if(mode==='old')delete f.sandbox.people[1].recordBank.npcIndex;
    f.run(`record(true);Object.assign(record().preferences,{advancedEnabled:true,advancedElements:['relationship'],newGenerationEnabled:false,advancedStyle:'very_active',appearanceChance:0,spontaneousMode:'off',socialEnabled:false});characterStore={enabled:true,characters:[people[0]],npcs:people.slice(1),persona:null};`);
    f.sandbox.search=async args=>{searches.push(args.bankId);await new Promise(resolve=>setTimeout(resolve,35));args.signal?.throwIfAborted();return {status:'ready',indices:args.items.map((_,i)=>i)};};
    f.run(`vectorRetrieval.search=search;vectorRetrieval.config=()=>({source:'vertexai'});`);
    f.sandbox.reply=async body=>{
        requests.push(body);
        const result=Object.fromEntries(Object.entries(body.questions).map(([key,q])=>{
            if(q.type==='noul')return [key,{type:'noul',noul:0.95}];
            let choice=Object.hasOwn(q.criteria,FALLBACKS[key])?FALLBACKS[key]:Object.keys(q.criteria)[0];
            if(key.startsWith('scene_participant_')||key.endsWith('_participation'))choice='direct';
            if(key==='story_element')choice='relationship';
            if(/^event_cast_\d+$/.test(key))choice=Object.hasOwn(q.criteria,'sheet_0')?'sheet_0':'none';
            if(key.startsWith('npc_reference_')){
                const id=body.state.npc_reference_context.people[Number(key.split('_').at(-1))].id;
                choice=mode==='none'||mode==='present'?'skip':mode==='multiple'&&id!=='casey'||id==='blair'?'reference':'skip';
            }
            return [key,{choice,confidence:0}];
        }));
        if(mode==='fallback')for(const key of Object.keys(result))if(key.startsWith('npc_reference_'))delete result[key];
        return {answers:result};
    };
    f.run('callJev=reply');
    const started=performance.now();await f.run('runJudge({force:true,pendingUserText:"What now?"})');
    const elapsed=performance.now()-started;
    const result=JSON.parse(f.run('JSON.stringify(record().lastJudgment)'));
    assert.ok(result,mode+' completes');assert.equal(requests.length,2,'no extra Jev request');
    assert.match(requests[0].questions.scene_status.instructions,/latest visible exchange/);
    assert.equal(result.opportunityPlan.person.chance,0);assert.equal(result.opportunityPlan.additions.length,0);
    assert.ok(searches.some(id=>id.endsWith(':morgan')),'current character retrieval stays intact');
    if(mode==='present')assert.ok(searches.some(id=>id.endsWith(':avery')),'current NPC is retained even if other references are skipped');
    const expected={one:2,old:2,none:1,multiple:3,present:2,fallback:4}[mode];
    assert.equal(searches.length,expected,mode+' searches only required files');
    assert.ok(!result.characterTrace.some(item=>item.id==='blair'),'prospective reference is not observed presence');
    if(['one','old'].includes(mode))assert.ok(result.payload.includes(npcs[0].recordBank.records[0].rule),'selected NPC still gets original characterization');
    return {mode,searches:searches.length,elapsed:Math.round(elapsed)};
}
const measurements=[];
for(const mode of ['fallback','one','none','multiple','present','old'])measurements.push(await runScenario(mode));
console.log('NPC reference checks passed:',JSON.stringify(measurements));
