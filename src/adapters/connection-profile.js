import {parseReasonerReply} from '../continuity/json-parser.js';
import { withRequestLifetime } from './request-lifetime.js';
import { requestFailure } from './failure-info.js';
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

export async function requestWithConnectionProfile(service, profileId, system, state, { testing = false, maxTokens = REASONER_MAX_TOKENS, signal, timeoutMs=60000, onDiagnostic=()=>{} } = {}) {
    const started=Date.now();
    const report=detail=>{try{onDiagnostic({module:'src/adapters/connection-profile.js',testing,timeoutMs,...detail});}catch{/* diagnostic only */}};
    report({status:'started'});
    let profile;
    try { profile=service.getProfile(profileId); service.validateProfile(profile); }
    catch { report({status:'failed',errorKind:'PROFILE_UNAVAILABLE'}); throw Object.assign(new Error('확장 연결 프로필을 찾지 못했습니다. 설정에서 사용할 프로필을 선택하세요.'),{code:'PROFILE_UNAVAILABLE'}); }
    const messages = testing
        ? [{ role: 'system', content: 'Return a JSON object only.' }, { role: 'user', content: 'Return exactly {"ok":true}.' }]
        : [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(state) }];
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
        report({status:signal?.aborted?'cancelled':'failed',durationMs:Date.now()-started,errorKind:failure.code,httpStatus:failure.httpStatus});
        throw failure;
    }
    let result;
    try { result = parseReasonerReply(response?.content ?? response); }
    catch { report({status:'failed',durationMs:Date.now()-started,errorKind:'PROFILE_INVALID_RESPONSE'}); throw Object.assign(new Error('연결 모델이 완전한 JSON을 반환하지 않았습니다. 출력 길이와 연결 프로필을 확인하세요.'),{code:'PROFILE_INVALID_RESPONSE'}); }
    if (testing && result?.ok !== true) { report({status:'failed',errorKind:'PROFILE_INVALID_RESPONSE'}); throw Object.assign(new Error('선택한 모델의 연결 확인 응답이 올바르지 않습니다.'),{code:'PROFILE_INVALID_RESPONSE'}); }
    report({status:'succeeded',durationMs:Date.now()-started});
    return { result, profile: { id: profile.id, name: profile.name || profile.id, model: profile.model || '모델 이름 없음' } };
}
