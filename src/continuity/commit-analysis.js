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
    const sourceIndex=Math.max(...result.accepted.map(item=>Number(item.sourceIdentity?.assistantIndex)));
    const update=snapshot=>{if(snapshot)assignContinuity(snapshot,applyContinuityVerdicts(continuityView(snapshot),candidates,decisions,{opportunity:record.sceneOpportunity}).continuity);};
    for(const entry of history) {
        if(Number(entry.assistantIndex)===sourceIndex){entry.after||={};update(entry.after);}
        else if(Number(entry.assistantIndex)>sourceIndex){entry.before||={};entry.after||={};update(entry.before);update(entry.after);}
    }
    if(canUpdatePendingSnapshot(record.pendingPlan,sourceIndex))update(record.pendingPlan.stateSnapshot);
    return result;
}
