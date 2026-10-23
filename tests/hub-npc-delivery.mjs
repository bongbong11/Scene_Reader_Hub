import assert from 'node:assert/strict';
import {buildInjection,NPC_KNOWLEDGE_PROMPTS,NPC_DISCLOSURE_PROMPTS} from '../src/injection/assemble.js';
import {npcDeliveryTarget,npcTargetMatches} from '../src/injection/npc-routing.js';
import {CHAT_DEFAULTS} from '../src/storage/contract.js';
import {FALLBACKS} from '../src/decision/answers.js';
import {fixture} from './regression/audit-v012.mjs';
import {finalRequestMatrix} from './fixtures/final-request.mjs';
import {NPC_ACTIVITY} from '../src/injection/world-agency.js';
import {createRecordBank} from '../src/character/records.js';

const courier={id:'courier',role:'Synthetic Courier',aim:'Deliver the parcel.',access:'public street',mode:'ordinary',status:'active'};
const settings={...CHAT_DEFAULTS};
function render(extra={}) {
    const parts={};const payload=buildInjection({settings,decisions:{...FALLBACKS},...extra,delivery:parts});
    return {payload,characterDelivery:parts};
}
for(const target of ['stored_generated','generated_0']) {
    const value=render({npcProfile:courier,presentSheetNpcNames:['Registered Observer'],decisions:{...FALLBACKS,npc_route:'reuse',npc_target:target,npc_role:'information',npc_knowledge:'direct'}});
    await finalRequestMatrix(value,text=>{
        assert.ok(text.includes('<NPC_ACTION_TARGET>Synthetic Courier\n'));
        assert.ok(!text.includes('Registered Observer: Apply the following role guidance'));
        assert.ok(text.includes('Reuse the established Synthetic Courier'));
    });
}
assert.equal(npcDeliveryTarget({decisions:{npc_target:'scene_existing'},presentNames:['Observer']}).kind,'scene_existing');
assert.equal(npcDeliveryTarget({decisions:{npc_target:'none',npc_route:'reuse'},profile:courier,presentNames:['Observer']}).id,'courier');
assert.equal(npcDeliveryTarget({decisions:{npc_target:'none',npc_route:'none'},profile:courier,presentNames:['Observer']}).name,'Observer','an unused old profile cannot override the ordinary fallback');
assert.equal(npcDeliveryTarget({sheetName:'Selected Person',sheetId:'selected',presentNames:['Other Person']}).id,'selected');

export async function pipeline({target='stored_generated',archived=false,eventActor=null,worldActivity=false}={}) {
    const f=fixture(),requests=[];
    f.ctx.name2='Morgan';f.ctx.chat=[{is_user:true,mes:'Morgan and Registered Observer discuss the parcel.'}];
    f.sandbox.courier=courier;
    const observer={id:'observer',name:'Registered Observer',kind:'npc',npcRole:'mixed',source:'Name: Registered Observer',aliases:[],sourceVisibleToMain:false};
    observer.recordBank=createRecordBank({entity_type:'npc',entity_name:observer.name,records:[{type:'knowledge',target:'',when:['general'],rule:'Registered Observer knows the public hearing procedure.',modality:'fact',basis:'explicit',source_ids:['S001'],knowledge_domain:'professional',knowledge_state:'knows'}]},observer,'delivery');
    f.sandbox.observer=observer;
    f.run(`record(true);Object.assign(record().preferences,{advancedEnabled:true,advancedElements:['objective'],worldAgencyEnabled:${worldActivity},newGenerationEnabled:false,socialEnabled:true});characterStore={enabled:true,characters:[],npcs:[observer],persona:null};
        record().npcProfile=courier;${archived?"record().npcProfile={...courier,id:'other',role:'Other Courier'};record().generatedCast=[{kind:'npc',profile:courier}];":''}
        ${eventActor?"record().eventProfile={id:'hearing',source:'advanced',element:'objective',phase:'active',title:'Hearing',prompt:'Discuss access to the hearing.'};":''}`);
    f.sandbox.reply=async body=>{
        requests.push(body);
        if(eventActor==='sheet_0'&&body.questions.event_cast_0)assert.ok(body.questions.event_cast_0.criteria.sheet_0,'the compiled registered actor is an available event candidate');
        return {answers:Object.fromEntries(Object.entries(body.questions).map(([key,q])=>{
            if(q.type==='noul')return [key,{noul:0.9}];
            let choice=Object.hasOwn(q.criteria,FALLBACKS[key])?FALLBACKS[key]:Object.keys(q.criteria)[0];
            const choices={scene_status:'ordinary',npc_reference_0:'reference',primary_focus:eventActor?'event':'npc',npc_route:'reuse',npc_target:target,npc_role:'information',npc_knowledge:'direct',npc_weight:'supporting',npc_presence:'present',story_element:'objective',event_cast_0:eventActor||'none',event_cast_0_action:'obstruction',world_npc_activity:'active',advanced_route:eventActor?'continue':'none',advanced_move:eventActor?'advance':'quiet',event_state:eventActor?'active':'none'};
            if(key.startsWith('scene_participant_')||key.endsWith('_participation'))choice='direct';
            if(Object.hasOwn(choices,key))choice=choices[key];
            return [key,{choice,confidence:0.7}];
        }))};
    };
    f.run('callJev=reply');await f.run('runJudge({force:true})');
    const j=JSON.parse(f.run('JSON.stringify(record().lastJudgment)'));
    assert.ok(j);assert.equal(requests.length,2,'no new model or review request');
    return j;
}
for(const archived of [false,true]) {
    const target=archived?'generated_0':'stored_generated';
    const j=await pipeline({target,archived});assert.equal(j.decisions.npc_target,target);
    await finalRequestMatrix(j,text=>{
        assert.ok(text.includes('<NPC_ACTION_TARGET>Synthetic Courier\n'));
        assert.ok(!text.includes('Registered Observer: Apply the following role guidance'));
    });
}
const registered=await pipeline({target:'sheet_0'});
await finalRequestMatrix(registered,text=>assert.ok(text.includes('Registered Observer: Apply the following role guidance')));

