import {createRequestQueue} from '../adapters/request-lifetime.js';

// Remote reads may overlap; writes and local inference run alone. FIFO keeps
// maintenance from starving behind a stream of new searches.
export function createRetrievalSchedule() {
    const waiting=[], banks=new Map();
    let active=0, exclusive=false;
    function drain() {
        while(waiting.length && !exclusive && active<2) {
            const job=waiting[0];
            if(job.exclusive && active)return;
            waiting.shift();job.signal?.removeEventListener('abort',job.cancel);
            if(job.signal?.aborted){job.reject(job.signal.reason);continue;}
            active++;exclusive=job.exclusive;
            Promise.resolve().then(()=>{job.signal?.throwIfAborted();return job.task();})
                .then(job.resolve,job.reject).finally(()=>{active--;if(job.exclusive)exclusive=false;drain();});
        }
    }
    function request(task,{signal,exclusive:alone=false}={}) {
        return new Promise((resolve,reject)=>{
            if(signal?.aborted)return reject(signal.reason);
            if(waiting.length>=32)return reject(Object.assign(new Error('검색 대기 작업이 많습니다.'),{code:'REQUEST_QUEUE_FULL'}));
            const job={task,signal,exclusive:alone,resolve,reject,cancel:()=>{
                const index=waiting.indexOf(job);if(index>=0)waiting.splice(index,1);
                reject(signal.reason);drain();
            }};
            signal?.addEventListener('abort',job.cancel,{once:true});waiting.push(job);drain();
        });
    }
    async function bank(key,task,signal) {
        let slot=banks.get(key);
        if(!slot){slot={enqueue:createRequestQueue(),users:0};banks.set(key,slot);}
        slot.users++;
        try{return await slot.enqueue(()=>{signal?.throwIfAborted();return task();},signal);}
        finally{if(--slot.users===0)banks.delete(key);}
    }
    return {request,bank};
}
