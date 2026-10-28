import {PRESET_ENTRIES,entryHasMacro} from './preset-entry-contract.js';
let sequence=0;
const parts=body=>(body.messages||[]).flatMap(m=>typeof m.content==='string'?[{object:m,key:'content',role:m.role}]:Array.isArray(m.content)?m.content.filter(p=>p.type==='text').map(p=>({object:p,key:'text',role:m.role})):[]);
export function createHubMacros({getContext,isActive,getExpected,getPreset}) {
    const markers={};
    let registered=false;
    function register(){
        const macros=getContext().macros;if(!macros?.register)return false;
        for(const [kind,spec] of Object.entries(PRESET_ENTRIES))macros.register(spec.macro,{category:macros.category?.MISC??'misc',description:spec.name,returns:'현재 실행의 주입문',handler:()=>{
            const expected=getExpected();
            return registered&&isActive()&&getContext().mainApi==='openai'&&expected?.[kind+'Native']&&expected.presetKey===getPreset().key&&!/custom-request\.js|\b(?:generateRaw|generateRawData|generateQuietPrompt)\b/.test(String(new Error().stack||''))?markers[kind]||'':'';
        }});
        registered=true;return true;
    }
    return {register,start(){for(const kind of Object.keys(PRESET_ENTRIES))markers[kind]=`[SR_HUB_${kind.toUpperCase()}_${Date.now().toString(36)}_${++sequence}]`;},reset(){for(const key of Object.keys(markers))delete markers[key];},markers};
}

// Replace explicit macro slots only; no anchor text matching or message splitting.
export function applyEntryMacros(body,blocks,{markers={},preset}={}) {
    if(!Array.isArray(body?.messages))return {changed:false,results:[]};
    const fields=parts(body),eligible=fields.filter(p=>['system','developer'].includes(p.role)),results=[];let changed=false;
    for(const block of blocks){
        const spec=PRESET_ENTRIES[block.kind],prompt=preset?.prompts?.find(p=>p.identifier===spec.identifier);
        const marker=markers[block.kind],result={kind:block.kind,identifier:spec.identifier,side:'inside',status:'missing'};
        results.push(result);
        if(!prompt)result.reason='prompt_missing';
        else if(!prompt.enabled){result.status='disabled';result.reason='prompt_disabled';}
        else if(!entryHasMacro(prompt,block.kind))result.reason='macro_missing';
        else if(!block.content){result.status='empty';}
        else if(eligible.some(p=>p.object[p.key].includes(block.content))){result.status='present';}
        else if(marker&&eligible.some(p=>p.object[p.key].includes(marker)))result.status='inserted';
        else result.reason='macro_missing';
        let placed=false;
        for(const field of fields){
            const original=field.object[field.key];let text=original;
            if(result.status==='present'&&['system','developer'].includes(field.role))text=text.split(block.content).map((piece,index)=>index?(!placed?(placed=true,block.content):'')+piece:piece).join('');
            if(block.content&&result.status!=='inserted'&&result.status!=='present')text=text.split(block.content).join('');
            if(marker&&text.includes(marker))text=text.split(marker).map((piece,index)=>index?(!placed&&result.status==='inserted'&&['system','developer'].includes(field.role)?(placed=true,block.content):'')+piece:piece).join('');
            if(text!==original){field.object[field.key]=text;changed=true;}
        }
    }
    return {changed,results};
}
