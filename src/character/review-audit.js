// One working answer per person. Never feed this answer into the next audit.
import {cleanReviewText} from './review-text.js';
const NAMESPACE='characterReviewAuditV1';
const retryReference=value=>value?.version===2&&typeof value.template==='string'&&typeof value.bankKey==='string'?{version:2,template:value.template,bankKey:value.bankKey}:null;
export function createReviewAuditStore(deps){
 let tail=Promise.resolve();
 const serialize=task=>{const pending=tail.then(task,task);tail=pending.catch(()=>{});return pending;};
 const people=()=>[...(deps.characterStore.characters||[]),...[deps.characterStore.persona].filter(Boolean)];
 const normalize=value=>({version:1,answers:(Array.isArray(value?.answers)?value.answers:[]).filter(item=>item&&typeof item.personId==='string'&&typeof item.text==='string'&&people().some(person=>person.id===item.personId)).map(item=>({personId:item.personId,kind:item.kind,text:cleanReviewText(item.text),retry:retryReference(item.retry),updatedAt:item.updatedAt}))});
 const assert=scope=>{if(!scope.valid())throw Object.assign(new Error('대화나 선택 파일이 바뀌었습니다. 다시 확인하세요.'),{code:'REVIEW_STALE'});};
 const bridge=()=>{if(!deps.companionStorage?.load||!deps.companionStorage?.save)throw Object.assign(new Error('답변 저장소를 불러오지 못했습니다. 채팅방을 다시 열어 주세요.'),{code:'REVIEW_STORAGE_UNAVAILABLE'});return deps.companionStorage;};
 async function read(scope){assert(scope);const value=normalize(await bridge().load(NAMESPACE,{metadata:scope.metadata}));assert(scope);return value;}
 const load=scope=>serialize(async()=>{const value=await read(scope),item=value.answers.find(item=>item.personId===scope.entry.id);return {text:item?.text||'',retry:retryReference(item?.retry)};});
 const save=(scope,text,retry)=>serialize(async()=>{
  const value=await read(scope),answer=cleanReviewText(text);
  if(!answer)throw Object.assign(new Error('확인 답변이 비어 있습니다. 이전 저장 답변은 유지됩니다.'),{code:'REVIEW_EMPTY'});
  const reference=retryReference(retry??value.answers.find(item=>item.personId===scope.entry.id)?.retry);
  value.answers=value.answers.filter(item=>item.personId!==scope.entry.id);
  value.answers.push({personId:scope.entry.id,kind:scope.entry.kind||scope.entry.recordBank.entity_type,text:answer,...(reference?{retry:reference}:{}),updatedAt:new Date().toISOString()});
  assert(scope);await bridge().save(NAMESPACE,value,{metadata:scope.metadata});return answer;
 });
 const remove=scope=>serialize(async()=>{const value=await read(scope);value.answers=value.answers.filter(item=>item.personId!==scope.entry.id);assert(scope);await bridge().save(NAMESPACE,value,{metadata:scope.metadata});});
 return {load,save,remove};
}
