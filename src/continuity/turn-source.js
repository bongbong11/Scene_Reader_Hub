import {sourceRp,messageRef,validateSourceRefs,sourceRefsKey} from './source-refs.js';
export const SOURCE_LIMIT=32000;
export function completedTurn(chat,index,{chatRef,fingerprint,excluded=[]}){
    if(chat[index]?.is_user||excluded.includes(index)||!sourceRp(chat[index]))return null;
    let user=index-1;while(user>=0&&!chat[user]?.is_user)user--;
    const refs=[...(user>=0&&sourceRp(chat[user])?[messageRef(chatRef,chat,user,fingerprint)]:[]),messageRef(chatRef,chat,index,fingerprint)];
    return {refs,key:sourceRefsKey(refs,fingerprint),outputIndex:index};
}
export function pendingTurns(record,current,options){
    const pending=record?.auxiliaryStateV1?.pending;
    const old=pending?.turns||pending?.groups?.map(group=>({refs:group.refs,key:group.key,outputIndex:group.group}))||[];
    const turns=[...old],last=record?.continuity?.context;
    if(last?.inputRefs?.some(ref=>ref.originChatRef===options.chatRef)&&Number.isInteger(last.outputIndex)){
        for(let index=last.outputIndex+1;index<current.outputIndex;index++){
            const missed=completedTurn(options.chat,index,options);if(missed)turns.push(missed);
        }
    }
    turns.push(current);
    return [...new Map(turns.filter(turn=>turn?.refs?.length&&validateSourceRefs(turn.refs,options)).map(turn=>{
        const next={...turn,key:sourceRefsKey(turn.refs,options.fingerprint)};return [next.key,next];
    })).values()].filter(turn=>!last?.processedKeys?.includes(turn.key)).sort((a,b)=>a.outputIndex-b.outputIndex);
}
export function turnText(turn,chat){return {user:turn.refs.filter(ref=>ref.role==='user').map(ref=>sourceRp(chat[ref.messageIndex])).join('\n'),character:turn.refs.filter(ref=>ref.role==='assistant').map(ref=>sourceRp(chat[ref.messageIndex])).join('\n')};}
export function compactSourceInput(current,turns,chat){
    const currentTurn=turnText(current,chat),chars=JSON.stringify(currentTurn).length;
    if(chars>SOURCE_LIMIT)throw Object.assign(new Error('이번 답변이 연속성 입력 한도를 넘었습니다. 미처리 원문은 보존합니다.'),{code:'CONTINUITY_INPUT_TOO_LARGE'});
    const covered=[current],earlier=[];let size=chars;
    for(const turn of turns){
        if(turn.key===current.key||turn.outputIndex>=current.outputIndex)continue;
        const text=turnText(turn,chat),length=JSON.stringify(text).length;
        if(size+length>SOURCE_LIMIT)continue;
        earlier.push(text);covered.push(turn);size+=length;
    }
    return {input:{current_turn:currentTurn,...(earlier.length?{earlier_unprocessed_turns:earlier}:{})},covered,refs:[...new Map(covered.flatMap(turn=>turn.refs).map(ref=>[ref.messageIndex,ref])).values()]};
}
