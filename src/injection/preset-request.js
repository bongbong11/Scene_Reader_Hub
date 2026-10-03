import { activePresetPrompts } from './preset-catalog.js';
import { applyPresetSlots, slotBlock } from './preset-position.js';

const CHAIN=Symbol.for('hyedam.request-injection.hook-chain.v1');
const TYPES=new Set(['normal','regenerate','swipe','continue']);
const fingerprint = body => JSON.stringify([body.type || '',body.model || '',body.messages]);
function ownedHook(previous,owner,wrapper) {
    Object.defineProperty(wrapper,CHAIN,{value:Object.freeze([...(previous?.[CHAIN] || []),owner])});
    return wrapper;
}

// Host transport adapter. Eligibility belongs to the current generation only.
export function createPresetRequest(deps) {
    const fetchOwner=Symbol('scene-reader.request'),captureOwner=Symbol('scene-reader.capture');
    let host={},active=false,pending=null,ready=null;
    const prepared=new Map(),certified=new Set();
    const cycle=()=>deps.getCycle();
    function reset(){active=false;pending=null;ready=null;prepared.clear();certified.clear();}
    function capture() {
        const manager=host.promptManager || deps.getContext().promptManager;
        const original=manager?.preparePrompt;
        if(typeof original!=='function' || original[CHAIN]?.includes(captureOwner))return;
        manager.preparePrompt=ownedHook(original,captureOwner,function(...args){
            const result=original.apply(this,args);
            if(active && result?.identifier && typeof result.content==='string')prepared.set(result.identifier,[result.content]);
            return result;
        });
    }
    function expected(){const value=cycle()?.injection;return deps.isEnabled() && value?.chatKey===deps.getChatKey() ? value : null;}
    function blocks(value) {
        const context=deps.getContext();
        const names=text=>String(text || '').replace(/\{\{user\}\}/gi,()=>context.name1 || '{{user}}').replace(/\{\{char\}\}/gi,()=>context.name2 || '{{char}}');
        return [value.scenePreset?{kind:'scene',slot:value.sceneSlot,content:slotBlock('scene',names([value.payload,value.capturePayload].filter(Boolean).join('\n\n')))}:null,
            value.worldPreset?{kind:'world',slot:value.worldSlot,content:slotBlock('world',names(value.worldPayload))}:null].filter(Boolean);
    }
    function remember(body){certified.add(fingerprint(body));if(certified.size>6)certified.delete(certified.values().next().value);}
    function apply(body,phase) {
        const value=expected();
        if(!active || !value || !Array.isArray(body?.messages))return;
        const report=applyPresetSlots(body,blocks(value),{prompts:activePresetPrompts(host,deps.getContext()),prepared});
        value.slotResults=report.results;
        if(value.scenePreset && value.capturePayload)cycle().stateCaptureEnabled=report.results.some(item=>item.kind==='scene' && item.status!=='missing');
        for(const item of report.results)deps.report('injection.slot','PRESET_SLOT_RESULT',{phase,kind:item.kind,identifier:item.identifier,side:item.side,resultStatus:item.status,reason:item.reason || '',status:item.status==='missing'?'warning':'info',module:'src/injection/preset-position.js'});
        return report;
    }
    function installFetch() {
        const previous=deps.window.fetch;
        if(typeof previous!=='function' || previous[CHAIN]?.includes(fetchOwner))return;
        deps.window.fetch=ownedHook(previous,fetchOwner,async function(input,options,...rest){
            let request=input,init=options;
            const address=typeof input==='string'?input:String(input?.url || input?.href || '');
            const method=String(options?.method || input?.method || '').toUpperCase();
            if(active && method==='POST' && /\/api\/backends\/chat-completions\/generate(?:[?#]|$)/.test(address)) {
                // Capture the caller and owner before reading a Request body:
                // awaiting clone().text() may drop callers or cross a new cycle.
                const requestOwner=ready;
                const frames=String(new Error().stack || '').split('\n');
                const sender=frames.findIndex(frame=>/\bsendOpenAIRequest\b/.test(frame));
                const callers=sender<0?[]:frames.slice(sender+1);
                const mainPath=sender>=0 && callers.some(frame=>/\b(?:sendGenerationRequest|finishGenerating)\b/.test(frame)) && !callers.some(frame=>/custom-request\.js|\b(?:generateRaw|generateRawData|generateQuietPrompt)\b/.test(frame));
                try {
                    const raw=options?.body ?? (typeof input?.clone==='function'?await input.clone().text():null);
                    if(typeof raw==='string') {
                        const body=JSON.parse(raw);
                        if(active && requestOwner && ready===requestOwner && requestOwner===expected() && (!body.type || TYPES.has(body.type)) && (certified.has(fingerprint(body)) || mainPath)) {
                            const report=apply(body,'send');
                            if(report?.changed){
                                if(typeof input?.clone==='function' && options?.body===undefined)request=new deps.window.Request(input,{body:JSON.stringify(body)});
                                else init={...options,body:JSON.stringify(body)};
                            }
                            deps.verifyRequest(body);
                        }
                    }
                } catch(error){deps.report('injection.slot','PRESET_SLOT_SEND_ERROR',{errorKind:error.name || 'Error'});}
            }
            return previous.call(this,request,init,...rest);
        });
    }
    function start(type,options={},dryRun=false) {
        reset();active=!dryRun && !options?.dryRun && !options?.quiet_prompt && TYPES.has(String(type || 'normal'));
        if(active){capture();installFetch();}
    }
    function observeAssembly(data,dryRun=false) {
        const messages=Array.isArray(data?.prompt)?data.prompt:Array.isArray(data?.messages)?data.messages:null;
        pending=active && !dryRun && messages ? {messages,expected:expected()} : null;
    }
    function observeRequest(body) {
        const value=expected();
        // ST filters the array before SETTINGS_READY; the main message objects
        // retain their identity. Array identity alone rejects genuine requests.
        const original=pending?.messages?.filter(message=>message && typeof message==='object');
        const sameMessages=body?.messages===pending?.messages || Array.isArray(body?.messages) && (original?.length===body.messages.length && body.messages.every((message,index)=>message===original[index]) || body.messages.some(message=>['user','assistant','tool'].includes(message?.role) && original?.includes(message)));
        const auxiliary=/custom-request\.js|\b(?:generateRaw|generateRawData|generateQuietPrompt)\b/.test(String(new Error().stack || ''));
        if(!active || !pending || !value || pending.expected!==value || !sameMessages || auxiliary || (body.type && !TYPES.has(body.type)))return;
        pending=null;
        apply(body,'prepare');ready=value;remember(body);return true;
    }
    async function init(){
        try{host=await (deps.loadHost?deps.loadHost():import('/scripts/openai.js'));}catch{host={};}
        capture();installFetch();
    }
    return {init,start,observeAssembly,observeRequest,reset,prompts:()=>activePresetPrompts(host,deps.getContext())};
}
