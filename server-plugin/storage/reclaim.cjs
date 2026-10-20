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
async function staleTemps(root,now,grace,check){
    let deleted=0;
    for(const folder of ['', 'chunks','operations','backups']){
        const directory=path.join(root,'storage-v2',folder);await safeDirectory(root,directory);
        for(const entry of await fs.readdir(directory,{withFileTypes:true})){
            check();
            if(!entry.isFile()||!/^(?:head\.json|[a-f0-9]{64}\.(?:json|srbak))\.[a-f0-9-]{36}\.tmp$/.test(entry.name))continue;
            const file=await safeFile(root,path.join(directory,entry.name));
            if(now-(await fs.stat(file)).mtimeMs<grace)continue;
            await fs.unlink(file);if(++deleted>=64)return deleted;
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
async function reclaim(root,{signal,now=Date.now(),grace=GRACE}={}){
    return writer(root,()=>collect(root,{signal,now,grace}));
}
async function collect(root,{signal,now,grace}){
    const check=()=>signal?.throwIfAborted();check();
    const initial=await read(tx.headFile(root));if(!initial)return {status:'empty',deleted:0};
    const state=await tx.snapshot(root),documents=await backups.allDocuments(root,state);
    const migration=documents['metadata:migration-v2'];
    if(!migration||!['completed','cleaned'].includes((await chunks.reader(root).value(migration.root)).status))return {status:'deferred',reason:'migration'};
    const operations=[],removable=[];
    for(const file of await entries(root,'operations')){
        check();let op=await read(file);const stat=await fs.stat(file),age=now-Math.max(stat.mtimeMs,Date.parse(op.updatedAt||op.createdAt)||stat.mtimeMs);
        if(op.status==='committing'){
            op=await tx.status(root,op.operationId);
            if(op?.status!=='committed')return {status:'deferred',reason:'unresolved_commit'};
            await atomic(root,file,JSON.stringify(op));
        }
        if(op.status==='preparing'){
            // Abandoned uploads are explicitly cancelled before they can be reclaimed.
            if(age<7*DAY)return {status:'deferred',reason:'pending_upload'};
            await atomic(root,file,JSON.stringify({...op,status:'cancelled',updatedAt:new Date(now).toISOString()}));
            return {status:'deferred',reason:'expired_upload'};
        }
        if(age<grace)operations.push(op);else if(['committed','cancelled','verified'].includes(op.status)||op.kind==='character_export')removable.push(file);
        else return {status:'deferred',reason:'unknown_operation'};
        await pause();
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
    const selected=await require('./live-documents.cjs').select(root,documents,{recentKeys,signal});
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
    let deleted=0,bytes=0;
    for(const file of await entries(root,'chunks')){
        check();const ref=path.basename(file,'.json');if(marked.has(ref))continue;
        const stat=await fs.stat(await safeFile(root,file));if(now-stat.mtimeMs<grace)continue;
        await fs.unlink(file);deleted++;bytes+=stat.size;
        // Bounded sweep; another idle pass continues without a growing journal.
        if(deleted>=256)break;
        await pause();
    }
    for(const file of removable.slice(0,64)){
        check();for(const target of [file+'.upload',file])try{await fs.unlink(await safeFile(root,target));}catch(error){if(error.code!=='ENOENT')throw error;}
    }
    const temporaryFiles=await staleTemps(root,now,grace,check);
    return {status:'completed',deleted,bytes,removedDocuments,temporaryFiles};
}
module.exports={reclaim,replaceIndex,GRACE};
