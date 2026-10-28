import assert from 'node:assert/strict';
import {createPresetRequest} from '../src/injection/preset-request.js';
import {PRESET_ENTRIES,entryText} from '../src/injection/preset-entry-contract.js';
import {characterEnvelope} from '../src/injection/character-macro.js';
const handlers={},sent=[],events=[];
const prompts=Object.entries(PRESET_ENTRIES).map(([kind,spec])=>({...spec,content:entryText(kind),enabled:true}));
let cycle={},key='room',macro=true,presetKey='openai:A';
const context={mainApi:'openai',name1:'User',name2:'Morgan',chat:[],macros:{register:(name,definition)=>handlers[name]=definition.handler}};
const transport={Request,fetch:async(input,options)=>{sent.push(JSON.parse(options?.body??await input.clone().text()));return {ok:true};}};
const adapter=createPresetRequest({window:transport,getContext:()=>context,getCycle:()=>cycle,getChatKey:()=>key,isEnabled:()=>true,isCharacterMacroEnabled:()=>macro,
    getPreset:()=>({key:presetKey,prompts}),loadHost:async()=>({}),report:(...args)=>events.push(args),verifyRequest:()=>{}});
await adapter.init();
const full='SYNTHETIC_SCENE\nSYNTHETIC_PERSON',envelope=characterEnvelope('SYNTHETIC_PERSON');
function prepare({enabled=true,anchor=true}={}){
    macro=enabled;key='room';presetKey='openai:A';for(const prompt of prompts)prompt.enabled=true;
    cycle={injection:{chatKey:key,presetKey,sceneNative:true,worldNative:true,scenePreset:true,worldPreset:true,payload:full,worldPayload:'SYNTHETIC_WORLD',capturePayload:'SYNTHETIC_CAPTURE',characterDelivery:{version:1,text:'SYNTHETIC_PERSON',scenePayload:'SYNTHETIC_SCENE'}}};
    adapter.start('normal');
    const body={type:'normal',model:'unchanged-model',messages:[{role:'system',content:'before '+handlers['scene-reader-hub']()+' after'},{role:'system',content:handlers['scene-reader-hub-world']()},{role:'system',content:anchor?handlers['scene-reader-character']():''},{role:'user',content:[{type:'text',text:'Keep user'},{type:'image_url',image_url:{url:'synthetic'}}]}]};
    adapter.observeAssembly({prompt:body.messages});adapter.observeRequest(body);return body;
}
async function sendOpenAIRequest(body){return transport.fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(body)});}
async function sendGenerationRequest(body){return sendOpenAIRequest(body);}
const text=body=>body.messages.map(m=>typeof m.content==='string'?m.content:'').join('\n');
for(const enabled of [false,true])for(const anchor of [false,true]){
    const body=prepare({enabled,anchor}),user=structuredClone(body.messages.at(-1));await sendGenerationRequest(body);await sendGenerationRequest(body);
    const actual=sent.at(-1),out=text(actual);assert.equal(actual.model,'unchanged-model');assert.equal(actual.messages.length,4);assert.deepEqual(actual.messages.at(-1),user);
    for(const target of ['SYNTHETIC_PERSON','SYNTHETIC_WORLD','SYNTHETIC_CAPTURE'])assert.equal(out.split(target).length-1,1);
    assert.equal(out.includes(envelope),enabled&&anchor);assert.ok(out.startsWith('before <SCENE_READER_OUTPUT'));assert.ok(!out.includes('SR_HUB_'));
    assert.equal(adapter.preview.read().status,enabled&&anchor?'included':'fallback');assert.ok(out.includes(adapter.preview.read().text));
}
{
    const body=prepare();prompts[0].enabled=false;await sendGenerationRequest(body);const out=text(sent.at(-1));
    assert.ok(!out.includes('SYNTHETIC_SCENE')&&!out.includes('SYNTHETIC_PERSON')&&!out.includes('SYNTHETIC_CAPTURE'));assert.ok(out.includes('SYNTHETIC_WORLD'));assert.equal(adapter.preview.read().status,'disabled');assert.equal(cycle.stateCaptureEnabled,false);
}
{
    const body=prepare();presetKey='openai:B';await sendGenerationRequest(body);assert.ok(!text(sent.at(-1)).includes('SYNTHETIC_'));assert.equal(adapter.preview.read(),null);
}
{
    const body=prepare();key='other-room';await sendGenerationRequest(body);assert.ok(!text(sent.at(-1)).includes('SYNTHETIC_'));assert.equal(adapter.preview.read(),null);
}
adapter.start('quiet');assert.equal(handlers['scene-reader-hub'](),'');assert.equal(handlers['scene-reader-hub-world'](),'');
assert.ok(events.some(args=>args[2].side==='inside'));assert.ok(!JSON.stringify(events).includes('SYNTHETIC_PERSON'));
console.log('Native final transport passed: scene/world in-place, macro/integrated fallback, repeat handoff, late toggle off, stale preset/room removal, quiet exclusion, unchanged multimodal user and privacy.');
