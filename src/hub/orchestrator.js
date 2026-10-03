import { createEventJournal } from '../debug/events.js';
import { withDeadline } from '../lifecycle/watchdog.js';
import { createCommandBus } from './commands.js';

// Domain modules choose values. Hub owns run identity, sequencing and completion.
export function createHub({jobs,getIdentity,StaleRunError,journal=createEventJournal(),now=()=>Date.now()}={}) {
    let sequence=0,active=null,last=null,preparation=null;
    const commands=createCommandBus({onDispatch:name=>event('command','COMMAND_DISPATCHED',{name})});
    const listeners=new Set();
    const state={status:'idle',stage:'',cycleId:'',inputKey:'',trigger:'',revision:0};
    function event(stage,code,detail={},run=active?.run) {
        const result=journal.emit({cycleId:run?.cycleId||state.cycleId,stage,code,module:detail.module||'',...detail});
        for(const listener of listeners)try{listener();}catch{/* UI cannot affect execution. */}
        return result;
    }
    function setState(patch) { Object.assign(state,patch,{revision:state.revision+1}); }
    async function stage(run,name,task,{timeoutMs=0,module=''}={}) {
        run.assert();
        const start=now();
        if(active?.run===run)setState({stage:name,status:'running'});
        event(name,'STAGE_STARTED',{status:'started',module},run);
        try {
            const result=await withDeadline(task,{stage:name,timeoutMs,abort:error=>{run.timeout=error;run.controller.abort(error);}});
            run.assert();
            event(name,'STAGE_FINISHED',{status:'succeeded',module,durationMs:now()-start},run);
            return result;
        } catch(error) {
            event(name,error.code||(!run.valid()?'STALE_RUN':'STAGE_FAILED'),{status:!run.valid()&&!run.timeout?'cancelled':'failed',module,durationMs:now()-start,errorKind:error.code || error.name || 'Error'},run);
            throw error;
        }
    }
    function run({key,inputKey='',trigger='manual'},task) {
        if(active?.key===key&&active.run.valid()){event('lifecycle','RUN_JOINED',{trigger},active.run);return active.promise;}
        const scope=jobs.begin('judge');
        const cycleId=`hub-${++sequence}`;
        const token={...scope,cycleId,stage:(name,fn,options)=>stage(token,name,fn,options)};
        setState({status:'running',stage:'context',cycleId,inputKey,trigger});
        event('lifecycle','RUN_STARTED',{inputKey,trigger},token);
        // Defer execution until active ownership is installed.
        const promise=Promise.resolve().then(()=>task(token)).then(result=>{
            if(active?.run===token){setState({status:result?'prepared':'skipped',stage:'complete'});last={cycleId,inputKey,status:state.status};}
            event('lifecycle',result?'RUN_PREPARED':'RUN_SKIPPED',{status:result?'succeeded':'skipped'},token);
            return result;
        },error=>{
            const failure=token.timeout||error;
            const cancelled=!token.owns()||(!token.timeout&&(error instanceof StaleRunError||!token.valid()));
            if(active?.run===token)setState({status:cancelled?'cancelled':'failed',stage:failure.stage||state.stage});
            event(failure.stage||'lifecycle',cancelled?'RUN_CANCELLED':failure.code||'RUN_FAILED',{status:cancelled?'cancelled':'failed',error:String(failure.message||failure)},token);
            if(cancelled)return null;
            throw failure;
        }).finally(()=>{scope.finish();if(active?.promise===promise)active=null;});
        active={key,run:token,promise};
        return promise;
    }
    function ensurePrepared(identity,task) {
        if(preparation?.key===identity.key&&preparation.identity===getIdentity()&&(!preparation.settled||identity.trigger==='interceptor')){
            event('trigger','PREPARATION_JOINED',{trigger:identity.trigger});return preparation.promise;
        }
        const entry={key:identity.key,identity:getIdentity(),request:identity.request,trigger:identity.trigger};
        entry.promise=Promise.resolve().then(task).catch(error=>{if(preparation===entry)preparation=null;throw error;}).finally(()=>{entry.settled=true;});
        preparation=entry;
        event('trigger','PREPARATION_STARTED',{trigger:identity.trigger});
        return entry.promise;
    }
    function invalidate(reason='input_changed') {
        preparation=null;jobs.invalidate();
        setState({status:'cancelled',stage:'lifecycle'});event('lifecycle','INVALIDATED',{reason});
    }
    function endCycle() { preparation=null;event('lifecycle','GENERATION_ENDED'); }
    function report(stage,code,detail={}) { return event(stage,code,detail); }
    return {run,stage,ensurePrepared,invalidate,endCycle,report,commands,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},
        pendingRequest:()=>preparation?.identity===getIdentity()?preparation?.request:null,
        waitPrepared:()=>preparation?.identity===getIdentity()?preparation.promise:Promise.resolve(),
        snapshot:()=>({state:{...state},last:last?{...last}:null,events:journal.snapshot(),lastFailure:journal.lastFailure?.() || null}),
    };
}
