import {stageDeltaCommit} from './delta-commit.js';
import {validateSourceRefs} from './analysis-window.js';
import {evolutionMatchesBase} from '../character/evolution.js';
export function pendingDeltas(record,{chatRef,chat,fingerprint,store,enabled}) {
 if(!enabled)return [];
 const candidates=(record.analysisRuntimeV1?.pendingBatches||[]).flatMap(b=>b.candidates||[]).filter(c=>c.status==='pending' && c.evidence?.length
  &&validateSourceRefs((c.evidence||[]).map(e=>e.identity),{chatRef,chat,fingerprint})
  &&(c.type!=='character'||evolutionMatchesBase(c.data,store)));
 return candidates;
}
export function commitFrameDeltas(frame,run,candidates,answers,{onFailure=()=>{}}={}) {
 if(!candidates?.length)return [];
 const updates=[];
 const project=(snapshot,index)=>{
  if(!snapshot)return;
  const eligible=candidates.filter(c=>c.sourceIndex<=index);
  if(!eligible.length)return;
  const mapped=Object.fromEntries(eligible.map((c,i)=>[`continuity_delta_${i}`,answers[`continuity_delta_${candidates.indexOf(c)}`]]));
  updates.push([snapshot,stageDeltaCommit(snapshot,eligible,mapped).record]);
 };
 try{
  const result=stageDeltaCommit(frame.rec,candidates,answers);
  for(const entry of run.history||[]){project(entry.before,Number(entry.assistantIndex)-1);project(entry.after,Number(entry.assistantIndex));}
  project(result.record.pendingPlan?.stateSnapshot,Number(frame.rec.pendingPlan?.outputIndex??frame.rec.pendingPlan?.chatCount??Infinity));
  for(const [snapshot,next]of updates)Object.assign(snapshot,next);
  Object.assign(frame.rec,result.record);return result.accepted;
 }catch(error){onFailure(error);return [];}
}
// The profile already analyzed meaning. Publish locally validated updates without a second model vote.
export function commitCollectedDeltas(record,history,options) {
 const candidates=pendingDeltas(record,options),frame={rec:record};
 return commitFrameDeltas(frame,{history},candidates,Object.fromEntries(candidates.map((_,i)=>[`continuity_delta_${i}`,{choice:'supported'}])),{onFailure:error=>{throw error;}});
}
