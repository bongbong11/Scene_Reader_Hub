import assert from 'node:assert/strict';
import {characterBehaviorPrompt} from '../src/injection/character-behavior.js';
import {createHash} from 'node:crypto';
import {buildInjection,antagonistPrompt,genreNpcPrompt,RELATIONSHIP_PROMPTS,NPC_KNOWLEDGE_PROMPTS,NPC_DISCLOSURE_PROMPTS,AUXILIARY_EXECUTION_CORRECTIONS,META_CLOSE} from '../src/injection/assemble.js';
import {LEGACY_PROMPTS as L} from '../src/decision/legacy-prompts.js';
import {INITIATIVE,NPC_ACTIVITY,PHYSICAL_OPPOSITION,PROGRESS_BOOST} from '../src/injection/world-agency.js';
import {CHARACTER_MACRO,CHARACTER_GUIDANCE,characterEnvelope,routeCharacterMacro} from '../src/injection/character-macro.js';
import {buildPausedInjection} from '../src/injection/paused.js';
import {createPresetRequest} from '../src/injection/preset-request.js';
import {observePromptReceipt} from '../src/injection/receipt.js';
import {CHAT_DEFAULTS} from '../src/storage/contract.js';
import {createTransmissionPreview} from '../src/injection/transmission-preview.js';

