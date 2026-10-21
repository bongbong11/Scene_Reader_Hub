// A dedicated typed-decision transport. Never forwards chat presets or billing overrides.
const MODELS = new Set(['typesafe/jev-1.14', 'typesafe/jev-1.13']);
const BASE = 'https://nano-gpt.com/api/subscription/v1';
const failure = (code, message, status = 400) => Object.assign(new Error(message), {code, status});
function assertSubscription(usage) {
    // The subscription URL alone does NOT prevent paid-balance fallback.
    if (usage?.routing?.paidSpendPolicyAllowsBalance !== false)
        throw failure('NANO_SUBSCRIPTION_ONLY_REQUIRED', '나노GPT API 키의 Billing을 Subscription only로 설정하세요. 잔액 사용 차단을 확인하지 못해 판독하지 않았습니다.');
    if (usage.routing.recommendedMode !== 'subscription')
        throw failure('NANO_SUBSCRIPTION_UNAVAILABLE', '나노GPT 구독을 사용할 수 없습니다. 구독 상태와 사용 한도를 확인하세요. 잔액으로 전환하지 않습니다.', 403);
}
async function readResponse(response) {
    if (!response.ok) {
        const status = response.status;
        throw failure('NANO_UPSTREAM_ERROR', status === 429 ? '나노GPT 사용 한도에 도달했습니다. 잠시 후 다시 확인하세요.' : `나노GPT가 요청을 거절했습니다 (${status}). 키·구독·모델 이용 가능 여부를 확인하세요.`, status);
    }
    try { return await response.json(); } catch { throw failure('NANO_INVALID_RESPONSE', '나노GPT 응답을 읽지 못했습니다.', 502); }
}
async function decide({key, body, signal, fetchImpl = fetch}) {
    if (!key) throw failure('NANO_KEY_MISSING', '나노GPT 구독 전용 API 키를 먼저 저장하세요.', 401);
    if (!MODELS.has(body?.model)) throw failure('NANO_MODEL_INVALID', 'Jev 1.14 또는 Jev 1.13을 선택하세요.');
    if (!body.questions || typeof body.questions !== 'object' || Array.isArray(body.questions) || !Object.keys(body.questions).length)
        throw failure('NANO_QUESTIONS_MISSING', 'Jev 판독 질문이 없습니다.');
    const payload = JSON.stringify({model:body.model, messages:[{role:'user', content:JSON.stringify(body.state ?? {})}], stream:false, response_format:{type:'questions', questions:body.questions}});
    if (Buffer.byteLength(payload) > 1_000_000) throw failure('NANO_REQUEST_TOO_LARGE', 'Jev 판독 요청이 너무 큽니다.', 413);
    const headers = {Authorization:`Bearer ${key}`, 'Content-Type':'application/json', Accept:'application/json'};
    // Check current policy on every call, including connection tests. No paid retry route.
    const usage = await readResponse(await fetchImpl(`${BASE}/usage`, {headers, signal, redirect:'error'}));
    assertSubscription(usage);
    signal?.throwIfAborted();
    const data = await readResponse(await fetchImpl(`${BASE}/chat/completions`, {method:'POST', headers, body:payload, signal, redirect:'error'}));
    let result;
    try { result = JSON.parse(data?.choices?.[0]?.message?.content); } catch { throw failure('NANO_INVALID_RESPONSE', '나노GPT에서 Jev 판독 JSON을 받지 못했습니다.', 502); }
    if (!result?.answers || typeof result.answers !== 'object' || Array.isArray(result.answers)) throw failure('NANO_INVALID_RESPONSE', '나노GPT 응답에 Jev 판독값이 없습니다.', 502);
    return {model:body.model,answers:result.answers};
}
function register(router, {pathsFor, load, save, storageHandler}) {
    router.post('/storage/nanogpt/key', storageHandler(async (req,res) => {
        const key=String(req.body?.key||'').trim();
        if(key.length>2048 || /[\r\n]/.test(key))throw failure('NANO_KEY_INVALID','API 키 형식을 확인하세요.');
        const files=pathsFor(req), saved={...await load(files.root,files.secret,{})};
        if(key)saved.nanoJevKey=key;else delete saved.nanoJevKey;
        await save(files.root,files.secret,saved);
        res.json({ok:true,keyStatus:key?'저장됨':'저장된 키 없음'});
    }));
    router.post('/nanogpt/systemone', async (req,res) => {
        const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),30000);
        const disconnected=()=>{if(!res.writableEnded)controller.abort();};
        res.on('close',disconnected);
        try {
            const files=pathsFor(req), saved=await load(files.root,files.secret,{});
            const key=String(req.get('X-NanoGPT-Key')||saved?.nanoJevKey||'').trim();
            const result=await decide({key,body:req.body,signal:controller.signal});
            if(!res.destroyed)res.json(result);
        } catch(error) {
            if(!res.destroyed)res.status(error.status|| (controller.signal.aborted?504:502)).json({error:error.code?error.message:'나노GPT 연결에 실패했습니다. 잠시 후 다시 확인하세요.',code:error.code||'NANO_CONNECTION_FAILED'});
        } finally {clearTimeout(timeout);res.off('close',disconnected);}
    });
}
module.exports={register,decide,assertSubscription};
