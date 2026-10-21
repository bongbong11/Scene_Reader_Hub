const fs=require('node:fs/promises');
const {read,atomic,safeFile}=require('./paths.cjs');
const tx=require('./transactions.cjs');
const DAY=86400000;
// Resolve receipts before detaching the old index. Upload age is measured from
// last activity, including the multipart body, rather than creation alone.
async function inspect(root,files,documents,{now,signal}){
    const protectedOperations=[],removable=[],blocked=[];let cancelled=0,recent=0;
    for(const file of files){
        signal?.throwIfAborted();let op;
        try{op=await read(file);}catch(error){
            // An unreadable receipt cannot be resumed. It is not a source of
            // live data: the committed head and backup roots are verified by
            // the collector before removing any unreferenced data chunks.
            if(error instanceof SyntaxError){removable.push(file);continue;}throw error;
        }
        if(!op||typeof op!=='object'||Array.isArray(op)){removable.push(file);continue;}
        let touched=(await fs.stat(file)).mtimeMs;
        try{touched=Math.max(touched,(await fs.stat(await safeFile(root,file+'.upload'))).mtimeMs);}catch(error){if(error.code!=='ENOENT')throw error;}
        const age=now-Math.max(touched,Date.parse(op.updatedAt||op.createdAt)||0);
        if(op.status==='committing'){
            op=await tx.status(root,op.operationId);
            if(op?.status!=='committed'){blocked.push('unresolved_commit');continue;}
            await atomic(root,file,JSON.stringify(op));
        }
        if(op.status==='preparing'){
            // Backup imports have a placeholder write, not a CAS transaction.
            // Character imports have their own resumable upload protocol.
            const transaction=!op.kind&&Array.isArray(op.writes)&&op.writes.length&&op.writes.every(write=>
                typeof write.key==='string'&&Number.isSafeInteger(write.expectedRevision)&&!write.key.startsWith('metadata:import-'));
            const conflict=transaction&&op.writes.some(write=>(documents[write.key]?.revision||0)!==write.expectedRevision);
            if(conflict||age>=7*DAY){
                op={...op,status:'cancelled',updatedAt:new Date(now).toISOString(),cancelReason:conflict?'superseded_revision':'upload_expired'};
                await atomic(root,file,JSON.stringify(op));cancelled++;removable.push(file);continue;
            }
            // Pending client writes can reuse old hashes that have not yet been
            // submitted. Protect chunks, but still clean finished receipts.
            blocked.push('pending_upload');continue;
        }
        if(!['committed','cancelled','verified'].includes(op.status)&&op.kind!=='character_export'){
            blocked.push('unknown_operation');continue;
        }
        if(age<DAY){protectedOperations.push(op);recent++;}else removable.push(file);
        await new Promise(resolve=>setImmediate(resolve));
    }
    return {protectedOperations,removable,blocked:[...new Set(blocked)],cancelled,recent};
}
module.exports={inspect};
