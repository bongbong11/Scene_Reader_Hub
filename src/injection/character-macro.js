// Delivery only: no judging, rewriting, model calls or persistent prompt edits.
export const CHARACTER_MACRO = 'scene-reader-character';
export const CHARACTER_OPEN = '[SCENE_READER_CHARACTER]';
export const CHARACTER_CLOSE = '[/SCENE_READER_CHARACTER]';
let nextSlot=0;
export const CHARACTER_GUIDANCE = 'Read these records and turn guidance as material for interpreting living characters, not a fixed script. Each person responds through their present feelings, desires, attention, and circumstances; a trait need not produce the same words or behavior every time. Characterization may evolve through established events and consequences. Do not display every trait or recite and explain the records in sequence. Preserve established facts and knowledge boundaries, and distinguish prior states from proposed actions.';
export function characterEnvelope(text) {
    return String(text || '').trim() ? `${CHARACTER_OPEN}\n${CHARACTER_GUIDANCE}\n\n${text}\n${CHARACTER_CLOSE}` : '';
}
function textParts(body) {
    return (body.messages || []).flatMap(message => {
        const entries = typeof message.content === 'string' ? [{object:message,key:'content'}]
            : Array.isArray(message.content) ? message.content.filter(p=>p.type==='text'&&typeof p.text==='string').map(object=>({object,key:'text'})) : [];
        return entries.map(part=>({...part,role:message.role}));
    });
}
const count = (text, needle) => needle ? text.split(needle).length - 1 : 0;

// Always replace the complete, owned scene block, never matching individual rules.
// Work on copies so callers cannot half-apply a split.
export function routeCharacterMacro(body, value, {marker='', enabled=false, render=String}={}) {
    if (!Array.isArray(body?.messages)) return {changed:false,status:'unavailable'};
    if(!enabled && value?.characterRoute!=='macro' && (!marker || !textParts(body).some(p=>p.object[p.key].includes(marker)))) {
        if(value?.characterRoute) {
            value.characterRoute='disabled';
            value.deliveryPayload=value.payload;
            value.characterPayload='';
        }
        return {changed:false,status:'disabled',occurrences:0,characterChars:0};
    }
    const copy={messages:body.messages.map(m=>({...m,content:Array.isArray(m.content)?m.content.map(p=>({...p})):m.content}))};
    const parts=textParts(copy), delivery=value?.characterDelivery;
    const full=render(value?.payload || ''), scene=render(delivery?.scenePayload || '');
    const envelope=delivery?.version===1 ? characterEnvelope(render(delivery.text || '')) : '';
    const sceneParts=parts.filter(p=>['system','developer'].includes(p.role));
    const anchors=parts.reduce((n,p)=>n+count(p.object[p.key],marker),0);
    const existing=envelope ? parts.reduce((n,p)=>n+count(p.object[p.key],envelope),0) : 0;
    const fullCount=sceneParts.reduce((n,p)=>n+count(p.object[p.key],full),0);
    const reducedCount=sceneParts.reduce((n,p)=>n+count(p.object[p.key],scene),0);
    const canSplit=enabled && envelope && scene && (anchors || existing) && (fullCount===1 || value.characterRoute==='macro'&&reducedCount===1);
    const status=canSplit?'macro':!enabled?'disabled':!delivery?'legacy':!envelope?'empty':!anchors&&!existing?'missing':'scene_missing';
    let placed=false;
    for(const part of parts) {
        let text=part.object[part.key];
        if(canSplit) {
            if(['system','developer'].includes(part.role) && fullCount===1) text=text.replace(full,scene);
            // Repeated host passes keep the existing placement; duplicate anchors vanish.
            if(existing && text.includes(envelope)) {
                text=text.split(envelope).map((piece,index)=>index ? (placed?'':(placed=true,envelope))+piece : piece).join('');
            }
            if(marker && text.includes(marker)) {
                text=text.split(marker).map((piece,index)=>index ? (!existing&&!placed?(placed=true,envelope):'')+piece : piece).join('');
            }
        } else {
            if(value?.characterRoute==='macro' && scene && reducedCount===1 && ['system','developer'].includes(part.role))text=text.replace(scene,full);
            if(envelope)text=text.split(envelope).join('');
            if(marker)text=text.split(marker).join('');
        }
        part.object[part.key]=text;
    }
    const changed=JSON.stringify(copy.messages)!==JSON.stringify(body.messages);
    if(changed)body.messages=copy.messages;
    if(value) {
        value.characterRoute=status;
        value.deliveryPayload=canSplit?delivery.scenePayload:value.payload;
        value.characterPayload=canSplit?characterEnvelope(delivery.text):'';
    }
    return {changed,status,occurrences:anchors || existing,characterChars:canSplit?envelope.length:0};
}

export function createCharacterMacro({getContext,isEnabled,isActive}) {
    let marker='',registered=false;
    function register() {
        const macros=getContext().macros;
        if(typeof macros?.register!=='function')return false;
        macros.register(CHARACTER_MACRO,{category:macros.category?.MISC??'misc',
            description:'위브 프리셋 인물 분석 위치',returns:'현재 실행의 인물 분석',
            handler:()=>getContext().mainApi==='openai'&&isActive()&&isEnabled()&&!/custom-request\.js|\b(?:generateRaw|generateRawData|generateQuietPrompt)\b/.test(String(new Error().stack||''))?marker:''});
        registered=true;return true;
    }
    return {
        register,
        start(){marker=`[SR_CHARACTER_SLOT_${Date.now().toString(36)}_${++nextSlot}]`;},
        reset(){marker='';},
        get marker(){return marker;},
        get enabled(){return registered&&getContext().mainApi==='openai'&&Boolean(isEnabled());},
    };
}
