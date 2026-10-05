import {clone,digest} from '../storage/shared-document.js';
export const HISTORY_WINDOW=12;
// Checkpoint entries are immutable. Reclaim only unreferenced rolling entries;
// pinned room/branch entry points and the head are always retained.
export function addCheckpoint(story,state,operationId,writer) {
    if(story.lastOperationId===operationId)return clone(story);
    if(digest(story.checkpoints[story.headCheckpointId]?.state)===digest(state))return clone(story);
    const next=clone(story),id=digest([story.id,story.revision,operationId,state]);
    next.checkpoints[id]={id,state:clone(state),parent:story.headCheckpointId,writer,createdAt:new Date().toISOString()};
    next.headCheckpointId=id;next.revision++;next.lastOperationId=operationId;
    const recent=Object.keys(next.checkpoints).slice(-HISTORY_WINDOW),keep=new Set([id,...recent,...(next.pinned || [])]);
    for(const key of Object.keys(next.checkpoints))if(!keep.has(key))delete next.checkpoints[key];
    return next;
}
export function pinCheckpoint(story,id) {
    const next=clone(story);next.pinned=[...new Set([...(next.pinned||[]),id])];
    return next;
}
export function initialStory({id,baselineId,baselineRevision,state,writer,operationId}) {
    const checkpointId=digest([id,operationId,state]);
    return {id,baselineId,baselineRevision,headCheckpointId:checkpointId,activeChatRef:writer,epoch:1,revision:1,lastOperationId:operationId,pinned:[checkpointId],
        checkpoints:{[checkpointId]:{id:checkpointId,state:clone(state),parent:null,writer,createdAt:new Date().toISOString()}}};
}
