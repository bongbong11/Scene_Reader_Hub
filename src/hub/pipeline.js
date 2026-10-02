export function createPipeline({stages,preparationCount=3,onError,finalize}) {
    return async function execute(run,options={}) {
        const frame={force:false,pendingUserText:'',cycleSalt:'',...options};
        const step=async descriptor=>{
            await run.stage(descriptor.stage,()=>descriptor.execute(run,frame),{module:descriptor.module,timeoutMs:descriptor.timeoutMs||0});
        };
        for(const descriptor of stages.slice(0,preparationCount)) {
            await step(descriptor);
            if(frame.done)return frame.result;
        }
        try {
            for(const descriptor of stages.slice(preparationCount)) {
                await step(descriptor);
                if(frame.done)return frame.result;
            }
        } catch(error) { return onError(error,run); }
        finally { finalize(run); }
    };
}
