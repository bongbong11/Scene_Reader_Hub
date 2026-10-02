// Extracted from Scene Reader 0.26.2; behavior preserved.
export function createJobControl(deps) {
function invalidateReasonerJobs({preserveProfileStates=false} = {}) {
    if (!preserveProfileStates) deps.pendingProfileStateRequests.clear();
    if(deps.hub)deps.hub.invalidate('domain_state_changed');else deps.jobs.invalidate();
    deps.reasonerGeneration += 1;
    deps.reasonerJobs.delete(deps.stateChatKey());
}
return {invalidateReasonerJobs};
}
