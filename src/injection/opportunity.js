import {BASE_RESPONSE,COMBINE_ADDITIONS,renderAddition,renderAdvancedEvent} from './opportunity-prompts.js';
import {COMMON_META, ADDITION_META} from './assemble.js';
import {buildAntagonistExecution} from './npc-execution.js';

export function additionBlocks(additions,settings,hasOngoingEvent) {
    return additions.map(item=>({id:item.id,feature:item.feature,templateId:item.templateId,
        text:item.boundEvent
            ? 'Use the selected new-person offer to supply the actor of the selected event through plausible access. Do not create a second unrelated encounter or duplicate an established person.'
            :item.feature==='event'&&item.candidate.element
            ?renderAdvancedEvent(item.profile||item.candidate,{move:'seed',ongoing:hasOngoingEvent,style:settings.developmentStyle,direction:settings.worldDirection})
            :[item.kind==='villain'?buildAntagonistExecution({actor:'the selected arriving antagonist',antagonist:true}):'',renderAddition(item.candidate,{kind:item.feature,spontaneous:item.spontaneous,style:settings.developmentStyle,direction:settings.worldDirection,ongoing:hasOngoingEvent,antagonist:item.kind==='villain',groupAllowed:Boolean(settings.worldAgencyEnabled)})].filter(Boolean).join('\n')}));
}
export function incorporateAdditions(payload,blocks,settings) {
    if(!blocks.length)return payload;
    const opening=payload.startsWith(ADDITION_META)?ADDITION_META:COMMON_META;
    if(!payload.startsWith(opening)||!payload.endsWith('\n)'))throw new Error('신규 전개 주입문 조립 형식을 확인하지 못했습니다.');
    // Explicit opening variant; no matching/replacing individual English rules.
    let output=ADDITION_META+payload.slice(opening.length);
    // Conflict priority is already present in fixedSceneSettings.
    const additionText=[BASE_RESPONSE,...blocks.map(x=>x.text),blocks.length>1?COMBINE_ADDITIONS:''].filter(Boolean).join('\n\n');
    output=output.replace(/\n\)$/,'\n\n'+additionText+'\n)');
    if(!blocks.every(x=>output.includes(x.text)))throw new Error('선택한 신규 전개가 주입문에 포함되지 않았습니다.');
    return output;
}
