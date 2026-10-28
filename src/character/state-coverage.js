import {STATE_MOODS} from './state-contract.js';
export const expectedStateFields=(person,version=person.coverageVersion)=>{const moods=version===2?STATE_MOODS:STATE_MOODS.slice(0,4);return person.trackArousal?['a','c',...moods]:[...moods];};
export function missingStateFields(state,person) {
    if(!state)return expectedStateFields(person);
    // Legacy collectors omitted zero moods by contract; do not recollect old saved states.
    if(![1,2].includes(state.coverageVersion))return Object.keys(state.values || {}).length?[]:expectedStateFields(person);
    return expectedStateFields(person,state.coverageVersion).filter(field=>!Number.isInteger(state.values?.[field]));
}
export function mergeRecoveredStates(preserved,received) {
    const merged=structuredClone(preserved);
    for(const state of received) {
        const old=merged.find(item=>item.id===state.id);
        if(!old){merged.push(state);continue;}
        if(![1,2].includes(old.coverageVersion))continue;
        for(const [field,value] of Object.entries(state.values || {})) {
            if(Object.hasOwn(old.values,field))continue;
            old.values[field]=value;
            if(state.targets?.[field]){old.targets ||= {};old.targets[field]=state.targets[field];}
        }
    }
    return merged;
}
export function captureDiagnostic(capture) {
    return {status:capture.status,collectorMode:capture.source==='profile-output'?'profile-output':'main-output',count:capture.count || 0,participantCount:capture.participantIds?.length || 0,
        receivedCount:capture.diagnostics?.received || 0,acceptedCount:capture.diagnostics?.accepted || 0,
        partialCount:capture.diagnostics?.partial || 0,rejectedCount:capture.diagnostics?.rejected || 0,
        skipReason:capture.skipReason || '',phase:capture.phase || '',requestMs:capture.requestMs||0,waitMs:capture.waitMs||0,durationMs:capture.durationMs||0,errorKind:/^[A-Z][A-Z0-9_]{0,79}$/.test(capture.errorKind || '')?capture.errorKind:['timeout','request','format','save_failed','processing_failed','unavailable','too_long'].includes(capture.status)?capture.status:''};
}
