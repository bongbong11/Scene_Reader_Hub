import {COMMON_EXECUTION,BASE_RESPONSE,COMBINE_ADDITIONS,DIRECTIONS,renderAddition,renderAdvancedEvent} from './opportunity-prompts.js';
import {COMMON_META} from './assemble.js';

export function additionBlocks(additions,settings,hasOngoingEvent) {
    return additions.map(item=>({id:item.id,feature:item.feature,templateId:item.templateId,
        text:item.feature==='event'&&item.candidate.element
            ?renderAdvancedEvent(item.profile||item.candidate,{move:'seed',ongoing:hasOngoingEvent,style:settings.developmentStyle,direction:settings.worldDirection})
            :renderAddition(item.candidate,{kind:item.feature,spontaneous:item.spontaneous,style:settings.developmentStyle,direction:settings.worldDirection,ongoing:hasOngoingEvent,antagonist:item.kind==='villain'})}));
}
export function incorporateAdditions(payload,blocks,settings) {
    if(!blocks.length)return payload;
    if(!payload.startsWith(COMMON_META)||!payload.endsWith('\n)'))throw new Error('신규 전개 주입문 조립 형식을 확인하지 못했습니다.');
    // Replace only the generic single-beat ceiling on a run with selected additions.
    // All existing character, relationship, conflict, world and continuity blocks remain.
    let output=payload.replace(COMMON_META,`(Meta: ${COMMON_EXECUTION}\n\n${COMMON_META.split('\n\n').at(-1)}`);
    output=output.replaceAll('Do not add a separate event merely to answer.','Do not invent an unselected event merely to answer; explicitly selected additions remain required.')
        .replaceAll('Do not force a new plot merely to demonstrate progress.','Do not invent an unselected plot merely to demonstrate progress; carry out explicitly selected additions.')
        .replaceAll('do not introduce a separate event to fill a quota.','do not introduce an unselected event to fill a quota.')
        .replaceAll('without repetition or an unrelated new incident.','without repetition or an unselected new incident.');
    const additionText=[BASE_RESPONSE,...blocks.map(x=>x.text),blocks.length>1?COMBINE_ADDITIONS:'',
        settings.negativePriority&&(settings.worldHostility||settings.userMisfortune)?DIRECTIONS.negativePriority:''].filter(Boolean).join('\n\n');
    output=output.replace(/\n\)$/,'\n\n'+additionText+'\n)');
    if(!blocks.every(x=>output.includes(x.text)))throw new Error('선택한 신규 전개가 주입문에 포함되지 않았습니다.');
    return output;
}
