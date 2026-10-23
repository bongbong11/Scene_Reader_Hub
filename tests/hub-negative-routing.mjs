import assert from 'node:assert/strict';
import {buildInjection} from '../src/injection/assemble.js';
import {LEGACY_PROMPTS as L} from '../src/decision/legacy-prompts.js';
import {characterBehaviorPrompt} from '../src/injection/character-behavior.js';
import {characterEnvelope,routeCharacterMacro} from '../src/injection/character-macro.js';
import {negativeContext} from '../src/decision/negative-context.js';
import {negativePriorityInstruction} from '../src/injection/priority.js';
import {applyPresetSlots,slotBlock} from '../src/injection/preset-position.js';
import {buildPausedInjection} from '../src/injection/paused.js';
import {resolveCastBindings,castSummary} from '../src/scene/cast-binding.js';
import {additionBlocks,incorporateAdditions} from '../src/injection/opportunity.js';
import {buildEventCastInjection,CONFLICT_TACTICS} from '../src/injection/npc-execution.js';
import {fixture} from './regression/audit-v012.mjs';
import {FALLBACKS} from '../src/decision/answers.js';

const settings={socialEnabled:true,worldHostility:true,relationshipDirection:'dynamic'};
const render=(decisions,extra={})=>buildInjection({settings,decisions:{relationship_pacing:'hold',...decisions},...extra});
for(const conflict_state of ['none','tension','resolving','unclear']) {
    const delivery={};
    const payload=render({conflict_state,npc_autonomy:'yes'},{delivery});
    assert.ok(payload.includes(L.AUTONOMOUS_NPC_DYNAMICS));
    assert.ok(!payload.includes(L.CONFLICT_EXECUTION));
    assert.ok(!payload.includes('<CONFLICT_PROGRESSION>'));
    assert.ok(delivery.text.includes(L.AUTONOMOUS_NPC_DYNAMICS));
    assert.ok(payload.includes(L.WORLD_HOSTILITY),'world direction does not wait for a fight');
    const value={payload,characterDelivery:delivery};
    const body={messages:[{role:'system',content:'SLOT'},{role:'system',content:payload}]};
    routeCharacterMacro(body,value,{enabled:true,marker:'SLOT'});
    const text=body.messages.map(m=>m.content).join('\n');
    assert.equal(text.split(L.AUTONOMOUS_NPC_DYNAMICS).length-1,1);
    assert.ok(text.includes(characterEnvelope(delivery.text)));
}
for(const decisions of [
    {conflict_state:'active'}, {fight_sustain:'yes'},
    {conflict_state:'none',primary_focus:'conflict'},
    {conflict_state:'none',npc_route:'reuse',npc_role:'opposition'},
]) assert.ok(render(decisions).includes(L.CONFLICT_EXECUTION));
const villain={id:'v',access:'public square',leverage:'a document',motive:'gain influence',method:'obstruction',competence:'ordinary',composure:'blunt'};
for(const villain_route of ['create','replace','continue'])assert.ok(render({conflict_state:'none',villain_route},{villainProfile:villain}).includes(L.CONFLICT_EXECUTION),'selected villain does not need a pre-existing fight');
assert.ok(render({conflict_state:'none'},{eventActors:[{kind:'sheet',actorId:'n',action:'threat'}]}).includes(L.CONFLICT_EXECUTION));
for(const kind of ['sheet','generated'])assert.ok(!render({conflict_state:'none'},{eventActors:[{kind,actorId:'n',antagonist:true,action:'character_driven'}]}).includes(L.CONFLICT_EXECUTION),'an existing antagonist role alone does not establish an active fight');
assert.ok(render({conflict_state:'none'},{eventActors:[{kind:'new',actorId:'n',antagonist:true,action:'character_driven'}]}).includes(L.CONFLICT_EXECUTION),'a selected new antagonist can act without a pre-existing fight');
for(const mode of ['glm','gemini'])assert.ok(render({},{settings:{...settings,characterBehaviorMode:mode}}).includes(characterBehaviorPrompt(mode)));
console.log('Negative routing: NPC activity, tension, actual conflict, selected opponents, villain entry and macro delivery passed.');

