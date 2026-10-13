import {participationQuestion, participationBasis} from '../character/presence.js';
const choice = value => String(value?.choice ?? value ?? '').trim();

export function sceneGateRequest({model,transcript,previous='normal',previousScene=null,people=[],previousParticipantIds=[]}) {
    const messageIds=[...new Set([...String(transcript).matchAll(/^\[(\d+)\] (?:USER|CHARACTER)/gm)].map(match=>match[1]))];
    const questions={
        scene_status:{type:'choice',instructions:`Classify the CURRENT interaction once, not its past highest intensity or proposed next action. Previous route: ${previous}. Judge actual activity, not vocabulary: anatomical terms, mentions of sex or arousal, and non-graphic adult jokes alone do not establish sexual activity. A pause inside the same interaction is not an ending; silence alone does not end it. Ordinary status does not forbid a next physical approach.`,criteria:{ordinary:'Ordinary current interaction.',tension:'Attraction, desire, or sexual tension, without actual sexual activity.',affection:'Affectionate contact or kissing without explicit sexual activity.',explicit_begin:'Explicit sexual activity has actually begun now.',explicit_ongoing:'Explicit sexual activity is continuing now.',brief_pause:'The same ongoing sexual interaction briefly pauses for talk, rest, or preparation.',ended:'The activity has actually ended or its purpose has shifted to another activity.',unknown:'Current status cannot be established.'}},
        scene_evidence:{type:'choice',instructions:'Select the one supplied RP message that best supports the current scene phase and level. Do not cite OOC, an imagined action, or an absent message.',criteria:{none:'No message reliably supports a transition.',...Object.fromEntries(messageIds.map(id=>[id,`RP message [${id}]`]))}},
    };
    for(const [index,person] of people.entries())questions[`scene_participant_${index}`]=participationQuestion(person);
    return {model,state:{scope:'Classify current scene continuity and any supplied world-rule relevance. Different questions describe different aspects, not successive permissions. Do not propose actions, character traits, or a new scene.',recent_roleplay:transcript,previous_route:previous,previous_scene:previousScene,previous_participant_ids:previous==='paused'?previousParticipantIds:[],registered_people:people.map(person=>({id:person.id,name:person.name,aliases:person.aliases||[],...(person.mainSillyTavernName?{main_card:person.mainSillyTavernName}:{})}))},questions};
}

export function resolveSceneGate(answers,request,previous='normal') {
    const canonical={ordinary:['0','normal'],tension:['1','normal'],affection:['2','normal'],explicit_begin:['3','active'],explicit_ongoing:['4','active'],brief_pause:[String(request.state.previous_scene?.level??4),'paused'],ended:[String(request.state.previous_scene?.level??0),'ended'],unknown:['unclear','unclear']};
    const selected=choice(answers?.scene_status);
    const [level,phase]=canonical[selected] || [choice(answers?.scene_level)||'unclear',choice(answers?.scene_phase)||'unclear'];
    const evidence=choice(answers?.scene_evidence);
    const cited=Object.keys(request.questions.scene_evidence.criteria).filter(id=>id!=='none');
    const validEvidence=evidence!=='none' && cited.includes(evidence);
    const recentEvidence=validEvidence;
    let route=previous==='paused'?'paused':'normal';
    let transition='';
    if(phase==='active' && ['3','4'].includes(level) && recentEvidence) {
        if(route!=='paused')transition='entered';
        route='paused';
    } else if(route==='paused' && phase==='paused' && validEvidence) {
        route='paused';
    } else if(route==='paused' && recentEvidence && (phase==='ended' || ['0','1','2'].includes(level) && phase==='normal')) {
        route='normal';transition='exited';
    }
    const participantIds=[],participationObservations={};
    const priorParticipants=new Set(request.state.previous_participant_ids||[]);
    for(const [index,person] of (request.state.registered_people||[]).entries()) {
        const answer=answers?.[`scene_participant_${index}`];
        const legacy=choice(answer);
        const participation=legacy==='yes'?'direct':legacy==='no'?'reference':participationBasis(answer);
        participationObservations[person.id]=legacy==='yes'?{choice:'direct',confidence:1}:legacy==='no'?{choice:'reference',confidence:1}:answer||{choice:'unknown',confidence:0};
        if(['direct','remote','continuing','participating'].includes(participation) || (route==='paused' && previous==='paused' && participation==='unknown' && priorParticipants.has(person.id)))participantIds.push(person.id);
    }
    const unresolved=level==='unclear'||phase==='unclear'||(['active','ended','paused'].includes(phase)&&!validEvidence)||(route==='paused'&&previous==='paused'&&phase!=='paused'&&!recentEvidence);
    return {...(unresolved?{confirmation:'unresolved'}:{}),route,transition,level:unresolved?request.state.previous_scene?.level??null:['0','1','2','3','4'].includes(level)?Number(level):null,phase,evidence:validEvidence?evidence:null,participantIds,participationObservations};
}
