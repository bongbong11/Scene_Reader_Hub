// Extracted from Scene Reader 0.26.2; behavior preserved.
export function createJobControl(deps) {
function invalidateReasonerJobs({preserveProfileStates=false,reason='domain_state_changed'} = {}) {
    if (!preserveProfileStates) { for (const task of deps.pendingProfileStateRequests.values()) task.cancel?.(); deps.pendingProfileStateRequests.clear(); }
    if(deps.hub)deps.hub.invalidate(reason);else deps.jobs.invalidate();
    deps.reasonerGeneration += 1;
    for(const task of deps.reasonerJobs.values())task.cancel?.();
    deps.reasonerJobs.clear();
}
return {invalidateReasonerJobs};
}
