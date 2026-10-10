import {loadBankRecords} from '../storage/character-pages.js';
import {baseRecordRef} from '../character/evolution.js';
import {evolutionRuleBudget} from '../character/evolution-budget.js';
// Original records, not the subset selected for injection, define comparison scope.
export async function baselinePage(actors,{fingerprint,signal,offset=0,maxChars=16000,maxRecords=32,currentChanges=()=>[]}={}){
 const bases=[],wire=[],coverage=[];let cursor=0,used=0,next=null,blocked=false;
 for(const actor of actors){
  if(!actor.recordBank)continue;
  const bank=actor.recordBank,total=bank.pagedRecords?.count??bank.records?.length??0;
  let included=0,actorOffset=Math.max(0,offset-cursor);
  if(actorOffset>=total){coverage.push({actor_id:actor.id,total,included:0,scope:'all_records',status:'previous_page'});cursor+=total;continue;}
  let localOffset=actorOffset;
  while(localOffset<total){
   signal?.throwIfAborted();
   const page=bank.pagedRecords?await loadBankRecords(bank,{offset:localOffset,purpose:'embedding',signal}):{records:bank.records.slice(localOffset),indices:bank.records.slice(localOffset).map((_,i)=>localOffset+i),nextOffset:null};
   if(page.status==='fallback'||!page.records?.length)throw Object.assign(new Error('인물 원본 페이지를 읽지 못했습니다.'),{code:'BASELINE_UNAVAILABLE'});
   for(let i=0;i<page.records.length;i++){
    const index=page.indices?.[i]??localOffset+i,record=page.records[i],base={ref:'b'+bases.length,actorId:actor.id,baseRef:baseRecordRef(bank,record,index,fingerprint),record};
    const budget=evolutionRuleBudget(record);
    const entry={ref:base.ref,actorId:actor.id,record,rule_chars:budget.targetChars,rule_utf8:budget.targetUtf8,rule_max_chars:budget.maxChars,rule_max_utf8:budget.maxUtf8};
    const changes=currentChanges(base);if(changes.length)entry.current_changes=changes;
    const chars=JSON.stringify(entry).length+1;
    if(chars>maxChars){blocked=true;next=cursor+index;break;}
    if(bases.length>=maxRecords||used+chars>maxChars){next=cursor+index;break;}
    used+=chars;bases.push(base);wire.push(entry);included++;
   }
   if(next!==null)break;
   const following=page.nextOffset;
   if(!bank.pagedRecords||following===null){if(bank.pagedRecords&&(page.indices?.at(-1)??localOffset+page.records.length-1)!==total-1)throw Object.assign(new Error('인물 원본 일부가 누락됐습니다.'),{code:'BASELINE_UNAVAILABLE'});localOffset=total;break;}
   if(!Number.isInteger(following)||following<=localOffset)throw Object.assign(new Error('인물 원본 페이지 순서 오류'),{code:'BASELINE_UNAVAILABLE'});
   localOffset=following;
  }
  coverage.push({actor_id:actor.id,total,included,scope:'all_records',status:next===null?'complete':'partial'});cursor+=total;
  if(next!==null)break;
 }
 return {bases,wire,coverage,nextOffset:next,blocked,total:actors.reduce((n,a)=>n+(a.recordBank?.pagedRecords?.count??a.recordBank?.records?.length??0),0),offset};
}
