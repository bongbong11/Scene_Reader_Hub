import {clone, digest, object} from '../storage/shared-document.js';
import {latestStateForChat} from '../character/state-contract.js';
import {roomPreferences} from '../storage/common-preferences.js';
export const STORY_FIELDS=['pacingState','characterState','relationshipState','observationState','sceneState','sceneIntimacy','eventProfile','npcProfile','villainProfile','generatedCast','backgroundEvents','advancedEntities','sceneOpportunity','progressionState','deferredRoutes','continuity','opportunities','lastOpportunityVerification','characterEvolutionV1','analysisJournalV1','approvedHistorySourcesV1'];
const TRANSIENT=new Set(['sharedSource','sharedWorld','sharedReference','sharedLinkV1']);
function portableCompanions(value,sourceChatRef) {
    const stores=value?.knowledgeVaultV1?{knowledgeVaultV1:clone(value.knowledgeVaultV1)}:{};
    for(const card of stores.knowledgeVaultV1?.cards || [])for(const item of card.acquisitions || []) {
        if(item.sourceIdentity && !item.sourceIdentity.originChatRef && sourceChatRef)item.sourceIdentity.originChatRef=sourceChatRef;
    }
    return stores;
}
export const localCompanions=record=>Object.fromEntries(Object.entries(record?.companionStores || {}).filter(([namespace])=>namespace!=='knowledgeVaultV1').map(([namespace,value])=>[namespace,clone(value)]));
export function confirmedStory(record={}, {chat=[],fingerprint,sourceChatRef=''}={}) {
    const before=record.pendingPlan?.stateSnapshot;
    const result={};
    for(const key of STORY_FIELDS) {
        const source=object(before)?before:record;
        if(Object.hasOwn(source,key))result[key]=clone(source[key]);
    }
    if(result.sceneIntimacy){delete result.sceneIntimacy.contextEndIndex;delete result.sceneIntimacy.contextKey;delete result.sceneIntimacy.inputKey;}
    if(result.opportunities)result.opportunities.current=null;
    // Values are portable, message indices and raw outputs are not.
    const current=latestStateForChat(record,chat,fingerprint);
    const carried=new Map((record.sharedReference?.characterStates || record.legacyCarryReferenceV1?.characterStates || []).map(state=>[state.id,state]));
    for(const state of current)carried.set(state.id,state);
    result.inheritedCharacterStates=clone([...carried.values()]);
    result.companionStores=portableCompanions(record.companionStores,sourceChatRef);
    // A message number is meaningful only inside its original room. Preserve
    // imported knowledge evidence without comparing it to the new room's turn.
    const output=[...chat].reverse().find(message=>message && !message.is_user && !message.is_system)?.mes || '';
    const sceneInfo=record.pendingPlan?.outputText?'':/<Scene_Info\b[^>]*>([\s\S]*?)<\/Scene_Info>/i.exec(output)?.[1] || '';
    const clean=value=>String(value||'').replace(/<[^>]*>/g,'').trim().slice(0,220);
    result.continuationContext={
        ...(record.sharedReference?.scene || record.legacyCarryReferenceV1?.scene || {}),
        ...(sceneInfo.match(/(?:Date|날짜)\s*:\s*([^|\n<]+)/i)?{date:clean(sceneInfo.match(/(?:Date|날짜)\s*:\s*([^|\n<]+)/i)[1])}:{}),
        ...(sceneInfo.match(/(?:Time|시간)\s*:\s*([^|\n<]+)/i)?{time:clean(sceneInfo.match(/(?:Time|시간)\s*:\s*([^|\n<]+)/i)[1])}:{}),
        ...(sceneInfo.match(/(?:Loc|Location|장소)\s*:\s*([^\n<]+)/i)?{location:clean(sceneInfo.match(/(?:Loc|Location|장소)\s*:\s*([^\n<]+)/i)[1])}:{}),
        sourceChatRef,
    };
    result.continuationPreferences=roomPreferences(record.preferences || {});
    return result;
}
export function splitRuntime(record,confirmed) {
    const runtime={},overlay={};
    for(const [key,value]of Object.entries(record || {})) {
        if(TRANSIENT.has(key))continue;
        if(key==='companionStores') {
            const local=localCompanions(record);if(Object.keys(local).length)runtime.companionStores=local;
            const projected=portableCompanions(value,confirmed.continuationContext?.sourceChatRef);
            if(digest(projected)!==digest(confirmed[key]))overlay[key]=projected;
            continue;
        }
        if(STORY_FIELDS.includes(key)) {
            if(digest(value)!==digest(confirmed[key]))overlay[key]=clone(value);
        } else runtime[key]=clone(value);
    }
    return {runtime,overlay};
}
export function resetRuntime(record={}) {
    return {preferences:clone(record.preferences || {}),lastJudgment:null,pendingPlan:null,nonRpOutputIndices:[],characterStateEvents:[],characterStateCapture:null};
}
export function resolveRecord(link,baseline,asset,checkpoint,stored={}) {
    const state=clone(checkpoint.state || {}),characters=state.inheritedCharacterStates || [];
    delete state.inheritedCharacterStates;delete state.continuationContext;delete state.continuationPreferences;
    return {...state,...clone(stored.overlay || {}),...clone(stored.runtime || {}),
        companionStores:{...clone(state.companionStores || {}),...clone(stored.overlay?.companionStores || {}),...clone(stored.runtime?.companionStores || {})},
        preferences:{...clone(baseline.defaultPreferences),...clone(stored.runtime?.preferences || {})},
        sharedSource:{storylineId:link.storylineId,baselineId:link.baselineId,baselineRevision:link.baselineRevision,assetId:baseline.assetId,checkpointId:checkpoint.id,epoch:link.epoch,active:link.active},
        sharedReference:{scene:clone(checkpoint.state?.continuationContext || {}),characterStates:clone(characters),summary:String(link.summary || ''),sourceCheckpoint:checkpoint.id},
    };
}
