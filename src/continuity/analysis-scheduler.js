// Serialize distinct completed turns; never replace an earlier queued turn.
export function createAnalysisScheduler({onError=()=>{},onSettled=()=>{}}={}) {
    let active=null,epoch=0;
    const queued=[];
    function drain(){
        if(active||!queued.length)return;
        const entry=queued.shift(),controller=new AbortController(),token=epoch;
        const job={controller};active=job;
        job.promise=Promise.resolve().then(()=>entry.task({signal:controller.signal,current:()=>token===epoch&&!controller.signal.aborted}))
            .catch(error=>{if(!controller.signal.aborted)try{onError(error);}catch{}})
            .finally(()=>{if(active===job){active=null;drain();}try{onSettled();}catch{}});
        void job.promise.then(entry.resolve);
    }
    function request(task){let resolve;const promise=new Promise(done=>resolve=done);queued.push({task,resolve,promise});drain();return promise;}
    function cancel(){epoch++;for(const entry of queued.splice(0))entry.resolve({status:'cancelled'});active?.controller.abort();active=null;}
    return {request,cancel,get busy(){return Boolean(active||queued.length);},get pending(){return Boolean(active||queued.length);},get completion(){return Promise.all([active?.promise,...queued.map(entry=>entry.promise)]);}};
}
