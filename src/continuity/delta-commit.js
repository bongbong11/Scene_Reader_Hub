import {normalizeAnalysisRuntime,assertAnalysisCapacity,ANALYSIS_LIMITS} from './analysis-contract.js';
import {normalizeEvolution} from '../character/evolution.js';
import {continuityView,assignContinuity} from './state-adapter.js';

export function stageDeltaCommit(record,candidates,answers) {
 const next=structuredClone(record),runtime=normalizeAnalysisRuntime(next.analysisRuntimeV1);
 const evolution=normalizeEvolution(next.characterEvolutionV1),state=structuredClone(continuityView(next));
 state.items||=[];state.knowledge||=[];
 const accepted=[],processed=new Map(),journal=structuredClone(next.analysisJournalV1||[]);
 for(let i=0;i<candidates.length;i++){
  const c=candidates[i],answer=answers[`continuity_delta_${i}`]?.choice;
  if(c.status!=='pending'||journal.some(j=>j.proposalId===c.id))continue;
  const d=c.data,list=c.type==='memory'?state.items:c.type==='knowledge'?state.knowledge:evolution.entries;
  const existing=c.type==='knowledge'?list.find(e=>e.factId===d.factId&&(e.characterId||e.character)===d.characterId):list.find(e=>e.id===d.existingId);
  if((c.prior&&JSON.stringify(c.prior)!==JSON.stringify(existing))||(d.existingId&&!existing)){
   processed.set(c.id,{...c,status:'needs_review',reasonCode:'prior_changed'});continue;
  }
  const origin=c.evidence[0]?.identity.originChatRef;
  if((existing?.sourceRefs||existing?.evidenceRefs||[]).some(ref=>ref.originChatRef===origin&&ref.messageIndex>c.sourceIndex)){
   processed.set(c.id,{...c,status:'rejected',reasonCode:'older_source'});continue;
  }
  if(!['supported','unsupported'].includes(answer)){
   processed.set(c.id,{...c,attempts:(c.attempts||0)+1,status:(c.attempts||0)>=1?'needs_review':'pending'});continue;
  }
  processed.set(c.id,{...c,status:answer==='supported'?'accepted':'rejected'});
  if(answer!=='supported')continue;
  if(!existing&&list.filter(e=>!['resolved','completed','cancelled'].includes(e.lifecycle||e.status)).length>=ANALYSIS_LIMITS.maxActive){
   processed.set(c.id,{...c,status:'needs_review',reasonCode:'capacity'});continue;
  }
  const sourceRefs=c.evidence.map(e=>({...e.identity,quote:e.quote}));
  let item;
  if(c.type==='memory')item={...d,id:existing?.id||'continuity:delta:'+c.id,sourceRefs,pressure:existing?.pressure||'none'};
  else if(c.type==='knowledge')item={...d,sourceRefs};
  else item={...d,id:existing?.id||'evolution:'+c.id,status:d.operation==='resolve'?'resolved':d.compactStatus==='compact_budget'?'needs_review':'active',evidenceRefs:sourceRefs,updatedOrdinal:c.sourceIndex};
  delete item.op;delete item.existingId;
  journal.push({proposalId:c.id,type:c.type,key:c.type==='knowledge'?[d.characterId,d.factId]:item.id,before:existing?structuredClone(existing):null,after:structuredClone(item),refs:sourceRefs});
  if(existing)Object.assign(existing,item);else list.push(item);
  accepted.push(c);
 }
 if(accepted.some(c=>c.type!=='character')){state.revision=(state.revision||0)+1;assignContinuity(next,state);}
 if(accepted.some(c=>c.type==='character'))evolution.revision++;
 next.characterEvolutionV1=evolution;
 for(const batch of runtime.pendingBatches){batch.candidates=(batch.candidates||[]).map(c=>processed.get(c.id)||c);batch.status=batch.candidates.some(c=>c.status==='pending')?'pending':'settled';
  for(const section of ['continuity','evolution','persona'])if(batch.coverage?.[section]==='complete'&&batch.candidates.filter(c=>c.section===section).every(c=>['accepted','rejected'].includes(c.status)))runtime.sections[section].settledThrough=batch.refs?.at(-1);
 }
 runtime.lastRun={...runtime.lastRun,status:accepted.length?'saved':'reviewed',acceptedCount:accepted.length};
 next.analysisRuntimeV1=runtime;next.analysisJournalV1=journal.slice(-128);
 assertAnalysisCapacity(next);return {record:next,accepted};
}

export function invalidateDeltasFrom(record,index,{chatRef}={}) {
 const runtime=normalizeAnalysisRuntime(record.analysisRuntimeV1),evo=normalizeEvolution(record.characterEvolutionV1),state=structuredClone(continuityView(record));
 const affected=refs=>(refs||[]).some(ref=>ref.originChatRef===chatRef&&ref.messageIndex>=index);
 for(const change of [...(record.analysisJournalV1||[])].reverse()){
  if(!affected(change.refs))continue;
  const list=change.type==='memory'?state.items:change.type==='knowledge'?state.knowledge:evo.entries;
  const position=list.findIndex(e=>change.type==='knowledge'?(e.characterId||e.character)===change.key[0]&&e.factId===change.key[1]:e.id===change.key);
  if(position<0||JSON.stringify(list[position])!==JSON.stringify(change.after))continue;
  if(change.before)list[position]=structuredClone(change.before);else list.splice(position,1);
 }
 for(const entry of evo.entries)if(affected(entry.evidenceRefs))entry.status='suspended';
 state.items=(state.items||[]).filter(e=>!affected(e.sourceRefs));state.knowledge=(state.knowledge||[]).filter(e=>!affected(e.sourceRefs));
 evo.revision++;state.revision=(state.revision||0)+1;assignContinuity(record,state);
 record.analysisJournalV1=(record.analysisJournalV1||[]).filter(j=>!affected(j.refs));
 runtime.turnRefs=runtime.turnRefs.filter(t=>!affected(t.refs));runtime.rangeLedger=runtime.rangeLedger.filter(r=>!affected(r.refs));runtime.pendingBatches=runtime.pendingBatches.filter(b=>!affected(b.refs));
 runtime.coveredThrough=Math.min(runtime.coveredThrough??-1,index-1);runtime.openScene=null;runtime.retry={attempts:0,notBefore:0,failureClass:null};record.analysisRuntimeV1=runtime;record.characterEvolutionV1=evo;
}

export function createDeltaCommit(deps) {
 async function commitDeltaTransaction(chatKey,reduce,valid=()=>true){
  return deps.queueWrite('session:'+chatKey,async()=>{
   if(!valid())return false;const current=deps.chatRecords.get(chatKey);if(!current)return false;
   const signature=deps.fingerprint(current),history=structuredClone(await deps.loadStateHistory(chatKey));
   if(deps.fingerprint(deps.chatRecords.get(chatKey))!==signature||!valid())return false;
   const result=reduce({current:structuredClone(current),history});if(!result||!valid())return false;assertAnalysisCapacity(result.chat);
   await deps.storagePost('transaction',{chatKey,chat:result.chat,history:result.history});
   if(!valid()||deps.fingerprint(deps.chatRecords.get(chatKey))!==signature){
    const latest=deps.chatRecords.get(chatKey);
    if(latest)await deps.storagePost('transaction',{chatKey,chat:structuredClone(latest),history:structuredClone(deps.stateHistoryCache.get(chatKey)||history)});
    return false;
   }
   deps.chatRecords.set(chatKey,result.chat);deps.stateHistoryCache.set(chatKey,result.history);return true;
  });
 }
 return {commitDeltaTransaction};
}
