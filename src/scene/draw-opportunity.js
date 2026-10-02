import {isVisibleRoleplayMessage,splitOocText,appendPendingUserMessage} from '../context/messages.js';
import {stableFingerprint} from '../decision/policy.js';

// Identify the response slot, not its wording. Editing or swiping a reply cannot
// buy another roll; appended RP (including empty-send continuations) can.
export function drawOpportunityKey({chat=[],pendingUserText='',identity='',type='',pendingPlan=null,excluded=[]}={}) {
    let input=chat;
    if(['swipe','regenerate'].includes(type)) {
        if(Number.isInteger(pendingPlan?.chatCount))input=chat.slice(0,pendingPlan.chatCount);
        else if(chat.at(-1)&&!chat.at(-1).is_user)input=chat.slice(0,-1);
        pendingUserText='';
    }
    const visible=input.filter((message,index)=>!excluded.includes(index)&&isVisibleRoleplayMessage(message));
    const roles=appendPendingUserMessage(visible,pendingUserText)
        .filter(message=>splitOocText(message.mes).rpText.trim())
        .map(message=>message.is_user?'u':'a').join('');
    return stableFingerprint({identity,roles});
}

// A stable uniform draw per response slot survives refresh, retries and rollback
// without consuming additional lottery tickets. Independent channels avoid
// correlating event and person rolls. This is routing randomness, not security.
export function drawRandom(key,channel) {
    let seed=Number(stableFingerprint(`${key}:${channel}`).split(':').at(-1))>>>0;
    return ()=>{
        seed=(seed+0x6D2B79F5)>>>0;
        let value=seed;
        value=Math.imul(value^(value>>>15),value|1);
        value^=value+Math.imul(value^(value>>>7),value|61);
        return ((value^(value>>>14))>>>0)/4294967296;
    };
}
