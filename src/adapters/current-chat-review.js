// Use the host's contextual quiet request; never append chat messages or change profiles.
export function createCurrentChatReview({loadHost=()=>import('/script.js'),timeoutMs=120000}={}){
 let pending=false;
 const failure=(message,code)=>Object.assign(new Error(message),{code});
 async function request(prompt,{signal}={}){
  if(pending)throw failure('이전 요청이 아직 끝나지 않았습니다. 잠시 후 다시 눌러 주세요.','REVIEW_BUSY');
  pending=true;let started=false;
  try{
   signal?.throwIfAborted();const host=await loadHost();signal?.throwIfAborted();
   if(typeof host.generateQuietPrompt!=='function'||typeof host.isGenerating!=='function')throw failure('현재 SillyTavern에서 비공개 답변 요청을 지원하지 않습니다.','REVIEW_UNSUPPORTED');
   if(host.isGenerating())throw failure('현재 답변 생성이 끝난 뒤 눌러 주세요.','REVIEW_HOST_BUSY');
   const task=Promise.resolve().then(()=>{signal?.throwIfAborted();return host.generateQuietPrompt({quietPrompt:prompt,quietToLoud:false,skipWIAN:false,removeReasoning:true});});
   started=true;
   // A timed-out host may still be working. Keep the single-flight lock until it
   // settles; never abort shared RP generation or start duplicate paid requests.
   void task.then(()=>{pending=false;},()=>{pending=false;});
   return await new Promise((resolve,reject)=>{
    let timer;const done=(fn,value)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);fn(value);};
    const abort=()=>done(reject,failure('요청 표시를 취소했습니다.','REVIEW_CANCELLED'));
    timer=setTimeout(()=>done(reject,failure('응답 대기 시간이 지났습니다. 이전 생성이 끝나면 다시 시도할 수 있습니다.','REVIEW_TIMEOUT')),timeoutMs);
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    task.then(value=>typeof value==='string'&&value.trim()?done(resolve,value.trim()):done(reject,failure('모델이 빈 답변을 돌려줬습니다.','REVIEW_EMPTY')),()=>done(reject,failure('현재 채팅 모델 요청에 실패했습니다. 연결 상태를 확인해 주세요.','REVIEW_REQUEST_FAILED')));
   });
  }finally{if(!started)pending=false;}
 }
 return {request,get busy(){return pending;}};
}
