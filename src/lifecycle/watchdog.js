export class StageTimeoutError extends Error {
    constructor(stage,timeoutMs) { super(`${stage} 단계의 대기 시간이 초과되었습니다.`);this.name='StageTimeoutError';this.code='WATCHDOG_TIMEOUT';this.stage=stage;this.timeoutMs=timeoutMs; }
}
export async function withDeadline(task,{stage,timeoutMs=0,abort=()=>{}}={}) {
    if(!timeoutMs) return task();
    let timer;
    const deadline = new Promise((_,reject) => {
        timer=setTimeout(()=>{const error=new StageTimeoutError(stage,timeoutMs);abort(error);reject(error);},timeoutMs);
    });
    try { return await Promise.race([Promise.resolve().then(task),deadline]); }
    finally { clearTimeout(timer); }
}
