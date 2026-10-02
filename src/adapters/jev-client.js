// Extracted from Scene Reader 0.26.2; behavior preserved.
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

async function callJev(body, timeoutMs = 30000, signal = null) {
    const key = deps.getSavedKey();
    if (!key && !deps.serverKeyStatus.startsWith('저장됨')) throw new Error('Jev API 키를 먼저 저장하세요.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await deps.fetch(deps.JEV_API_URL, {
            method: 'POST',
            headers: { ...deps.getRequestHeaders(), ...(key ? { 'X-Jev-Key': key } : {}), 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
            signal: signal ? AbortSignal.any([signal,controller.signal]) : controller.signal,
        });
        let data = null;
        try { data = await response.json(); } catch { /* status still explains failure */ }
        if (!response.ok) {
            if ([401, 403].includes(response.status)) throw new Error(`Jev 키 인증 실패 (${response.status})`);
            throw new Error(pluginError(response.status, data, `Jev API 응답 오류 (${response.status})`));
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
        return data;
    } catch (error) {
        if (signal?.aborted) throw new deps.StaleRunError();
        if (error.name === 'AbortError') throw new Error('Jev 연결 시간이 초과되었습니다.');
        if (error instanceof TypeError) throw new Error('씬판독기 Jev 서버 플러그인에 연결하지 못했습니다.');
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}
return {apiError, pluginError, callJev};
}
