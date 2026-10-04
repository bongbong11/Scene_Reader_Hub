import {drawRandom} from './draw-opportunity.js';
import {opportunitySettings} from './opportunity-settings.js';
import {EVENTS,PEOPLE,ADVANCED_TEMPLATES} from './opportunity-catalog.js';

export function normalizeOpportunities(value) {
    return {schemaVersion:1,current:value?.current||null,
        offered:Array.isArray(value?.offered)?value.offered.slice(-32):[],
        confirmed:Array.isArray(value?.confirmed)?value.confirmed.slice(-32):[]};
}
function choosePackages(pool,key,feature,history) {
    const random=drawRandom(key,`material:${feature}`),remaining=[...pool],chosen=[];
    const recent=new Set(history.slice(-8).map(x=>x.templateId));
    while(remaining.length&&chosen.length<3) {
        const fresh=remaining.filter(x=>!recent.has(x.id));
        const distinct=(fresh.length?fresh:remaining).filter(x=>!chosen.some(c=>c.family===x.family));
        const options=distinct.length?distinct:fresh.length?fresh:remaining;
        const item=options[Math.floor(random()*options.length)];chosen.push(item);remaining.splice(remaining.indexOf(item),1);
    }
    return chosen;
}
function ticket(key,feature,chance,enabled,reasonCode) {
    if(!enabled)return {key,feature,chance,roll:null,passed:false,status:'skipped',reasonCode,candidates:[]};
    const roll=1+Math.floor(drawRandom(key,feature==='person'?'appearance':'event')()*100);
    return {key,feature,chance,roll,passed:roll<=chance,status:roll<=chance?'offered':'skipped',reasonCode:roll<=chance?'draw_passed':'chance_failed',candidates:[]};
}
export function makeOpportunities(rec,key,{worldId='current',worldName='현재 설정 따름'}={}) {
    const config=opportunitySettings(rec.preferences),history=normalizeOpportunities(rec.opportunities);
    const supernatural=['fantasy','urban-supernatural','occult'].includes(worldId)
        || rec.lastJudgment?.worldId===worldId && rec.lastJudgment?.decisions?.advanced_world_rules==='supernatural';
    // An unverified output may already have started the prior central event.
    // Reserve its slot until the same request verifies that output; this does
    // not promote the stored proposal into a fictional fact.
    const current=Boolean(rec.eventProfile || rec.pendingPlan?.outputText && rec.pendingPlan?.additions?.some(x=>x.feature==='event'&&x.scope==='central'));
    const configuration=JSON.stringify([config.spontaneousMode,Boolean(rec.preferences.advancedEnabled),rec.preferences.advancedElements,config.villainAllowed,worldId,supernatural,current]);
    const event=ticket(key,'event',config.eventChance,config.eventEnabled&&(!current||config.eventSpontaneous),!config.enabled?'generation_disabled':current&&!config.eventSpontaneous?'existing_event':'disabled');
    const person=ticket(key,'person',config.personChance,config.personEnabled,'generation_disabled');
    const kind=config.villainAllowed&&drawRandom(key,'appearance-kind')()<0.3?'villain':'npc';
    person.kind=kind;person.spontaneous=config.personSpontaneous;
    event.spontaneous=config.eventSpontaneous;event.scope=current||!rec.preferences.advancedEnabled?'local':'central';
    event.worldId=worldId;event.worldName=worldName;
    let eventPool=[];
    const personPool=kind==='villain'?PEOPLE.filter(x=>x.family==='friction'):PEOPLE;
    if(event.passed) {
        const elements=rec.preferences.advancedElements||[];
        const advanced=rec.preferences.advancedEnabled&&!current?ADVANCED_TEMPLATES.filter(x=>elements.includes(x.element)
            && (supernatural || !['A_horror_03','A_horror_05'].includes(x.id))).map(x=>({...x,family:x.element,label:x.title,
            condition:`The selected world permits this element and trigger: ${x.trigger} Use only established actors or anonymous background; never invent a new featured person, named or unnamed, to bypass the person draw.`,action:x.prompt,effect:x.goal})):[];
        eventPool=config.eventSpontaneous?[...EVENTS,...advanced]:advanced;
        event.candidates=choosePackages(eventPool,key,'event',history.offered);
        if(!event.candidates.length){event.status='blocked';event.reasonCode='element_missing';}
    }
    if(person.passed)person.candidates=choosePackages(personPool,key,'person',history.offered);
    // Stored IDs/rolls are routing data, not evidence of fictional occurrence.
    const cache=history.current;
    for(const offer of [event,person]) {
        const old=cache?.key===key?cache[offer.feature]:null;
        if(cache?.configuration===configuration&&old?.passed&&offer.passed&&old.kind===offer.kind&&old.spontaneous===offer.spontaneous&&old.scope===offer.scope&&old.worldId===offer.worldId) {
            const available=new Map((offer.feature==='event'?eventPool:personPool).map(x=>[x.id,x]));
            if(old.candidateIds?.length&&old.candidateIds.every(id=>available.has(id))) {
                // Retain exact proposals on a retry; immutable copies prevent history drift.
                offer.candidates=old.candidateIds.map(id=>structuredClone(available.get(id)));
            }
            offer.reusedDraw=true;
        }
    }
    const metadata=({candidates,...offer})=>({...offer,candidateIds:candidates.map(x=>x.id)});
    history.current={key,configuration,event:metadata(event),person:metadata(person)};
    rec.opportunities=history;
    return {key,config,event,person};
}
export function rememberOpportunity(rec,addition,verdict) {
    rec.opportunities=normalizeOpportunities(rec.opportunities);
    const bucket=verdict==='request_included'?'offered':['fulfilled','partial'].includes(verdict)?'confirmed':null;
    if(!bucket)return;
    const entry={planId:addition.id,feature:addition.feature,templateId:addition.templateId,verdict};
    rec.opportunities[bucket]=[...rec.opportunities[bucket].filter(x=>x.planId!==entry.planId),entry].slice(-32);
}
