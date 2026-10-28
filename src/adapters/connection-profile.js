import {parseReasonerReply} from '../continuity/json-parser.js';
import { withRequestLifetime } from './request-lifetime.js';
import { requestFailure } from './failure-info.js';
import {stableFingerprint} from '../decision/policy.js';
import {safeAnalysisInfo} from '../continuity/failure.js';
export {parseReasonerReply} from '../continuity/json-parser.js';
export const REASONER_MAX_TOKENS = 1200;



export function listConnectionProfiles(service) {
    return service.getSupportedProfiles().map((profile) => ({
        id: String(profile.id),
        name: String(profile.name || profile.id),
        model: String(profile.model || '모델 이름 없음'),
        mode: String(profile.mode || ''),
    }));
}



export function createConnectionProfileClient({onDiagnostic=()=>{}}={}) {
    return (service,profileId,system,state,options={})=>requestWithConnectionProfile(service,profileId,system,state,{...options,onDiagnostic});
}

export async function requestWithConnectionProfile(service, profileId, system, state, { testing = false, maxTokens = REASONER_MAX_TOKENS, signal, timeoutMs=60000, onDiagnostic=()=>{},responseFormat='json' } = {}) {
    const started=Date.now();
    const diagnostic={module:'src/adapters/connection-profile.js',phase:'request',profileHash:stableFingerprint(profileId),maxTokens,timeoutMs,responseReceived:false};
    const report=detail=>{try{onDiagnostic({module:'src/adapters/connection-profile.js',testing,timeoutMs,...detail});}catch{/* diagnostic only */}};
    let profile;
    try { profile=service.getProfile(profileId); service.validateProfile(profile); }
    catch { report({status:'failed',errorKind:'PROFILE_UNAVAILABLE',...diagnostic}); throw Object.assign(new Error('확장 연결 프로필을 찾지 못했습니다. 설정에서 사용할 프로필을 선택하세요.'),{code:'PROFILE_UNAVAILABLE',diagnostic:safeAnalysisInfo(diagnostic)}); }
    const messages = testing
        ? [{ role: 'system', content: 'Return a JSON object only.' }, { role: 'user', content: 'Return exactly {"ok":true}.' }]
        : [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(state) }];
    Object.assign(diagnostic,{modelHash:stableFingerprint(profile.model||''),inputChars:messages.reduce((n,item)=>n+item.content.length,0)});
    report({...safeAnalysisInfo(diagnostic),status:'started'});
    let response;
    try {
        response = await withRequestLifetime(requestSignal=>service.sendRequest(profileId, messages, maxTokens, {
            signal:requestSignal,
            stream: false,
            extractData: true,
            includePreset: false,
            includeInstruct: true,
        }),{signal,timeoutMs,timeoutMessage:'확장 연결 모델 응답 시간이 초과되었습니다.'});
    } catch (error) {
        const failure=requestFailure(error,'PROFILE','확장 연결 모델');
        // Unknown host errors are not proof of a broken network connection.
        const cause=error?.cause?.cause||error?.cause||error;
        const network=['ECONNRESET','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','ETIMEDOUT'].includes(cause?.code)||/failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(String(cause?.message||''));
        if(failure.code==='PROFILE_NETWORK_ERROR'&&!network){
            failure.code='PROFILE_REQUEST_FAILED';failure.message='확장 연결 모델 요청에 실패했습니다. 호스트에서 구체적인 원인을 제공하지 않았습니다.';
        }
        failure.diagnostic=safeAnalysisInfo({...diagnostic,durationMs:Date.now()-started,httpStatus:failure.httpStatus});
        report({...failure.diagnostic,status:signal?.aborted&&!/TIMEOUT/.test(failure.code)?'cancelled':'failed',errorKind:failure.code});
        throw failure;
    }
    let result;
    const content=response&&typeof response==='object'&&Object.hasOwn(response,'content')?response.content:response;
    const finish=response?.finish_reason??response?.finishReason;
    Object.assign(diagnostic,{phase:'response',responseReceived:true,responseKind:content===null?'null':Array.isArray(content)?'array':typeof content,
        finishReason:['stop','length','max_tokens','content_filter','tool_calls','end_turn'].includes(finish)?finish:'unknown',
        outputChars:typeof content==='string'?content.length:responseSize(content)});
    try {
        if(!testing&&responseFormat==='text'){
            const text=content;
            if(typeof text!=='string'||!text.trim())throw Object.assign(new Error('Empty text response'),{code:'PROFILE_EMPTY_RESPONSE'});
            if([response?.finish_reason,response?.finishReason].includes('length'))throw Object.assign(new Error('Truncated text response'),{code:'PROFILE_TRUNCATED_RESPONSE'});
            result=text.trim();
        }else result = parseReasonerReply(content);
    }
    catch(error) {
        const text=!testing&&responseFormat==='text',code=['length','max_tokens'].includes(finish)?'PROFILE_TRUNCATED_RESPONSE':error?.code||'PROFILE_INVALID_RESPONSE';
        const info=safeAnalysisInfo({...diagnostic,module:text?'src/adapters/connection-profile.js':'src/continuity/json-parser.js',durationMs:Date.now()-started});
        report({...info,status:'failed',errorKind:code});
        throw Object.assign(new Error(text?(code==='PROFILE_TRUNCATED_RESPONSE'?'번역 응답이 출력 한도에서 잘렸습니다. 연결 프로필의 출력 설정을 확인하세요.':'연결 모델이 번역 내용을 반환하지 않았습니다.'):'연결 모델 응답을 읽지 못했습니다. 전체 진단 로그에서 실패 이유를 확인하세요.'),{code,diagnostic:info});
    }
    if (testing && result?.ok !== true) { const info=safeAnalysisInfo({...diagnostic,durationMs:Date.now()-started});report({...info,status:'failed',errorKind:'PROFILE_INVALID_RESPONSE'}); throw Object.assign(new Error('선택한 모델의 연결 확인 응답이 올바르지 않습니다.'),{code:'PROFILE_INVALID_RESPONSE',diagnostic:info}); }
    const info=safeAnalysisInfo({...diagnostic,durationMs:Date.now()-started});
    report({...info,status:'succeeded'});
    return { result, diagnostic:info,profile: { id: profile.id, name: profile.name || profile.id, model: profile.model || '모델 이름 없음' } };
}
function responseSize(value){try{return JSON.stringify(value)?.length||0;}catch{return 0;}}
