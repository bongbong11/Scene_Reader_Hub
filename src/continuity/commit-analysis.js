import {applyContinuityVerdicts} from './engine.js';
import {candidateDecisions} from './candidates.js';
import {continuityView,assignContinuity} from './state-adapter.js';

export function canUpdatePendingSnapshot(plan,sourceIndex) {
    if(!plan||!Number.isInteger(sourceIndex))return false;
    if(Number.isInteger(plan.outputIndex))return plan.outputIndex>sourceIndex;
    return Number.isInteger(plan.chatCount)&&plan.chatCount>sourceIndex;
}
export function commitAnalyzedContinuity(record,history,candidates) {
    const decisions=candidateDecisions(candidates);
    const result=applyContinuityVerdicts(continuityView(record),candidates,decisions,{opportunity:record.sceneOpportunity});
    if(!result.accepted.length)return result;
    assignContinuity(record,result.continuity);
    const indexOf=item=>Number(item.sourceIdentity?.assistantIndex);
    const update=(snapshot,entries)=>{if(snapshot&&entries.length)assignContinuity(snapshot,applyContinuityVerdicts(continuityView(snapshot),entries,candidateDecisions(entries),{opportunity:record.sceneOpportunity}).continuity);};
    for(const entry of history) {
        const index=Number(entry.assistantIndex);
        const before=result.accepted.filter(item=>indexOf(item)<index),after=result.accepted.filter(item=>indexOf(item)<=index);
        if(before.length){entry.before||={};update(entry.before,before);}
        if(after.length){entry.after||={};update(entry.after,after);}
    }
    update(record.pendingPlan?.stateSnapshot,result.accepted.filter(item=>canUpdatePendingSnapshot(record.pendingPlan,indexOf(item))));
    return result;
}
