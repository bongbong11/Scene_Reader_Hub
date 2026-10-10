import {sameRuleMeaningText,sameComparisonBase,resolveRoleReferences,mentionsActor} from './record-comparison.js';
import {COVERAGE_SECTIONS, ANALYSIS_LIMITS} from './analysis-contract.js';
import {validateCompactRecord} from '../character/evolution.js';
const kinds=new Set(['commitment','plan','schedule','obligation','delegation','status','fact','open_issue']);
const sources=new Set(['world_fact','claim','belief','intention','promise','delegation','completed_action']);
const epistemics=new Set(['established','stated','believed','suspected','intended']);
const lifecycles=new Set(['active','confirmed','delegated','contested','cancel_pending','resolved','cancelled','completed']);
const knowledgeSources=new Set(['direct','observed','told','reported','public','role_based','privileged']);
const short=v=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=320&&!/[<>]/.test(v)?v.trim():null;
export function validateEvidence(value,window) {
 if(!Array.isArray(value)||!value.length||value.length>3)return null;
 const result=[];for(const e of value){const segment=window.segments.find(s=>s.ref===e?.ref);if(!segment||typeof e.quote!=='string'||!e.quote.trim()||e.quote.length>320||!segment.text.includes(e.quote))return null;result.push({identity:segment.identity,quote:e.quote});}return result;
}
export function validateCoverage(value,persona) {return Object.fromEntries(Object.entries(COVERAGE_SECTIONS).map(([key,section])=>[section,key==='persona'&&!persona?'not_requested':['complete','deferred','not_requested'].includes(value?.[key])&&value[key]!=='not_requested'?value[key]:'deferred']));}
export function validateDeltaPacket(raw,{window,actors,bases,state,evolution,fingerprint,input}) {
 if(!raw||raw.protocol!==1||typeof raw.coverage!=='object')throw Object.assign(new Error('누적 분석 응답 형식을 확인하지 못했습니다.'),{code:'ANALYSIS_INVALID_RESPONSE'});
 const coverage=validateCoverage(raw.coverage,window.persona),actorMap=new Map(actors.map(a=>[a.id,a])),baseMap=new Map(bases.map(b=>[b.ref,b]));
 const candidates=[],rejections=[],invalid={continuity:0,evolution:0,persona:0};let total=0;
 const knownItems=new Map((state.items||[]).map(i=>[i.id,i])),knownChanges=new Map((evolution.entries||[]).map(i=>[i.id,i]));
 const lists=[['character_changes','character','evolution'],['deferred_changes','character','evolution'],['memory_changes','memory','continuity'],['knowledge_changes','knowledge','continuity']];
 for(const [field,type,defaultSection]of lists){
  if(!Array.isArray(raw[field])){coverage[defaultSection]='deferred';continue;}
  for(const [itemIndex,value]of raw[field].entries()){
   total++;let section=defaultSection;const actor=actorMap.get(value?.actor_id);if(actor?.kind==='persona')section='persona';
   const reject=(code='invalid_fields')=>{invalid[section]++;coverage[section]='deferred';if(rejections.length<32)rejections.push({field,index:itemIndex,code});};
   if(total>ANALYSIS_LIMITS.maxChanges){reject('change_limit');continue;}
   const evidence=validateEvidence(value?.evidence,window);if(!evidence||!sources.has(value?.source_type)){reject(!evidence?'invalid_evidence':'invalid_source_type');continue;}
   const ids=v=>Array.isArray(v)&&v.every(id=>actorMap.has(id))?[...new Set(v)].sort():null;
   let data,baseline=null,prior=null;
   if(type==='memory'){
    const owners=ids(value.owners),targets=ids(value.target_ids||[]),summary=short(value.summary);
    if(!['add','update','resolve'].includes(value.op)||!kinds.has(value.kind)||!owners||!owners.length||!targets||!summary||!epistemics.has(value.epistemic)||!lifecycles.has(value.lifecycle)||value.op!=='add'&&!knownItems.has(value.existing_id)){reject();continue;}
    prior=knownItems.get(value.existing_id)||null;data={op:value.op,existingId:prior?.id||null,kind:value.kind,label:summary,owners,targetIds:targets,lifecycle:value.op==='resolve'?'resolved':value.lifecycle,sourceType:value.source_type,epistemic:value.epistemic};
   }else if(type==='knowledge'){
    const summary=short(value.summary);if(!actor||!knowledgeSources.has(value.source)||!summary){reject();continue;}
    const factId=(state.knowledge||[]).find(k=>k.factId===value.fact_id)?.factId||'continuity_fact:'+fingerprint(summary);
    if(!epistemics.has(value.epistemic)){reject();continue;}
    prior=(state.knowledge||[]).find(k=>k.factId===factId&&(k.characterId||k.character)===actor.id)||null;data={factId,character:actor.name,characterId:actor.id,source:value.source,summary,sourceType:value.source_type,epistemic:value.epistemic};
   }else{
    if(!actor||actor.kind==='persona'&&!window.persona||!epistemics.has(value.epistemic)){reject();continue;}
    if(actor.kind==='persona'&&!evidence.some(e=>e.identity.role==='user')){reject();continue;}
    const targets=ids(value.target_ids||[]);if(!targets){reject();continue;}
    const base=value.base_ref?baseMap.get(value.base_ref):null;
    if(value.base_ref&&(!base||base.actorId!==actor.id)){reject();continue;}
    const namedTarget=base&&actors.find(a=>[a.name,...(a.aliases||[])].some(name=>name&&resolveRoleReferences(base.record.target,input?.role_bindings).toLowerCase()===String(name).toLowerCase()));
    if(namedTarget&&namedTarget.id!==actor.id&&!targets.includes(namedTarget.id)){reject('missing_target_id');continue;}
    const existing=value.existing_change_id?knownChanges.get(value.existing_change_id):null;
    if(value.existing_change_id&&!existing||existing&&base&&existing.baseRef&&existing.baseRef.recordDigest!==base.baseRef.recordDigest){reject();continue;}
    if(existing&&existing.actorId!==actor.id){reject();continue;}
    let op=value.op,rule=typeof value.compact_rule==='string'&&value.compact_rule.trim()&&!/[<>]/.test(value.compact_rule)?value.compact_rule.trim():null,stateSummary=short(value.state_summary),fits=false;
    if(field==='deferred_changes'){if(value.reason_code!=='compact_budget'||!base){reject();continue;}op='add_state';}
    if(!['replace','exception','add_state','resolve'].includes(op)||op==='resolve'&&!existing){reject();continue;}
    if(['replace','exception'].includes(op)){if(!base||!rule||value.record_type!==base.record.type){reject('invalid_original_mapping');continue;}const effective=existing||evolution.entries.find(e=>e.actorId===actor.id&&sameComparisonBase(e.baseRef,base.baseRef)&&JSON.stringify(e.scope?.targetIds||[])===JSON.stringify(targets));if(sameRuleMeaningText(effective?.compactRule||base.record.rule,rule,input?.role_bindings)){reject('unchanged_rule');continue;}fits=validateCompactRecord(base.record,rule);if(!fits){op='add_state';stateSummary=stateSummary||short(rule);}}
    if(fits&&targets.some(id=>!mentionsActor(rule,actorMap.get(id),input?.role_bindings))){reject('target_scope_mismatch');continue;}
    if(op==='add_state'&&!stateSummary){reject(base?'compact_budget_without_summary':'missing_state_summary');continue;}
    baseline=base?.record||null;prior=existing||(base?evolution.entries.find(e=>e.actorId===actor.id&&sameComparisonBase(e.baseRef,base.baseRef)&&JSON.stringify(e.scope?.targetIds||[])===JSON.stringify(targets)):null)||null;
    data={actorId:actor.id,baseRef:base?.baseRef||null,existingId:prior?.id||null,operation:op,category:base?.record.type||existing?.category||'relationship',compactRule:fits?rule:null,stateSummary,compactStatus:fits?'fits':base?'compact_budget':'not_applicable',exportEligible:fits,scope:{actorId:actor.id,targetIds:targets,knowledgeOwnerIds:[]},sourceType:value.source_type,epistemic:value.epistemic};
   }
   const id=fingerprint([type,data,evidence.map(e=>[e.identity,e.quote])]);
   const candidate={id,type,section,data,baseline,prior,evidence,attempts:0,status:'pending',sourceIndex:Math.max(...evidence.map(e=>e.identity.messageIndex))};
   if(type==='character'&&data.compactStatus==='compact_budget')candidate.reasonCode='compact_budget';
   const review=v=>typeof v==='string'&&v.trim().length<=2000&&!/[<>]/.test(v)?v.trim():null;
   candidate.reviewText={originalKo:review(value.original_ko),replacementKo:review(value.replacement_ko),reasonKo:review(value.reason_ko)};
   candidates.push(candidate);
  }
 }
 return {id:window.id,coverage,candidates,refs:window.sourceRefs,invalid,rejections,status:candidates.length?'pending':'empty'};
}
