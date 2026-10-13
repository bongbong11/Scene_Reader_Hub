import {eligibleSource} from './source-eligibility.js';

const fields=['lifecycle','pressure','reason'];
const stateOf=item=>Object.fromEntries(fields.map(field=>[field,item[field]??(field==='pressure'?'none':'')]));

// Keep the original commitment separate from later state changes. Hiding or
// replacing the completion message must reveal the preceding visible state.
export function applyItemUpdate(item, candidate, now) {
    item.baseState ||= stateOf(item);
    item.stateUpdates ||= [];
    if(item.stateUpdates.some(update=>update.id===candidate.id))return;
    const patch={pressure:candidate.data.pressure,reason:candidate.data.reason};
    if(candidate.data.relation==='changed'&&candidate.data.lifecycle)patch.lifecycle=candidate.data.lifecycle;
    item.stateUpdates.push({id:candidate.id,...patch,sourceRefs:candidate.sourceIdentity?.refs||[candidate.sourceIdentity],updatedAt:now});
    Object.assign(item,patch,{updatedAt:now});
}

export function visibleItemState(item, options) {
    if(!item.baseState||!Array.isArray(item.stateUpdates))return item;
    const projected={...item,...item.baseState};
    for(const update of item.stateUpdates)if(eligibleSource(update.sourceRefs,options)) {
        for(const field of fields)if(update[field]!==undefined)projected[field]=update[field];
        projected.updatedAt=update.updatedAt;
    }
    return projected;
}
