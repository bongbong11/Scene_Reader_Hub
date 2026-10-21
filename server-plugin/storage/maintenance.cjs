const path=require('node:path');
const {read,atomic,hash}=require('./paths.cjs');
const {failure}=require('./limits.cjs');
// Foreground leases include imports, exports and backups. Control/status routes
// do not abort maintenance merely because the user is viewing its progress.
const states=new Map(),fields=['deleted','bytes','removedDocuments','temporaryFiles','operationFiles','cancelledOperations'];
const empty=()=>Object.fromEntries(fields.map(key=>[key,0]));
function state(root){if(!states.has(root))states.set(root,{active:0,last:0,ownerRef:null,mode:'automatic',totals:empty()});return states.get(root);}
const settingsFile=root=>path.join(root,'storage-v2','maintenance.json');
async function settings(root){
    const s=state(root);
    if(!s.loaded)s.loaded=read(settingsFile(root)).then(saved=>{if(saved&&!['automatic','manual'].includes(saved.mode))throw failure('STORAGE_MAINTENANCE_CONFIG','정리 설정을 읽지 못했습니다.');s.mode=saved?.mode||'automatic';});
    await s.loaded;return s;
}
function schedule(root){
    const s=state(root);clearTimeout(s.timer);
    if(s.active||s.running||s.stopped)return;
    s.timer=setTimeout(()=>{s.timer=null;void execute(root).catch(error=>{s.result={status:'failed',code:error.code||'STORAGE_MAINTENANCE_FAILED'};});},Math.max(45000,(s.manual||s.result?.hasMore?0:300000)-(Date.now()-s.last)));
    s.timer.unref?.();
}
async function execute(root){
    const s=await settings(root);if(s.stopped||s.active||s.running||(!s.manual&&s.mode==='manual'))return;
    const manual=Boolean(s.manual),ownerRef=s.ownerRef;s.controller=new AbortController();
    if(!s.continuing)s.totals=empty();s.continuing=true;
    s.running=(async()=>{
        let result;
        do{
            const before={...s.totals};s.result={status:'running',...before};
            result=await require('./reclaim.cjs').reclaim(root,{signal:s.controller.signal,ownerRef,
                grace:manual?0:undefined,onProgress:progress=>{
                    s.totals=Object.fromEntries(fields.map(key=>[key,before[key]+(progress[key]||0)]));
                    s.result={status:'running',...s.totals};
                }});
            s.result={...result,...s.totals};
            if(result?.hasMore)await new Promise(resolve=>setImmediate(resolve));
        }while(result?.hasMore&&!s.controller.signal.aborted);
        s.manual=false;s.continuing=false;
    })().catch(error=>{
        s.result={...s.totals,status:error.name==='AbortError'?'waiting':'failed',code:error.name==='AbortError'?'FOREGROUND_ACTIVE':error.code||'STORAGE_MAINTENANCE_FAILED'};
        if(error.name!=='AbortError'){s.manual=false;s.continuing=false;}
    }).finally(()=>{s.running=null;s.controller=null;s.last=Date.now();if(!s.active&&!s.stopped&&(s.manual||s.mode==='automatic'))schedule(root);});
    await s.running;
}
async function run(root,task){
    const s=state(root);s.active++;clearTimeout(s.timer);
    try{s.controller?.abort();if(s.running)await s.running;return await task();}
    finally{s.active--;if(!s.active&&!s.stopped)schedule(root);}
}
async function configure(root,{mode,chatKey}={}){
    if(mode!==undefined&&!['automatic','manual'].includes(mode))throw failure('STORAGE_INVALID_OPERATION','정리 방식을 선택해 주세요.');
    if(chatKey!==undefined&&(typeof chatKey!=='string'||chatKey.length>512))throw failure('STORAGE_INVALID_ID','현재 방을 확인하지 못했습니다.');
    return run(root,async()=>{
        const s=await settings(root);
        if(mode!==undefined){await atomic(root,settingsFile(root),JSON.stringify({schemaVersion:1,mode}));s.mode=mode;if(mode==='manual'){s.manual=false;s.continuing=false;}}
        if(chatKey!==undefined){const owner=chatKey.includes('|chat:')?hash(chatKey.split('|chat:')[0]):null;if(s.ownerRef!==owner){s.manual=false;s.continuing=false;s.result=null;}s.ownerRef=owner;}
        return status(root);
    });
}
async function start(root,{chatKey}={}){
    if(typeof chatKey!=='string'||!chatKey.includes('|chat:')||chatKey.endsWith('|chat:unsaved'))throw failure('STORAGE_NOT_READY','정리할 캐릭터의 채팅방을 먼저 열어 주세요.');
    const s=state(root);if(s.manual)return status(root);
    await configure(root,{chatKey});s.manual=true;s.continuing=false;clearTimeout(s.timer);s.result={status:'waiting',...empty()};
    if(!s.active)void execute(root).catch(error=>{s.manual=false;s.result={status:'failed',code:error.code||'STORAGE_MAINTENANCE_FAILED'};});
    return status(root);
}
function status(root){const s=state(root);return {mode:s.mode,characterScoped:Boolean(s.ownerRef),requested:Boolean(s.manual),...(s.result||{status:'waiting'})};}
async function inspect(root){await settings(root);return status(root);}
function stop(root){const s=states.get(root);if(!s)return;s.stopped=true;clearTimeout(s.timer);s.controller?.abort();states.delete(root);}
module.exports={run,schedule,status,inspect,configure,start,stop};
