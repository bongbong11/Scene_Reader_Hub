

export function createCommonForm(deps) {
function nextMutation(target,key) {
    let byKey=deps.mutationSequences.get(target);
    if(!byKey) { byKey=new Map(); deps.mutationSequences.set(target,byKey); }
    const sequence=(byKey.get(key)||0)+1;
    byKey.set(key,sequence);
    return () => byKey.get(key)===sequence;
}

function invalidatePreparedJudgment() {
    deps.invalidateReasonerJobs();
    const rec = deps.record(true);
    rec.lastJudgment = null;
    if (!rec.pendingPlan?.outputText) rec.pendingPlan = null;
}
return {nextMutation,invalidatePreparedJudgment};
}
