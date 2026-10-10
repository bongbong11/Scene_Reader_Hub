import {sameComparisonBase} from './record-comparison.js';
import {baselinePage} from './baseline-coverage.js';
import {normalizeEvolution, confirmedEvolution} from '../character/evolution.js';
import {selectActiveContinuity, confirmedContinuity} from './selection.js';
import {continuityView} from './state-adapter.js';
import {sourceRp} from './analysis-window.js';
import {ANALYSIS_LIMITS} from './analysis-contract.js';

export async function analysisContext(record,window,{store,selectActiveEntries,name,userName,chat=[],fingerprint,signal,maxInputChars=ANALYSIS_LIMITS.inputChars,baselineOffset=0,allActors=false,recentInterval=3}) {
 const text=window.segments.map(s=>s.text).join('\n');
 const carried=[...(record.sceneIntimacy?.participantIds||[]),...(record.lastJudgment?.characterTrace||[]).filter(p=>p.presence==='active').map(p=>p.id)];
 const actors=store.enabled?(allActors?[...(store.characters||[]),...(store.npcs||[])]:selectActiveEntries(store,text,name,carried,{allowUserImpersonation:false})).filter(a=>a.kind!=='persona'):[];
 // Persona identity can be a relationship target even with trait collection off.
 if(store.persona)actors.push(store.persona);
 const chatRef=window.sourceRefs?.[0]?.originChatRef;
 const evolution=normalizeEvolution(confirmedEvolution(record,{chat,chatRef,fingerprint,store})),state=confirmedContinuity(continuityView(record),{record,chatRef,chat,fingerprint,inherited:Boolean(record.sharedReference||record.legacyCarryReferenceV1)});
 const selected=selectActiveContinuity(state,text,{actorIds:actors.map(a=>a.id),opportunity:record.sceneOpportunity,limits:{items:12,knowledge:8}});
 const before=Math.min(...window.sourceRefs.map(r=>r.messageIndex));
 const overlap=[];let overlapBudget=Math.max(ANALYSIS_LIMITS.contextChars,Math.min(8000,recentInterval*1600));
 for(let index=before-1;index>=0&&overlap.length<Math.max(2,recentInterval*2);index--){const rp=sourceRp(chat[index]);if(!rp)continue;if(rp.length>overlapBudget)break;overlap.unshift({role:chat[index].is_user?'user':'assistant',text:rp});overlapBudget-=rp.length;}
 const input={comparison_contract:2,role_bindings:{user:userName||store.persona?.name||null,character:name||actors.find(a=>a.kind==='character')?.name||null},actors:actors.map(({id,name,aliases,kind})=>({id,name,aliases,kind})),persona_enabled:window.persona,
  source_segments:window.segments.map(({ref,role,text,identity})=>({ref,role,text,message_index:identity.messageIndex})),overlap_context:overlap,
  baseline_records:[],prior_state:Object.fromEntries(Object.keys(selected).map(key=>[key,[]])),prior_character_changes:[],
  pending_proposal_ids:(record.analysisRuntimeV1?.pendingBatches||[]).flatMap(b=>b.candidates||[]).map(c=>c.id).slice(-128)};
 const contextBase=JSON.stringify(input).length;let comparisonBudget=6000;
 const addComparison=(list,item)=>{const size=JSON.stringify(item).length+1;if(size>comparisonBudget||JSON.stringify(input).length+size>maxInputChars-4000)return;list.push(item);comparisonBudget-=size;};
 for(const [key,list]of Object.entries(selected))for(const item of list){const {sourceRefs,collectionOriginV1,...view}=item;addComparison(input.prior_state[key],view);}
 const currentChange=entry=>({id:entry.id,actorId:entry.actorId,compactRule:entry.compactRule||null,stateSummary:entry.stateSummary||null,scope:entry.scope,updatedOrdinal:entry.updatedOrdinal});
 const activeChanges=evolution.entries.filter(e=>actors.some(a=>a.id===e.actorId)&&e.status==='active');
 for(const entry of activeChanges.filter(e=>!e.baseRef).slice(-12))addComparison(input.prior_character_changes,currentChange(entry));
 // A compared original and its current applied version travel together. Paging
 // may reduce the number of originals, but never silently resets an older change.
 const baseline=await baselinePage(actors.filter(a=>a.kind!=='persona'||window.persona),{fingerprint,signal,offset:baselineOffset,maxChars:Math.min(16000,maxInputChars-JSON.stringify(input).length-512),currentChanges:base=>activeChanges.filter(e=>e.actorId===base.actorId&&sameComparisonBase(e.baseRef,base.baseRef)).map(currentChange)});
 const bases=baseline.bases;input.baseline_records=baseline.wire;input.baseline_coverage=baseline.coverage;
 input.baseline_progress={offset:baselineOffset,next_offset:baseline.nextOffset,total:baseline.total,blocked:baseline.blocked};
 if(contextBase>maxInputChars||JSON.stringify(input).length>maxInputChars)throw Object.assign(new Error('분석 자료가 한도를 넘었습니다.'),{code:'ANALYSIS_INPUT_CAPACITY'});
 return {actors,bases,state,evolution,input,baseline};
}
