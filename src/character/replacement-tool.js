import {currentCharacterReview,replacementFilePrompt} from './replacement-prompts.js';
import {bankOutput} from './versions.js';
import {expandBank} from '../storage/character-pages.js';
import {createCurrentChatReview} from '../adapters/current-chat-review.js';
export function createReplacementTool(deps,{client=createCurrentChatReview(),expand=expandBank}={}){
 let controller=null,epoch=0;
 const entries=()=>[...(deps.characterStore.characters||[]),...[deps.characterStore.persona].filter(Boolean)].filter(e=>e.recordBank&&(e.recordBank.pagedRecords?.count||e.recordBank.records?.length));
 const assertOwner=()=>{if(!deps.ownerUnlocked())throw new Error('개발자 모드를 먼저 열어 주세요.');};
 const signature=()=>deps.stableFingerprint((deps.getContext().chat||[]).map(m=>[m.is_user,m.mes,m.swipe_id,m.is_system,m.is_hidden,m.hidden,m.extra?.hidden,m.extra?.exclude_from_prompt,m.extra?.ooc_chat]));
 function cancel(){epoch++;controller?.abort();controller=null;}
 function capture(id){assertOwner();if(!deps.getContext().chatId)throw new Error('채팅방을 먼저 열어 주세요.');const entry=entries().find(e=>e.id===id);if(!entry)throw new Error('현재 방의 원본 인물 파일을 선택하세요.');const key=deps.stateChatKey(),bank=deps.stableFingerprint(entry.recordBank),chat=signature(),revision=epoch;
  return {entry,key,valid:()=>revision===epoch&&deps.ownerUnlocked()&&key===deps.stateChatKey()&&chat===signature()&&bank===deps.stableFingerprint(entries().find(e=>e.id===id)?.recordBank)};
 }
 const report=(code,status,extra={})=>deps.noteDiagnostic?.('replacement_review',{module:'src/character/replacement-tool.js',code,status,...extra});
 async function review(id){
  if(controller||client.busy)throw new Error('이전 확인 요청이 끝난 뒤 다시 눌러 주세요.');
  const source=capture(id),abort=new AbortController();controller=abort;const started=Date.now();report('REVIEW_STARTED','running');
  try{const text=await client.request(currentCharacterReview(source.entry.name),{signal:abort.signal});if(!source.valid())throw Object.assign(new Error('대화나 선택 파일이 바뀌었습니다. 현재 방에서 다시 확인하세요.'),{code:'REVIEW_STALE'});report('REVIEW_SUCCEEDED','succeeded',{durationMs:Date.now()-started});return {text,valid:source.valid};}
  catch(error){report(/^REVIEW_[A-Z_]+$/.test(error.code)?error.code:'REVIEW_FAILED','failed',{durationMs:Date.now()-started});throw error;}
  finally{if(controller===abort)controller=null;}
 }
 async function prompt(id,text){
  const source=capture(id),bank=await expand(source.entry.recordBank);
  if(!source.valid())throw new Error('대화나 원본 파일이 바뀌었습니다. 다시 확인하세요.');
  if(bank.records?.length!==(source.entry.recordBank.pagedRecords?.count||source.entry.recordBank.records.length))throw new Error('원본 파일을 전부 읽지 못했습니다. 다시 시도하세요.');
  return replacementFilePrompt(bankOutput(bank),text);
 }
 return {entries,review,prompt,cancel,get busy(){return Boolean(controller||client.busy);}};
}