// Count owned source blocks in the FINAL request, including repeated host passes.
// Analysis requests are separate from the RP request and never summed together.
let combinations=0;
for(let mask=0;mask<16;mask++)for(const negativePriority of [false,true]) {
    const prefs={worldHostility:Boolean(mask&1),relationshipDirection:mask&2?'hostile':'dynamic',npcToUser:Boolean(mask&4),userMisfortune:Boolean(mask&8),negativePriority};
    const expected={WORLD_HOSTILITY:prefs.worldHostility,CHARACTER_TO_USER_DEFAULT:prefs.relationshipDirection==='hostile',NPC_TO_USER_DEFAULT:prefs.npcToUser,USER_MISFORTUNE:prefs.userMisfortune,INDEPENDENT_PERSPECTIVES:Boolean(mask)};
    const priority=negativePriorityInstruction(prefs);
    const parts={};const payload=buildInjection({settings:prefs,decisions:{},sheetCastNames:['Synthetic NPC'],delivery:parts});
    const originals=negativeContext(prefs).active_negative_directives?.originals||{};
    for(const [id,on] of Object.entries(expected))if(id!=='INDEPENDENT_PERSPECTIVES')assert.equal(Object.hasOwn(originals,id),on);
    for(const preset of [false,true])for(const macro of [false,true])for(const hasMarker of [false,true]) {
        const value={payload,characterDelivery:structuredClone(parts)};
        const body={messages:[{role:'system',content:hasMarker?'PRESET SLOT':'PRESET'},...(!preset?[{role:'system',content:payload}]:[])]};
        const blocks=[{kind:'scene',slot:{identifier:'main',side:'after'},content:slotBlock('scene',payload)}];
        if(preset)applyPresetSlots(body,blocks,{prompts:[{identifier:'main',enabled:true,role:'system',content:hasMarker?'PRESET SLOT':'PRESET'}]});
        for(let pass=0;pass<2;pass++)routeCharacterMacro(body,value,{enabled:macro,marker:'SLOT'});
        const text=body.messages.map(message=>message.content).join('\n');
        for(const [id,on] of Object.entries(expected))assert.equal(text.split(L[id]).length-1,on?1:0,`${id}: mask ${mask}, preset ${preset}, macro ${macro}, marker ${hasMarker}`);
        if(priority)assert.equal(text.split(priority).length-1,1);
        for(const id of ['CONFLICT_EXECUTION','SUSTAINED_INTERPERSONAL_CONFLICT','TRIGGERED_ANTAGONIST_ENCOUNTER','ONGOING_ANTAGONIST_ENCOUNTER'])assert.ok(!text.includes(L[id]));
        combinations++;
    }
    const paused=buildPausedInjection({settings:prefs});
    for(const [id,on] of Object.entries(expected))assert.equal(paused.split(L[id]).length-1,id==='INDEPENDENT_PERSPECTIVES'?0:on?1:0);
}
console.log(`Final negative requests: ${combinations} combinations passed; active originals once, inactive originals absent, priority preserved and paused path checked.`);

