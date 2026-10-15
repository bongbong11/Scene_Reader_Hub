export const CONFLICT_TACTICS = {
    argument:'Make the NPC directly dispute, refuse, accuse, interrupt, or press the opposed point in their own voice. Execute the disagreement rather than describing a possible argument.',
    sarcasm:'Make the NPC deliver a character-specific barb, mockery, or provocation that bears on the live exchange. Do not replace it with a harmless joke or an unspoken insult.',
    manipulation:'Make the NPC actively distort, conceal, frame, or exploit what they actually know to influence a choice or alignment. Carry out the tactic; do not invent private knowledge.',
    exploitation:'Make the NPC seek a concrete advantage through a demand, unfair condition, leverage, or opportunistic choice. Execute the demand without assuming it succeeds.',
    seduction:'Make the NPC carry out the established seduction or tempting approach in their own style. Do not leave the aim only in thoughts, and do not write the target’s desire or response for them.',
    threat:'Make the NPC express or carry out the established threat through a concrete demand or coercive move. When its established trigger is met, attempt the threatened conduct instead of repeating warnings.',
    physical:'Make the NPC attempt the selected physical aggression using their established means. Do not substitute another glare, inner threat, or harmless motion for the selected act; leave the target’s response open.',
    obstruction:'Make the NPC actually obstruct access, cooperation, movement, information, or standing through the means they possess. Show the obstruction in the present exchange.',
    withdrawal:'Make the NPC withdraw, refuse further involvement, or change tactics for their own established reason. Do not recast retreat as kindness, forgiveness, or surrender without cause.',
    character_driven:'Make the NPC pursue their established immediate objective through an actual line, decision, or action. Do not default to agreeable helpfulness or leave the objective only in thoughts.',
};
export function selectActingAntagonists(people, {socialEnabled=true, selectedTargetId=''}={}) {
    if (!socialEnabled) return [];
    return people.filter(person => person.kind === 'npc' && person.presence === 'active'
        && (person.antagonist || person.npcRole === 'villain')
        && (person.participationEvidence !== 'continuing' || person.id === selectedTargetId));
}
export function buildAntagonistExecution({actor='the established antagonist',tactic='character_driven',antagonist=false}={}) {
    if (!antagonist) return '';
    const selected=Object.hasOwn(CONFLICT_TACTICS,tactic)?tactic:'character_driven';
    const name=String(actor).replace(/[<>\n\r]/g,' ').trim();
    return `<NPC_CONFLICT_ACTION tactic="${selected}">For ${name}, execute the selected tactic through actual in-character speech or conduct in this response, following their established personality and objective. Inner thoughts, looks, or atmosphere alone do not fulfill it. Use only established knowledge, means and access; the tactic grants no new capability or control of the target. ${CONFLICT_TACTICS[selected]}</NPC_CONFLICT_ACTION>`;
}

export function buildEventCastInjection(bindings=[]) {
    return bindings.map(binding=>{
        if(binding.kind==='unresolved')return 'For the selected event, do not invent an inaccessible actor or a new identity without the person offer. Execute the available part with established participants; do not claim the missing contact occurred.';
        const actor=binding.kind==='current_cast'?'the existing non-user participants':binding.kind==='scene_existing'?'the relevant established NPC':String(binding.name||'the selected actor').replace(/[<>\r\n]/g,' ');
        const tactic=(CONFLICT_TACTICS[binding.action]||CONFLICT_TACTICS.character_driven).replaceAll('the NPC','the acting character');
        const profile=binding.kind==='generated'?` Established purpose: ${binding.profile?.aim||binding.profile?.motive||''}. Means and access: ${binding.profile?.access||''}.`:'';
        if(binding.beatKey==='direction')return `Ongoing actor: ${actor}. ${tactic}${profile} Use available presence or contact within the ongoing interaction; do not add an unselected incident or identity. Preserve established personality, knowledge and relationship pace; leave the other person's response and success open.`;
        return `Event actor: ${actor}. Make one concrete move for the selected event in this response, through available contact or presence. ${tactic}${profile} This is part of that event, not another plot. Thoughts alone do not fulfill the move. Preserve personality, known facts, access, relationship pace and the target's response; do not assume success or mutual desire.`;
    }).join('\n');
}
