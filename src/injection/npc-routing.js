// Delivery identity only. Never selects a new actor or changes a model verdict.
export function npcDeliveryTarget({decisions={},profile=null,sheetName='',sheetId='',presentNames=[]}={}) {
    if(sheetName)return {kind:'sheet',id:sheetId,name:sheetName};
    const selected=decisions.npc_target;
    const generated=selected==='stored_generated'||/^generated_\d+$/.test(selected||'');
    const routedProfile=profile&&['create','replace','reuse'].includes(decisions.npc_route)&&(!selected||selected==='none');
    if(generated||routedProfile)return {kind:'generated',id:profile?.id||'',name:profile?.name||profile?.identityName||profile?.characterName||profile?.role||'the selected established NPC'};
    if(selected==='scene_existing')return {kind:'scene_existing',id:'',name:''};
    if(presentNames.length===1)return {kind:'sheet',id:'',name:presentNames[0]};
    return null;
}

export function scopeNpcExecution(text,target) {
    if(!text||!target?.name)return text;
    if(target.kind==='sheet')return `<SHEET_NPC_ACTION_TARGET>${target.name}: Apply the following role guidance to this registered person using their own characterization.</SHEET_NPC_ACTION_TARGET>\n${text}`;
    return `<NPC_ACTION_TARGET>${String(target.name).replace(/[<>\r\n]/g,' ')}\n${text}\n</NPC_ACTION_TARGET>`;
}

export function npcTargetMatches(target,actor) {
    if(!target||!actor||actor.kind==='unresolved')return false;
    const id=actor.actorId||actor.id;
    if(target.id)return Boolean(id&&target.id===id);
    // Older direct renderers supply only a registered name. Never use a
    // generated role label or an unnamed scene participant as an identity.
    return target.kind==='sheet'&&actor.kind==='sheet'&&Boolean(target.name&&target.name===actor.name);
}
