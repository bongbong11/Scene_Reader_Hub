import {recordText, hash53} from '../retrieval/identity.js';
import {eligibleSource} from '../continuity/source-eligibility.js';
import {evolutionRuleBudget} from './evolution-budget.js';
const chars=t=>Array.from(String(t)).length,bytes=t=>new TextEncoder().encode(String(t)).length;
export function normalizeEvolution(value) {return {schemaVersion:1,revision:Math.max(0,Number(value?.revision)||0),entries:structuredClone(Array.isArray(value?.entries)?value.entries:[]),excludedProposals:structuredClone(value?.excludedProposals||[])};}
export function baseRecordRef(bank,record,index,fingerprint) {
 return {bankDigest:bank.pagedRecords?.bankId||String(bank.analysisId||''),analysisId:String(bank.analysisId||''),index,recordDigest:fingerprint(record),retrievalHash:hash53(JSON.stringify(['character',record.id||index,record,recordText('character',record)]))};
}
export function validateCompactRecord(original,rule) {
 if(typeof rule!=='string'||!rule.trim()||/[<>]/.test(rule))return false;
 const proposed=rule.trim(),budget=evolutionRuleBudget(original);
 return chars(proposed)<=budget.maxChars&&bytes(proposed)<=budget.maxUtf8&&bytes(JSON.stringify(proposed))<=budget.maxJsonStringUtf8;
}
export function selectEvolutionForActors(value,actorIds) {const ids=new Set(actorIds);return normalizeEvolution(value).entries.filter(e=>e.status==='active'&&ids.has(e.actorId));}
export function effectiveRecord(record,entry,evolution,fingerprint,{actorIds=[],index}={}) {
 const bank=entry.recordBank;
 if(!bank||typeof fingerprint!=='function')return record;
 // Selection decorates a record with a synthetic ID. Compare the immutable
 // source, never that decorated candidate, to its saved base reference.
 const original=Number.isInteger(index)?bank.records?.find((_,local)=>(bank.recordIndices?.[local]??local)===index):record;
 if(!original)return record;
 const digest=fingerprint(original),bankDigest=bank.pagedRecords?.bankId||String(bank.analysisId||''),present=new Set(actorIds);
 const change=(evolution?.entries||[]).filter(e=>e.status==='active'&&e.actorId===entry.id&&e.compactStatus==='fits'
  &&e.baseRef?.analysisId===String(bank.analysisId||'')&&e.baseRef.bankDigest===bankDigest&&e.baseRef.recordDigest===digest
  &&(!Number.isInteger(index)||e.baseRef.index===index)
  &&(e.scope?.targetIds||[]).every(id=>present.has(id)))
  .sort((a,b)=>(b.updatedOrdinal??0)-(a.updatedOrdinal??0))[0];
 return change&&validateCompactRecord(original,change.compactRule)?{...record,rule:change.compactRule,evolutionChangeId:change.id}:record;
}
export function applyEvolutionCandidates(entry,candidates,evolution,fingerprint,actorIds) {
 return candidates.map(record=>{
  const match=new RegExp('^record:'+String(entry.id).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+':(\\d+)$').exec(record.id);
  return effectiveRecord(record,entry,evolution,fingerprint,{actorIds,index:match?Number(match[1]):undefined});
 });
}
export function evolutionMatchesBase(item,store) {
 const person=[...(store?.characters||[]),...(store?.npcs||[]),...[store?.persona].filter(Boolean)].find(e=>e.id===item.actorId);
 return Boolean(person&&(!item.baseRef||person.recordBank?.analysisId===item.baseRef.analysisId && (person.recordBank?.pagedRecords?.bankId||String(person.recordBank?.analysisId||''))===item.baseRef.bankDigest));
}
export function confirmedEvolution(record,{chat,chatRef,fingerprint,store}) {
 const inherited=Boolean(record.sharedReference||record.legacyCarryReferenceV1),cache=new Map();
 const valid=ref=>{const key=JSON.stringify(ref);if(!cache.has(key))cache.set(key,eligibleSource([ref],{record,chatRef,chat,fingerprint,inherited}));return cache.get(key);};
 return {...record.characterEvolutionV1,entries:(record.characterEvolutionV1?.entries||[]).filter(e=>evolutionMatchesBase(e,store)&&e.evidenceRefs?.length&&e.evidenceRefs.every(valid))};
}
