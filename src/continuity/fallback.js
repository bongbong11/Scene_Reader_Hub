import {sourceRp} from './source-refs.js';

// Local fallback carries newly relevant RP to the same continuity injection.
// It does not invent semantic state changes, knowledge paths or a fixation ban.
const cues=/\b(?:promis\w*|plan\w*|tomorrow|tonight|appointment|schedule\w*|cancel\w*|postpon\w*|owe\w*|agree\w*|refus\w*|told|learn\w*|realiz\w*|discover\w*|secret\w*|because|unless|cannot|couldn.t|still|instead|return\w*|deliver\w*)\b|약속|계획|일정|내일|오늘 밤|취소|미루|미뤘|알게|전했|말했|때문|아직|대신|돌려|전달/iu;
const terms=value=>String(value||'').toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)||[];
export function codeContinuityCandidates(window,{identity,chat,state={},actors=[],fingerprint}) {
    const anchors=new Set((state.items||[]).flatMap(item=>terms(`${item.label} ${item.summary||''}`)));
    const parts=[];
    for(const source of window.sources||[]) {
        const start=parts.length;
        for(const ref of source.refs) {
            const full=sourceRp(chat[ref.messageIndex]);
            // Only read the window's supplied piece; an unread suffix remains pending.
            const chunks=full.split(/\n\s*\n|(?<=[.!?。])\s+(?=[\p{Lu}"“])/u).map(text=>text.trim()).filter(Boolean);
            for(const text of chunks) {
                if(text.length<8||!source.text.includes(text))continue;
                const related=(state.items||[]).filter(item=>terms(item.label).some(term=>terms(text).includes(term))).map(item=>item.id);
                const weight=Number(cues.test(text))*2+Number(terms(text).some(term=>anchors.has(term)))+Number(ref.role==='assistant');
                parts.push({text:text.length<=600?text:`${text.slice(0,580)} […]`,ref,related,weight});
            }
        }
        if(parts.length===start) {
            const text=source.text.replace(/^\[\d+\] (?:USER|ASSISTANT):\n/gm,'').trim();
            const refs=source.refs.filter(ref=>!source.messageIndices||source.messageIndices.includes(ref.messageIndex));
            if(text&&refs.length)parts.push({text:text.length<=600?text:`${text.slice(0,580)} […]`,ref:refs.at(-1),refs,related:[],weight:0});
        }
    }
    // Prefer a few useful passages, not whole answers or the same repeated line.
    const seen=new Set();
    const selected=parts.sort((a,b)=>b.weight-a.weight||b.ref.messageIndex-a.ref.messageIndex).filter(item=>{
        const key=item.text.toLowerCase();if(seen.has(key))return false;seen.add(key);return true;
    }).slice(0,3);
    return selected.map(item=>({
        id:`reference:${fingerprint([item.ref,item.text])}`,type:'reference',sourceType:'claim',evidence:'',label:'Temporary RP context',
        sourceIdentity:{...identity,refs:item.refs||[item.ref],assistantIndex:item.ref.role==='assistant'?item.ref.messageIndex:identity.assistantIndex},
        data:{text:item.text,role:item.refs?'source window':item.ref.role,messageIndex:item.ref.messageIndex,relatedStateIds:item.related,
            owners:actors.filter(name=>name&&item.text.toLowerCase().includes(String(name).toLowerCase())).slice(0,4)},
    }));
}

// Replace temporary context only once its source window was successfully read.
// Apply to snapshots too, so a later swipe cannot revive obsolete fallback text.
export function clearCoveredFallback(record,history,refs) {
    const keys=new Set(refs.map(ref=>JSON.stringify(ref)));
    for(const target of [record,record.pendingPlan?.stateSnapshot,...history.flatMap(entry=>[entry.before,entry.after])]) {
        if(!target?.continuity?.references?.length)continue;
        const retained=target.continuity.references.filter(item=>!item.sourceRefs?.every(ref=>keys.has(JSON.stringify(ref))));
        if(retained.length!==target.continuity.references.length) {
            target.continuity.references=retained;
            target.continuity.revision=(target.continuity.revision||0)+1;
        }
    }
}
