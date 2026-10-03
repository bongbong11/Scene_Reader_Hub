export function createPipeline({stages,onError,finalize}) {
    return async function execute(run,options={}) {
        const frame={force:false,pendingUserText:'',cycleSalt:'',...options};
        try {
            for(const descriptor of stages) {
                try { await run.stage(descriptor.stage,()=>descriptor.execute(run,frame),{module:descriptor.module,timeoutMs:descriptor.timeoutMs||0}); }
                catch(error) { if(!error.stage)error.stage=descriptor.stage; throw error; }
                if(frame.done)return frame.result;
            }
        } catch(error) { return await onError(error,run); }
        finally { finalize(run); }
    };
}
