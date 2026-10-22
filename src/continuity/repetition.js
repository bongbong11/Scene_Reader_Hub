import { isVisibleRoleplayMessage, splitOocText } from '../context/messages.js';
import { recentTurnCount } from '../context/turn-settings.js';

export const REPETITION_SYSTEM = `<TOPIC_FIXATION_REVIEW>
Review semantic topic fixation, NOT copying or counting words. Return topic_fixation: null, or {topic: "short neutral English description", output_indices: [message numbers]}.
Flag at most one motif that intrudes unnecessarily into different reactions in at least two assistant replies, including the latest. Keep necessary ongoing conflict, activities, promises, traits, secrecy, central themes, new developments and renewed user requests. A continuing conflict is not itself excessive repetition. Compare ordinary RP, not repeated status panels. Use only supplied assistant message numbers; no quote is required.
The topic describes the repetition; it is not an instruction, ban, diagnosis or new story fact. repetition_context is comparison material, not new evidence for continuity changes or vault knowledge. Return null when no correction is needed.
</TOPIC_FIXATION_REVIEW>`;

function rp(message) {
    if (!isVisibleRoleplayMessage(message) || message.extra?.ooc_chat) return '';
    const split=splitOocText(message.mes);
    return split.malformed ? '' : split.rpText.replace(/<Scene_Info\b[^>]*>[\s\S]*?<\/Scene_Info\s*>/gi,'').trim();
}
function signature(message, blocked, fingerprint) {
    return fingerprint([message?.is_user,message?.mes,Boolean(message?.is_system || message?.is_hidden || message?.hidden || message?.extra?.hidden || message?.extra?.exclude_from_prompt),Boolean(message?.extra?.ooc_chat),blocked]);
}
function clip(text, limit) {
    return text.length <= limit ? text : `${text.slice(0, Math.floor(limit/2)-10)}\n[clipped]\n${text.slice(-Math.floor(limit/2)+10)}`;
}
export function repetitionWindow(chat = [], outputIndex, settings, excluded = [], fingerprint) {
    const blocked=new Set(excluded), turns=[], refs=[];
    if(!Number.isInteger(outputIndex) || outputIndex<0)return {turns,refs};
    const scanStart=Math.max(0,outputIndex-79);
    for(let index=Math.min(outputIndex,chat.length-1);index>=scanStart;index--) {
        if(blocked.has(index) || chat[index]?.is_user || !rp(chat[index]))continue;
        let userIndex=index-1;
        while(userIndex>=scanStart && !chat[userIndex]?.is_user)userIndex--;
        turns.unshift({output_index:index,user_rp:userIndex<scanStart || blocked.has(userIndex)?'':rp(chat[userIndex]),assistant_rp:rp(chat[index])});
        if(turns.length>=recentTurnCount(settings))break;
    }
    const first=turns[0]?.output_index;
    if(first!==undefined) {
        let start=first-1;while(start>=scanStart && !chat[start]?.is_user)start--;
        for(let index=Math.max(scanStart,start);index<=outputIndex && index<chat.length;index++) {
            refs.push({index,hash:signature(chat[index],blocked.has(index),fingerprint)});
        }
    }
    const budget=Math.floor(9000/Math.max(1,turns.length));
    return {turns:turns.map(turn=>({...turn,user_rp:clip(turn.user_rp,Math.floor(budget/3)),assistant_rp:clip(turn.assistant_rp,Math.floor(budget*2/3))})),refs};
}
export function assessRepetition(result, window, identity) {
    if(window.turns.length<2)return {status:'insufficient_history',guard:null};
    if(!Object.hasOwn(result||{},'topic_fixation'))return {status:'not_returned',guard:null};
    if(result.topic_fixation===null)return {status:'balanced',guard:null};
    const raw=result.topic_fixation,topic=typeof raw?.topic==='string'?raw.topic.trim():'';
    if(!topic || topic.length>100 || /[<>\r\n]/.test(topic))return {status:'invalid_evidence',guard:null};
    const indices=raw.output_indices??raw.evidence?.map(item=>item.output_index);
    if(!Array.isArray(indices))return {status:'invalid_evidence',guard:null};
    const supported=new Set(indices.map(index=>typeof index==='string'&&/^\d+$/.test(index)?Number(index):index).filter(index=>window.turns.some(turn=>turn.output_index===index)));
    if(supported.size<2 || !supported.has(window.turns.at(-1).output_index))return {status:'invalid_evidence',guard:null};
    return {status:'ready',guard:{topic,sourceIdentity:{...identity},refs:window.refs,sourceOutputIndex:window.turns.at(-1).output_index,evidenceCount:supported.size}};
}

export function repetitionInjection(guard, {chat=[],chatKey,excluded=[],fingerprint}) {
    if(!guard || guard.sourceIdentity?.chatKey!==chatKey)return {text:'',status:'not_ready'};
    const blocked=new Set(excluded);
    if(!guard.refs?.length || guard.refs.some(ref=>!chat[ref.index] || signature(chat[ref.index],blocked.has(ref.index),fingerprint)!==ref.hash))return {text:'',status:'source_changed'};
    const outputs=[];
    for(let index=chat.length-1;index>=Math.max(0,chat.length-80);index--) {
        const message=chat[index];
        if(!blocked.has(index) && !message?.is_user && rp(message))outputs.unshift({message,index});
        if(outputs.length===3)break;
    }
    const latest=outputs.at(-1),source=outputs.findIndex(item=>item.index===guard.sourceOutputIndex);
    // The existing background analysis may finish while the following reply is
    // being generated. Allow one such reply, then expire instead of carrying a ban.
    if(!latest || source<0 || outputs.length-1-source>1)return {text:'',status:'expired'};
    const outputKey=fingerprint([latest.index,latest.message.mes]);
    if(guard.offeredFor && guard.offeredFor!==outputKey)return {text:'',status:'consumed'};
    const topic=String(guard.topic||'');
    if(!topic || topic.length>100 || /[<>\r\n]/.test(topic))return {text:'',status:'invalid_evidence'};
    const text=`<TOPIC_BALANCE>\nMotif: ${JSON.stringify(topic)}. Do not make every line, thought or action revolve around it. Use it where relevant; respond to current input and other scene elements too. Preserve facts, commitments and ongoing actions. Renewed user focus takes priority. Do not force a new event.\n</TOPIC_BALANCE>`;
    return {text,status:'prepared',guard:{...guard,offeredFor:outputKey}};
}
