// Append one request-only user input before SillyTavern builds chat history.
// The saved chat, input box, preset and extension prompt positions are untouched.
import {installReviewSheetFilter} from './review-sheet-filter.js';

export function installReviewMessage(host,prompt,report=()=>{},{manager,subjectKind}={}) {
 const target=host.reviewWindow||globalThis,bus=host.eventSource,events=host.event_types;
 const previous=target.SceneReaderHubBeforeGenerate;
 if(host.main_api!=='openai'||typeof previous!=='function'||!bus?.makeLast||!bus?.removeListener||!events?.GENERATION_STARTED){
  throw Object.assign(new Error('인물 확인에 필요한 채팅 입력 연결을 사용할 수 없습니다. 확장 업데이트 후 새로고침하세요.'),{code:'REVIEW_PLACEMENT_UNSUPPORTED'});
 }
 const requestSignal=new AbortController().signal;
 // Expand command macros without rewriting literal JSON data (or swapping its targets).
 const boundary='\n[END CURRENT CHARACTER RECORDS]';
 const split=prompt.indexOf(boundary);
 const resolve=text=>typeof host.substituteParams==='function'?host.substituteParams(text):text;
 const text=split<0?resolve(prompt):prompt.slice(0,split+boundary.length)+resolve(prompt.slice(split+boundary.length));
 let active=true,owned=false,inserted=false,observed=false,error=null;
 const note=detail=>{try{report(detail);}catch{/* diagnostics only */}};
 let restoreSheet=null;
 const restore=()=>{restoreSheet?.();restoreSheet=null;};
 const onStart=(type,options={},dryRun=false)=>{
  if(dryRun||options.signal!==requestSignal){restore();return;}
  owned=type==='quiet';
  if(owned&&subjectKind)restoreSheet=installReviewSheetFilter(manager,subjectKind,note);
 };
 async function intercept(chat,size,abort,type) {
  await previous.call(this,chat,size,abort,type);
  if(!active||!owned||inserted||type!=='quiet')return;
  owned=false;
  if(!Array.isArray(chat)||chat===host.chat){
   error=Object.assign(new Error('임시 채팅 입력을 준비하지 못해 확인 요청을 중단했습니다.'),{code:'REVIEW_PLACEMENT_UNCONFIRMED'});
   abort(true);return;
  }
  chat.push({name:host.name1||'User',is_user:true,is_system:false,mes:text,extra:{}});
  inserted=true;
  note({code:'REVIEW_USER_INPUT_ADDED',status:'info',phase:'history',role:'user',position:'last_chat_message',messageIndex:chat.length-1,messageCount:chat.length});
 }
 const onPrompt=data=>{
  if(!active||!inserted||data?.dryRun||!Array.isArray(data?.chat))return;
  restore();
  const index=data.chat.findIndex(message=>message.role==='user'&&(message.content===text||Array.isArray(message.content)&&message.content.some(part=>part.type==='text'&&part.text===text)));
  if(index<0)return;
  observed=true;note({code:'REVIEW_USER_MESSAGE_READY',status:'info',phase:'assembly',role:'user',position:'last_chat_message',messageIndex:index,messageCount:data.chat.length});
 };
 target.SceneReaderHubBeforeGenerate=intercept;
 const dispose=()=>{active=false;restore();if(target.SceneReaderHubBeforeGenerate===intercept)target.SceneReaderHubBeforeGenerate=previous;bus.removeListener(events.GENERATION_STARTED,onStart);if(events.CHAT_COMPLETION_PROMPT_READY)bus.removeListener(events.CHAT_COMPLETION_PROMPT_READY,onPrompt);};
 try{bus.makeLast(events.GENERATION_STARTED,onStart);if(events.CHAT_COMPLETION_PROMPT_READY)bus.makeLast(events.CHAT_COMPLETION_PROMPT_READY,onPrompt);}catch(failure){dispose();throw failure;}
 return {options:{quiet_prompt:'',quietToLoud:false,skipWIAN:false,force_name2:true,signal:requestSignal},dispose,get error(){return error;},finish(){
  // Never discard a model answer because a host/extension transformed its
  // prompt representation. Keep placement diagnostics separate from the answer.
  if(!observed)note({code:'REVIEW_PLACEMENT_NOT_OBSERVED',status:'warning',phase:'response',inserted});
 }};
}
