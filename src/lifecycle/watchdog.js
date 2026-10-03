export class StageTimeoutError extends Error {
    constructor(stage,timeoutMs) { super(`${stage} 단계의 대기 시간이 초과되었습니다.`);this.name='StageTimeoutError';this.code='WATCHDOG_TIMEOUT';this.stage=stage;this.timeoutMs=timeoutMs; }
}
export async function withDeadline(task,{stage,timeoutMs=0,abort=()=>{},signal}={}) {
    if(signal?.aborted)throw signal.reason;
    if(!timeoutMs && !signal) return task();
    let timer,relay;
    const waits=[Promise.resolve().then(()=>{signal?.throwIfAborted();return task();})];
    if(signal)waits.push(new Promise((_,reject)=>{
        relay=()=>reject(signal.reason);
        signal.addEventListener('abort',relay,{once:true});
    }));
    if(timeoutMs)waits.push(new Promise((_,reject) => {
        timer=setTimeout(()=>{const error=new StageTimeoutError(stage,timeoutMs);abort(error);reject(error);},timeoutMs);
    }));
    try { return await Promise.race(waits); }
    finally { clearTimeout(timer);if(relay)signal.removeEventListener('abort',relay); }
}
