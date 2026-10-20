const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {createReadStream,createWriteStream}=require('node:fs');
const {createGzip,createGunzip}=require('node:zlib');
const {pipeline}=require('node:stream/promises');
const {Readable}=require('node:stream');
const {createInterface}=require('node:readline');
const {hash,safeDirectory,safeFile,location}=require('./paths.cjs');
const chunks=require('./chunks.cjs');
const {failure,LIMITS}=require('./limits.cjs');

const filename=(root,id)=>location(root,'backups',hash(id)).replace(/\.json$/,'.srbak');
const verified=new Map();
async function checksum(file,signal){const digest=crypto.createHash('sha256');for await(const data of createReadStream(file)){signal?.throwIfAborted();digest.update(data);}return digest.digest('hex');}
async function inspect(root,backup,{file=filename(root,backup.id),install=false,signal}={}) {
    signal?.throwIfAborted();
    file=await safeFile(root,file);
    if(backup.archive && await checksum(file,signal)!==backup.archive.sha256)throw failure('STORAGE_CORRUPT','백업 파일 검증에 실패했습니다.');
    const input=createReadStream(file),unzip=createGunzip();
    input.on('error',error=>unzip.destroy(error));input.pipe(unzip);
    const lines=createInterface({input:unzip,crlfDelay:Infinity});
    const seen=new Set(),references=new Set();let header=false,complete=false,count=0;
    try {
        for await(const line of lines){
            signal?.throwIfAborted();
            if(Buffer.byteLength(line)>LIMITS.partBytes*2+4096)throw failure('STORAGE_CORRUPT','백업 조각 크기가 올바르지 않습니다.');
            const frame=JSON.parse(line);
            if(!header){
                if(frame.format!=='scene-reader-server-backup'||frame.backup?.root!==backup.root||frame.backup?.id!==backup.id)throw failure('STORAGE_CORRUPT','백업 목록과 파일이 일치하지 않습니다.');
                header=true;continue;
            }
            if(complete)throw failure('STORAGE_CORRUPT','백업 종료 뒤에 자료가 남아 있습니다.');
            if(frame.complete===true){
                if(frame.partCount!==count)throw failure('STORAGE_PART_MISSING','백업 조각 일부가 없습니다.');
                complete=true;continue;
            }
            if(typeof frame.text!=='string'||hash(frame.text)!==frame.hash||seen.has(frame.hash)||Buffer.byteLength(frame.text)>LIMITS.partBytes)throw failure('STORAGE_CORRUPT','백업 조각 검증에 실패했습니다.');
            const node=chunks.validate(JSON.parse(frame.text));seen.add(frame.hash);count++;
            for(const ref of chunks.references(node))references.add(ref);
            if(install)await chunks.put(root,frame.hash,frame.text);
        }
        if(!complete||!seen.has(backup.root)||[...references].some(ref=>!seen.has(ref)))throw failure('STORAGE_PART_MISSING','독립 백업의 참조 자료가 없습니다.');
        return {partCount:count};
    } finally {lines.close();input.destroy();unzip.destroy();}
}
async function create(root,backup,{signal}={}) {
    const target=filename(root,backup.id),temporary=target+'.'+crypto.randomUUID()+'.tmp';
    await safeDirectory(root,path.dirname(target));
    try{
        await fs.lstat(target);
        const checked=await inspect(root,backup,{signal});
        return {...backup,archive:{version:1,sha256:await checksum(await safeFile(root,target)),bytes:(await fs.stat(target)).size,partCount:checked.partCount}};
    }catch(error){if(error.code!=='ENOENT')throw error;}
    const refs=await chunks.reader(root,{signal}).verify(backup.root);
    async function* frames(){
        yield JSON.stringify({format:'scene-reader-server-backup',backup})+'\n';
        for(const ref of refs){
            signal?.throwIfAborted();
            const text=await fs.readFile(await safeFile(root,location(root,'chunks',ref)),'utf8');
            if(hash(text)!==ref)throw failure('STORAGE_CORRUPT','백업 원본 조각 검증에 실패했습니다.');
            yield JSON.stringify({hash:ref,text})+'\n';
        }
        yield JSON.stringify({complete:true,partCount:refs.size})+'\n';
    }
    try {
        await pipeline(Readable.from(frames()),createGzip({level:3}),createWriteStream(temporary,{flags:'wx',mode:0o600}));
        await inspect(root,backup,{file:temporary,signal});
        const handle=await fs.open(temporary,'r+');try{await handle.sync();}finally{await handle.close();}
        const archive={version:1,sha256:await checksum(temporary),bytes:(await fs.stat(temporary)).size,partCount:refs.size};
        // A published archive is immutable; conversion never overwrites one.
        try{await fs.lstat(target);throw failure('STORAGE_CONFLICT','이미 보관된 백업 파일이 있습니다.',409);}catch(error){if(error.code!=='ENOENT')throw error;}
        await fs.rename(temporary,target);
        return {...backup,archive};
    } finally {await fs.rm(temporary,{force:true});}
}
async function materialize(root,backup,options){
    if(!backup.archive)return backup;
    // Validate the entire independent archive before installing any pieces.
    await inspect(root,backup,options);
    await inspect(root,backup,{...options,install:true});
    return backup;
}
async function verifyStored(root,backup,options){
    const file=await safeFile(root,filename(root,backup.id)),stat=await fs.stat(file);
    const key=JSON.stringify([backup.root,backup.archive?.sha256,stat.size,stat.mtimeMs,stat.ctimeMs,stat.ino]);
    if(verified.get(file)===key)return;
    await inspect(root,backup,options);
    if(verified.size>=64)verified.delete(verified.keys().next().value);
    verified.set(file,key);
}
async function remove(root,id){try{await fs.unlink(await safeFile(root,filename(root,id)));}catch(error){if(error.code!=='ENOENT')throw error;}}
module.exports={filename,inspect,create,materialize,verifyStored,remove};
