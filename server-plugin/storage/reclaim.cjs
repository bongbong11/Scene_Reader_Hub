const fs=require('node:fs/promises'),path=require('node:path');
const {read,atomic,writer,location,safeDirectory,safeFile,id}=require('./paths.cjs');
const chunks=require('./chunks.cjs'),tx=require('./transactions.cjs'),backups=require('./backups.cjs');
const {failure}=require('./limits.cjs');
const DAY=86400000,GRACE=DAY;
async function entries(root,kind){
    const dir=path.dirname(location(root,kind,'0'.repeat(64)));await safeDirectory(root,dir);
    const rows=await fs.readdir(dir,{withFileTypes:true});
    if(rows.some(row=>row.isSymbolicLink()))throw failure('STORAGE_INVALID_PATH','정리 위치에 안전하지 않은 연결이 있습니다.');
    return rows.filter(row=>row.isFile()&&/^[a-f0-9]{64}\.json$/.test(row.name)).map(row=>path.join(dir,row.name));
}
const pause=()=>new Promise(resolve=>setImmediate(resolve));
async function staleTemps(root,now,grace,check,onDelete,limit){
    let deleted=0;
    for(const folder of ['', 'chunks','operations','backups']){
        const directory=path.join(root,'storage-v2',folder);await safeDirectory(root,directory);
        for(const entry of await fs.readdir(directory,{withFileTypes:true})){
            check();
            if(!entry.isFile()||!/^(?:head\.json|maintenance\.json|[a-f0-9]{64}\.(?:json|srbak))\.[a-f0-9-]{36}\.tmp$/.test(entry.name))continue;
            const file=await safeFile(root,path.join(directory,entry.name));
            const stat=await fs.stat(file);if(now-stat.mtimeMs<grace)continue;
            await fs.unlink(file);onDelete(stat.size);if(++deleted>=limit)return deleted;
            await pause();
        }
    }return deleted;
}
// Rebuild only the current index. No live document values/revisions are changed.
async function replaceIndex(root,documents,expected,{detach=false,locked=false}={}){
    const apply=async()=>{
        const pointer=await read(tx.headFile(root));
        if(pointer?.hash!==expected)throw failure('STORAGE_CONFLICT','자료가 바뀌어 정리를 미뤘습니다.',409);
        const current=await tx.snapshot(root),groups={};
        for(const [key,meta]of Object.entries(documents))(groups[id(key).slice(0,2)]||={})[key]=meta;
        const state={...current,revision:current.revision+1,previous:detach?null:expected,buckets:{}};
        for(const [prefix,group]of Object.entries(groups))state.buckets[prefix]=await chunks.encode(root,group);
        const ref=await chunks.encode(root,state);
        await atomic(root,tx.headFile(root),JSON.stringify({schemaVersion:2,hash:ref}));
        return ref;
    };
    return locked?apply():writer(root,apply);
}
async function reclaim(root,{signal,now=Date.now(),grace=GRACE,ownerRef,onProgress,drain=false}={}){
    return writer(root,()=>collect(root,{signal,now,grace,ownerRef,onProgress,drain}));
}
async function collect(root,{signal,now,grace,ownerRef,onProgress,drain}){
    // Reuse this pass's verified roots and file list only while the writer lock
    // is held. Foreground work aborts and joins the pass before changing data;
    // the next pass builds fresh protection sets, never a cross-write cache.
    const limit=drain?Infinity:256,tempLimit=drain?Infinity:64;
    const check=()=>signal?.throwIfAborted();check();
    const initial=await read(tx.headFile(root));if(!initial)return {status:'empty',deleted:0};
    const state=await tx.snapshot(root),documents=await backups.allDocuments(root,state);
    const migration=documents['metadata:migration-v2'];
    if(!migration||!['completed','cleaned'].includes((await chunks.reader(root).value(migration.root)).status))return {status:'deferred',reason:'migration'};
    const work=await require('./reclaim-operations.cjs').inspect(root,await entries(root,'operations'),documents,{now,signal});
    const operations=work.protectedOperations,removable=work.removable;
    const totals={deleted:0,bytes:0,removedDocuments:0,temporaryFiles:0,operationFiles:0,cancelledOperations:work.cancelled};
    const report=()=>onProgress?.({...totals});report();
    // A resumable upload protects chunks, not every unrelated completed job.
    const removeReceipts=async()=>{
        for(const file of removable.slice(0,limit)){
            check();for(const target of [file+'.upload',file])try{
                const safe=await safeFile(root,target),stat=await fs.stat(safe);await fs.unlink(safe);
                totals.operationFiles++;totals.bytes+=stat.size;report();await pause();
            }catch(error){if(error.code!=='ENOENT')throw error;}
        }
    };
    if(work.blocked.length){
        await removeReceipts();
        return {status:'deferred',reason:work.blocked[0],reasons:work.blocked,...totals,remainingOperations:Math.max(0,removable.length-limit),hasMore:removable.length>limit};
    }
    check();
    // Convert at most one legacy reference backup per pass. Until converted,
    // those backups remain explicit roots in the mark set.
    const saved=await backups.list(root),old=saved.find(item=>!item.archive);
    if(old)await backups.makeIndependent(root,old,{signal});else await backups.convertLegacy(root,{signal});
    const nodes=chunks.reader(root,{signal}),marked=new Set();
    for(const backup of await backups.list(root)){
        check();
        if(backup.archive)await require('./backup-archive.cjs').verifyStored(root,backup,{signal});
        else await nodes.verify(backup.root,marked);
    }
    const recentKeys=new Set(operations.flatMap(op=>Object.keys(op.results||{})));
    const selected=await require('./live-documents.cjs').select(root,documents,{recentKeys,signal,ownerRef});
    const next=selected.documents,removedDocuments=Object.keys(documents).length-Object.keys(next).length;
    // Validate every retained document before publishing a compact index.
    for(const meta of Object.values(next)){check();await nodes.verify(meta.root,marked);await pause();}
    for(const op of operations){
        check();for(const meta of Object.values(op.results||{}))await nodes.verify(meta.root,marked);
        const refs=new Set();const scan=value=>{if(value&&typeof value==='object'){for(const ref of value.storageRefs||[])refs.add(ref);for(const child of Object.values(value))scan(child);}};scan(op.outputs);scan(op.bank);for(const ref of refs)await nodes.verify(ref,marked);
    }
    check();
    const current=await read(tx.headFile(root));
    if(current.hash!==initial.hash)throw failure('STORAGE_CONFLICT','자료가 바뀌어 정리를 미뤘습니다.',409);
    // Completed receipts no longer need the unbounded previous-state chain.
    const head=state.previous||selected.changed?await replaceIndex(root,next,initial.hash,{detach:true,locked:true}):initial.hash;
    const compact=await tx.snapshot(root);
    await nodes.verify(head,marked);
    for(const ref of Object.values(compact.buckets))await nodes.verify(ref,marked);
    totals.removedDocuments=removedDocuments;report();
    let remainingChunks=0,recentChunks=0;
    for(const file of await entries(root,'chunks')){
        check();const ref=path.basename(file,'.json');if(marked.has(ref))continue;
        const stat=await fs.stat(await safeFile(root,file));if(now-stat.mtimeMs<grace){recentChunks++;continue;}
        if(totals.deleted>=limit){remainingChunks++;continue;}
        // Unreferenced damaged chunks need not parse successfully to be removed.
        // All live and backup roots have already passed validation above.
        await fs.unlink(file);totals.deleted++;totals.bytes+=stat.size;report();await pause();
    }
    await removeReceipts();
    await staleTemps(root,now,grace,check,size=>{totals.temporaryFiles++;totals.bytes+=size;report();},tempLimit);
    const remainingOperations=Math.max(0,removable.length-limit);
    return {status:'completed',...totals,remainingChunks,remainingOperations,recentChunks,recentOperations:work.recent,
        hasMore:remainingChunks>0||remainingOperations>0||totals.temporaryFiles>=tempLimit};

}
module.exports={reclaim,replaceIndex,GRACE};
