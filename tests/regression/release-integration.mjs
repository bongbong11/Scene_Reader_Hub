import assert from 'node:assert/strict';
import { fixture } from './audit-v012.mjs';
import { createRecordBank } from '../../src/characters/records.js';
import { FALLBACKS } from '../../src/scene/policy.js';

const world={id:'audit-world',name:'Archive',hint:'An archive whose sealed gate responds to a token.',prompt:'WORLD_FIXED_SENTINEL',advanced:{version:1,records:[
    {id:'W1',category:'mechanism',when:'A token touches the gate.',keywords:['token'],rule:'WORLD_SELECTED_SENTINEL: a token opens the gate.',source_quote:'SOURCE_QUOTE_NOT_FOR_JEV'},
]}};
function actor(kind,name) {
    const entry={id:kind,name,kind,npcRole:'mixed',source:`${name}. RAW_SHEET_NOT_FOR_JEV`,selectedLore:[],sourceVisibleToMain:true};
    entry.recordBank=createRecordBank({entity_type:kind,entity_name:name,records:[{type:'knowledge',target:'self',when:['before confirmation'],rule:`${name} suspects the invitation is a trap.`,modality:'possibility',basis:'explicit',source_ids:['S001'],knowledge_domain:'event',knowledge_state:'suspects'}]},entry,'release-audit');
    return entry;
}
let count=0;
for(const style of ['static','dynamic']) for(const focus of ['event','npc','conflict']) for(const advanced of [false,true]) for(const worldChoice of ['yes','no','invalid','partial']) {
    const f=fixture(),requests=[];
    f.ctx.chat=[{is_user:true,name:'User',mes:'Hunter and Rowan discuss their pending delivery, their mutual trust and the invitation near the token gate.'}];
    f.sandbox.auditWorld=worldChoice==='partial'?{...world,advanced:{...world.advanced,records:[...world.advanced.records,{...world.advanced.records[0],id:'W2',rule:'UNCONFIRMED_WORLD_RULE'}]}}:world;
    f.sandbox.actors=[actor('character','Hunter'),actor('npc','Rowan')];
    f.sandbox.config={style,focus,advanced};
    f.run(`record(true); selectedWorld=()=>auditWorld;
        Object.assign(record().preferences,{developmentStyle:config.style,advancedEnabled:config.advanced,advancedElements:['objective'],appearanceChance:0,fightSustain:config.focus==='conflict',socialEnabled:true,worldHostility:true,negativePriority:true,allowUserImpersonation:false});
        record().eventProfile=config.advanced?{id:'event',source:'advanced',element:'objective',phase:'active',prompt:'Advance the pending delivery through its established obstacle.'}:null;
        characterStore={enabled:true,characters:[actors[0]],npcs:[actors[1]],persona:null};`);
    f.sandbox.mockJudge=async request=>{
        requests.push(request);
        const selected={scene_level:'0',scene_phase:'normal',primary_focus:focus,event_state:'active',progression_move:'advance',event_route:'continue',npc_route:'reuse',npc_presence:'present',npc_target:'sheet_0',npc_role:'witness',npc_weight:'supporting',npc_knowledge:'reported',npc_disclosure:'selective',relationship_pacing:'closer_incremental',relationship_motion:'closer',relationship_beat:'vulnerability',counterevidence:'none',conflict_state:focus==='conflict'?'active':'none',advanced_route:advanced?'continue':'none',advanced_entry:'open',advanced_cause:'existing',advanced_element:'objective',advanced_move:'advance',basic_move:'dialogue',progress_need:'flowing'};
        return {answers:Object.fromEntries(Object.entries(request.questions).map(([key,q])=>{
            if(q.type==='noul')return [key,{type:'noul',noul:0.9}];
            let choice=key.startsWith('world_record_')?(worldChoice==='partial'?(key==='world_record_0'?'yes':'invalid'):worldChoice):key.startsWith('scene_participant_')?'yes':/^character_\d+_presence$/.test(key)?'active':/_profile_slot_/.test(key)?Object.keys(q.criteria).find(id=>id!=='none'):selected[key]??FALLBACKS[key];
            if(!key.startsWith('world_record_')&&!Object.hasOwn(q.criteria,choice))choice=Object.keys(q.criteria)[0];
            return [key,{choice,confidence:1}];
        }))};
    };
    f.run('callJev=mockJudge');
    await f.run('runJudge({force:true})');
    const result=JSON.parse(f.run('JSON.stringify(record().lastJudgment)'));
    const gate=requests.find(r=>r.state.world_record_candidates);
    const main=requests.find(r=>Object.hasOwn(r.state,'character_profiles'));
    assert.equal(gate.state.world_context.name,world.name);
    assert.equal(result.decisions.primary_focus,focus);
    assert.equal(result.decisions.direct_execution,'yes');
    assert.equal(result.decisions.relationship_beat,'vulnerability');
    assert.ok(!result.actionPlan.excluded.some(item=>['direct','relationship'].includes(item.kind)));
    assert.match(result.payload,/<DIRECT_SCENE_EXECUTION>/);
    assert.match(result.payload,/<RELATIONSHIP_BEAT type="vulnerability">/);
    assert.match(result.payload,/Rowan suspects the invitation is a trap/);
    assert.match(result.payload,/knowledge=suspects/);
    assert.ok(result.payload.indexOf('<FIXED_SCENE_SETTINGS>')<result.payload.indexOf('<SCENE_FOCUS>'));
    assert.ok(result.payload.indexOf('<SCENE_FOCUS>')<result.payload.indexOf('<CHARACTER_EXECUTION>'));
    assert.doesNotMatch(result.payload,/WORLD_FIXED_SENTINEL|WORLD_SELECTED_SENTINEL|RAW_SHEET_NOT_FOR_JEV|undefined|\[object Object\]/);
    assert.doesNotMatch(JSON.stringify(requests),/RAW_SHEET_NOT_FOR_JEV|SOURCE_QUOTE_NOT_FOR_JEV/);
    assert.match(result.worldPayload,/WORLD_FIXED_SENTINEL/);
    assert.equal(result.worldPayload.includes('WORLD_SELECTED_SENTINEL'),['yes','partial'].includes(worldChoice));
    assert.doesNotMatch(result.worldPayload,/UNCONFIRMED_WORLD_RULE/);
    assert.equal(main.state.applicable_world_rules.length,['yes','partial'].includes(worldChoice)?1:0);
    assert.equal(main.state.world_rule_selection.status,worldChoice==='invalid'?'fallback':worldChoice==='partial'?'partial':'selected');
    assert.equal(result.worldSelection.appliedIds.length,['yes','partial'].includes(worldChoice)?1:0);
    assert.equal(result.payload.includes('<ADVANCED_PROGRESSION'),advanced&&result.decisions.advanced_route==='continue');
    assert.equal(f.run('record().pendingPlan.status'),'awaiting_output');
    const calls=requests.length;
    await f.run('runJudge()');
    assert.equal(requests.length,calls,'same input reuses the current assembly');
    f.run('record().lastJudgment.sourceKey="old-assembly-contract"; record().lastJudgment.payload="STALE_ASSEMBLY";');
    await f.run('runJudge()');
    assert.ok(requests.length>calls,'an old assembly contract is never reused');
    assert.doesNotMatch(f.run('record().lastJudgment.payload'),/STALE_ASSEMBLY/);
    count++;
}
{
    const f=fixture();let started;
    const waiting=new Promise(resolve=>started=resolve);
    f.ctx.chat=[{is_user:true,name:'User',mes:'Hunter waits near the token gate.'}];
    f.sandbox.auditWorld=world;
    f.sandbox.blockSearch=({signal})=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});started();});
    f.run('record(true); selectedWorld=()=>auditWorld; vectorRetrieval.search=blockSearch; globalThis.clearCount=0; clearInjection=async()=>{clearCount++;};');
    const stale=f.run('runJudge({force:true})');
    await waiting;
    f.run('jobs.invalidate(); activeInjectionPayload="NEWER_VALID_INJECTION";');
    assert.equal(await stale,null);
    assert.equal(f.run('clearCount'),0,'a cancelled retrieval cannot clear a newer turn injection');
    assert.equal(f.run('activeInjectionPayload'),'NEWER_VALID_INJECTION');
}
{
    const f=fixture();
    f.ctx.characters=[null,{avatar:'Hunter.png'}];
    const owner=f.run('stateChatKey()');
    f.ctx.characters=[{avatar:'Hunter.png'}];f.ctx.characterId=0;
    assert.equal(f.run('stateChatKey()'),owner,'reordering the SillyTavern character list cannot switch stored ownership');
    f.sandbox.fetch=async()=>({ok:true,json:async()=>({storageVersion:2})});
    await assert.rejects(f.run('hydrateServerState()'),/0.7.0/,'old plugins must not load an empty new identity or overwrite legacy data');
}
console.log(`Release integration passed: ${count} scene/style/advanced/world-selection combinations, same-scene responses, scoped character records, matching world injection, and cache refresh.`);
