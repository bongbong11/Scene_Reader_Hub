export class StaleRunError extends Error {
    constructor() { super('입력이나 채팅이 바뀌어 이전 작업을 취소했습니다.'); this.name = 'StaleRunError'; }
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
