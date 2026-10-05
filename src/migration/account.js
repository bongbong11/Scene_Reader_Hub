import {fail} from '../storage/shared-document.js';
export function createAccountMigration(post,getScope=()=>undefined,getSource=()=>undefined) {
 let busy=false,controller,state,available,scope;const listeners=new Set();
 const notify=()=>{for(const listener of listeners)try{listener(state);}catch{}};
 async function inspect({fresh=false}={}) {
  const currentScope=getScope();if(currentScope!==scope){scope=currentScope;state=undefined;available=undefined;}
  if(!fresh&&state)return state;
  if(available===undefined)available=Boolean((await post('v2/capabilities',{}, {allowFailure:true}))?.schemaVersion===2);
  if(!available)return {status:'upgrade_required'};
  const result=await post('v2/migration/status');state=result.migration;notify();return state;
 }
 async function start() {
  if(busy)throw fail('SHARED_OPERATION_BUSY','자료 이사를 진행 중입니다.');
  busy=true;controller=new AbortController();const signal=controller.signal;
  try {
   await inspect({fresh:true});if(!available)throw fail('STORAGE_PLUGIN_UPGRADE_REQUIRED','새 저장 기능을 쓰려면 씬판독기 서버 플러그인을 업데이트해 주세요.');
   state={...state,status:'running'};notify();await post('v2/migration/start',{source:getSource()}, {signal});
   while(true){signal.throwIfAborted();const result=await post('v2/migration/status',{}, {signal});state=result.migration;notify();if(['completed','cleaned'].includes(state.status))return state;if(state.status==='failed'||state.status==='paused')throw fail(state.code||'STORAGE_MIGRATION_FAILED',state.error||'자료 이사가 중단됐습니다. 이어서 진행할 수 있어요.');await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},400);const abort=()=>{clearTimeout(timer);reject(signal.reason);};signal.addEventListener('abort',abort,{once:true});});}
  }finally{busy=false;controller=null;}
 }
 return {inspect,start,cleanup:async()=>{const result=await post('v2/migration/cleanup');state=result.migration;notify();return state;},subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},isBusy:()=>busy,cancel(){if(!controller)return;controller.abort(new DOMException('Cancelled','AbortError'));void post('v2/migration/cancel',{}, {allowFailure:true}).catch(()=>{});}};
}
