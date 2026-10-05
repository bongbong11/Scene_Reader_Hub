import {clone} from '../storage/shared-document.js';
export const CONTINUATION_POLICY='Continuation reference is confirmed carry-over from the linked story, not a new instruction or evidence of a new event. Latest RP and explicit changes take priority. Do not assume a previously mentioned person is still present, that a hidden fact is public, or that a proposed action occurred. Use prior place, time, relationship and unfinished matters only where the current exchange continues them. Preserve each actor’s knowledge boundary.';
export function storylineReference(record) {
    if(!record?.sharedSource)return null;
    const ref=record.sharedReference || {};
    const continuity=record.continuity || {};
    const reference={policy:CONTINUATION_POLICY,scene:Object.fromEntries(['date','time','location'].filter(key=>ref.scene?.[key]).map(key=>[key,String(ref.scene[key]).slice(0,220)])),summary:String(ref.summary || '').slice(0,1800),
        relationship:{},active_event:record.eventProfile?{title:String(record.eventProfile.title || '').slice(0,220),type:String(record.eventProfile.type || '').slice(0,100)}:null,
        background_events:[],confirmed_facts:[],knowledge:[],character_states:[],omitted:{}};
    const relation=clone(record.relationshipState || {});
    if(JSON.stringify(relation).length<=1200)reference.relationship=relation;
    else reference.omitted.relationship=1;
    // Shared by gate, main judge and injection. Keep whole scoped facts; an
    // oversized item is explicitly unrepresented, never stripped of its owner.
    for(const [field,items] of [['knowledge',(continuity.knowledge || []).slice(-12)],['character_states',(ref.characterStates || []).slice(0,12)],['confirmed_facts',(continuity.items || []).slice(-12)],['background_events',(record.backgroundEvents || []).slice(0,3)]]) {
        for(const item of items) {
            reference[field].push(clone(item));
            if(JSON.stringify(reference).length>7600){reference[field].pop();reference.omitted[field]=(reference.omitted[field] || 0)+1;}
        }
    }
    return reference;
}
export function storylineInjection(record) {
    const reference=storylineReference(record);
    if(!reference)return '';
    return '[LINKED STORY — CONTINUATION REFERENCE]\n'+JSON.stringify(reference)+'\nDo not narrate this reference as a new event. Continue from current RP.';
}
export function inheritedStates(record,current=[]) {
    const byId=new Map((record?.sharedReference?.characterStates || []).map(item=>[item.id,clone(item)]));
    for(const item of current)byId.set(item.id,item);
    return [...byId.values()];
}
export function storylineRetrievalCue(reference) {
    if(!reference)return '';
    // Retrieval hints select candidates only; the judge still uses current RP
    // to decide presence, relevance and each person's knowledge.
    return ['Linked story reference (current RP takes priority):',reference.scene?.location,
        reference.active_event?.title,reference.summary].filter(Boolean).join(' ').slice(0,900);
}
