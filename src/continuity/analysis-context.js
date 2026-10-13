import {selectActiveContinuity} from './selection.js';

export function selectAnalysisContinuity(state, transcript, options) {
    const selected=selectActiveContinuity(state,transcript,{...options,limits:{items:12,knowledge:8,dependencies:4,followups:2}});
    // Analysis must be able to link a paraphrased/off-screen promise. Prefer
    // current actors, then use remaining slots for other unresolved commitments.
    const seen=new Set(selected.items.map(item=>item.id));
    const others=(state.items||[]).filter(item=>!item.userExcluded&&!seen.has(item.id)&&!['completed','resolved','cancelled'].includes(item.lifecycle));
    others.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
    selected.items=[...selected.items,...others].slice(0,12);
    return continuityAnalysisContext(selected);
}

// The model needs the current state, not storage hashes or hidden update history.
export function continuityAnalysisContext(state) {
    const project=(list,fields)=>(list||[]).map(item=>Object.fromEntries(fields.filter(field=>item[field]!==undefined).map(field=>[field,item[field]])));
    return {
        items:project(state.items,['id','kind','label','owners','lifecycle','pressure','reason']),
        knowledge:project(state.knowledge,['factId','character','source','sourceType','summary']),
        dependencies:project(state.dependencies,['stateId','pressure','reason']),
        followups:project(state.followups,['id','relatedStateId','action','reason']),
    };
}
