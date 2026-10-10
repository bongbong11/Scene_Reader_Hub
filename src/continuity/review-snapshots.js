import {continuityView,assignContinuity} from './state-adapter.js';
export function updateReviewedSnapshots(current,history,candidate,patch){
 const update=record=>{
  const state=continuityView(record),list=candidate.type==='character'?record.characterEvolutionV1?.entries:candidate.type==='memory'?state.items:state.knowledge;
  const matches=item=>candidate.type==='knowledge'?(item.characterId||item.character)===(candidate.data.characterId||candidate.data.character)&&item.factId===candidate.data.factId:item.id===candidate.id;
  const item=list?.find(matches);if(!item)return;
  Object.assign(item,structuredClone(patch));
  if(candidate.type==='character')record.characterEvolutionV1.revision=(record.characterEvolutionV1.revision||0)+1;
  else{state.revision=(state.revision||0)+1;assignContinuity(record,state);}
  record.lastJudgment=null;
  for(const journal of record.analysisJournalV1||[])if(journal.type===candidate.type&&matches(journal.after||{}))Object.assign(journal.after,structuredClone(patch));
 };
 for(const snapshot of [...history.flatMap(h=>[h.before,h.after]),current.pendingPlan?.stateSnapshot].filter(Boolean))update(snapshot);
 for(const journal of current.analysisJournalV1||[]){const after=journal.after;if(!after)continue;const match=candidate.type==='knowledge'?(after.characterId||after.character)===(candidate.data.characterId||candidate.data.character)&&after.factId===candidate.data.factId:after.id===candidate.id;if(match&&journal.type===candidate.type)Object.assign(after,structuredClone(patch));}
}
