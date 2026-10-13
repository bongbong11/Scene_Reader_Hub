import {normalizeJevAnswers} from './jev-answer-normalizer.js';
import {withRequestLifetime} from './request-lifetime.js';
import {requestFailure} from './failure-info.js';
export function createJevClient(deps) {
function apiError(data, fallback) {
    if (typeof data?.detail === 'string') return data.detail;
    if (typeof data?.error === 'string') return data.error;
    if (typeof data?.error?.message === 'string') return data.error.message;
    return fallback;
}

function pluginError(status, data, fallback) {
    if (status === 404) return '씬판독기 Jev 서버 플러그인을 찾지 못했습니다. 설치 안내에 따라 server-plugin을 설치하고 SillyTavern을 다시 시작하세요.';
    return apiError(data, fallback);
}

async function callJev(body, timeoutMs = 30000, signal = null, connection = null) {
    const provider = 'typesafe';
    const key = String(connection ? connection.key || '' : deps.getSavedKey() || '').trim();
    // Reject recognizable foreign credentials without sending them to another service.
    if (/^(sk-or-v1-|vck_)/.test(key)) throw Object.assign(new Error('공홈 TypeSafe에서 발급받은 Jev 키를 입력하세요.'), {code:'JEV_CREDENTIAL_PROVIDER'});
    if (!key && !deps.serverKeyStatus?.startsWith('저장됨')) {
        deps.noteDiagnostic?.('jev_request',{module:'src/adapters/jev-client.js',provider,status:'failed',errorKind:'JEV_CREDENTIAL_MISSING'});
        throw Object.assign(new Error('공홈 TypeSafe Jev API 키를 먼저 저장하세요.'),{code:'JEV_CREDENTIAL_MISSING'});
    }
    timeoutMs=Math.min(timeoutMs,30000);
    const started = Date.now();
    const requestBody = JSON.stringify({...body,model:deps.JEV_MODEL || 'jev-latest'});
    const report = detail => { try { deps.noteDiagnostic?.('jev_request',{module:'src/adapters/jev-client.js',provider,requestChars:requestBody.length,timeoutMs,questionCount:Object.keys(body?.questions || {}).length,requestKind:body?.questions?.scene_status||body?.questions?.scene_level?'scene':'decision',...detail}); } catch { /* diagnostic only */ } };
    report({status:'started'});
    try {
        const {response,data} = await withRequestLifetime(async requestSignal => {
        const response = await deps.fetch(deps.JEV_API_URL, {
            method: 'POST',
            headers: { ...deps.getRequestHeaders(), ...(key ? { 'X-Jev-Key': key } : {}), 'Content-Type': 'application/json', Accept: 'application/json' },
            body: requestBody,
            signal: requestSignal,
        });
        let data = null;
        try { data = await response.json(); } catch { /* status still explains failure */ }
        return {response,data};
        }, {signal,timeoutMs,timeoutMessage:'Jev 연결 시간이 초과되었습니다.'});
        signal?.throwIfAborted();
        if (!response.ok) {
            if (response.status===404) throw Object.assign(new Error(pluginError(404,null,'')),{code:'JEV_PLUGIN_NOT_FOUND',httpStatus:404});
            throw requestFailure({httpStatus:response.status},'JEV','공홈 TypeSafe Jev 연결');
        }
        if (!data?.answers || typeof data.answers !== 'object' || Array.isArray(data.answers) || !Object.keys(data.answers).length) throw new Error('Jev 응답에 판정 결과가 없습니다.');
        const requested=Object.entries(body?.questions||{});
        data.answers=normalizeJevAnswers(data.answers,body?.questions||{});
        const invalidKeys=requested.filter(([name])=>data.answers[name].responseState!=='valid').map(([name])=>name);
        if(requested.length && invalidKeys.length===requested.length)throw new Error('Jev가 요청한 판정 항목에 유효하게 답하지 않았습니다.');
        data.answerDiagnostics={requested:requested.length,valid:requested.length-invalidKeys.length,invalidKeys};
        report({status:invalidKeys.length?'degraded':'succeeded',durationMs:Date.now()-started,validCount:requested.length-invalidKeys.length,invalidCount:invalidKeys.length});
        return data;
    } catch (error) {
        report({status:signal?.aborted?'cancelled':'failed',durationMs:Date.now()-started,errorKind:error.code || (error instanceof TypeError?'JEV_NETWORK_ERROR':'JEV_INVALID_RESPONSE'),httpStatus:error.httpStatus || 0});
        if (signal?.aborted) throw new deps.StaleRunError();
        if (error.code === 'REQUEST_TIMEOUT' || error.name === 'AbortError') throw Object.assign(new Error('Jev 연결 시간이 초과되었습니다.'),{code:'JEV_TIMEOUT'});
        if (error instanceof TypeError) throw Object.assign(new Error('씬판독기 Jev 서버 플러그인에 연결하지 못했습니다.'),{code:'JEV_NETWORK_ERROR'});
        throw error;
    }
}
return {apiError, pluginError, callJev};
}