const named={kind:'sheet',id:'observer',name:'Registered Observer'};
assert.equal(npcTargetMatches(named,{kind:'scene_existing'}),false);
assert.equal(npcTargetMatches(named,{kind:'sheet',actorId:'other',name:named.name}),false,'a repeated name cannot override known different IDs');
assert.equal(npcTargetMatches(named,{kind:'sheet',actorId:'observer',name:'Updated Name'}),true,'stable ID owns the actor');
assert.equal(npcTargetMatches({...named,id:''},{kind:'sheet',actorId:'observer',name:named.name}),true,'legacy direct renderers retain exact registered-name support');
const unnamed=await pipeline({target:'sheet_0',eventActor:'scene_existing'});
await finalRequestMatrix(unnamed,text=>{
    assert.ok(text.includes('Registered Observer: Apply the following role guidance'));
    assert.ok(text.includes('Let Registered Observer perform'));
});
for(const sameActor of [false,true]) {
    const parts={};const binding={kind:'sheet',actorId:sameActor?'observer':'other',name:sameActor?'Registered Observer':'Other Actor',action:'obstruction'};
    const value=render({sheetNpcId:'observer',sheetNpcTarget:'Registered Observer',presentSheetNpcNames:['Registered Observer'],eventActors:[binding],decisions:{...FALLBACKS,npc_route:'reuse',npc_target:'sheet_0',npc_role:'information',npc_knowledge:'direct'},delivery:parts});
    await finalRequestMatrix(value,text=>{
        assert.equal(text.includes('Let Registered Observer perform'),!sameActor);
        assert.equal(text.includes('<NPC_SCENE_EXECUTION role='),!sameActor);
        assert.equal(text.split(NPC_KNOWLEDGE_PROMPTS.direct).length-1,1,'knowledge is a separate boundary from the assigned move');
    });
}
for(const worldActivity of [false,true])for(const target of ['sheet_0','stored_generated']) {
    const j=await pipeline({target,eventActor:target==='sheet_0'?'sheet_0':'generated_0',worldActivity});
    assert.equal(j.decisions.npc_target,target);
    assert.equal(j.cast[0]?.actorId,target==='sheet_0'?'observer':'courier',JSON.stringify({target,cast:j.cast}));
    await finalRequestMatrix(j,text=>{
        assert.equal(text.split(NPC_ACTIVITY).length-1,worldActivity?1:0);
        assert.ok(!text.includes('<NPC_SCENE_EXECUTION role='));
        assert.equal(text.split(NPC_KNOWLEDGE_PROMPTS.direct).length-1,1);
        assert.equal((text.match(/Event actor:/g)||[]).length,1);
        if(worldActivity)assert.ok(text.includes(`<NPC_SCENE_EXECUTION>${NPC_ACTIVITY}</NPC_SCENE_EXECUTION>`),'independent activity is not assigned to the skipped actor role');
    });
}
{
    const v=render({sheetNpcId:'observer',sheetNpcTarget:'Registered Observer',eventActors:[{kind:'sheet',actorId:'observer',name:'Registered Observer',action:'obstruction'}],decisions:{...FALLBACKS,npc_route:'reuse',npc_target:'sheet_0',npc_role:'information',npc_knowledge:'reported',npc_disclosure:'selective'}});
    await finalRequestMatrix(v,text=>{
        assert.equal(text.split(NPC_KNOWLEDGE_PROMPTS.reported).length-1,1);
        assert.equal(text.split(NPC_DISCLOSURE_PROMPTS.selective).length-1,1);
        assert.ok(!text.includes('Let Registered Observer perform'));
    });
}
console.log('NPC delivery: selected current/archived generated identity, explicit registered identity, ordinary fallback, real two-call Hub pipeline and final macro/preset requests passed.');
