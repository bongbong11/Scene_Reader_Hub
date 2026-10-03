const MOODS=['anger','joy','fear','sadness'];
export const expectedStateFields=person=>person.trackArousal?['a','c',...MOODS]:MOODS;
export function missingStateFields(state,person) {
    if(!state)return expectedStateFields(person);
    // Legacy collectors omitted zero moods by contract; do not recollect old saved states.
    if(state.coverageVersion!==1)return Object.keys(state.values || {}).length?[]:expectedStateFields(person);
    return expectedStateFields(person).filter(field=>!Number.isInteger(state.values?.[field]));
}
export function mergeRecoveredStates(preserved,received) {
    const merged=structuredClone(preserved);
    for(const state of received) {
        const old=merged.find(item=>item.id===state.id);
        if(!old){merged.push(state);continue;}
        if(old.coverageVersion!==1)continue;
        for(const [field,value] of Object.entries(state.values || {})) {
            if(Object.hasOwn(old.values,field))continue;
            old.values[field]=value;
            if(state.targets?.[field]){old.targets ||= {};old.targets[field]=state.targets[field];}
        }
    }
    return merged;
}
export function captureDiagnostic(capture) {
    return {status:capture.status,count:capture.count || 0,participantCount:capture.participantIds?.length || 0,
        receivedCount:capture.diagnostics?.received || 0,acceptedCount:capture.diagnostics?.accepted || 0,
        partialCount:capture.diagnostics?.partial || 0,rejectedCount:capture.diagnostics?.rejected || 0,
        skipReason:capture.skipReason || '',errorKind:['timeout','request','format','save_failed','unavailable','too_long'].includes(capture.status)?capture.status:''};
}
