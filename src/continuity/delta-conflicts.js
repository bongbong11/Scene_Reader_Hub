import {ANALYSIS_LIMITS} from './analysis-contract.js';
const scope=c=>{
 const d=c.data;
 if(c.type==='character'&&d.baseRef)return JSON.stringify(['character',d.actorId,d.baseRef.analysisId,d.baseRef.recordDigest,[...(d.scope?.targetIds||[])].sort()]);
 if(d.existingId)return JSON.stringify([c.type,d.existingId]);
 if(c.type==='knowledge')return JSON.stringify(['knowledge',d.characterId,d.factId]);
 return c.id;
};
export function mergeDeltaResponses(first,second){
 const result={...second,coverage:{...second.coverage},candidates:[]},groups=new Map();
 for(const candidate of [...(first?.candidates||[]),...second.candidates]){
  const key=scope(candidate),prior=groups.get(key)||[];
  if(prior.some(c=>c.id===candidate.id||JSON.stringify(c.data)===JSON.stringify(candidate.data)))continue;
  prior.push(candidate);groups.set(key,prior);
 }
 for(const group of groups.values())for(const candidate of group)result.candidates.push(group.length>1?{...candidate,status:'needs_review',reasonCode:'conflicting_proposals'}:candidate);
 for(const section of Object.keys(result.coverage))if(first?.coverage[section]==='complete'&&!first.invalid?.[section])result.coverage[section]='complete';
 for(const omitted of result.candidates.slice(ANALYSIS_LIMITS.maxChanges))result.coverage[omitted.section]='deferred';
 result.candidates=result.candidates.slice(0,ANALYSIS_LIMITS.maxChanges);
 return result;
}
