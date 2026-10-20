import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildInjection} from '../src/injection/assemble.js';
import {CHARACTER_MACRO,characterEnvelope,routeCharacterMacro} from '../src/injection/character-macro.js';
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
assert.equal(delivery.scenePayload,buildInjection({...input,characterBlock:'',sexualBlock:'',characterContextBlock:''}),'scene part is the same assembly without person blocks');
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
        assert.equal(createHash('sha256').update(buildInjection(fixture)).digest('hex'),hashes[relationshipDirection][characters?1:0],'off preserves prior assembly byte for byte');
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
        const body={type,messages};
        runtime.observeAssembly({prompt:messages});assert.equal(runtime.observeRequest(body),true);
        return {body,location};
    }
    async function sendOpenAIRequest(body){return win.fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(body)});}
    async function sendGenerationRequest(body){return sendOpenAIRequest(body);}
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
console.log('Character macro: original assembly parity, exact placement, all actor scopes, no Meta, missing/duplicate/off/legacy/empty fallback, final-request inclusion, retries, stale/hidden/chat invalidation and auxiliary isolation passed.');
