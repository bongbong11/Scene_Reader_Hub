import { isVisibleRoleplayMessage, splitOocText } from '../context/messages.js';
import { recentTurnCount } from '../context/turn-settings.js';

export const REPETITION_SYSTEM = `<TOPIC_FIXATION_REVIEW>
Also inspect repetition_context, comparing the meaning of at least two DIFFERENT assistant replies and their intervening user inputs. This is semantic topic fixation, NOT copying the user's wording or counting repeated words. A command, word, image, joke, feeling or situation can become an unnecessary explanation for unrelated dialogue, inner thoughts and actions even when paraphrased differently each time.
Return an additional field topic_fixation: null, or {topic: "short neutral English description, at most 100 characters", evidence: [{output_index: integer, quote: "brief verbatim assistant excerpt"}, {output_index: integer, quote: "brief verbatim assistant excerpt"}]}.
Flag at most ONE dominant motif only when it repeatedly intrudes into reactions that do not need it. Do not require the underlying action to be completed. Conversely, repetition alone is insufficient: keep genuine ongoing activities, promises, consistent traits, necessary secrecy, an intentionally central theme, new developments and renewed user requests. Quiet behavior during concealment is appropriate; explaining every unrelated reaction through an old 'be quiet' remark is fixation. A meal scene may discuss food repeatedly; using hunger to explain every joke, gesture and relationship response after the focus moves elsewhere is fixation. There must be evidence in two distinct replies, including the latest supplied reply. Evidence must concern ordinary narration, dialogue or inner thought, not repeated status panels or labels. If evidence is absent or the motif is necessary to the current scene, return null.
The topic is descriptive data, not a new instruction, ban, plot event, diagnosis or character fact. Do not rewrite the story or invent replacement events. The fixed instruction will reduce overuse while retaining relevant facts and actions.
repetition_context is ONLY comparison material for this review. It is not new evidence for continuity changes or vault knowledge acquisition; those sections must still use source_rp and their own evidence rules.
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
const compact=value=>String(value||'').replace(/\s+/g,' ').trim().toLowerCase();
export function assessRepetition(result, window, identity) {
    if(window.turns.length<2)return {status:'insufficient_history',guard:null};
    if(!Object.hasOwn(result||{},'topic_fixation'))return {status:'not_returned',guard:null};
    if(result.topic_fixation===null)return {status:'balanced',guard:null};
    const raw=result.topic_fixation,topic=typeof raw?.topic==='string'?raw.topic.trim():'';
    if(!topic || topic.length>100 || /[<>\r\n]/.test(topic) || !Array.isArray(raw.evidence))return {status:'invalid_evidence',guard:null};
    const supported=new Set();
    for(const evidence of raw.evidence.slice(0,5)) {
        const turn=window.turns.find(item=>item.output_index===evidence?.output_index);
        const quote=typeof evidence?.quote==='string'?compact(evidence.quote):'';
        if(turn && quote.length>=4 && quote.length<=260 && !quote.includes('[clipped]') && compact(turn.assistant_rp).includes(quote))supported.add(turn.output_index);
    }
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
