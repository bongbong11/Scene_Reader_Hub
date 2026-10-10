// Compatibility cleanup for the removed character-change collector only.
// Never infer ownership from sourceRefs: ordinary continuity uses them too.
const fields=['analysisRuntimeV1','characterEvolutionV1','historyAnalysisV1','approvedHistorySourcesV1','analysisJournalV1'];
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const collected=e=>Boolean(e?.collectionOriginV1||String(e?.id||'').startsWith('continuity:delta:')||String(e?.factId||'').startsWith('continuity_fact:'));
export function hasRetiredCollection(record){return Boolean(record&&(fields.some(k=>own(record,k))||own(record,'retiredCollectionV1')||record.continuity?.items?.some(collected)||record.continuity?.knowledge?.some(collected)||record.characterState?.knowledge?.some(collected)));}
export function retireCollection(record){
 if(!record||!hasRetiredCollection(record))return false;
 const items=structuredClone(record.continuity?.items||[]);
 const knowledge=structuredClone(record.characterState?.knowledge||[]);
 for(const entry of record.continuity?.knowledge||[])if(!knowledge.some(e=>(e.characterId||e.character)===(entry.characterId||entry.character)&&e.factId===entry.factId))knowledge.push(structuredClone(entry));
 const removed=new Set();
 for(const change of [...(record.analysisJournalV1||[])].reverse()){
  if(!['memory','knowledge'].includes(change.type))continue;
  const list=change.type==='memory'?items:knowledge;
  const index=list.findIndex(e=>change.type==='memory'?e.id===change.key:(e.characterId||e.character)===change.key?.[0]&&e.factId===change.key?.[1]);
  if(index<0||!collected(list[index])&&JSON.stringify(list[index])!==JSON.stringify(change.after))continue;
  if(change.before)list[index]=structuredClone(change.before);
  else{removed.add(list[index].id);list.splice(index,1);}
 }
 const restore=list=>list.flatMap(e=>{
  const seen=new Set();
  while(collected(e)){
   if(seen.has(e)||!e.collectionOriginV1?.before){removed.add(e.id);return [];}
   seen.add(e);e=e.collectionOriginV1.before;
  }
  return [structuredClone(e)];
 });
 if(record.continuity){record.continuity={...record.continuity,items:restore(items),knowledge:[],revision:(record.continuity.revision||0)+1};
  record.continuity.dependencies=(record.continuity.dependencies||[]).filter(e=>!removed.has(e.stateId));
  record.continuity.followups=(record.continuity.followups||[]).filter(e=>!removed.has(e.relatedStateId));}
 if(record.characterState||knowledge.length)record.characterState={...record.characterState,knowledge:restore(knowledge),revision:(record.characterState?.revision||0)+1};
 for(const field of fields)delete record[field];
 delete record.retiredCollectionV1;
 // These caches can include a rule from the removed collector.
 record.lastJudgment=null;record.pendingPlan=null;record.lastReasonerSource=null;record.lastContinuityTrace=null;
 return true;
}
export function retireHistory(history){
 let changed=false;
 for(const entry of history||[]){
  let removed=false;
  for(const snapshot of [entry.before,entry.after,entry.plan?.stateSnapshot,entry.plan?.preparedStateSnapshot])removed=retireCollection(snapshot)||removed;
  if(removed){entry.judgment=null;if(entry.plan)entry.plan.judgment=null;changed=true;}
 }
 return changed;
}
