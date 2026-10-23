import assert from 'node:assert/strict';
import {createPresetRequest} from '../../src/injection/preset-request.js';
import {CHARACTER_MACRO} from '../../src/injection/character-macro.js';

export const requestText=body=>(body.messages||[]).flatMap(m=>typeof m.content==='string'?[m.content]:(m.content||[]).filter(p=>p.type==='text').map(p=>p.text)).join('\n');
export const occurrences=(text,needle)=>needle?text.split(needle).length-1:0;

// Real adapter, with a synthetic final transport. No server or credentials.
export async function finalRequestFixture() {
    let key='room',cycle={},enabled=true,macroEnabled=true;
    const handlers={},sent=[],events=[];
    const prompt={identifier:'main',role:'system',content:'SYNTHETIC_PRESET',enabled:true};
    const manager={serviceSettings:{prompts:[prompt]},activeCharacter:{id:1},getPromptOrderForCharacter:()=>[{identifier:'main',enabled:true}],preparePrompt:p=>({...p})};
    const ctx={mainApi:'openai',chat:[],name1:'User',name2:'Morgan',macros:{register:(name,def)=>handlers[name]=def.handler}};
    const win={Request,fetch:async(input,options)=>{
        const raw=options?.body??await input.clone().text();
        sent.push({body:JSON.parse(raw),input,options});return {ok:true};
    }};
    const runtime=createPresetRequest({window:win,getContext:()=>ctx,getCycle:()=>cycle,getChatKey:()=>key,isEnabled:()=>enabled,isCharacterMacroEnabled:()=>macroEnabled,loadHost:async()=>({promptManager:manager}),report:(...args)=>events.push(args),verifyRequest:()=>{}});
    await runtime.init();
    const render=text=>String(text||'').replace(/\{\{user\}\}/gi,'User').replace(/\{\{char\}\}/gi,'Morgan');
    function prepare(value,{macro=true,preset=false,worldPreset=false,type='normal',marker=true}={}) {
        macroEnabled=macro;key='room';ctx.chat=[];
        cycle={injection:{...structuredClone(value),chatKey:key,scenePreset:preset,worldPreset,worldPayload:'SYNTHETIC_WORLD',capturePayload:'SYNTHETIC_CAPTURE',sceneSlot:{identifier:'main',side:'after'},worldSlot:{identifier:'main',side:'before'}}};
        runtime.start(type);manager.preparePrompt(prompt);
        const slot=handlers[CHARACTER_MACRO]();
        const messages=[{role:'system',content:`SYNTHETIC_PRESET\n${marker?slot:''}`},...(!preset?[{role:'system',content:render(value.payload)},{role:'system',content:'SYNTHETIC_CAPTURE'}]:[]),...(!worldPreset?[{role:'system',content:'SYNTHETIC_WORLD'}]:[]),{role:'user',content:'Synthetic current turn.'}];
        const body={type,messages};runtime.observeAssembly({prompt:messages});assert.equal(runtime.observeRequest(body),true);
        return body;
    }
    async function sendOpenAIRequest(body,{asRequest=false,input=null}={}) {
        if(input)return win.fetch(input);
        const raw=JSON.stringify(body);
        return asRequest?win.fetch(new Request('https://synthetic.invalid/api/backends/chat-completions/generate',{method:'POST',body:raw})):win.fetch('/api/backends/chat-completions/generate',{method:'POST',body:raw});
    }
    async function sendGenerationRequest(body,options){return sendOpenAIRequest(body,options);}
    return {runtime,ctx,sent,events,prepare,send:sendGenerationRequest,
        setKey:value=>key=value,setCycle:value=>cycle=value,setEnabled:value=>enabled=value,
        get cycle(){return cycle;}};
}

export async function finalRequestMatrix(value,check) {
    const f=await finalRequestFixture();
    for(const macro of [false,true])for(const preset of [false,true]) {
        const body=f.prepare(value,{macro,preset});await f.send(body);
        const sent=f.sent.at(-1).body,text=requestText(sent);
        assert.equal(occurrences(text,'SYNTHETIC_WORLD'),1);
        assert.equal(occurrences(text,'SYNTHETIC_CAPTURE'),1);
        check(text,{macro,preset,body:sent});
    }
}