for(const kind of ['npc','villain']) {
    const beat={key:'event',text:'The public meeting changes.',title:'Meeting',element:'social'};
    const person={id:'person',feature:'person',kind,profile:{id:'actor',role:'Opposed organizer',aim:'Keep control of the meeting.',access:'public entrance',method:'Withhold access to the agenda.'},candidate:{action:'An organizer arrives.',effect:'The organizer makes a move.'}};
    const additions=[{id:'event',feature:'event',templateId:beat.key,candidate:{effect:'The meeting changes.'}},person];
    const bindings=resolveCastBindings({beats:[beat],additions,answers:{event_cast_0:{choice:'new_person'},event_cast_0_action:{choice:'obstruction'}}});
    const castText=buildEventCastInjection(bindings);
    const parts={};const base=buildInjection({settings:{villainEnabled:kind==='villain'},decisions:{},eventActors:bindings,hasAdditions:true,delivery:parts});
    const blocks=additionBlocks([person],{},false);
    const payload=incorporateAdditions(base,blocks,{}).slice(0,-2)+'\n'+castText+'\n)';
    parts.scenePayload=incorporateAdditions(parts.scenePayload,blocks,{}).slice(0,-2)+'\n'+castText+'\n)';
    if(kind==='villain') {
        assert.equal(person.profile.role,'Opposed organizer');
        assert.equal(person.profile.access,'public entrance');
        assert.equal(person.profile.method,'Withhold access to the agenda.');
        assert.ok(person.profile.aim.includes('Keep control of the meeting.'));
        assert.equal(castSummary(bindings)[0].antagonist,true);
        assert.equal(payload.split('<NPC_CONFLICT_ACTION').length-1,1);
        assert.equal(payload.split(CONFLICT_TACTICS.obstruction).length-1,1);
    } else {
        assert.equal(bindings[0].antagonist,undefined);
        assert.ok(!payload.includes('<NPC_CONFLICT_ACTION'));
    }
    for(const enabled of [true,false])for(const marker of ['SLOT','']) {
        const owner={payload,characterDelivery:structuredClone(parts)};
        const body={messages:[{role:'system',content:marker||'PRESET'},{role:'system',content:payload}]};
        for(let pass=0;pass<2;pass++)routeCharacterMacro(body,owner,{enabled,marker:'SLOT'});
        const text=body.messages.map(message=>message.content).join('\n');
        assert.equal(text.split(castText).length-1,1);
        if(kind==='villain')assert.equal(text.split('<NPC_CONFLICT_ACTION').length-1,1);
    }
}
for(const kind of ['sheet','generated']) {
    const source={id:'opponent',name:'Synthetic Opponent',npcRole:'villain',antagonist:true,aim:'Keep the document.',access:'public desk',method:'Block access.'};
    const binding=resolveCastBindings({beats:[{key:'event'}],sheets:kind==='sheet'?[source]:[],generated:kind==='generated'?[source]:[],additions:[{feature:'event',templateId:'event'}],answers:{event_cast_0:{choice:kind==='sheet'?'sheet_0':'generated_0'},event_cast_0_action:{choice:'argument'}}})[0];
    assert.equal(binding.antagonist,true);
    const text=buildEventCastInjection([binding]);
    assert.equal(text.split('<NPC_CONFLICT_ACTION').length-1,1);
    assert.equal(text.split(CONFLICT_TACTICS.argument).length-1,1);
}
console.log('Bound antagonist delivery: new, registered and stored opponents keep their role; normal actors unchanged and selected action delivered once.');

// Real Hub pipeline with synthetic Jev replies: role survives questions,
// resolution, split payload and persisted pending verification without a new call.
{
    const f=fixture(),requests=[];
    f.ctx.chat=[{is_user:true,mes:'We discuss access to the public meeting.'}];
    f.run(`record(true);Object.assign(record().preferences,{advancedEnabled:true,advancedElements:['objective'],socialEnabled:true,villainEnabled:true,newGenerationEnabled:false});
        record().villainProfile={id:'known-opponent',status:'active',role:'Meeting organizer',aim:'Retain control of the agenda.',motive:'Retain control of the agenda.',access:'public meeting',method:'Withhold the agenda.'};
        record().eventProfile={id:'meeting',source:'advanced',element:'objective',phase:'active',title:'Meeting',prompt:'Discuss access to the public meeting.'};`);
    f.sandbox.reply=async request=>{
        requests.push(request);
        return {answers:Object.fromEntries(Object.entries(request.questions).map(([key,q])=>{
            if(q.type==='noul')return [key,{noul:0.1}];
            let choice=Object.hasOwn(q.criteria,FALLBACKS[key])?FALLBACKS[key]:Object.keys(q.criteria)[0];
            if(key==='scene_status')choice='ordinary';
            if(key==='advanced_route')choice='continue';
            if(key==='advanced_move')choice='advance';
            if(key==='event_state')choice='active';
            if(key==='primary_focus')choice='event';
            if(key==='villain_route')choice='continue';
            if(/^event_cast_\d+$/.test(key))choice='generated_0';
            if(/^event_cast_\d+_action$/.test(key))choice='obstruction';
            return [key,{choice,confidence:0.01}];
        }))};
    };
    f.run('callJev=reply');await f.run('runJudge({force:true})');
    assert.equal(requests.length,2);
    assert.equal(f.run('record().lastJudgment.cast[0].antagonist'),true);
    assert.equal(f.run('record().pendingPlan.cast[0].antagonist'),true);
    assert.equal(f.run('record().lastJudgment.payload').split('<NPC_CONFLICT_ACTION').length-1,1);
    assert.ok(f.run('record().lastJudgment.payload').includes('Withhold the agenda.'));
}
console.log('Bound antagonist full pipeline passed: two existing Jev calls, role persisted and one selected actor instruction.');
