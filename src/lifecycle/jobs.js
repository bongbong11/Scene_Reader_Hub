export class StaleRunError extends Error {
    constructor() { super('입력이나 채팅이 바뀌어 이전 작업을 취소했습니다.'); this.name = 'StaleRunError'; }
}

// Detached results wait, never the foreground model request. The timer only
// observes host generation completion, which does not emit Hub state changes.
export async function waitForIdle({hub,signal,isBusy=()=>false,timeoutMs=120000}) {
    const busy=()=>hub?.snapshot().state.status==='running'||isBusy();
    signal?.throwIfAborted();
    if(!busy())return;
    await new Promise((resolve,reject)=>{
        let poll,deadline,settled=false,unsubscribe=()=>{};
        const finish=error=>{if(settled)return;settled=true;clearInterval(poll);clearTimeout(deadline);unsubscribe();signal?.removeEventListener('abort',abort);error?reject(error):resolve();};
        const abort=()=>finish(signal.reason||Object.assign(new Error('배경 작업 취소'),{name:'AbortError'}));
        const check=()=>{if(!busy())finish();};
        poll=setInterval(check,100);
        deadline=setTimeout(()=>finish(Object.assign(new Error('배경 결과 저장 대기 시간 초과'),{code:'ANALYSIS_BUSY_TIMEOUT'})),timeoutMs);
        unsubscribe=hub?.subscribe?.(check)||(()=>{});
        signal?.addEventListener('abort',abort,{once:true});
        if(signal?.aborted)abort();else check();
    });
}

/** Results are scoped to the context captured before the first await. */
export function createJobScope(readIdentity) {
    let epoch = 0;
    const active = new Map();
    return {
        invalidate() { epoch += 1; for (const job of active.values()) job.controller.abort(); active.clear(); },
        begin(slot, revision = '') {
            active.get(slot)?.controller.abort();
            const identity = readIdentity();
            const startedEpoch = epoch;
            const controller = new AbortController();
            const job = {
                identity, revision, controller,
                owns() { return startedEpoch === epoch && identity === readIdentity() && active.get(slot) === job; },
                valid() { return !controller.signal.aborted && startedEpoch === epoch && identity === readIdentity() && active.get(slot) === job; },
                assert() { if (!job.valid()) throw new StaleRunError(); },
                finish() { if (active.get(slot) === job) active.delete(slot); },
            };
            active.set(slot, job);
            return job;
        },
    };
}

/** Serialize writes using the snapshot supplied at enqueue time, not live UI state. */
export function createWriteQueue() {
    const queues = new Map();
    return function enqueue(key, task) {
        const previous = queues.get(key) || Promise.resolve();
        const next = previous.catch(() => {}).then(task);
        queues.set(key, next);
        void next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => {});
        return next;
    };
}
