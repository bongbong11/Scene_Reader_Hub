import assert from 'node:assert/strict';

export async function checkFinalRouting(page,requests) {
    await page.evaluate(()=>mock.emit('GENERATION_ENDED'));
    const before=requests.filter(r=>r.url.endsWith('/api/backends/chat-completions/generate')).length;
    const results=await page.evaluate(async()=>{
        const base='/scripts/extensions/third-party/Scene_Reader_Hub/';
        const {buildInjection,NPC_KNOWLEDGE_PROMPTS}=await import(base+'src/injection/assemble.js');
        const {buildEventCastInjection}=await import(base+'src/injection/npc-execution.js');
        const {createPresetRequest}=await import(base+'src/injection/preset-request.js');
        const {NPC_ACTIVITY}=await import(base+'src/injection/world-agency.js');
        const {CHAT_DEFAULTS}=await import(base+'src/storage/contract.js');
        const results=[];
        for(const scenario of ['generated','unnamed-event','same-actor','cancelled'])for(const macro of [false,true])for(const preset of [false,true]) {
            const characterDelivery={},handlers={};let cycle={};
            const named=scenario!=='generated';
            const bindings=scenario==='unnamed-event'?[{kind:'scene_existing',action:'obstruction'}]:scenario==='same-actor'?[{kind:'sheet',actorId:'observer',name:'Browser Observer',action:'obstruction'}]:[];
            let payload=buildInjection({settings:{...CHAT_DEFAULTS,worldAgencyEnabled:true},decisions:{npc_route:'reuse',npc_target:named?'sheet_0':'stored_generated',npc_role:'information',npc_knowledge:'direct',world_npc_activity:'active'},sheetNpcTarget:named?'Browser Observer':'',sheetNpcId:named?'observer':'',presentSheetNpcNames:['Browser Observer'],npcProfile:named?null:{id:'courier',role:'Browser Courier',aim:'Deliver the parcel.',mode:'ordinary'},eventActors:bindings,characterBlock:'BROWSER_ROUTING_RECORD',delivery:characterDelivery});
            const cast=buildEventCastInjection(bindings);
            if(cast){payload=payload.slice(0,-2)+'\n'+cast+'\n)';characterDelivery.scenePayload=characterDelivery.scenePayload.slice(0,-2)+'\n'+cast+'\n)';}
            cycle.injection={chatKey:'browser-routing',payload,characterDelivery,scenePreset:preset,worldPreset:preset,worldPayload:'BROWSER_ROUTING_WORLD',capturePayload:'BROWSER_ROUTING_CAPTURE',sceneSlot:{identifier:'anchor',side:'after'},worldSlot:{identifier:'anchor',side:'before'}};
            const prompt={identifier:'anchor',role:'system',content:'BROWSER_ROUTING_PRESET'};
            const manager={serviceSettings:{prompts:[prompt]},activeCharacter:{id:1},getPromptOrderForCharacter:()=>[{identifier:'anchor',enabled:true}],preparePrompt:p=>({...p})};
            const context={chat:[],mainApi:'openai',name1:'User',name2:'Hunter',macros:{register:(name,def)=>handlers[name]=def.handler}};
            const transport={Request,fetch:(...args)=>window.fetch(...args)};
            const runtime=createPresetRequest({window:transport,getContext:()=>context,getCycle:()=>cycle,getChatKey:()=> 'browser-routing',isEnabled:()=>true,isCharacterMacroEnabled:()=>macro,loadHost:async()=>({promptManager:manager}),report:()=>{},verifyRequest:()=>{}});
            await runtime.init();runtime.start('normal');manager.preparePrompt(prompt);
            const marker=handlers['scene-reader-character']();
            const render=text=>text.replaceAll('{{user}}','User').replaceAll('{{char}}','Hunter');
            const messages=[{role:'system',content:'BROWSER_ROUTING_PRESET\n'+marker},...(!preset?[{role:'system',content:render(payload)},{role:'system',content:'BROWSER_ROUTING_WORLD'},{role:'system',content:'BROWSER_ROUTING_CAPTURE'}]:[]),{role:'user',content:'BROWSER_ROUTING_INPUT'}];
            const body={type:'normal',messages};runtime.observeAssembly({prompt:messages});runtime.observeRequest(body);
            if(scenario==='cancelled'){runtime.reset();cycle={injection:null};}
            async function sendOpenAIRequest(){return transport.fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(body)});}
            async function sendGenerationRequest(){return sendOpenAIRequest();}
            const response=await sendGenerationRequest(),sent=await response.json();
            const text=sent.messages.map(m=>m.content).join('\n');
            results.push({scenario,macro,preset,text,activity:NPC_ACTIVITY,knowledge:NPC_KNOWLEDGE_PROMPTS.direct});
            runtime.finish();
        }
        return results;
    });
    const sent=requests.filter(r=>r.url.endsWith('/api/backends/chat-completions/generate')).slice(before);
    assert.equal(sent.length,results.length);
    for(const [i,r] of results.entries()) {
        assert.equal(sent[i].body.messages.map(m=>m.content).join('\n'),r.text,'check the body actually received by the synthetic server');
        assert.ok(r.text.includes('BROWSER_ROUTING_PRESET')&&r.text.includes('BROWSER_ROUTING_INPUT'));
        if(r.scenario==='cancelled'){
            assert.ok(!r.text.includes('BROWSER_ROUTING_RECORD')&&!r.text.includes('BROWSER_ROUTING_WORLD')&&!r.text.includes('BROWSER_ROUTING_CAPTURE'));
            continue;
        }
        assert.equal(r.text.split('BROWSER_ROUTING_RECORD').length-1,1);
        assert.equal(r.text.split(r.activity).length-1,1);
        assert.equal(r.text.split(r.knowledge).length-1,1);
        if(r.scenario==='generated'){
            assert.ok(r.text.includes('<NPC_ACTION_TARGET>Browser Courier'));
            assert.ok(!r.text.includes('Browser Observer: Apply the following role guidance'));
        } else if(r.scenario==='unnamed-event')assert.ok(r.text.includes('Let Browser Observer perform'));
        else {assert.ok(!r.text.includes('Let Browser Observer perform'));assert.equal(r.text.split('Event actor: Browser Observer.').length-1,1);}
    }
    console.log('Browser final routing passed: 16 actual requests, generated/registered ownership, unnamed event scope, bound activity and knowledge, cancelled prepared body cleanup, macro and preset.');
}
