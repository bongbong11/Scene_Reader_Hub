// Account-scoped request leases. Maintenance yields to ordinary storage traffic.
const states=new Map();
function state(root){if(!states.has(root))states.set(root,{active:0,last:0});return states.get(root);}
function schedule(root){
    const s=state(root);clearTimeout(s.timer);
    if(s.active||s.running)return;
    s.timer=setTimeout(()=>{s.timer=null;if(s.active)return;
        s.controller=new AbortController();
        s.running=require('./reclaim.cjs').reclaim(root,{signal:s.controller.signal})
            .then(result=>{s.result=result;})
            .catch(error=>{if(error.name!=='AbortError')s.result={status:'deferred',code:error.code||'STORAGE_MAINTENANCE_FAILED'};})
            .finally(()=>{s.running=null;s.controller=null;s.last=Date.now();if(!s.active&&!s.stopped)schedule(root);});
    },Math.max(45000,300000-(Date.now()-s.last)));
    s.timer.unref?.();
}
async function run(root,task){
    const s=state(root);s.active++;clearTimeout(s.timer);
    try{s.controller?.abort();if(s.running)await s.running;return await task();}
    finally{s.active--;if(!s.active&&!s.stopped)schedule(root);}
}
function status(root){return state(root).result||{status:'waiting'};}
function stop(root){const s=states.get(root);if(!s)return;s.stopped=true;clearTimeout(s.timer);s.controller?.abort();states.delete(root);}
module.exports={run,schedule,status,stop};
