import {validateSourceRefs} from './source-refs.js';

// Retain unfinished source references, never a second copy of the dialogue.
export function restorePendingAnalysis(progress,pending,options) {
    for(const entry of pending?.groups||[]) {
        if(!Array.isArray(entry.refs)||!entry.refs.length||!validateSourceRefs(entry.refs,options))continue;
        if(!progress.groups.has(entry.group)&&progress.processed.get(entry.group)!==entry.key)
            progress.groups.set(entry.group,{key:entry.key,refs:entry.refs,offset:entry.offset||0});
    }
    progress.groups=new Map([...progress.groups].sort(([a],[b])=>a-b));
}

export function pendingAnalysisReceipt(candidates,pending,{fingerprint,...options}) {
    const receipts=(pending?.receipts||[]).filter(item=>Array.isArray(item.refs)&&item.refs.length&&validateSourceRefs(item.refs,{...options,fingerprint}));
    const seen=new Set(receipts.map(item=>item.key)),ids=new Set(receipts.map(item=>item.id));
    const fresh=[],added=[];
    for(const candidate of candidates) {
        const refs=candidate.sourceIdentity?.refs||[];
        const key=fingerprint([candidate.type,candidate.sourceType,candidate.evidence,candidate.data,refs]);
        if(seen.has(key))continue;
        // A repaired/reordered response can reuse an earlier array position.
        const id=ids.has(candidate.id)?`${candidate.id}:retry:${key}`:candidate.id;
        seen.add(key);ids.add(id);fresh.push({...candidate,id});added.push({key,id,refs});
    }
    return {candidates:fresh,receipts:[...receipts,...added],reusedCount:candidates.length-fresh.length};
}

export function pendingAnalysisState(progress,receipts=[]) {
    return {groups:[...progress.groups].map(([group,entry])=>({group,...entry})),receipts};
}
