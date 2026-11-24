import {requestFailure} from '../adapters/failure-info.js';

// Only known metadata is rendered; never include upstream text or URLs.
export function retrievalFailureMessage(event) {
 const provider={nanogpt:'나노GPT',palm:'Gemini AI Studio',vertexai:'Gemini Vertex AI',transformers:'로컬'}[event.provider]||'';
 const phase={query:'검색',insert:'자료 생성·등록',list:'색인 확인',delete:'색인 정리',total:'검색 작업'}[event.phase]||'처리';
 const code=event.errorKind||event.code||'';
 const reason=/TOTAL_TIMEOUT/.test(code)?'전체 대기 시간이 초과되었습니다':/TIMEOUT/.test(code)?'응답 시간이 초과되었습니다':/AUTH/.test(code)||event.httpStatus===401?'인증 실패':/FORBIDDEN/.test(code)||event.httpStatus===403?'접근 거절':/RATE|BUSY/.test(code)||event.httpStatus===429?'사용 한도 또는 처리 대기':/SERVER|UPSTREAM/.test(code)||event.httpStatus>=500?'서버 오류 응답':/NETWORK/.test(code)?'연결 실패 · 서버 응답 확인 불가':'실패';
 const limit=/TIMEOUT/.test(code)&&Number.isFinite(event.timeoutMs)&&event.timeoutMs>0?` · 제한 ${event.timeoutMs/1000}초`:'';
 const http=Number.isInteger(event.httpStatus)&&event.httpStatus>=400&&event.httpStatus<=599?` · HTTP ${event.httpStatus}`:'';
 return `${provider?provider+' ':''}임베딩 ${phase} ${reason}${limit}${http}`;
}
export function retrievalRequestFailure(error, detail) {
 const failure=requestFailure(error,'RETRIEVAL','임베딩 연결');
 if(error?.code==='RETRIEVAL_TOTAL_TIMEOUT')failure.code=error.code;
 return Object.assign(failure,{message:retrievalFailureMessage({...detail,errorKind:failure.code,httpStatus:failure.httpStatus,timeoutMs:error?.timeoutMs??detail.timeoutMs}),timeoutMs:error?.timeoutMs??detail.timeoutMs});
}
