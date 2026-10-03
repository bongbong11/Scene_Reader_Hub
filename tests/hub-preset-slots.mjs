import assert from 'node:assert/strict';
import {activePresetPrompts} from '../src/injection/preset-catalog.js';
import {applyPresetSlots,slotBlock} from '../src/injection/preset-position.js';
import {createPresetRequest} from '../src/injection/preset-request.js';
import {clearLegacyPrompts,registerEmptyLegacyMacros} from '../src/injection/legacy-cleanup.js';
const prompts=[{identifier:'main',name:'Main',content:'Rules for User.',role:'system',enabled:true},{identifier:'world',name:'World',content:'World rules.',role:'system',enabled:true}];
const block=(kind,identifier,side,text=kind)=>({kind,slot:{identifier,side},content:slotBlock(kind,text)});
const text=messages=>messages.map(m=>typeof m.content==='string'?m.content:m.content.filter(p=>typeof p.text==='string').map(p=>p.text).join('')).join('|');
const source=[{role:'system',content:'Intro\nRules for User.\nWorld rules.\nTail'},{role:'user',content:'Continue.'}];
for(const side of ['before','after']) {
    const body={messages:structuredClone(source)};
    const report=applyPresetSlots(body,[block('scene','main',side)],{prompts});
    assert.equal(report.results[0].status,'inserted');
    assert.equal(body.messages[1].role,'system');
    assert.ok(text(body.messages).indexOf('scene_reader_hub')<(side==='before'?text(body.messages).indexOf('Rules for User.'):Infinity));
    if(side==='after')assert.ok(text(body.messages).indexOf('Rules for User.')<text(body.messages).indexOf('scene_reader_hub'));
    assert.deepEqual(source,[{role:'system',content:'Intro\nRules for User.\nWorld rules.\nTail'},{role:'user',content:'Continue.'}]);
    assert.equal(applyPresetSlots(body,[block('scene','main',side)],{prompts}).changed,false,'second transport pass does not duplicate content');
}
{
    const body={messages:structuredClone(source)};
    const blocks=[block('scene','main','after'),block('world','world','before')];
    assert.equal(applyPresetSlots(body,blocks,{prompts}).results.filter(r=>r.status==='inserted').length,2);
    assert.match(text(body.messages),/Rules for User\.[\s\S]*data-kind="scene"[\s\S]*data-kind="world"[\s\S]*World rules\./);
    assert.equal(body.messages.filter(m=>m.role==='user').length,1);
}
{
    const body={messages:structuredClone(source)};
    applyPresetSlots(body,[block('scene','main','after'),block('world','main','after')],{prompts});
    assert.match(body.messages[1].content,/data-kind="scene"[\s\S]*data-kind="world"/,'same position keeps category order');
}
for(const reason of ['prompt_missing','prompt_disabled','content_not_found','ambiguous_content']) {
    const body={messages:structuredClone(reason==='ambiguous_content'?[...source,{role:'system',content:'Rules for User.'}]:source)};
    const before=structuredClone(body);
    const list=reason==='prompt_missing'?[]:reason==='prompt_disabled'?[{...prompts[0],enabled:false}]:reason==='content_not_found'?[{...prompts[0],content:'Different.'}]:prompts;
    assert.equal(applyPresetSlots(body,[block('scene','main','after')],{prompts:list}).results[0].reason,reason);
    assert.deepEqual(body,before,'uncertain anchor does not fall back or damage outbound chat');
}
{
    const body={messages:[{role:'developer',content:[{type:'text',text:'Intro Rules for User. Tail'},{type:'image_url',image_url:{url:'synthetic-image'}}]}]};
    applyPresetSlots(body,[block('scene','main','after')],{prompts});
    assert.equal(body.messages[0].role,'developer');assert.equal(body.messages[1].role,'system');
    assert.deepEqual(body.messages[2].content.at(-1),{type:'image_url',image_url:{url:'synthetic-image'}});
}
{
    const body={messages:[{role:'system',content:'Rules   for\nUser.'}]};
    const rendered=new Map([['main',['Rules for User.']]]);
    const raw=[{...prompts[0],content:'Rules for {{user}}.'}];
    assert.equal(applyPresetSlots(body,[block('scene','main','after')],{prompts:raw,prepared:rendered}).changed,true);
    assert.equal(applyPresetSlots({messages:source},[block('scene','main','after')],{prompts:raw}).changed,false,'unresolved macros are never re-evaluated');
}
{
    const settings={prompts:[...prompts,{identifier:'history',marker:true}],prompt_order:[{character_id:1,order:[{identifier:'world',enabled:false},{identifier:'main',enabled:true},{identifier:'history',enabled:true}]}]};
    const original=structuredClone(settings);
    assert.deepEqual(activePresetPrompts({oai_settings:settings},{characterId:1}).map(p=>[p.identifier,p.enabled]),[['world',false],['main',true]]);
    assert.deepEqual(settings,original);
    assert.deepEqual(activePresetPrompts({oai_settings:settings},{characterId:9}),[],'never use another character order');
}
{
    const sent=[],events=[],verified=[],manager={serviceSettings:{prompts,prompt_order:[{character_id:1,order:prompts.map(p=>({identifier:p.identifier,enabled:true}))}]},activeCharacter:{id:1},getPromptOrderForCharacter(){return this.serviceSettings.prompt_order[0].order},preparePrompt(p){return {...p,content:p.content.replace('{{user}}','User')}}};
    const expected={chatKey:'room',payload:'Scene payload',worldPayload:'World payload',capturePayload:'Collect emotions.',scenePreset:true,worldPreset:true,sceneSlot:{identifier:'main',side:'after'},worldSlot:{identifier:'world',side:'before'}};
    let generation={injection:expected,stateCaptureEnabled:false},chatKey='room',enabled=true;
    const win={Request,fetch:async function(input,options){sent.push({input,options});return {ok:true}}};
    const runtime=createPresetRequest({window:win,getContext:()=>({}),getCycle:()=>generation,getChatKey:()=>chatKey,isEnabled:()=>enabled,loadHost:async()=>({promptManager:manager}),report:(...args)=>events.push(args),verifyRequest:body=>verified.push(body)});
    await runtime.init();const hooked=win.fetch;await runtime.init();assert.equal(win.fetch,hooked,'one hook per owner');
    for(const type of ['normal','regenerate','swipe','continue']) {
        generation={injection:{...expected},stateCaptureEnabled:false};runtime.start(type);prompts.forEach(p=>manager.preparePrompt(p));
        const messages=structuredClone(source),body={type,messages:messages.filter(Boolean)};runtime.observeAssembly({prompt:messages});
        assert.equal(runtime.observeRequest({type,messages:structuredClone(messages)}),undefined,'auxiliary array is not eligible');
        assert.equal(runtime.observeRequest(body),true);assert.equal(generation.stateCaptureEnabled,true);
        assert.match(text(body.messages),/Collect emotions\./,'main-output emotion collection moves with scene slot');
        const once=JSON.stringify(body);
        await win.fetch('/api/backends/chat-completions/generate',{method:'POST',body:once});
        assert.equal(JSON.stringify(JSON.parse(sent.at(-1).options.body)),once);
        assert.equal(verified.at(-1).messages.length,body.messages.length);
        assert.ok(events.some(e=>e[1]==='PRESET_SLOT_RESULT'&&e[2].phase==='send'));
        const count=verified.length;
        await win.fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify({type:'quiet',messages:body.messages})});
        assert.equal(verified.length,count,'quiet auxiliary requests are untouched');
        runtime.reset();await win.fetch('/api/backends/chat-completions/generate',{method:'POST',body:once});assert.equal(verified.length,count);
    }
    for(const options of [{type:'quiet'},{type:'normal',dryRun:true},{type:'normal',options:{quiet_prompt:'aux'}}]) {
        runtime.start(options.type,options.options,options.dryRun);const messages=structuredClone(source),body={type:options.type,messages};runtime.observeAssembly({prompt:messages});assert.equal(runtime.observeRequest(body),undefined);
    }
    async function sendOpenAIRequest(input,options){return win.fetch(input,options);}
    async function sendGenerationRequest(input,options){return sendOpenAIRequest(input,options);}
    function prepareBody(){
        generation={injection:{...expected},stateCaptureEnabled:false};runtime.start('normal');
        const messages=structuredClone(source),body={type:'normal',messages:messages.filter(Boolean)};
        runtime.observeAssembly({prompt:messages});assert.equal(runtime.observeRequest(body),true);
        body.messages=body.messages.filter(message=>!String(message.content).includes('SCENE_READER_OUTPUT'));
        body.messages.unshift({role:'system',content:'Another extension rule.'});
        return body;
    }
    for(const asRequest of [false,true]) {
        const body=prepareBody(),raw=JSON.stringify(body),headers={'Content-Type':'application/json','X-Synthetic':'kept'};
        if(asRequest)await sendGenerationRequest(new Request('https://synthetic.invalid/api/backends/chat-completions/generate',{method:'POST',body:raw,headers}));
        else await sendGenerationRequest('/api/backends/chat-completions/generate',{method:'POST',body:raw,headers});
        const sentRequest=sent.at(-1),sentBody=JSON.parse(sentRequest.options?.body??await sentRequest.input.clone().text());
        assert.match(text(sentBody.messages),/Scene payload/,'main Request still repairs late removal after reading its body');
        assert.match(text(sentBody.messages),/Another extension rule/);
        assert.equal(new Headers(sentRequest.options?.headers??sentRequest.input.headers).get('X-Synthetic'),'kept');
        assert.equal(JSON.stringify(body),raw);
        assert.deepEqual(verified.at(-1),sentBody);
    }
    {
        const body=prepareBody(),raw=JSON.stringify(body),count=verified.length;
        let release;
        const read=new Promise(resolve=>release=resolve);
        const input={url:'https://synthetic.invalid/api/backends/chat-completions/generate',method:'POST',clone:()=>({text:()=>read})};
        const sending=sendGenerationRequest(input);
        prepareBody(); // A new generation becomes ready while the old body is read.
        release(raw);await sending;
        assert.equal(verified.length,count,'old asynchronous body reads cannot confirm the new cycle');
        assert.equal(sent.at(-1).input,input,'old requests are not rebuilt with new cycle content');
        assert.ok(!events.some(e=>e[1]==='PRESET_SLOT_SEND_ERROR'));
    }
    runtime.start('normal');const messages=structuredClone(source),body={type:'normal',messages};runtime.observeAssembly({prompt:messages});chatKey='other';assert.equal(runtime.observeRequest(body),undefined);chatKey='room';
    enabled=false;assert.equal(runtime.observeRequest(body),undefined);enabled=true;
    runtime.start('normal');runtime.observeAssembly({prompt:messages});generation={injection:{...expected}};assert.equal(runtime.observeRequest(body),undefined,'replacement preparation invalidates old reference');
}
{
    const calls=[],macros={other:()=> 'other content'};
    await clearLegacyPrompts(async(...args)=>calls.push(args));
    assert.deepEqual(calls.map(a=>a[0]),['scene-reader-router','scene-reader-world','scene-reader-state-capture']);
    registerEmptyLegacyMacros({register:(name,value)=>macros[name]=value.handler});
    assert.equal(macros['scene-reader'](),'');assert.equal(macros['scene-reader-world'](),'');assert.equal(macros.other(),'other content');
}
console.log('Preset slots passed: exact merged boundaries, two categories, stable ordering, idempotence, disabled/missing/ambiguous failures, rendered macros, multimodal preservation, main-only transport, stale cycles, quiet exclusions and exact-key cleanup.');
