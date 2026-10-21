import assert from 'node:assert/strict';
import { parseAdvancedWorld, advancedWorldToStored, storedWorldToJson, worldCandidates, addWorldQuestions, worldPayload } from '../../src/world/advanced.js';
import { seasonalWorldNote } from '../../src/world/seasonal.js';
import { allWorlds, INITIAL_CUSTOM_WORLDS, saveCustomWorlds, loadCustomWorlds } from '../../src/world/catalog.js';
import { BUILTIN_WORLDS } from '../../src/world/advanced-library.js';
const raw = {format:'scene-reader-world',version:1,name:'Garden',short_description:'A garden with a moonlit gate.',fixed_rules:'Physical limits apply.',franchise:false,calendar_topics:[],records:[{id:'W001',category:'mechanism',when:'Moonlight reaches the gate.',keywords:['moonlight'],rule:'The gate opens.',source_quote:'The gate opens.'}]};
const parsed = parseAdvancedWorld('\uFEFF```json\n'+JSON.stringify(raw)+'\n```');
const world = advancedWorldToStored(parsed,'garden');
assert.deepEqual(parseAdvancedWorld(storedWorldToJson(world)),parsed);
for (const mutate of [r=>r.version=9,r=>r.records.push(r.records[0]),r=>r.records[0].category='unknown',r=>r.records[0].when='',r=>r.records[0].source_quote='',r=>r.calendar_topics=['unknown'],r=>r.records[0].rule='x'.repeat(2401)]) {
    const invalid=structuredClone(raw);mutate(invalid);assert.throws(()=>parseAdvancedWorld(invalid));
}
const request={state:{scope:'Current scene.'},questions:{}};
const candidates=addWorldQuestions(request,world,'Moonlight falls on the gate.');
assert.equal(candidates.length,1);assert.equal(request.state.world_record_candidates[0].source_quote,undefined);
assert.deepEqual(request.state.world_context,{name:world.name,short_description:world.hint});
assert.ok(!JSON.stringify(request.state).includes('Physical limits apply.'),'the gate receives the short description, not the full world source');
assert.equal(worldPayload(world,candidates,{world_record_0:{choice:'no'}}),'Physical limits apply.');
assert.match(worldPayload(world,candidates,{world_record_0:{choice:'yes'}}),/Scope: Moonlight reaches the gate\.\nThe gate opens\./);
assert.equal(worldPayload(world,[],{},true),'Physical limits apply.','failed selection applies fixed world rules only');
const many={advanced:{version:1,records:Array.from({length:30},(_,i)=>({...raw.records[0],id:`W${i}`,keywords:[i===29?'needle':'other']}))}};
assert.equal(worldCandidates(many,'needle').length,12);assert.equal(worldCandidates(many,'needle')[0].id,'W29');
assert.equal(worldCandidates(many,'unrelated scene',12,[29])[0].id,'W29','embedding hit reaches world applicability check even without matching words');
assert.equal(worldCandidates(many,'unrelated scene',12,[29]).length,1,'semantic retrieval does not fill a quota with unrelated rules');
const worlds=allWorlds(BUILTIN_WORLDS,INITIAL_CUSTOM_WORLDS);
for (const source of [...INITIAL_CUSTOM_WORLDS,...BUILTIN_WORLDS]) {
    const bank=worlds.find(w=>w.id===source.id);
    if(!bank.advanced)continue;
    const combined=[bank.prompt,...bank.advanced.records.map(r=>r.rule)].join('\n\n');
    for(const paragraph of source.prompt.replace(/^<[A-Z_]+>\s*|\s*<\/[A-Z_]+>$/g,'').split(/\n\s*\n/).map(p=>p.trim()).filter(p=>p&&!p.startsWith('#')&&!p.startsWith('{{//'))) assert.ok(combined.includes(paragraph),`${source.id}: source paragraph lost`);
}
for(const id of ['custom-harry-potter','custom-omegaverse','custom-werewolf']) assert.ok(worlds.find(w=>w.id===id).advanced?.records.length>0,id);
const edited={...INITIAL_CUSTOM_WORLDS.find(w=>w.id==='custom-harry-potter'),prompt:'My edited canon.'};
assert.equal(allWorlds([], [edited])[0].prompt,edited.prompt);
let saved=null;globalThis.localStorage={getItem:()=>saved,setItem:(_,v)=>{saved=v;}};
assert.ok(saveCustomWorlds([world]));assert.deepEqual(loadCustomWorlds()[0],world);
const before=saved;assert.equal(saveCustomWorlds([{...world,advanced:{...world.advanced,version:9}}]),false);assert.equal(saved,before);
const date={year:2026,month:10,day:30};
assert.equal(seasonalWorldNote({},date,null),'');
const prefs={seasonalReferences:['us_holidays','college_football','us_university']};
assert.equal(seasonalWorldNote(prefs,null,null),'');
assert.match(seasonalWorldNote(prefs,date,null),/Halloween[\s\S]*college football[\s\S]*US university/);
assert.doesNotMatch(seasonalWorldNote(prefs,date,{advanced:{calendar_topics:['holidays','us_university']}}),/Halloween|US university/);
assert.match(seasonalWorldNote({seasonalReferences:['us_holidays']},{year:2026,month:4,day:5},null),/Easter/);
assert.match(seasonalWorldNote({seasonalReferences:['us_holidays']},{year:2026,month:12,day:25},null),/Christmas/);
assert.equal(seasonalWorldNote({seasonalReferences:['us_holidays']},{year:2026,month:6,day:9},null),'');
console.log('World bank passed: preserved sources, scoped selection, persistence and confirmed-date seasonal deduplication.');

const harry=worlds.find(w=>w.id==='custom-harry-potter');
assert.equal(harry.seasonalProfile,undefined,'world selection does not enable Hogwarts calendar');
assert.match(harry.prompt,/At Hogwarts, the school year begins on 1 September/,'original fixed calendar paragraph stays intact');
assert.equal(seasonalWorldNote({},date,harry),'','world alone adds no monthly materials');
const harryBefore=JSON.stringify(harry);
assert.match(seasonalWorldNote({seasonalReferences:['hogwarts']},date,harry),/Hogwarts:.*Halloween/);
assert.equal(JSON.stringify(harry),harryBefore,'optional calendar never rewrites the world');
assert.match(seasonalWorldNote({seasonalReferences:['hogwarts']},date,edited),/Hogwarts:/,'edited world can use explicit optional calendar');
