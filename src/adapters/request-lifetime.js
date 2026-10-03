// Bound both headers and response-body waits, even if a host fetch ignores abort.
// No retry: a timed-out request may already have been accepted by the server.
export async function withRequestLifetime(task, { signal, timeoutMs, timeoutMessage = '연결 시간이 초과되었습니다.' } = {}) {
    const controller = new AbortController();
    let timer, rejectAbort;
    const stopped = new Promise((_, reject) => { rejectAbort = reject; });
    const abort = reason => { controller.abort(reason); rejectAbort(reason); };
    const relay = () => abort(signal.reason || new DOMException('Cancelled', 'AbortError'));
    if (signal?.aborted) throw signal.reason || new DOMException('Cancelled', 'AbortError');
    signal?.addEventListener('abort', relay, { once: true });
    if (timeoutMs > 0) timer = setTimeout(() => abort(Object.assign(new Error(timeoutMessage), { code: 'REQUEST_TIMEOUT' })), timeoutMs);
    try { return await Promise.race([Promise.resolve().then(() => { controller.signal.throwIfAborted(); return task(controller.signal); }), stopped]); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', relay); }
}

// Only this extension's work is queued; cancellation removes pending jobs.
export function createRequestQueue({ limit = 1, maxPending = 32 } = {}) {
    let active = 0;
    const waiting = [];
    function drain() {
        while (active < limit && waiting.length) {
            const job = waiting.shift();
            job.signal?.removeEventListener('abort', job.cancel);
            if (job.signal?.aborted) { job.reject(job.signal.reason); continue; }
            active++;
            Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => { active--; drain(); });
        }
    }
    return (task, signal) => new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason);
        if (waiting.length >= maxPending) return reject(Object.assign(new Error('검색 대기 작업이 많아 이번 판독을 중단했습니다.'), { code:'REQUEST_QUEUE_FULL' }));
        const job = { task, signal, resolve, reject, cancel: () => {
            const index = waiting.indexOf(job);
            if (index >= 0) waiting.splice(index, 1);
            reject(signal.reason);
        } };
        signal?.addEventListener('abort', job.cancel, { once:true });
        waiting.push(job); drain();
    });
}
