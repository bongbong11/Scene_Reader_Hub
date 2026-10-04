import {BLOCK_CHOICES,opportunityQuestion,VERIFICATION,VERIFICATION_CHOICES} from '../decision/opportunity-questions.js';

export function addOpportunityQuestions(questions,offers,rec) {
    for(const key of ['event_route','npc_route','villain_route','advanced_route']) {
        if(!questions[key])continue;
        delete questions[key].criteria.create;delete questions[key].criteria.replace;
    }
    // Preserve existing-actor and existing-event routing, without two creative approvals.
    if(!rec.eventProfile)for(const key of ['advanced_entry','advanced_route','advanced_cause','advanced_element','advanced_move'])delete questions[key];
    for(const feature of ['event','person']) {
        const offer=offers[feature];
        if(offer.passed&&offer.candidates.length) {
            questions[`${feature}_opportunity`]=opportunityQuestion(feature,offer.candidates);
            questions[`${feature}_opportunity`].instructions+=` Mode: ${offer.spontaneous?'spontaneous':'normal'}.${feature==='person'?` Kind: ${offer.kind}.`:''}`;
        }
    }
    if(rec.eventProfile?.phase==='aftermath')questions.event_closure={type:'choice',instructions:VERIFICATION.closure,criteria:{ongoing:'The objective remains materially unresolved.',completed:'A concrete completed or abandoned objective is established.',unclear:'Completion cannot be determined.'}};
}
export function opportunityDetail(answer,offer) {
    const choice=answer?.choice,valid=Object.hasOwn(BLOCK_CHOICES,choice)||/^candidate_[1-3]$/.test(choice||'')&&Boolean(offer?.candidates[Number(choice.slice(-1))-1]);
    const effective=valid?choice:'invalid_selection';
    return {selected:effective,effective,policyEffective:effective,coordinatorFinal:effective,adjusted:!valid,certainty:Number(answer?.confidence)||0,threshold:0,policy:'routing',fallbackApplied:!valid,rule:'신규 전개 재료 선택 · 추가 확신도 탈락 없음'};
}
export function resolveOpportunities(offers,answers) {
    const additions=[];
    for(const feature of ['event','person']) {
        const offer=offers[feature];
        if(!offer.passed||!offer.candidates.length)continue;
        const choice=answers[`${feature}_opportunity`]?.choice;
        if(Object.hasOwn(BLOCK_CHOICES,choice)){offer.status='blocked';offer.reasonCode=choice;continue;}
        const candidate=/^candidate_[1-3]$/.test(choice||'')?offer.candidates[Number(choice.slice(-1))-1]:null;
        if(!candidate){offer.status='failed';offer.reasonCode='invalid_selection';continue;}
        // Ordinary spontaneous happenings remain local even with advanced
        // generation enabled; only an advanced package opens a central thread.
        if(feature==='event'&&!candidate.element)offer.scope='local';
        offer.status='selected';offer.reasonCode='selected';
        const addition={id:`addition-${offers.key}-${feature}`,feature,templateId:candidate.id,candidate,
            spontaneous:offer.spontaneous,scope:offer.scope||'person',kind:offer.kind||'event',delivery:'prepared',verification:'awaiting_output'};
        if(feature==='event'&&offer.scope==='central') {
            addition.profile={id:`event-${offers.key}`,source:'advanced',worldId:offer.worldId,worldName:offer.worldName,element:candidate.element||'social',
                title:candidate.label,trigger:candidate.trigger||candidate.condition,goal:candidate.goal||candidate.effect,pressure:candidate.pressure||'A bounded local consequence',prompt:candidate.prompt||candidate.action,
                resolution:'The event ends only after its concrete objective produces an established result or the user ends it.',
                phase:'introduced',status:'pending',progress:0,createdAt:new Date().toISOString()};
        }
        if(feature==='person') {
            const profile={id:`appearance-${offers.key}`,status:'pending',mode:'natural',role:candidate.label,access:candidate.condition,
                aim:`Preserve the person's own immediate purpose established by the verified ${candidate.label} encounter. The original entrance is not a recurring task.`,contribution:candidate.effect,entry:'valid selected package',stake:'their own immediate purpose',constraint:'established access and knowledge',
                leverage:'bounded situational access',competence:'ordinary role competence',demeanor:'individual and proportionate',reliability:'limited by direct experience',duration:'while the immediate interaction matters',
                turningCondition:'a concrete change in circumstances',motive:'their own immediate interest',method:candidate.action,composure:'individual and proportionate'};
            addition.profile=profile;
        }
        additions.push(addition);
    }
    return additions;
}
export function additionVerificationQuestions(pending) {
    if(!pending?.outputText)return {};
    return Object.fromEntries((pending.additions||[]).map((item,i)=>[`verification_addition_${i}`,{type:'choice',instructions:`${VERIFICATION[item.feature]} Selected action: ${item.candidate.action} Required effect: ${item.candidate.effect}`,criteria:VERIFICATION_CHOICES}]));
}
export function additionVerdicts(pending,decisions) {
    return (pending?.additions||[]).map((addition,i)=>({...addition,verification:decisions[`verification_addition_${i}`]||'not_applicable'}));
}
