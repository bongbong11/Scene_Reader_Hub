// Verify item coverage, not model opinions. No second semantic judge.
export const RECORD_COMPARISON_VERSION=2;
const korean=value=>typeof value==='string'&&/[가-힣]/.test(value)&&value.length<=2000&&!/[<>]/.test(value);
export function missingReviewTranslation(candidate){
 const text=candidate.reviewText||{};
 return !korean(text.replacementKo)||!korean(text.reasonKo)||Boolean(candidate.baseline?.rule)&&!korean(text.originalKo);
}
export const sameComparisonBase=(a,b)=>Boolean(a&&b&&a.analysisId===b.analysisId&&a.bankDigest===b.bankDigest&&a.index===b.index&&a.recordDigest===b.recordDigest);
export function checkRecordComparison(raw,packet,context){
 if(context.input?.comparison_contract!==RECORD_COMPARISON_VERSION)return packet;
 const reviews=Array.isArray(raw?.record_reviews)?raw.record_reviews:[],rows=[],missing=[];
 for(const base of context.bases){
  const matches=reviews.filter(r=>r?.base_ref===base.ref),row=matches[0];
  const changes=packet.candidates.filter(c=>c.type==='character'&&sameComparisonBase(c.data.baseRef,base.baseRef)&&c.data.actorId===base.actorId);
  const valid=matches.length===1&&['keep','change','uncertain'].includes(row?.status)&&((row.status==='change')===Boolean(changes.length));
  if(!valid){missing.push(base.ref);const section=context.actors.find(a=>a.id===base.actorId)?.kind==='persona'?'persona':'evolution';packet.coverage[section]='deferred';continue;}
  rows.push({key:context.fingerprint([base.actorId,base.baseRef]),status:row.status});
 }
 for(const c of packet.candidates){
  const base=context.bases.find(b=>b.actorId===c.data.actorId&&sameComparisonBase(b.baseRef,c.data.baseRef));
  if(base&&missing.includes(base.ref)){c.status='needs_review';c.reasonCode='comparison_incomplete';}
 }
 packet.comparison={expected:context.bases.length,reviewed:rows.length,missing:missing.length,rows,kept:rows.filter(r=>r.status==='keep').length,changed:rows.filter(r=>r.status==='change').length,uncertain:rows.filter(r=>r.status==='uncertain').length};
 return packet;
}
export function mergeComparisonProgress(previous,comparison){
 const rows=new Map((previous?.rows||[]).map(r=>[r.key,r]));const rank={keep:0,uncertain:1,change:2};
 for(const row of comparison?.rows||[]){const old=rows.get(row.key);if(!old||rank[row.status]>=rank[old.status])rows.set(row.key,row);}
 const values=[...rows.values()];return {rows:values,reviewed:values.length,kept:values.filter(r=>r.status==='keep').length,changed:values.filter(r=>r.status==='change').length,uncertain:values.filter(r=>r.status==='uncertain').length};
}
export function markTranslationStatus(packet){
 for(const c of packet.candidates)c.reviewText={...c.reviewText,status:missingReviewTranslation(c)?'missing':'complete'};
 packet.translationMissing=packet.candidates.filter(missingReviewTranslation).length;return packet;
}

// Identity substitutions are not character development; leave the original intact.
export function sameRuleMeaningText(original,proposed,bindings={}){
 const normalize=text=>resolveRoleReferences(text,bindings).normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim().replace(/[.。]$/,'');
 return normalize(original)===normalize(proposed);
}
// A format repair can omit or rephrase an already valid item. Coverage must
// describe the merged result, including the valid first-pass items we retained.
export function checkMergedComparison(first,second,merged,context){
 if(context.input?.comparison_contract!==RECORD_COMPARISON_VERSION)return merged;
 const rows=context.bases.flatMap(base=>{
  const key=context.fingerprint([base.actorId,base.baseRef]);
  const before=first?.comparison?.rows.find(r=>r.key===key),after=second?.comparison?.rows.find(r=>r.key===key);
  const changes=merged.candidates.filter(c=>c.type==='character'&&c.data.actorId===base.actorId&&sameComparisonBase(c.data.baseRef,base.baseRef));
  const validChange=changes.length&&(before?.status==='change'||after?.status==='change');
  const row=validChange?{status:'change'}:after||before;
  if(!row)return [];
  if(validChange)for(const candidate of changes)if(candidate.reasonCode==='comparison_incomplete'){candidate.status='pending';delete candidate.reasonCode;}
  return [{base_ref:base.ref,status:row.status}];
 });
 return checkRecordComparison({record_reviews:rows},merged,context);
}
export function resolveRoleReferences(text,bindings={}){return String(text||'').replace(/\{\{user\}\}/gi,()=>bindings.user||'{{user}}').replace(/\{\{char\}\}/gi,()=>bindings.character||'{{char}}');}
export function mentionsActor(text,actor,bindings={}){const resolved=resolveRoleReferences(text,bindings).normalize('NFKC').toLowerCase();return Boolean(actor&&[actor.name,...(actor.aliases||[])].some(name=>name&&resolved.includes(String(name).normalize('NFKC').toLowerCase())));}
