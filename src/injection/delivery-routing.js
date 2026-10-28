import {characterEnvelope} from './character-macro.js';

export function deliveryParts({payload='',characterDelivery=null,worldPayload='',capturePayload='',scenePreset=false,worldPreset=false,characterMode='depth'}) {
    const split=characterDelivery?.version===1&&characterDelivery.scenePayload;
    const scene=split?characterDelivery.scenePayload:payload;
    const character=split?characterEnvelope(characterDelivery.text):'';
    const integrated=!scenePreset&&characterMode!=='entry';
    const base=[integrated?payload:!scenePreset?scene:'',!integrated&&characterMode!=='entry'?character:'',!worldPreset?worldPayload:'',!scenePreset?capturePayload:''].filter(Boolean).join('\n\n');
    const withoutCharacter=[!scenePreset?scene:'',!worldPreset?worldPayload:'',!scenePreset?capturePayload:''].filter(Boolean).join('\n\n');
    return {scene,character,base,withoutCharacter};
}

// Final routing only. The prepared analysis and its persisted format are unchanged.
export function routeIndependentCharacter(body,value,{marker='',render=String}={}) {
    const fields=(body.messages||[]).flatMap(m=>typeof m.content==='string'?[{object:m,key:'content',role:m.role}]:Array.isArray(m.content)?m.content.filter(p=>p.type==='text').map(p=>({object:p,key:'text',role:m.role})):[]);
    const character=render(value.independentCharacter||''),base=render(value.basePayload||'');
    const eligible=fields.filter(f=>['system','developer'].includes(f.role));
    if(value.characterMode==='entry'){
        value.characterRoute='macro';value.characterPayload=value.independentCharacter||'';
        return {changed:false,status:'macro',occurrences:0,characterChars:character.length};
    }
    const weave=value.characterMode==='weave'&&character&&marker;
    const hasAnchor=weave&&eligible.some(f=>f.object[f.key].includes(marker));
    const routed=value.characterRoute==='macro'&&value.characterMode==='weave';
    const included=routed&&eligible.some(f=>f.object[f.key].includes(character));
    const separated=Boolean(hasAnchor||included);
    const nextBase=separated?render(value.baseWithoutCharacter||''):base;
    let placed=false,changed=false;
    // Remove the integrated copy before deciding whether a placed envelope exists.
    // Otherwise a character-only base would be mistaken for the macro destination.
    for(const field of fields){
        const original=field.object[field.key];let text=original;
        const prior=render(value.routedBase??value.basePayload??'');
        const previous=[prior,hasAnchor?base:''].find(candidate=>candidate&&text.includes(candidate));
        if(previous&&['system','developer'].includes(field.role))text=text.replace(previous,nextBase);
        if(text!==original){field.object[field.key]=text;changed=true;}
    }
    const existing=separated&&eligible.some(f=>f.object[f.key].includes(character));
    for(const field of fields){
        const original=field.object[field.key];let text=original;
        const allowed=['system','developer'].includes(field.role);
        if(existing&&allowed)text=text.split(character).map((p,i)=>i?(!placed?(placed=true,character):'')+p:p).join('');
        if(marker&&text.includes(marker))text=text.split(marker).map((p,i)=>i?(!existing&&!placed&&separated&&allowed?(placed=true,character):'')+p:p).join('');
        if(text!==original){field.object[field.key]=text;changed=true;}
    }
    value.routedBase=nextBase;
    value.deliveryPayload=!value.scenePreset&&!separated?value.payload:value.independentScene;
    value.characterRoute=separated?'macro':value.characterMode==='weave'?'missing':'disabled';
    value.characterPayload=separated?value.independentCharacter:'';
    return {changed,status:value.characterRoute,occurrences:separated?1:0,characterChars:separated?character.length:0};
}
