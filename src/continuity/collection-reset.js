import {normalizeAnalysisRuntime,normalizeAnalysisSettings} from './analysis-contract.js';
import {continuityView,assignContinuity} from './state-adapter.js';
const collected=item=>Boolean(item?.collectionOriginV1||String(item?.id||'').startsWith('continuity:delta:')||String(item?.factId||'').startsWith('continuity_fact:'));
export function resetCollectedState(record,{chatRef,startIndex,interval}) {
 const state=structuredClone(continuityView(record));state.items||=[];state.knowledge||=[];
 const removedIds=new Set(state.items.filter(e=>collected(e)&&!e.collectionOriginV1?.before).map(e=>e.id));
 // Restore pre-collection state when the collection updated an existing ordinary item.
 for(const change of [...(record.analysisJournalV1||[])].reverse()){
  if(change.type==='character')continue;
  const list=change.type==='memory'?state.items:state.knowledge;
  const index=list.findIndex(e=>change.type==='memory'?e.id===change.key:(e.characterId||e.character)===change.key[0]&&e.factId===change.key[1]);
  if(index<0)continue;
  // Old collections have no provenance field. Only undo a journal-proven value,
  // never a later ordinary update that happens to reuse its identity.
  if(!collected(list[index])&&JSON.stringify(list[index])!==JSON.stringify(change.after))continue;
  if(change.before)list[index]=structuredClone(change.before);
  else {if(change.type==='memory')removedIds.add(list[index].id);list.splice(index,1);}
 }
 const restore=list=>list.flatMap(e=>e.collectionOriginV1?.before?[structuredClone(e.collectionOriginV1.before)]:collected(e)?[]:[e]);
 state.items=restore(state.items);state.knowledge=restore(state.knowledge);
 state.dependencies=(state.dependencies||[]).filter(e=>!removedIds.has(e.stateId));state.followups=(state.followups||[]).filter(e=>!removedIds.has(e.relatedStateId));
 state.revision=(state.revision||0)+1;assignContinuity(record,state);
 record.characterEvolutionV1={schemaVersion:1,revision:(record.characterEvolutionV1?.revision||0)+1,entries:[],excludedProposals:[]};
 record.analysisRuntimeV1=normalizeAnalysisRuntime({anchor:{chatRef,startIndex},coveredThrough:startIndex-1,lastRun:{status:'cleared',turnCount:0,interval}});
 delete record.historyAnalysisV1;delete record.approvedHistorySourcesV1;delete record.analysisJournalV1;
 record.lastJudgment=null;record.lastContinuityTrace=null;
 return record;
}
export function clearCollectedTransaction(current,history,options){
 // Clear rollback snapshots too, so a swipe cannot restore deleted collected content.
 for(const snapshot of [...history.flatMap(h=>[h.before,h.after]),current.pendingPlan?.stateSnapshot].filter(Boolean))resetCollectedState(snapshot,options);
 resetCollectedState(current,options);return {chat:current,history};
}
export function createCollectionReset(deps,commitDeltaTransaction){
 let clearing=false;
 return async function clearAll(){
  if(clearing||deps.hub?.snapshot()?.state?.status==='running')throw Object.assign(new Error('판독이 끝난 뒤 다시 눌러 주세요.'),{code:'CHANGE_BUSY'});
  clearing=true;const key=deps.stateChatKey();
  try{
   deps.analysis.cancel('collection_clear');await deps.analysis.completion;
   const valid=()=>key===deps.stateChatKey()&&!deps.analysis.busy&&deps.hub?.snapshot()?.state?.status!=='running';
   if(!valid())return false;
   const options={chatRef:key,startIndex:deps.getContext().chat.length,interval:normalizeAnalysisSettings(deps.settings).interval};
   const saved=await commitDeltaTransaction(key,({current,history})=>clearCollectedTransaction(current,history,options),valid);
   if(saved){await deps.clearInjection?.({chatKey:key});deps.noteDiagnostic?.('analysis_cleared',{module:'src/continuity/collection-reset.js',status:'succeeded'});deps.renderAll();}
   return saved;
  }catch(error){deps.noteDiagnostic?.('analysis_clear_failed',{module:'src/continuity/collection-reset.js',status:'failed',reasonCode:error.code||'STORAGE_FAILED'});throw error;}finally{clearing=false;}
 };
}
