// One cumulative answer per person in the existing room companion store.
// This reference is never a character rule, scene state or rollback snapshot.
const NAMESPACE='characterReviewAuditV1';
export function createReviewAuditStore(deps){
 let tail=Promise.resolve();
 const serialize=task=>{const pending=tail.then(task,task);tail=pending.catch(()=>{});return pending;};
 const people=()=>[...(deps.characterStore.characters||[]),...[deps.characterStore.persona].filter(Boolean)];
 const normalize=value=>({version:1,answers:(Array.isArray(value?.answers)?value.answers:[]).filter(item=>item&&typeof item.personId==='string'&&typeof item.text==='string'&&people().some(person=>person.id===item.personId)).map(item=>({...item}))});
 const assert=scope=>{if(!scope.valid())throw Object.assign(new Error('대화나 선택 파일이 바뀌었습니다. 다시 확인하세요.'),{code:'REVIEW_STALE'});};
 const bridge=()=>{if(!deps.companionStorage?.load||!deps.companionStorage?.save)throw Object.assign(new Error('답변 저장소를 불러오지 못했습니다. 채팅방을 다시 열어 주세요.'),{code:'REVIEW_STORAGE_UNAVAILABLE'});return deps.companionStorage;};
 async function read(scope){assert(scope);const value=normalize(await bridge().load(NAMESPACE,{metadata:scope.metadata}));assert(scope);return value;}
 const load=scope=>serialize(async()=>{const value=await read(scope);return value.answers.find(item=>item.personId===scope.entry.id)?.text||'';});
 const save=(scope,text)=>serialize(async()=>{
  const value=await read(scope),answer=String(text||'').trim();
  if(!answer)return '';
  value.answers=value.answers.filter(item=>item.personId!==scope.entry.id);
  value.answers.push({personId:scope.entry.id,kind:scope.entry.kind||scope.entry.recordBank.entity_type,text:answer,updatedAt:new Date().toISOString()});
  assert(scope);await bridge().save(NAMESPACE,value,{metadata:scope.metadata});return answer;
 });
 const remove=scope=>serialize(async()=>{const value=await read(scope);value.answers=value.answers.filter(item=>item.personId!==scope.entry.id);assert(scope);await bridge().save(NAMESPACE,value,{metadata:scope.metadata});});
 return {load,save,remove};
}
