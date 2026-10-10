import {validateSourceRefs} from './analysis-window.js';
export function sourceEligibility(refs,{record,chatRef,chat,fingerprint,inherited=false}) {
 if(!refs?.length)return 'legacy_unverified';
 for(const ref of refs){
  if(ref.sourceKind&&ref.sourceKind!=='chat'){
   const approved=(record?.approvedHistorySourcesV1||record?.historyAnalysisV1?.approvedSources)?.some(source=>source.id===ref.sourceId&&source.hash===ref.contentHash&&source.checkpointId===ref.checkpointId);
   if(!approved)return 'source_unverified';continue;
  }
  if(ref.originChatRef!==chatRef){if(inherited)continue;return 'source_unavailable';}
  const message=chat?.[ref.messageIndex];
  if(message?.is_system||message?.is_hidden||message?.hidden||message?.extra?.hidden||message?.extra?.exclude_from_prompt)return 'source_hidden';
  if(!validateSourceRefs([ref],{chatRef,chat:chat||[],fingerprint}))return 'source_changed';
 }
 return 'ready';
}
export const eligibleSource=(refs,options)=>['ready','legacy_unverified'].includes(sourceEligibility(refs,options));
export function refreshSourceEligibility(record,options){
 const config={...options,record,inherited:Boolean(record.sharedReference||record.legacyCarryReferenceV1)};
 for(const entry of record.characterEvolutionV1?.entries||[])entry.sourceStatus=sourceEligibility(entry.evidenceRefs,config);
 for(const batch of record.analysisRuntimeV1?.pendingBatches||[])for(const candidate of batch.candidates||[])candidate.sourceStatus=sourceEligibility(candidate.evidence?.map(e=>e.identity),config);
 return record;
}
