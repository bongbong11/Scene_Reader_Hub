// A cast binding belongs to one event, not to another independent plot slot.
// It is a proposal until completed RP verifies it; it never grants knowledge.
export const CAST_CONTRACT = 1;
export const CAST_LIMIT = 3;

export function castBeats(offers, event) {
    const beats = (offers?.event?.passed ? offers.event.candidates : [])
        .filter(item => item.element)
        .map(item => ({key:item.id, text:item.action || item.prompt, element:item.element, title:item.label, requiresOutsideActor:item.id==='A_relationship_01'}));
    if (event?.source === 'advanced' && event.phase !== 'aftermath') beats.push({key:'ongoing', text:event.prompt, element:event.element, title:event.title,requiresOutsideActor:Boolean(event.requiresOutsideActor)});
    return beats;
}

export function castQuestions(beats, sheets, generated, {newPersonAllowed=false}={}) {
    const questions=Object.fromEntries(beats.flatMap((beat,index) => {
        const prefix=`event_cast_${index}`;
        const direction=beat.key==='direction';
        return [[prefix, {type:'choice', instructions:`For event ${beat.key} in event_cast_context only. Select its acting person, not a separate event and not proof of current presence. Prefer a relevant registered NPC, then a relevant established person, then a new person only when the separate person offer is selected. A registered NPC need not have appeared recently: use a plausible arrival or contact. Do not summon an inaccessible person. Choose current_cast when existing main participants can carry the event; choose no_access only when an outside actor is essential and none can act. Do not choose no_access merely for lack of recent mention. Judge this event independently of the other proposed events.`, criteria:{
            ...Object.fromEntries(sheets.map((person,i)=>[`sheet_${i}`,`Registered NPC: ${person.name}. Use their supplied records.`])),
            ...Object.fromEntries(generated.map((person,i)=>[`generated_${i}`,`Established NPC: ${person.role || person.motive || person.id}. Access: ${person.access || 'follow established RP'}.`])),
            scene_existing:'An established person in RP fits; do not invent a new identity.',
            ...(newPersonAllowed&&!direction?{new_person:'No relevant established person fits; use the selected new-person offer for this event.'}:{}),
            ...(!beat.requiresOutsideActor?{current_cast:'The existing main participants or an impersonal circumstance can carry this event without another person.'}:{}),
            ...(direction?{none:'No additional actor move is useful; continue the current interaction.'}:{}),
            no_access:'An outside actor is essential but no plausible established access or selected new-person offer can supply one.',
        }}], [`${prefix}_action`, {type:'choice',instructions:`For event ${beat.key} in event_cast_context. Choose how its actor makes one concrete move according to their personality and motive. This selects the form of action, not permission. A rival may seduce, interfere or deceive without a villain label; ordinary people need not become hostile. Do not decide the target's response.`,criteria:{
            character_driven:'Pursue the event through a concrete character-specific line, decision or action.',
            argument:'Direct disagreement, accusation or refusal.', sarcasm:'A pointed barb or provocation.',
            manipulation:'Deception, concealment or divisive framing using known information.',
            seduction:'A character-consistent flirtation or tempting approach.', obstruction:'Actual interference with access, plans or cooperation.',
            exploitation:'A self-interested demand or use of leverage.', threat:'A concrete threat or coercive demand.',
            physical:'An attempt at supported physical confrontation.', withdrawal:'A consequential refusal or withdrawal.',
        }}]];
    }));
    const index=beats.findIndex(beat=>beat.key==='direction');
    if(index>=0){
        questions[`event_cast_${index}`].criteria.current_cast='An existing non-user participant carries this interaction; no extra entrance is needed.';
        questions[`event_cast_${index}`].instructions='For the enabled story directions, select an established actor whose own interest can shape the ongoing interaction now. Prefer a relevant registered NPC, then another established person. They may act through plausible presence or contact without a recent name mention. Use current participants when they fit, or none when no extra actor move is useful. This is not a second event draw: do not invent a new identity, separate crisis, secret, accident or knowledge. If a proposed event already uses this actor, their move is part of that event, not another action.';
        questions[`event_cast_${index}_action`].instructions='Choose the form of this established actor’s move within the ongoing interaction, according to personality, motive and access. This is expression, not permission or a new plot. Do not default to helpfulness or private thoughts alone. A rival can seduce, interfere or deceive without a villain label; ordinary people need not become hostile. Leave the target’s response open.';
    }
    return questions;
}

const ACTIONS=new Set(['character_driven','argument','sarcasm','manipulation','seduction','obstruction','exploitation','threat','physical','withdrawal']);
export function resolveCastBindings({beats=[],sheets=[],generated=[],answers={},additions=[],decisions={}}) {
    const event=additions.find(item=>item.feature==='event');
    const person=additions.find(item=>item.feature==='person');
    const selected=beats.filter(beat=>beat.key===event?.templateId || beat.key==='ongoing' && decisions.advanced_route==='continue' && decisions.advanced_move!=='quiet');
    // An event already owns its acting move. Do not add a competing routine
    // actor or ask the action budget to approve that same move a second time.
    const direction=beats.find(beat=>beat.key==='direction');
    if(!selected.length && direction && decisions.story_element && decisions.story_element!=='none') {
        const choice=answers[`event_cast_${beats.indexOf(direction)}`]?.choice;
        if(choice && choice!=='none' && choice!=='no_access')selected.push(direction);
    }
    return selected.map(beat=>{
        const index=beats.indexOf(beat), choice=answers[`event_cast_${index}`]?.choice;
        const action=answers[`event_cast_${index}_action`]?.choice;
        const base={schemaVersion:CAST_CONTRACT,beatKey:beat.key,action:ACTIONS.has(action)?action:'character_driven',delivery:'prepared',verification:'awaiting_output'};
        const sheet=/^sheet_\d+$/.test(choice||'')?sheets[Number(choice.slice(6))]:null;
        const existing=/^generated_\d+$/.test(choice||'')?generated[Number(choice.slice(10))]:null;
        if(sheet)return {...base,kind:'sheet',actorId:sheet.id,name:sheet.name};
        if(existing)return {...base,kind:'generated',actorId:existing.id,name:existing.role||existing.motive||'established NPC',profile:existing};
        if(choice==='new_person'&&person){
            // One new person, with a role in this event, not an unrelated second entrance.
            person.boundEvent=beat.key;
            person.candidate={...person.candidate,action:`Introduce one relevant participant through plausible access to act in this event: ${beat.text}`,effect:'The new participant actually enters or contacts the scene and acts in the selected event.'};
            person.profile.role=beat.title || person.profile.role;
            person.profile.aim=`Pursue their own character-specific purpose within this event: ${beat.text}`;
            person.profile.access='Use a plausible arrival or contact supported by this event and the setting; do not invent prior familiarity or hidden access.';
            person.profile.method=beat.text;
            person.profile.contribution=event?.candidate.effect || beat.text;
            return {...base,kind:'new',actorId:person.profile.id,name:'the selected new participant',profile:person.profile};
        }
        if(choice==='current_cast'&&beat.requiresOutsideActor)return {...base,kind:'unresolved',reason:'outside_actor_required'};
        if(['scene_existing','current_cast'].includes(choice))return {...base,kind:choice};
        return {...base,kind:'unresolved',reason:choice==='no_access'?'no_access':choice==='new_person'?'new_person_not_selected':'invalid_selection'};
    });
}

export function castSummary(bindings=[]) {
    return bindings.map(({schemaVersion,beatKey,kind,actorId,name,action,reason,delivery,verification})=>({schemaVersion,beatKey,kind,actorId,name,action,reason,delivery,verification}));
}
