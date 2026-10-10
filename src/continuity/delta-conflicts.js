import {ANALYSIS_LIMITS} from './analysis-contract.js';
const scope=c=>{
 const d=c.data;
 if(c.type==='character'&&d.baseRef)return JSON.stringify(['character',d.actorId,d.baseRef.analysisId,d.baseRef.bankDigest,d.baseRef.index,d.baseRef.recordDigest,[...(d.scope?.targetIds||[])].sort()]);
 if(d.existingId)return JSON.stringify([c.type,d.existingId]);
 if(c.type==='knowledge')return JSON.stringify(['knowledge',d.characterId,d.factId]);
 return c.id;
};
export function mergeDeltaResponses(first,second,{formatRepair=false}={}){
 const result={...second,coverage:{...second.coverage},candidates:[]},groups=new Map();
 // Repair fills invalid items; it must not reconsider an already valid original item.
 const preserved=new Map();
 if(formatRepair)for(const c of first?.candidates||[]){const key=scope(c);const same=(first.candidates||[]).filter(p=>scope(p)===key);if(c.type==='character'&&c.data.baseRef&&c.data.compactStatus==='fits'&&c.status==='pending'&&same.length===1)preserved.set(key,c);}
 const repaired=second.candidates.filter(c=>!preserved.has(scope(c)));
 const original=(first?.candidates||[]).filter(c=>!(formatRepair&&c.type==='character'&&c.data.compactStatus==='compact_budget'&&repaired.some(r=>scope(r)===scope(c))));
 for(const candidate of [...original,...repaired]){
  const key=scope(candidate),prior=groups.get(key)||[];
  const duplicate=prior.findIndex(c=>c.id===candidate.id||JSON.stringify(c.data)===JSON.stringify(candidate.data));
  if(duplicate>=0){prior[duplicate]=candidate;continue;}
  prior.push(candidate);groups.set(key,prior);
 }
 for(const group of groups.values())for(const candidate of group)result.candidates.push(group.length>1?{...candidate,status:'needs_review',reasonCode:'conflicting_proposals'}:candidate);
 for(const section of Object.keys(result.coverage))if(first?.coverage[section]==='complete'&&!first.invalid?.[section])result.coverage[section]='complete';
 if(second.comparison?.missing){result.coverage.evolution='deferred';if(second.coverage.persona==='deferred')result.coverage.persona='deferred';}
 for(const omitted of result.candidates.slice(ANALYSIS_LIMITS.maxChanges))result.coverage[omitted.section]='deferred';
 result.candidates=result.candidates.slice(0,ANALYSIS_LIMITS.maxChanges);
 return result;
}
