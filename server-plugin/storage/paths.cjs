const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {failure}=require('./limits.cjs');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function id(value) { if(typeof value!=='string'||!value||value.length>512||['__proto__','constructor','prototype'].includes(value))throw failure('STORAGE_INVALID_ID','저장 항목을 확인하지 못했습니다.');return hash(value); }
function hex(value) { if(!/^[a-f0-9]{64}$/.test(value))throw failure('STORAGE_INVALID_ID','저장 참조를 확인하지 못했습니다.');return value; }
function location(root,kind,value) { if(!['chunks','operations','backups'].includes(kind))throw failure('STORAGE_INVALID_ID','저장 위치를 확인하지 못했습니다.');return path.join(root,'storage-v2',kind,hex(value)+'.json'); }
async function safeDirectory(root,dir) {
 const base=path.resolve(root),target=path.resolve(dir);if(target!==base&&!target.startsWith(base+path.sep))throw failure('STORAGE_INVALID_PATH','저장 위치를 확인하지 못했습니다.');
 await fs.mkdir(base,{recursive:true});
 for(const item of [base,...path.relative(base,target).split(path.sep).filter(Boolean).map((_,i,parts)=>path.join(base,...parts.slice(0,i+1)))]) {
  try { const stat=await fs.lstat(item);if(stat.isSymbolicLink()||!stat.isDirectory())throw failure('STORAGE_INVALID_PATH','안전한 저장 폴더가 아닙니다.'); }
  catch(error){if(error.code!=='ENOENT')throw error;await fs.mkdir(item).catch(error=>{if(error.code!=='EEXIST')throw error;});const created=await fs.lstat(item);if(created.isSymbolicLink()||!created.isDirectory())throw failure('STORAGE_INVALID_PATH','안전한 저장 폴더가 아닙니다.');}
 }
}
async function atomic(root,file,text) {
 await safeDirectory(root,path.dirname(file));
 try{if((await fs.lstat(file)).isSymbolicLink())throw failure('STORAGE_INVALID_PATH','안전한 저장 파일이 아닙니다.');}catch(error){if(error.code!=='ENOENT')throw error;}
 const temporary=file+'.'+crypto.randomUUID()+'.tmp';let handle;
 try {handle=await fs.open(temporary,'wx',0o600);await handle.writeFile(text);await handle.sync();await handle.close();handle=null;
  // Windows can briefly hold a file open while another reader or scanner closes.
  // Retry only replacement locks, keeping the existing file intact throughout.
  for(let attempt=0;;attempt++){try{await fs.rename(temporary,file);break;}catch(error){if(process.platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=7)throw error;await new Promise(resolve=>setTimeout(resolve,25*(attempt+1)));}}
  try{const directory=await fs.open(path.dirname(file),'r');try{await directory.sync();}finally{await directory.close();}}catch(error){if(!['EINVAL','EPERM','EISDIR','EBADF','EACCES'].includes(error.code))throw error;}
 }finally{await handle?.close();await fs.rm(temporary,{force:true});}
}
async function read(file,fallback=null) {try{const marker=file.lastIndexOf(path.sep+'storage-v2'+path.sep);if(marker>=0)await safeDirectory(file.slice(0,marker),path.dirname(file));if((await fs.lstat(file)).isSymbolicLink())throw failure('STORAGE_INVALID_PATH','안전한 저장 파일이 아닙니다.');return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}}
async function safeFile(root,file) {await safeDirectory(root,path.dirname(file));if((await fs.lstat(file)).isSymbolicLink())throw failure('STORAGE_INVALID_PATH','안전한 저장 파일이 아닙니다.');return file;}
const writers=new Map();
async function lockedWriter(root,work) {
 await safeDirectory(root,path.join(root,'storage-v2'));const lock=path.join(root,'storage-v2','writer.lock');let handle;
 try{handle=await fs.open(lock,'wx',0o600);await handle.writeFile(JSON.stringify({pid:process.pid}));}
 catch(error){if(error.code!=='EEXIST')throw error;const prior=await read(lock).catch(()=>null);let alive=true;if(Number.isInteger(prior?.pid)&&prior.pid>0){try{process.kill(prior.pid,0);}catch(check){if(check.code==='ESRCH')alive=false;}}else alive=Date.now()-(await fs.stat(lock)).mtimeMs<5000;if(!alive){await fs.unlink(lock);handle=await fs.open(lock,'wx',0o600);await handle.writeFile(JSON.stringify({pid:process.pid}));}else throw failure('STORAGE_BUSY','다른 저장 작업이 진행 중입니다. 잠시 뒤 다시 시도하세요.',409);}
 try{return await work();}finally{await handle?.close();await fs.rm(lock,{force:true});}
}
function writer(root,work){const next=(writers.get(root)||Promise.resolve()).catch(()=>{}).then(()=>lockedWriter(root,work));writers.set(root,next);void next.finally(()=>{if(writers.get(root)===next)writers.delete(root);}).catch(()=>{});return next;}
module.exports={hash,id,hex,location,atomic,read,writer,safeDirectory,safeFile};
