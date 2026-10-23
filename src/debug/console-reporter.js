const code=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(value)?value:'';
const phases=new Set(['prepare','request','response','items','storage','settings','cleanup','commit','read','write','render','query','list','insert','index_check','index_sync','connection_test','send','assembly']);
const wrappers=new Set(['STAGE_FAILED','RUN_FAILED','GENERATION_PREPARATION_FAILED','UI_TASK_FAILED','EVENT_TASK_FAILED']);
const captureFailures=new Set(['timeout','request','format','save_failed','processing_failed','unavailable','too_long']);
function classification(event,root){
 if(/STORAGE|SAVE|SETTINGS|CLEANUP/.test(root)||/storage|settings|migration/.test(event.stage||''))return ['저장·설정','저장·설정 처리'];
 if(/^(PROFILE|JEV|NANO|RETRIEVAL)_(?:NETWORK|TIMEOUT|AUTH|FORBIDDEN|RATE|BILLING|SERVER|REQUEST|UNAVAILABLE|NOT_FOUND|SUBSCRIPTION)/.test(root))return ['연결','모델 연결'];
 if(/injection|prompt|generation_cleanup/.test(event.stage||''))return ['주입','주입 전달'];
 return ['분석',/character_state|emotion/.test(event.stage||'')?'감정 수집':/vault/.test(event.stage||'')?'추가 자료':/analysis|auxiliary|continuity/.test(event.stage||'')?'연속성 수집':/retrieval|embedding/.test(event.stage||'')?'검색·임베딩':'확장 처리'];
}
// Read-only, bounded, safe projection. Never forward an Error or event object.
export function createConsoleReporter({console:output=globalThis.console,now=()=>Date.now()}={}){
 const seen=new Map();let run='',attempt=0,lastFailure=null;
 function accept(event){
  if(event.code==='RUN_STARTED'){run=event.cycleId||String(event.sequence);attempt=0;}
  if(event.stage==='analysis_started')attempt++;
  const capture=event.stage==='character_state_capture';
  const status=capture&&captureFailures.has(event.status)?'failed':capture&&['partial','incomplete'].includes(event.status)?'degraded':event.status;
  if(!['failed','degraded','warning'].includes(status)&&event.code!=='PRESET_SLOT_SEND_ERROR'&&!(event.stage==='injection.slot'&&event.resultStatus==='missing'))return;
  const root=code(event.errorKind)||code(event.reasonCode)||(capture&&status!==event.status?code('EMOTION_'+event.status.toUpperCase()):'')||code(event.code)||'EXTENSION_FAILED';
  if(/CANCELLED|STALE_RUN|ABORT/.test(root))return;
  const [category,feature]=classification(event,root),time=now();
  const scope=`${run||event.cycleId||'outside'}:${attempt}`;
  if(wrappers.has(root)&&lastFailure?.scope===scope&&time-lastFailure.time<2000)return;
  const identity=JSON.stringify([run||event.cycleId||'outside',attempt,category,root]);
  const previous=seen.get(identity);
  // Generic follow-on stage errors share the first root where available.
  if(previous!==undefined&&time-previous<5000)return;
  seen.set(identity,time);if(seen.size>128)seen.delete(seen.keys().next().value);
  lastFailure={scope,time};
  const detail={기능:feature,코드:root};
  if(phases.has(event.phase))detail.단계=event.phase;
  if(typeof event.module==='string'&&/^src\/[a-z0-9/-]+\.js$/.test(event.module)&&event.module.length<100)detail.담당=event.module;
  if(Number.isInteger(event.httpStatus)&&event.httpStatus>=400&&event.httpStatus<=599)detail.HTTP=event.httpStatus;
  if(Number.isSafeInteger(event.invalidCount)&&event.invalidCount>=0)detail.미처리=event.invalidCount;
  if(event.codeFallback===true)detail.처리='코드 대체';
  else if(root==='CONTINUITY_PARTIAL_RESULT')detail.처리='정상 값 반영 · 나머지 보존';
  const write=status==='failed'?output?.error:output?.warn;
  try{write?.call(output,`[씬판독기 · ${category}]`,detail);}catch{/* Console cannot affect execution. */}
 }
 return {accept,reset:()=>{seen.clear();run='';attempt=0;lastFailure=null;}};
}
export function attachConsoleReporter(hub,options){
 const reporter=createConsoleReporter(options);let sequence=0;
 return hub.subscribe(()=>{for(const event of hub.snapshot().events)if(event.sequence>sequence){sequence=event.sequence;reporter.accept(event);}});
}
