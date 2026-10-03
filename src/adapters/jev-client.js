import { withRequestLifetime } from './request-lifetime.js';
import { requestFailure } from './failure-info.js';
import { jevProvider, browserJevKey, JEV_PROVIDERS } from './jev-providers.js';
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
    const provider = jevProvider(connection ? {jevProvider:connection.provider} : deps.settings), config = JEV_PROVIDERS[provider];
    const direct = Boolean(config.url);
    const key = connection ? connection.key : direct ? browserJevKey(deps.localStorage, provider) : deps.getSavedKey();
    if (!key && (direct || !deps.serverKeyStatus?.startsWith('저장됨'))) {
        deps.noteDiagnostic?.('jev_request',{module:'src/adapters/jev-client.js',provider,status:'failed',errorKind:'JEV_CREDENTIAL_MISSING'});
        throw Object.assign(new Error(`${config.label} Jev API 키를 먼저 저장하세요.`),{code:'JEV_CREDENTIAL_MISSING'});
    }
    timeoutMs=Math.min(timeoutMs,direct?60000:30000);
    const started = Date.now();
    const requestBody = JSON.stringify(direct ? { ...body, model:config.model } : body);
    const report = detail => { try { deps.noteDiagnostic?.('jev_request',{module:'src/adapters/jev-client.js',provider,requestChars:requestBody.length,timeoutMs,questionCount:Object.keys(body?.questions || {}).length,requestKind:body?.questions?.scene_level?'scene':'decision',...detail}); } catch { /* diagnostic only */ } };
    report({status:'started'});
    try {
        const {response,data} = await withRequestLifetime(async requestSignal => {
        const response = await deps.fetch(config.url || deps.JEV_API_URL, {
            method: 'POST',
            headers: { ...(direct ? { Authorization: `Bearer ${key}` } : { ...deps.getRequestHeaders(), ...(key ? { 'X-Jev-Key': key } : {}) }), 'Content-Type': 'application/json', Accept: 'application/json' },
            body: requestBody,
            ...(direct ? { credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' } : {}),
            signal: requestSignal,
        });
        let data = null;
        try { data = await response.json(); } catch { /* status still explains failure */ }
        return {response,data};
        }, {signal,timeoutMs,timeoutMessage:'Jev 연결 시간이 초과되었습니다.'});
        signal?.throwIfAborted();
        if (!response.ok) {
            if (!direct && response.status===404) throw Object.assign(new Error(pluginError(404,null,'')),{code:'JEV_PLUGIN_NOT_FOUND',httpStatus:404});
            throw requestFailure({httpStatus:response.status},'JEV',`${config.label} Jev 연결`);
        }
        if (!data?.answers || typeof data.answers !== 'object' || Array.isArray(data.answers) || !Object.keys(data.answers).length) throw new Error('Jev 응답에 판정 결과가 없습니다.');
        if (body?.questions?.scene_level) {
            for (const key of ['scene_level','scene_phase','scene_evidence']) {
                const selected=String(data.answers[key]?.choice ?? '');
                if (!Object.hasOwn(body.questions[key]?.criteria || {},selected)) throw new Error(`Jev 장면 판정 형식 오류: ${key}`);
            }
        }
        const requested=Object.entries(body?.questions||{});
        const invalidKeys=requested.filter(([name,question])=>{
            const answer=data.answers[name];
            if(!answer || typeof answer!=='object' || Array.isArray(answer))return true;
            if(question?.type==='noul')return !Number.isFinite(Number(answer.noul)) && !Object.hasOwn(question?.criteria||{},String(answer.choice??''));
            return !Object.hasOwn(question?.criteria||{},String(answer.choice??''));
        }).map(([name])=>name);
        if(requested.length && invalidKeys.length===requested.length)throw new Error('Jev가 요청한 판정 항목에 유효하게 답하지 않았습니다.');
        data.answerDiagnostics={requested:requested.length,valid:requested.length-invalidKeys.length,invalidKeys};
        report({status:invalidKeys.length?'degraded':'succeeded',durationMs:Date.now()-started,validCount:requested.length-invalidKeys.length,invalidCount:invalidKeys.length});
        return data;
    } catch (error) {
        report({status:signal?.aborted?'cancelled':'failed',durationMs:Date.now()-started,errorKind:error.code || (error instanceof TypeError?'JEV_NETWORK_ERROR':'JEV_INVALID_RESPONSE'),httpStatus:error.httpStatus || 0});
        if (signal?.aborted) throw new deps.StaleRunError();
        if (error.code === 'REQUEST_TIMEOUT' || error.name === 'AbortError') throw Object.assign(new Error('Jev 연결 시간이 초과되었습니다.'),{code:'JEV_TIMEOUT'});
        if (error instanceof TypeError) throw Object.assign(new Error(direct ? `${config.label}에 직접 연결하지 못했습니다. 인터넷 연결과 브라우저의 연결 차단 여부를 확인하세요.` : '씬판독기 Jev 서버 플러그인에 연결하지 못했습니다.'),{code:'JEV_NETWORK_ERROR'});
        throw error;
    }
}
return {apiError, pluginError, callJev};
}
