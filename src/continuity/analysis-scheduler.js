// One auxiliary request at a time; a new output supplies one bounded follow-up.
// There is no timer loop and RP generation never awaits this scheduler.
export function createAnalysisScheduler({onError=()=>{},onSettled=()=>{}}={}) {
 let active=null,queued=null,epoch=0;
 function request(task) {
  if(active){queued?.resolve({status:'cancelled'});let resolve;const promise=new Promise(done=>{resolve=done;});queued={task,resolve};return promise;}
  const controller=new AbortController(),token=epoch;
  const job={controller,promise:null};active=job;
  job.promise=Promise.resolve().then(()=>task({signal:controller.signal,current:()=>token===epoch&&!controller.signal.aborted}))
   .catch(error=>{if(!controller.signal.aborted)try{onError(error);}catch{/* Diagnostic observers cannot reject a detached job. */}})
   .finally(()=>{if(active!==job)return;active=null;const next=queued;queued=null;if(next)request(next.task).then(next.resolve);try{onSettled();}catch{/* Rendering is independent of the saved result. */}});
  return job.promise;
 }
 function cancel(){epoch++;queued?.resolve({status:'cancelled'});queued=null;active?.controller.abort();}
 return {request,cancel,get busy(){return Boolean(active&&!active.controller.signal.aborted);},get pending(){return Boolean(active);},get completion(){return active?.promise||Promise.resolve();}};
}
