import {currentCharacterReview,replacementFilePrompt,reviewTranslationPrompt,DEFAULT_CHARACTER_REVIEW_PROMPT,validateReviewTemplate} from './replacement-prompts.js';
import {cleanReviewText} from './review-text.js';
import {bankOutput} from './versions.js';
import {expandBank} from '../storage/character-pages.js';
import {createCurrentChatReview} from '../adapters/current-chat-review.js';
import {createReviewAuditStore} from './review-audit.js';
export function createReplacementTool(deps,{client=createCurrentChatReview(),expand=expandBank}={}){
 let controller=null,epoch=0;const audits=createReviewAuditStore(deps),answers=new Map();
 const entries=()=>[...(deps.characterStore.characters||[]),...[deps.characterStore.persona].filter(Boolean)].filter(e=>e.recordBank&&(e.recordBank.pagedRecords?.count||e.recordBank.records?.length));
 const renderReview=(entry,template,previous='')=>currentCharacterReview(entry.name,template,entry===deps.characterStore.persona,previous);
 const answerKey=id=>JSON.stringify([deps.stateChatKey(),id]);
 function reviewInstruction(id,template,previous=answers.get(answerKey(id))||''){const entry=entries().find(e=>e.id===id);if(!entry)throw new Error('인물을 먼저 선택하세요.');return renderReview(entry,template,cleanReviewText(previous));}
 const signature=()=>deps.stableFingerprint((deps.getContext().chat||[]).map(m=>[m.is_user,m.mes,m.swipe_id,m.is_system,m.is_hidden,m.hidden,m.extra?.hidden,m.extra?.exclude_from_prompt,m.extra?.ooc_chat]));
 function cancel(){epoch++;controller?.abort();controller=null;}
 function capture(id,cancellable=true){if(!deps.getContext().chatId)throw new Error('채팅방을 먼저 열어 주세요.');const entry=entries().find(e=>e.id===id);if(!entry)throw new Error('현재 방의 원본 인물 파일을 선택하세요.');const key=deps.stateChatKey(),bank=deps.stableFingerprint(entry.recordBank),chat=signature(),revision=epoch,metadata=deps.getContext().chatMetadata;
  return {entry,key,metadata,valid:()=>(!cancellable||revision===epoch)&&key===deps.stateChatKey()&&metadata===deps.getContext().chatMetadata&&chat===signature()&&bank===deps.stableFingerprint(entries().find(e=>e.id===id)?.recordBank)};
 }
 const report=(code,status,extra={})=>deps.noteDiagnostic?.('replacement_review',{module:'src/character/replacement-tool.js',code,status,...extra});
 async function loadAnswer(id){const scope=capture(id),state=await audits.load(scope);answers.set(answerKey(id),state.text);return {...state,valid:scope.valid};}
 async function saveAnswer(id,text){const scope=capture(id,false);try{const saved=await audits.save(scope,text);if(scope.valid())answers.set(answerKey(id),saved);report('REVIEW_ANSWER_SAVED','succeeded');return saved;}catch(error){report('REVIEW_ANSWER_SAVE_FAILED','failed');throw error;}}
 async function clearAnswer(id){const scope=capture(id);await audits.remove(scope);answers.delete(answerKey(id));report('REVIEW_ANSWER_CLEARED','succeeded');}
 async function review(id,template,retryMode=false){
  if(controller||client.busy)throw new Error('이전 확인 요청이 끝난 뒤 다시 눌러 주세요.');
  const source=capture(id),abort=new AbortController();controller=abort;const started=Date.now();report('REVIEW_STARTED','running');
  try{const saved=await audits.load(source);
   if(retryMode&&!saved.retry)throw new Error('다시 받을 요청이 없습니다. 현재 인물 변화 확인을 먼저 실행하세요.');
   const retry=retryMode?saved.retry:{template:validateReviewTemplate(template??DEFAULT_CHARACTER_REVIEW_PROMPT),previous:saved.text},previous=retry.previous;
   report('REVIEW_REFERENCE_READY','info',{module:'src/character/review-audit.js',retry:retryMode,hasPrevious:Boolean(previous),previousChars:previous.length});const text=cleanReviewText(await client.request(renderReview(source.entry,retry.template,previous),{signal:abort.signal,onPlacement:({code,status,...details})=>report(code,status,{...details,module:'src/adapters/review-message.js'})}));if(!source.valid())throw Object.assign(new Error('대화나 선택 파일이 바뀌었습니다. 현재 방에서 다시 확인하세요.'),{code:'REVIEW_STALE'});
   if(typeof text!=='string'||!text.trim())throw Object.assign(new Error('모델이 빈 답변을 돌려줬습니다.'),{code:'REVIEW_EMPTY'});
   const complete=previous&&/^No further revisions[.!]?\s*$/i.test(text.trim())?previous:text.trim();
   await audits.save(source,complete,retry);if(!source.valid())throw Object.assign(new Error('대화나 선택 파일이 바뀌었습니다. 현재 방에서 다시 확인하세요.'),{code:'REVIEW_STALE'});
   answers.set(answerKey(id),complete);report('REVIEW_SUCCEEDED','succeeded',{durationMs:Date.now()-started});return {text:complete,retry,valid:source.valid};}
  catch(error){report(/^REVIEW_[A-Z_]+$/.test(error.code)?error.code:'REVIEW_FAILED','failed',{durationMs:Date.now()-started});throw error;}
  finally{if(controller===abort)controller=null;}
 }
 async function translate(id,text){
  if(controller||client.busy)throw new Error('이전 확인 요청이 끝난 뒤 다시 눌러 주세요.');
  const source=capture(id),value=cleanReviewText(text);
  if(!value)throw new Error('번역할 답변이 없습니다.');
  const profileId=deps.settings?.reasonerProfileId,service=deps.connectionRequestService;
  if(!profileId||!service)throw new Error('설정 → 모델·키 설정에서 번역에 사용할 확장 연결 프로필을 먼저 선택하세요.');
  const abort=new AbortController();controller=abort;const started=Date.now();report('REVIEW_TRANSLATION_STARTED','running');
  try{const response=await deps.requestWithConnectionProfile(service,profileId,reviewTranslationPrompt(value),{}, {signal:abort.signal,responseFormat:'text',maxTokens:Math.max(4096,Math.ceil(value.length)+512),timeoutMs:60000});
   if(!source.valid()||profileId!==deps.settings.reasonerProfileId||service!==deps.connectionRequestService)throw Object.assign(new Error('대화나 선택 파일 또는 연결 프로필이 바뀌었습니다. 다시 확인하세요.'),{code:'REVIEW_STALE'});
   const translated=cleanReviewText(response.result);if(!translated)throw new Error('번역 답변이 비어 있습니다. 다시 시도하세요.');
   report('REVIEW_TRANSLATION_SUCCEEDED','succeeded',{durationMs:Date.now()-started});return translated;}
  catch(error){report('REVIEW_TRANSLATION_FAILED','failed',{durationMs:Date.now()-started});throw error;}
  finally{if(controller===abort)controller=null;}
 }
 async function prompt(id,text){
  const source=capture(id),bank=await expand(source.entry.recordBank);
  if(!source.valid())throw new Error('대화나 원본 파일이 바뀌었습니다. 다시 확인하세요.');
  if(bank.records?.length!==(source.entry.recordBank.pagedRecords?.count||source.entry.recordBank.records.length))throw new Error('원본 파일을 전부 읽지 못했습니다. 다시 시도하세요.');
  return replacementFilePrompt(bankOutput(bank),cleanReviewText(text));
 }
 return {entries,reviewInstruction,loadAnswer,saveAnswer,clearAnswer,review,retry:id=>review(id,undefined,true),translate,prompt,cancel,get busy(){return Boolean(controller||client.busy);}};
}
