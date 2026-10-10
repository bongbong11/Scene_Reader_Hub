import {loadBankRecords} from '../storage/character-pages.js';
import {selectRecordCandidates} from '../character/record-selection.js';
import {baseRecordRef,normalizeEvolution} from '../character/evolution.js';
import {selectActiveContinuity} from './selection.js';
import {continuityView} from './state-adapter.js';
import {sourceRp} from './analysis-window.js';
import {ANALYSIS_LIMITS} from './analysis-contract.js';

export async function analysisContext(record,window,{store,selectActiveEntries,name,chat=[],fingerprint,signal,maxInputChars=ANALYSIS_LIMITS.inputChars}) {
 const text=window.segments.map(s=>s.text).join('\n');
 const carried=[...(record.sceneIntimacy?.participantIds||[]),...(record.lastJudgment?.characterTrace||[]).filter(p=>p.presence==='active').map(p=>p.id)];
 const actors=store.enabled?selectActiveEntries(store,text,name,carried,{allowUserImpersonation:false}).filter(a=>a.kind!=='persona').slice(0,6):[];
 // Persona identity can be a relationship target even with trait collection off.
 if(store.persona)actors.push(store.persona);
 const evolution=normalizeEvolution(record.characterEvolutionV1),state=continuityView(record),bases=[];
 const selected=selectActiveContinuity(state,text,{actorIds:actors.map(a=>a.id),opportunity:record.sceneOpportunity,limits:{items:12,knowledge:8}});
 const before=Math.min(...window.sourceRefs.map(r=>r.messageIndex));
 const overlap=[];let overlapBudget=ANALYSIS_LIMITS.contextChars;
 for(let index=before-1;index>=0&&overlap.length<4;index--){const rp=sourceRp(chat[index]);if(!rp)continue;if(rp.length>overlapBudget)break;overlap.unshift({role:chat[index].is_user?'user':'assistant',text:rp});overlapBudget-=rp.length;}
 const input={actors:actors.map(({id,name,aliases,kind})=>({id,name,aliases,kind})),persona_enabled:window.persona,
  source_segments:window.segments.map(({ref,role,text,identity})=>({ref,role,text,message_index:identity.messageIndex})),overlap_context:overlap,
  baseline_records:[],prior_state:Object.fromEntries(Object.keys(selected).map(key=>[key,[]])),prior_character_changes:[],
  pending_proposal_ids:(record.analysisRuntimeV1?.pendingBatches||[]).flatMap(b=>b.candidates||[]).map(c=>c.id).slice(-128)};
 const contextBase=JSON.stringify(input).length;let comparisonBudget=6000;
 const addComparison=(list,item)=>{const size=JSON.stringify(item).length+1;if(size>comparisonBudget||JSON.stringify(input).length+size>maxInputChars-4000)return;list.push(item);comparisonBudget-=size;};
 for(const [key,list]of Object.entries(selected))for(const item of list){const {sourceRefs,...view}=item;addComparison(input.prior_state[key],view);}
 for(const {evidenceRefs,...entry}of evolution.entries.filter(e=>actors.some(a=>a.id===e.actorId)&&['active','needs_review'].includes(e.status)).slice(-12))addComparison(input.prior_character_changes,entry);
 let remaining=Math.min(16000,maxInputChars-JSON.stringify(input).length-512);
 const baselineCoverage=[];
 for(const actor of actors){
  if(!actor.recordBank||actor.kind==='persona'&&!window.persona)continue;
  const hashes=evolution.entries.filter(e=>e.actorId===actor.id&&e.status==='active'&&e.baseRef).slice(-8).map(e=>e.baseRef.retrievalHash);
  const page=await loadBankRecords(actor.recordBank,{query:text,hashes,signal});signal?.throwIfAborted();
  const entry={...actor,recordBank:{...actor.recordBank,records:page.records,recordIndices:page.indices}};
  const selectedRecords=selectRecordCandidates(entry,text,{limit:8,maxChars:Math.max(0,remaining)});
  let included=0;
  for(const candidate of selectedRecords){
   if(bases.length>=24)break;
   const index=Number(candidate.id.slice(candidate.id.lastIndexOf(':')+1)),local=page.indices.indexOf(index),original=page.records[local];if(!original)continue;
   const base={ref:'b'+bases.length,actorId:actor.id,baseRef:baseRecordRef(actor.recordBank,original,index,fingerprint),record:original};
   const {baseRef,...view}=base;const wire={...view,rule_chars:Array.from(original.rule).length,rule_utf8:new TextEncoder().encode(original.rule).length};
   const size=JSON.stringify(wire).length+1;if(size>remaining)continue;
   remaining-=size;bases.push(base);input.baseline_records.push(wire);included++;
  }
  baselineCoverage.push({actor_id:actor.id,included,scope:'selected_records_only'});
 }
 input.baseline_coverage=baselineCoverage;
 if(contextBase>maxInputChars||JSON.stringify(input).length>maxInputChars)throw Object.assign(new Error('분석 자료가 한도를 넘었습니다.'),{code:'ANALYSIS_INPUT_CAPACITY'});
 return {actors,bases,state,evolution,input};
}
