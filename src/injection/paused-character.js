import {loadBankRecords} from '../storage/character-pages.js';
import {effectiveRecord,confirmedEvolution} from '../character/evolution.js';
import {scopedRecordLine} from '../character/record-selection.js';

// The paused path uses an intimacy reference rather than ordinary record
// selection. Substitute literal baseline rules in it; otherwise supply only
// the verified effective record, preserving unrelated intimacy boundaries.
export async function pausedCharacterReference(entry,record,{chat,chatRef,store,actorIds,fingerprint,signal,limit=1000,budget={remaining:limit},onFailure=()=>{}}) {
 let text=String(entry.recordBank?.intimacy_reference?.text||'').trim();
 const evolution=confirmedEvolution(record,{chat,chatRef,store,fingerprint});
 const changes=evolution.entries.filter(e=>e.actorId===entry.id&&e.status==='active'&&e.compactStatus==='fits'&&(e.scope?.targetIds||[]).every(id=>actorIds.includes(id))).slice(-3);
 if(!changes.length)return text;
 let page;
 try {page=await loadBankRecords(entry.recordBank,{hashes:changes.map(e=>e.baseRef.retrievalHash),signal});}
 catch(error){if(signal?.aborted)throw error;onFailure();return text;}
 const working={...entry,recordBank:{...entry.recordBank,records:page.records,recordIndices:page.indices}},added=[];let used=0;
 for(const change of changes){
  const local=page.indices.indexOf(change.baseRef.index),original=page.records[local];if(!original)continue;
  const effective=effectiveRecord(original,working,evolution,fingerprint,{actorIds,index:change.baseRef.index});
  if(effective.rule===original.rule)continue;
  if(text.includes(original.rule))text=text.split(original.rule).join(effective.rule);
  else {const line=scopedRecordLine(entry.name,effective);if(used+line.length<=limit&&line.length<=budget.remaining){added.push(line);used+=line.length;budget.remaining-=line.length;}}
 }
 return [text,...new Set(added)].filter(Boolean).join('\n');
}
