import {sourceRp,validateSourceRefs} from './source-refs.js';

// Read only unprocessed visible groups. A long group is continued in a later
// window; successful parsing never marks an unread suffix as processed.
export function continuitySourceWindow(groups,{chatRef,chat,fingerprint,maxChars=9000}) {
    const parts=[],refs=[],consumed=[],sources=[];let remaining=maxChars;
    for(const [group,entry] of groups) {
        if(!validateSourceRefs(entry.refs,{chatRef,chat,fingerprint}))continue;
        const text=entry.refs.map(ref=>`[${ref.messageIndex}] ${ref.role.toUpperCase()}:\n${sourceRp(chat[ref.messageIndex])}`).join('\n');
        const offset=entry.offset||0;
        if(text.length<=offset)continue;
        const separator=parts.length?1:0;
        if(remaining<=separator)break;
        const piece=text.slice(offset,offset+remaining-separator);
        parts.push(piece);refs.push(...entry.refs);sources.push({text:piece,refs:entry.refs});
        consumed.push({group,key:entry.key,offset:offset+piece.length,complete:offset+piece.length>=text.length});
        remaining-=piece.length+separator;
        if(!consumed.at(-1).complete)break;
    }
    return {sources,text:parts.join('\n'),refs:[...new Map(refs.map(ref=>[ref.messageIndex,ref])).values()],consumed,groupCount:consumed.length,partial:consumed.some(entry=>!entry.complete)};
}
export function advanceContinuityWindow(progress,window) {
    for(const step of window.consumed) {
        const current=progress.groups.get(step.group);
        if(current?.key!==step.key)continue;
        if(step.complete){progress.groups.delete(step.group);progress.processed.set(step.group,step.key);}
        else current.offset=step.offset;
    }
    while(progress.processed.size>24)progress.processed.delete(progress.processed.keys().next().value);
}
