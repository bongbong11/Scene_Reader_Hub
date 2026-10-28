import assert from 'node:assert/strict';
import {deliveryParts,routeIndependentCharacter} from '../src/injection/delivery-routing.js';
import {createPresetRequest} from '../src/injection/preset-request.js';
import {PRESET_ENTRIES,entryText} from '../src/injection/preset-entry-contract.js';
const handlers={},events=[],prompts=Object.entries(PRESET_ENTRIES).map(([kind,spec])=>({...spec,content:entryText(kind),enabled:true}));
const ctx={mainApi:'openai',name1:'User',name2:'Morgan',chat:[],macros:{register:(key,value)=>handlers[key]=value.handler}};
let cycle={},macro=false,chatKey='room';const sent=[];
const transport={fetch:async(_url,options)=>{sent.push(JSON.parse(options.body));return {ok:true};}};
const runtime=createPresetRequest({window:transport,getContext:()=>ctx,getCycle:()=>cycle,getChatKey:()=>chatKey,isEnabled:()=>true,isCharacterMacroEnabled:()=>macro,getPreset:()=>({key:'A',prompts}),loadHost:async()=>({}),report:(...args)=>events.push(args),verifyRequest:()=>{}});
async function sendOpenAIRequest(body){return transport.fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(body)});}
async function sendGenerationRequest(body){return sendOpenAIRequest(body);}
await runtime.init();
for(const scenePreset of [false,true])for(const worldPreset of [false,true])for(const characterMode of ['depth','weave','entry'])for(const weaveAnchor of [false,true]){
    const args={payload:'SCENE_ONLY\nPERSON_ONLY',characterDelivery:{version:1,scenePayload:'SCENE_ONLY',text:'PERSON_ONLY'},worldPayload:'WORLD_ONLY',capturePayload:'CAPTURE_ONLY',scenePreset,worldPreset,characterMode};
    const parts=deliveryParts(args);macro=characterMode==='weave';
    chatKey='room';for(const prompt of prompts)prompt.enabled=true;
    cycle={injection:{...args,chatKey:'room',presetKey:'A',independentDelivery:true,deliveryPayload:parts.scene,independentScene:parts.scene,independentCharacter:parts.character,basePayload:parts.base,baseWithoutCharacter:parts.withoutCharacter,sceneNative:scenePreset,worldNative:worldPreset,characterNative:characterMode==='entry'}};
    runtime.start('normal');
    const messages=[{role:'system',content:parts.base},{role:'system',content:handlers['scene-reader-hub']()},{role:'system',content:handlers['scene-reader-hub-world']()},{role:'system',content:handlers['scene-reader-hub-character']()},{role:'system',content:weaveAnchor?handlers['scene-reader-character']():''},{role:'user',content:'USER_UNCHANGED'}];
    const body={type:'normal',messages};runtime.observeAssembly({prompt:messages});runtime.observeRequest(body);
    const text=messages.map(m=>m.content).join('\n');
    for(const token of ['SCENE_ONLY','PERSON_ONLY','WORLD_ONLY','CAPTURE_ONLY'])assert.equal(text.split(token).length-1,1,JSON.stringify({scenePreset,worldPreset,characterMode,weaveAnchor,token}));
    assert.ok(!text.includes('SR_HUB_')&&!text.includes('SR_CHARACTER_SLOT_'));
    assert.equal(messages[1].content.includes('PERSON_ONLY'),false,'scene entry never carries person');
    assert.equal(messages[2].content.includes('PERSON_ONLY'),false,'world entry never carries person');
    assert.equal(messages[3].content.includes('PERSON_ONLY'),characterMode==='entry');
    assert.equal(messages[4].content.includes('PERSON_ONLY'),characterMode==='weave'&&weaveAnchor);
    assert.equal(messages[0].content.includes('PERSON_ONLY'),characterMode==='depth'||characterMode==='weave'&&!weaveAnchor);
    assert.equal(messages.at(-1).content,'USER_UNCHANGED');
    await sendGenerationRequest(body);await sendGenerationRequest(body);
    for(const token of ['SCENE_ONLY','PERSON_ONLY','WORLD_ONLY','CAPTURE_ONLY'])assert.equal(sent.at(-1).messages.map(m=>m.content).join('\n').split(token).length-1,1,'final handoff is idempotent');
    if(characterMode==='entry'){
        prompts.find(p=>p.identifier===PRESET_ENTRIES.character.identifier).enabled=false;
        await sendGenerationRequest(body);
        const off=sent.at(-1).messages.map(m=>m.content).join('\n');assert.ok(!off.includes('PERSON_ONLY'));assert.ok(off.includes('SCENE_ONLY')&&off.includes('WORLD_ONLY'));
    }
    chatKey='other';await sendGenerationRequest(body);
    assert.ok(!sent.at(-1).messages.map(m=>m.content).join('\n').includes('_ONLY'),'stale room removes every owned section');
}
assert.ok(!JSON.stringify(events).includes('PERSON_ONLY'));
// A later host pass can retain the placed block while substituting another marker.
// Only the extension's system content is deduplicated; user content is untouched.
for(const scenePreset of [false,true]){
    const args={payload:'SCENE_ONLY\nPERSON_ONLY',characterDelivery:{version:1,scenePayload:'SCENE_ONLY',text:'PERSON_ONLY'},scenePreset,worldPreset:true,characterMode:'weave'};
    const parts=deliveryParts(args),value={...args,independentScene:parts.scene,independentCharacter:parts.character,basePayload:parts.base,baseWithoutCharacter:parts.withoutCharacter};
    const body={messages:[{role:'system',content:parts.base},{role:'system',content:'MARKER'}]};
    routeIndependentCharacter(body,value,{marker:'MARKER'});
    body.messages.push({role:'system',content:parts.character+'\nMARKER'},{role:'user',content:parts.character});
    routeIndependentCharacter(body,value,{marker:'MARKER'});
    assert.equal(body.messages.filter(m=>m.role==='system').map(m=>m.content).join('\n').split('PERSON_ONLY').length-1,1,'repeated host placement retains one character block');
    assert.equal(body.messages.at(-1).content,parts.character,'deduplication does not rewrite user text');
}
chatKey='room';runtime.start('normal');
const lost={messages:[{role:'system',content:handlers['scene-reader-hub-character']()},{role:'user',content:'USER_UNCHANGED'}]};
cycle.injection=null;runtime.observeAssembly({prompt:lost.messages});runtime.observeRequest(lost);
assert.ok(!JSON.stringify(lost).includes('SR_HUB_'),'lost preparation removes the third native marker too');assert.equal(lost.messages.at(-1).content,'USER_UNCHANGED');
console.log('Independent delivery passed: all 24 scene/world/person combinations, separate macros, default composition, Weave fallback and private diagnostics.');