const characterBlock='<CHARACTER_EXECUTION>\nAlex: Preserved record.\nIf Blair enters, apply their knowledge limits.\n</CHARACTER_EXECUTION>';
const sexualBlock='<PERSON_STATE>Alex: Prior state is not present consent.</PERSON_STATE>';
const characterContextBlock='<CHARACTER_CONTINUITY>Alex has an unresolved promise.</CHARACTER_CONTINUITY>';
const input={settings:{...CHAT_DEFAULTS},decisions:{primary_focus:'direct',relationship_pacing:'hold'},characterBlock,sexualBlock,characterContextBlock};
const delivery={};
const full=buildInjection({...input,delivery});
assert.equal(full,buildInjection(input),'requesting parts cannot alter the ordinary injection');
assert.doesNotMatch(delivery.scenePayload,/CHARACTER_TO_USER_DIRECTION|CHARACTER_EXECUTION|CHARACTER_CONTINUITY|PERSON_STATE/);
assert.ok(delivery.text.includes(RELATIONSHIP_PROMPTS.dynamic),'relationship direction moves even without a selected record');
assert.match(delivery.text,/SHEET_CAST_SCOPE/);
assert.ok(delivery.text.includes(characterBlock)&&delivery.text.includes(sexualBlock));
const wrapped=characterEnvelope(delivery.text);
assert.ok(!wrapped.includes('(Meta:'),'person envelope has no second Meta');
assert.doesNotMatch(wrapped,/[가-힣]/,'fixed macro guidance must be English');
const sourceText='하늘: 사용자가 저장한 원문';
assert.ok(characterEnvelope(sourceText).includes(sourceText),'user records are preserved, not translated or stripped');
assert.equal(characterEnvelope(''),'');
const marker='[SYNTHETIC_MACRO_LOCATION]';
const value=()=>({payload:full,characterDelivery:structuredClone(delivery)});
const flatten=body=>body.messages.flatMap(m=>typeof m.content==='string'?[m.content]:m.content.filter(p=>p.type==='text').map(p=>p.text)).join('\n');
const count=(text,part)=>text.split(part).length-1;
// Route whole selected guidance, including the paths omitted by the old slice.
for(const relationshipDirection of ['dynamic','positive','hostile']) {
    const parts={};
    const fixture={...input,settings:{...CHAT_DEFAULTS,relationshipDirection,worldHostility:true,
        npcToUser:true,userMisfortune:true,worldAgencyEnabled:true,negativePriority:true,developmentStyle:'dynamic'},
        decisions:{...input.decisions,relationship_pacing:'closer_incremental',relationship_beat:'vulnerability',
            npc_route:'reuse',npc_role:'information',npc_weight:'supporting',npc_knowledge:'reported',npc_disclosure:'selective',
            npc_presence:'multiple',npc_autonomy:'yes',fight_sustain:'yes',conflict_state:'active',
            world_npc_activity:'active',world_physical_opposition:'active',progress_boost:'yes',
            npc_knowledge_fit:'overreach',input_echo:'yes',event_route:'continue',primary_focus:'event',resolution_pacing:'partial'},
        sheetNpcTarget:'Blair',presentSheetNpcNames:['Blair'],sheetCastNames:['Alex','Blair'],
        eventProfile:{mode:'natural',phase:'active',prompt:'The bridge remains closed.'}};
    const integrated=buildInjection({...fixture,delivery:parts});
    const moved=[RELATIONSHIP_PROMPTS[relationshipDirection],L.INDEPENDENT_PERSPECTIVES,L.NPC_TO_USER_DEFAULT,
        L.AUTONOMOUS_NPC_DYNAMICS,L.SUSTAINED_INTERPERSONAL_CONFLICT,INITIATIVE,NPC_ACTIVITY,
        NPC_KNOWLEDGE_PROMPTS.reported,NPC_DISCLOSURE_PROMPTS.selective,AUXILIARY_EXECUTION_CORRECTIONS.npc_knowledge_fit,
        '<RELATIONSHIP_PACING','<RELATIONSHIP_BEAT','<SHEET_NPC_ACTION_TARGET>'];
    const retained=[L.WORLD_HOSTILITY,L.USER_MISFORTUNE,PHYSICAL_OPPOSITION,PROGRESS_BOOST,
        '<SHEET_NPC_SCENE>','<EVENT_RESOLUTION_PACING','<SCENE_FOCUS>'];
    for(const text of moved) {
        assert.equal(count(parts.text,text),1,`macro must contain all selected guidance: ${text.slice(0,60)}`);
        assert.equal(count(parts.scenePayload,text),0,'moved guidance must not remain in scene');
        assert.equal(count(integrated,text),1,'integrated delivery retains each source');
    }
    for(const text of retained) {
        assert.equal(count(parts.scenePayload,text),1,'event/world execution remains in scene');
        assert.equal(count(parts.text,text),0);
    }
    for(const enabled of [true,false])for(const anchor of [true,false]) {
        const owner={payload:integrated,characterDelivery:structuredClone(parts)};
        const body={messages:[{role:'system',content:anchor?marker:'PRESET'},{role:'system',content:integrated}]};
        routeCharacterMacro(body,owner,{marker,enabled});
        for(const text of [...moved,...retained]) assert.equal(count(flatten(body),text),1,'one copy after final routing/fallback');
        const receipt=observePromptReceipt(body,{payload:owner.deliveryPayload,
            characterPayload:owner.characterPayload,activity:{ids:['initiative','npc_activity','physical_opposition'],progressBoost:true}});
        assert.ok(receipt.activity.every(item=>item.status==='confirmed'),'activity verification follows both locations');
    }
}
{
    const parts={};
    buildInjection({...input,privatePrompt:RELATIONSHIP_PROMPTS.dynamic,delivery:parts});
    assert.ok(parts.scenePayload.includes(RELATIONSHIP_PROMPTS.dynamic),'a private prompt is not removed just because its text matches a routed instruction');
}
for(const route of ['create','replace','reuse','background']) {
    const profile={status:'pending',mode:'ordinary',role:'courier',aim:'deliver the letter',access:'public street',
        stake:'payment',constraint:'closed gate',contribution:'delivery',leverage:'receipt',competence:'trained',
        demeanor:'brisk',reliability:'known',entry:'delivery route',duration:'brief',turningCondition:'the gate opens'};
    const parts={};
    buildInjection({...input,npcProfile:profile,decisions:{...input.decisions,npc_route:route,arrival_mode:'visit'},delivery:parts});
    assert.ok(parts.text.includes(genreNpcPrompt(profile,route)),'generated and returning NPC profiles move whole');
    assert.doesNotMatch(parts.scenePayload,/<RP_NPC_ROUTING/);
    if(['create','replace'].includes(route))assert.match(parts.scenePayload,/<PERSON_ARRIVAL>/);
}
for(const route of ['create','replace','continue']) {
    const profile={access:'public desk',leverage:'permit',motive:'retain office',method:'delay',competence:'trained',composure:'steady'};
    const parts={};
    buildInjection({...input,villainProfile:profile,decisions:{...input.decisions,villain_route:route},delivery:parts});
    const source=antagonistPrompt(profile,route!=='continue');
    assert.ok(parts.text.includes(source),'antagonist characterization is moved without rewriting the fixed source');
    assert.ok(!parts.scenePayload.includes(source));
    assert.match(parts.scenePayload,/<NPC_CONFLICT_ACTION/,'selected confrontation still executes through scene direction');
}
for(const role of ['system','developer','user'])for(const multimodal of [false,true]) {
    const body={messages:[{role,content:multimodal?[{type:'text',text:`BEFORE\n${marker}\nAFTER`},{type:'image_url',image_url:{url:'fixture'}}]:`BEFORE\n${marker}\nAFTER`},{role:'system',content:full}]};
    const v=value();
    assert.equal(routeCharacterMacro(body,v,{marker,enabled:true}).status,'macro');
    assert.equal(count(flatten(body),characterBlock),1);
    assert.equal(count(flatten(body),sexualBlock),1);
    assert.equal(count(flatten(body),characterContextBlock),1);
    const first=multimodal?body.messages[0].content[0].text:body.messages[0].content;
    assert.equal(first,`BEFORE\n${wrapped}\nAFTER`);
    assert.equal(body.messages[1].content,delivery.scenePayload);
    if(multimodal)assert.equal(body.messages[0].content[1].image_url.url,'fixture');
    const once=structuredClone(body);
    assert.equal(routeCharacterMacro(body,v,{marker,enabled:true}).changed,false);
    assert.deepEqual(body,once);
    const receipt=observePromptReceipt(body,{payload:v.deliveryPayload,characterPayload:v.characterPayload});
    assert.equal(receipt.scene,'confirmed');assert.equal(receipt.character,'confirmed');
    routeCharacterMacro(body,v,{marker,enabled:false});
    assert.equal(body.messages[1].content,full);
    assert.equal(count(flatten(body),characterBlock),1);
    assert.ok(!flatten(body).includes('[SCENE_READER_CHARACTER]'));
}
{
    const v=value(),body={messages:[{role:'system',content:`A${marker}B${marker}C`},{role:'system',content:full}]};
    assert.equal(routeCharacterMacro(body,v,{marker,enabled:true}).occurrences,2);
    assert.equal(body.messages[0].content,`A${wrapped}BC`);
    // A later host post-processor omits the macro-bearing prompt.
    body.messages.shift();
    assert.equal(routeCharacterMacro(body,v,{marker,enabled:true}).status,'missing');
    assert.equal(body.messages[0].content,full);
    routeCharacterMacro(body,v,{marker,enabled:false});
    assert.equal(v.characterRoute,'disabled','off clears a previous missing-macro status');
    assert.equal(v.deliveryPayload,full);
}
for(const kind of ['missing','legacy','empty','scene_missing','disabled']) {
    const v=value();
    if(kind==='legacy')delete v.characterDelivery;
    if(kind==='empty')v.characterDelivery={version:1,text:'',scenePayload:full};
    const body={messages:[{role:'system',content:kind==='missing'?'UNCHANGED':`BEFORE${marker}AFTER`},
        {role:'system',content:kind==='scene_missing'?'UNRELATED':full}]};
    const result=routeCharacterMacro(body,v,{marker,enabled:kind!=='disabled'});
    assert.equal(result.status,kind);
    assert.ok(!flatten(body).includes(marker));
    if(kind!=='scene_missing')assert.equal(body.messages[1].content,full);
}
// Recorded after byte-for-byte comparison with pre-split 638f83e assembly.
{
    const hashes={
        dynamic:['bdb0f915cf1cb9889a6aed7f5a1d8abd0f36e4f2610cf31cd5588932b4ae2880','daf717f463fede3912b432cffc88c8a5586ab9d89b10f3ef3a5ea8c3c816e597'],
        positive:['da1bbd5c10f2a2995f1e331281d950ee96ad0e8ea5e3e47d82bef358fa905dac','c119b15d557c2f2d00f118a6ddaf95dc15167fc9edeff573731554f154a0f031'],
        hostile:['852f285f28e2c613455b2200dad3b6a835353890f9870612028764328206279f','e18297ef15ca9f6aec62ffa834cb9e407067f8a0976e433c81f1d9b75397ee3c'],
    };
    for(const relationshipDirection of ['dynamic','positive','hostile'])for(const advancedEnabled of [false,true])for(const characters of ['',characterBlock]) {
        const fixture={...input,settings:{...CHAT_DEFAULTS,relationshipDirection,advancedEnabled},characterBlock:characters,characterContextBlock:''};
        // Normalize only the intentionally revised interpretation wrapper;
        // keep the historical digest protecting every other assembled part.
        const withoutBehavior=buildInjection(fixture).replace(characterBehaviorPrompt('glm')+'\n\n','')
            .replace(META_CLOSE,"These directions govern scene developments, not writing style. Follow the main prompt's narrative voice, rhythm, imagery, and interiority, and each character's speech. Preserve its genre, setting, world logic, pacing, NSFW, and character-specific kink instructions.")
            .replace('Do not rush time or cut the interaction short.','Do not turn these directions into a checklist, rush time, or cut the interaction short.');
        assert.equal(createHash('sha256').update(withoutBehavior).digest('hex'),hashes[relationshipDirection][characters?1:0],'assembly outside the behavior and interpretation wrapper stays byte-identical');
    }
}
// Exercise the real request adapter, including its final transport hook.
{
    let enabled=true,chatKey='room';
    const handlers={},sent=[],events=[];
    const prompts=[{identifier:'main',role:'system',content:'ANCHOR',enabled:true}];
    const manager={serviceSettings:{prompts,prompt_order:[{character_id:1,order:[{identifier:'main',enabled:true}]}]},activeCharacter:{id:1},
        getPromptOrderForCharacter(){return this.serviceSettings.prompt_order[0].order;},preparePrompt(p){return {...p};}};
    let cycle={};
    const ctx={mainApi:'openai',chat:[],name1:'{{user}}',name2:'{{char}}',macros:{register:(name,def)=>handlers[name]=def.handler}};
    const win={Request,fetch:async(input,options)=>{sent.push(JSON.parse(options.body));return {ok:true};}};
    const runtime=createPresetRequest({window:win,getContext:()=>ctx,getCycle:()=>cycle,getChatKey:()=>chatKey,isEnabled:()=>true,
        isCharacterMacroEnabled:()=>enabled,loadHost:async()=>({promptManager:manager}),report:(...args)=>events.push(args),verifyRequest:()=>{}});
    await runtime.init();
    const handler=handlers[CHARACTER_MACRO];
    assert.equal(handler(),'');
    function prepare(type='normal',preset=false,macro=true) {
        cycle={injection:{...value(),chatKey:'room',scenePreset:preset,worldPayload:'Synthetic world reference.',worldPreset:false,capturePayload:'Synthetic capture instruction.',sceneSlot:{identifier:'main',side:'after'}}};
        runtime.start(type);
        const location=handler();
        manager.preparePrompt(prompts[0]);
        const messages=[{role:'system',content:`PREFIX\n${macro?location:''}\nSUFFIX`},{role:'system',content:'ANCHOR'},
            ...(!preset?[{role:'system',content:full}]:[]),{role:'system',content:'Synthetic world reference.'},{role:'user',content:'Continue.'}];
        const body={type,messages,model:ctx.extensionSettings?.connectionManager?.selectedProfile};
        runtime.observeAssembly({prompt:messages});assert.equal(runtime.observeRequest(body),true);
        return {body,location};
    }
    async function sendOpenAIRequest(body){return win.fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(body)});}
    async function sendGenerationRequest(body){return sendOpenAIRequest(body);}
    for(const model of ['synthetic-glm','synthetic-deepseek','synthetic-glm'])for(const macro of [true,false])for(const selected of [true,false]) {
        ctx.extensionSettings={connectionManager:{selectedProfile:model}};enabled=selected;
        const {body}=prepare('normal',false,macro);await sendGenerationRequest(body);
        const output=flatten(sent.at(-1));assert.equal(sent.at(-1).model,model);
        assert.equal(count(output,characterBlock),1,'profile changes must neither drop nor duplicate character content');
        assert.equal(output.includes(wrapped),selected&&macro);
        assert.equal(output.includes(full),!selected||!macro,'absent macro returns the whole block to ordinary injection');
        assert.doesNotMatch(output,/SR_CHARACTER_SLOT_/);
    }
    enabled=true;
    for(const type of ['normal','regenerate','swipe','continue'])for(const preset of [false,true]) {
        const {body,location}=prepare(type,preset);
        assert.equal(runtime.preview.read(),null,'assembly is not a transmission receipt');
        assert.equal(count(flatten(body),characterBlock),1);
        assert.ok(flatten(body).includes(`PREFIX\n${wrapped}\nSUFFIX`));
        await sendGenerationRequest(body);
        assert.deepEqual(sent.at(-1),body);
        assert.ok(!flatten(sent.at(-1)).includes(location));
        assert.equal(count(flatten(sent.at(-1)),characterBlock),1);
        assert.equal(runtime.preview.read().status,'included');
        assert.equal(runtime.preview.read().text,wrapped);
        assert.ok(flatten(sent.at(-1)).includes(runtime.preview.read().text));
        runtime.finish();cycle.injection=null;
        assert.equal(runtime.preview.read().text,wrapped,'normal completion retains the last actual transmission');
    }
    {
        const {body}=prepare();
        body.messages=body.messages.filter(m=>!m.content.includes('PREFIX'));
        await sendGenerationRequest(body);
        assert.ok(flatten(sent.at(-1)).includes(full),'late removal restores integrated delivery');
        assert.equal(runtime.preview.read().status,'fallback');
        assert.equal(runtime.preview.read().text,'');
    }
    {
        const {body}=prepare();
        enabled=false;await sendGenerationRequest(body);
        assert.ok(flatten(sent.at(-1)).includes(full),'switching off before send restores full delivery');
        assert.ok(!flatten(sent.at(-1)).includes(wrapped));enabled=true;
    }
    {
        const {body}=prepare();
        runtime.invalidate(cycle.injection);
        cycle.injection=null;
        await sendGenerationRequest(body);
        assert.ok(!flatten(sent.at(-1)).includes(characterBlock));
        assert.ok(!flatten(sent.at(-1)).includes(characterContextBlock));
        assert.ok(!flatten(sent.at(-1)).includes(delivery.scenePayload));
        assert.ok(flatten(sent.at(-1)).includes('PREFIX'),'invalidation preserves surrounding preset');
        assert.equal(runtime.preview.read(),null);
    }
    {
        const {body}=prepare();ctx.chat=[{mes:'hidden now',is_system:true}];
        await sendGenerationRequest(body);
        assert.ok(!flatten(sent.at(-1)).includes(characterBlock),'visibility change removes split payload');
        assert.ok(!flatten(sent.at(-1)).includes(characterContextBlock));
        ctx.chat=[];
    }
    {
        const {body}=prepare();chatKey='other';
        await sendGenerationRequest(body);
        assert.ok(!flatten(sent.at(-1)).includes(characterBlock),'chat change never transfers old analysis');
        assert.ok(!flatten(sent.at(-1)).includes(characterContextBlock));
        chatKey='room';
    }
    enabled=false;
    const disabled=prepare();assert.equal(disabled.location,'');assert.ok(flatten(disabled.body).includes(full));
    enabled=true;
    for(const type of ['quiet','normal']) {
        runtime.start(type,{},type==='normal');
        assert.equal(handler(),'','quiet and dry-run macros are empty');
    }
    runtime.start('normal');
    ctx.mainApi='textgenerationwebui';assert.equal(handler(),'','unsupported transport never leaks a placeholder');
    ctx.mainApi='openai';
    function generateQuietPrompt(){return handler();}
    assert.equal(generateQuietPrompt(),'','auxiliary call inside an active main cycle has no marker');
    runtime.reset();assert.equal(handler(),'');
    assert.ok(!JSON.stringify(events).includes(characterBlock),'diagnostics contain no analysis text');
}
{
    let valid=true;
    const preview=createTransmissionPreview({isCurrent:()=>valid,enabled:()=>true,render:String});
    const owner={payload:full,characterRoute:'macro',characterPayload:wrapped};
    const body={messages:[{role:'system',content:wrapped}]};
    const first=preview.capture(body,owner);
    assert.equal(preview.read(),null);
    preview.sent(first);assert.equal(preview.read().text,wrapped);
    preview.failed(first);assert.equal(preview.read().status,'failed');assert.equal(preview.read().text,'');
    preview.clear();const next=preview.capture(body,owner);preview.sent(next);
    preview.failed(first);assert.equal(preview.read().status,'included','late failure cannot erase a later receipt');
    valid=false;assert.equal(preview.read(),null);
    valid=true;preview.clear();assert.equal(preview.read(),null);
    preview.sent(preview.capture({messages:[]},owner));assert.equal(preview.read().status,'unconfirmed');
    preview.sent(preview.capture({messages:[{role:'system',content:wrapped+wrapped}]},owner));assert.equal(preview.read().status,'unconfirmed');
}
// Narrative interpretation stays in the scene; character interpretation stays
// in the separate envelope across repeated passes and integrated fallbacks.
for(const hasAdditions of [false,true])for(const enabled of [false,true])for(const anchor of [false,true]) {
    const parts={};
    const payload=buildInjection({...input,hasAdditions,delivery:parts});
    const owner={payload,characterDelivery:parts};
    const body={messages:[{role:'system',content:anchor?marker:'PRESET'},{role:'system',content:payload}]};
    for(let pass=0;pass<2;pass++)routeCharacterMacro(body,owner,{marker,enabled});
    const text=flatten(body),split=enabled&&anchor;
    assert.equal(count(text,META_CLOSE),1,'shared narrative interpretation appears once');
    assert.equal(count(text,CHARACTER_GUIDANCE),split?1:0,'character envelope is present only on the macro route');
    assert.ok(!parts.text.includes(META_CLOSE),'macro does not copy the scene meta');
    assert.equal(count(text,characterBlock),1,'record payload is retained exactly once');
    assert.equal(count(text,characterBehaviorPrompt(input.settings.characterBehaviorMode)),1,'selected behavior source remains once');
}
assert.equal(count(buildPausedInjection({settings:input.settings}),META_CLOSE),1,'paused delivery keeps the same narrative interpretation');
console.log('Character macro: original assembly parity, exact placement, all actor scopes, no Meta, missing/duplicate/off/legacy/empty fallback, final-request inclusion, retries, stale/hidden/chat invalidation, auxiliary isolation and separate interpretation guidance passed.');
