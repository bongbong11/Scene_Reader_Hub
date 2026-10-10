import {participationQuestion, participationBasis} from '../character/presence.js';
const choice = value => String(value?.choice ?? value ?? '').trim();

export function sceneGateRequest({model,transcript,previous='normal',people=[],previousParticipantIds=[]}) {
    const messageIds=[...new Set([...String(transcript).matchAll(/^\[(\d+)\] (?:USER|CHARACTER)/gm)].map(match=>match[1]))];
    const questions={
        scene_level:{type:'choice',instructions:'Classify only the CURRENT scene, not the highest intensity in recent history. A past event, proposal, fantasy, OOC instruction, kiss, or sexual tension is not ongoing sexual activity. Choose unclear when the evidence cannot establish a level.',criteria:{'0':'Ordinary scene.','1':'Attraction, desire, or sexual tension in dialogue or thought.','2':'Affectionate contact including kissing, without explicit sexual activity.','3':'Explicit sexual activity has actually begun in this scene.','4':'Explicit sexual activity is currently continuing.','unclear':'Current level cannot be established.'}},
        scene_phase:{type:'choice',instructions:`Previous confirmed route: ${previous}. Classify whether the actual ongoing interaction is active, briefly paused, clearly ended, or ordinary. A pause to talk or rest inside the same interaction is not an ending. Mere absence of description, a location change, or elapsed turns is not enough to end it. A possibility of resuming is not enough to keep a completed scene active. Judge this independently of the level question.`,criteria:{normal:'No sexual activity has begun in the current interaction.',active:'Explicit sexual activity is actually being performed.',paused:'The same sexual interaction is briefly paused for talk, rest, or preparation.',ended:'The activity was completed or the current purpose has shifted to another activity.',unclear:'Insufficient or conflicting evidence.'}},
        scene_evidence:{type:'choice',instructions:'Select the one supplied RP message that best supports the current scene phase and level. Do not cite OOC, an imagined action, or an absent message.',criteria:{none:'No message reliably supports a transition.',...Object.fromEntries(messageIds.map(id=>[id,`RP message [${id}]`]))}},
    };
    for(const [index,person] of people.entries())questions[`scene_participant_${index}`]=participationQuestion(person);
    return {model,state:{scope:'Classify current scene continuity and any supplied world-rule relevance. Do not propose actions, character traits, or a new scene.',recent_roleplay:transcript,previous_route:previous,previous_participant_ids:previous==='paused'?previousParticipantIds:[],registered_people:people.map(person=>({id:person.id,name:person.name,aliases:person.aliases||[]}))},questions};
}

export function sceneGateAnswersConflict(answers) {
    const level=choice(answers?.scene_level),phase=choice(answers?.scene_phase);
    return (phase==='ended' && ['3','4'].includes(level)) || (phase==='active' && ['0','1','2'].includes(level));
}

export function sceneGateConflictRequest(request,answers) {
    return {
        model:request.model,
        state:{...request.state,scope:request.state.scope+' Resolve only the conflicting current-scene status. Use current RP evidence; do not infer an ending from silence or elapsed time.',first_level:choice(answers?.scene_level),first_phase:choice(answers?.scene_phase)},
        questions:{
            scene_resolution:{type:'choice',instructions:'Has the current sexual interaction actually ended, is it still active, or is it briefly paused? Select unclear if the latest RP does not establish this.',criteria:{active:'Activity is happening now.',paused:'The same interaction is briefly paused.',ended:'The interaction actually ended or shifted to another purpose.',unclear:'Current RP does not establish the status.'}},
            scene_evidence:request.questions.scene_evidence,
        },
    };
}

export function resolveSceneGateConflict(initial,answers,request,previous='normal') {
    const resolution=choice(answers?.scene_resolution),evidence=choice(answers?.scene_evidence);
    const recent=Object.keys(request.questions.scene_evidence.criteria).filter(id=>id!=='none').slice(-2);
    if(!recent.includes(evidence))return {...initial,confirmation:'unresolved'};
    if(resolution==='ended')return {...initial,route:'normal',transition:previous==='paused'?'exited':'',phase:'ended',evidence,confirmation:'resolved'};
    if(resolution==='active')return {...initial,route:'paused',transition:previous==='paused'?'':'entered',phase:'active',evidence,confirmation:'resolved'};
    if(resolution==='paused' && previous==='paused')return {...initial,route:'paused',transition:'',phase:'paused',evidence,confirmation:'resolved'};
    return {...initial,confirmation:'unresolved'};
}

export function resolveSceneGate(answers,request,previous='normal') {
    const level=choice(answers?.scene_level), phase=choice(answers?.scene_phase), evidence=choice(answers?.scene_evidence);
    const cited=Object.keys(request.questions.scene_evidence.criteria).filter(id=>id!=='none');
    const validEvidence=evidence!=='none' && cited.includes(evidence);
    const recentEvidence=validEvidence && cited.slice(-2).includes(evidence);
    let route=previous==='paused'?'paused':'normal';
    let transition='';
    if(phase==='active' && ['3','4'].includes(level) && recentEvidence) {
        if(route!=='paused')transition='entered';
        route='paused';
    } else if(route==='paused' && phase==='paused' && validEvidence) {
        route='paused';
    } else if(route==='paused' && recentEvidence && ['0','1','2'].includes(level) && ['ended','normal'].includes(phase)) {
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
    const unresolved=level==='unclear'||phase==='unclear'||(route==='paused'&&previous==='paused'&&phase!=='paused'&&!recentEvidence);
    return {...(unresolved?{confirmation:'unresolved'}:{}),route,transition,level:['0','1','2','3','4'].includes(level)?Number(level):null,phase,evidence:validEvidence?evidence:null,participantIds,participationObservations};
}
