import {hash32,hash53,queryText,recordText} from './identity.js';
// Scene Reader owns retrieval. SillyTavern owns embedding inference, indexes and API secrets.
export const RETRIEVAL_PROVIDERS = Object.freeze({
    transformers: { label: 'SillyTavern 로컬', model: '', secret: '' },
    palm: { label: 'Gemini API', model: 'gemini-embedding-001', secret: 'api_key_makersuite' },
    vertexai: { label: 'Google Vertex AI', model: 'gemini-embedding-001', secret: 'api_key_vertexai' },
    nanogpt: { label: 'NanoGPT Qwen', model: 'Qwen/Qwen3-Embedding-0.6B', secret: 'api_key_nanogpt' },
});





const status = error => String(error?.message || error || '검색 오류').slice(0, 180);

export function createVectorRetrieval({ fetch, getRequestHeaders, getSettings, onProgress = () => {}, timeoutMs = 60000 }) {
    const queries = new Map();
    function boundedSignal(signal) {
        const controller = new AbortController();
        const relay = () => controller.abort(signal?.reason);
        if (signal?.aborted) relay();
        else signal?.addEventListener('abort', relay, { once: true });
        const timer = setTimeout(() => controller.abort(new Error('검색 연결 시간이 초과되었습니다.')), timeoutMs);
        return { signal: controller.signal, finish: () => { clearTimeout(timer); signal?.removeEventListener('abort', relay); } };
    }
    async function post(route, body, signal) {
        const response = await fetch(`/api/vector/${route}`, { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify(body), signal });
        if (!response.ok) throw new Error(`SillyTavern 검색 연결 오류 (${response.status})`);
        return route === 'insert' || route === 'delete' ? null : response.json();
    }
    function config() {
        const settings = getSettings();
        const source = RETRIEVAL_PROVIDERS[settings.retrievalProvider] ? settings.retrievalProvider : 'transformers';
        const model = source === 'transformers' ? '' : String(settings.retrievalModel || RETRIEVAL_PROVIDERS[source].model).trim();
        if (source !== 'transformers' && !model) throw new Error('검색 모델 이름을 설정하세요.');
        return { source, model, ...(source === 'vertexai' ? { api: 'vertexai', vertexai_auth_mode: settings.retrievalVertexAuth === 'full' ? 'full' : 'express', vertexai_region: settings.retrievalVertexRegion || 'global', vertexai_express_project_id: settings.retrievalVertexProject || '' } : {}) };
    }
    function entryMap(kind, items) {
        const map = new Map();
        for (const [index, item] of items.entries()) {
            const text = recordText(kind, item);
            const hash = hash53(JSON.stringify([kind, item.id || index, item, text]));
            if (map.has(hash)) throw new Error('검색 기록 해시 충돌');
            map.set(hash, { hash, index, text, item });
        }
        return map;
    }
    async function search({ kind, bankId, items, transcript, limit = 12, signal }) {
        if (!items.length || !queryText(transcript)) return { indices: [], status: 'empty' };
        const bounded = boundedSignal(signal);
        try {
            const options = config();
            const collectionId = `scene-reader-${kind}-${hash32(bankId)}`;
            const body = { ...options, collectionId };
            const entries = entryMap(kind, items);
            const revision = JSON.stringify([body, [...entries.keys()]]);
            const cacheKey = `${revision}\n${queryText(transcript)}\n${limit}`;
            // The same bank can switch A -> B -> A, or be changed in another tab.
            // A cheap list request checks the actual index; it does not embed text.
            {
                onProgress({kind, phase:'checking'});
                const saved = await post('list', body, bounded.signal);
                if (!Array.isArray(saved)) throw new Error('검색 색인 목록 오류');
                const stale = saved.filter(hash => !entries.has(Number(hash)));
                if (stale.length) await post('delete', { ...body, hashes: stale }, bounded.signal);
                const missing = [...entries.values()].filter(entry => !saved.includes(entry.hash));
                if (missing.length) onProgress({kind, phase:'indexing', count:missing.length});
                for (let offset = 0; offset < missing.length; offset += 20) {
                    await post('insert', { ...body, items: missing.slice(offset, offset + 20).map(({ hash, index, text }) => ({ hash, index, text })) }, bounded.signal);
                }
            }
            if (options.source !== 'transformers' && queries.has(cacheKey)) return { indices: queries.get(cacheKey), status: 'cached' };
            onProgress({kind, phase:'querying'});
            const result = await post('query', { ...body, searchText: queryText(transcript), topK: Math.min(limit, items.length), threshold: 0.01 }, bounded.signal);
            // The native API returns sorted metadata, but no numeric similarity scores.
            // Never use its unfiltered hashes as accepted matches.
            if (!Array.isArray(result?.metadata)) throw new Error('검색 결과 형식 오류');
            const indices = [...new Set(result.metadata.map(value => entries.get(Number(value.hash))?.index).filter(Number.isInteger))].slice(0,limit);
            queries.set(cacheKey, indices);
            if (queries.size > 48) queries.delete(queries.keys().next().value);
            return { indices, status: 'ready' };
        } catch (error) {
            if (signal?.aborted) throw error;
            const reason = bounded.signal.aborted ? '검색 연결 시간이 초과되었습니다.' : status(error);
            onProgress({kind, phase:'fallback', error:reason});
            return { indices: [], status: 'fallback', error: reason };
        } finally {
            bounded.finish();
        }
    }
    async function test(signal) {
        const options = config();
        const body = { ...options, collectionId: 'scene-reader-connection-test' };
        const item = { hash: hash53(String(Date.now()) + Math.random()), text: 'A scene retrieval connection test.', index: 0 };
        const bounded = boundedSignal(signal);
        try {
            const saved = await post('list', body, bounded.signal);
            if (!Array.isArray(saved)) throw new Error('검색 색인 목록 오류');
            if (saved.length) await post('delete', { ...body, hashes: saved }, bounded.signal);
            await post('insert', { ...body, items: [item] }, bounded.signal);
            const result = await post('query', { ...body, searchText: 'scene retrieval test', topK: 1, threshold: 0.01 }, bounded.signal);
            if (!result?.metadata?.some(value => Number(value.hash) === item.hash)) throw new Error('검색 결과를 확인하지 못했습니다.');
        } finally {
            await post('delete', { ...body, hashes: [item.hash] }, bounded.signal).catch(() => {});
            bounded.finish();
        }
        return `${RETRIEVAL_PROVIDERS[options.source].label} 연결 성공`;
    }
    return { search, test, config, clear: () => queries.clear() };
}
