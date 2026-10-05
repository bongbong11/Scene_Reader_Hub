const path=require('node:path');
const {LIMITS,failure}=require('./limits.cjs');
const {hash,id,location,atomic,read,writer}=require('./paths.cjs');
const {reader,encode}=require('./chunks.cjs');
const headFile=root=>path.join(root,'storage-v2','head.json');
async function snapshot(root) {const pointer=await read(headFile(root));return pointer?(await reader(root).value(pointer.hash)):{schemaVersion:2,revision:0,buckets:{}};}
async function entry(root,key,state) {state ||=await snapshot(root);const prefix=id(key).slice(0,2);return state.buckets[prefix]?await reader(root).select(state.buckets[prefix],[key]):null;}
async function begin(root,request) {
 const {operationId,writes}=request;if(!/^[a-f0-9]{64}$/.test(operationId)||!Array.isArray(writes)||!writes.length||writes.length>64)throw failure('STORAGE_INVALID_OPERATION','저장 작업을 확인하지 못했습니다.');
 for(const write of writes){id(write.key);if(!Number.isSafeInteger(write.expectedRevision)||write.expectedRevision<0)throw failure('STORAGE_INVALID_OPERATION','저장 버전을 확인하지 못했습니다.');}
 return writer(root,async()=>{const file=location(root,'operations',operationId),prior=await read(file);const signature=hash(JSON.stringify(writes));if(prior){if(prior.signature!==signature)throw failure('STORAGE_CONFLICT','동일 작업 ID의 내용이 달라 저장하지 않았습니다.',409);return prior;}
 const value={operationId,signature,writes,status:'preparing',createdAt:new Date().toISOString()};await atomic(root,file,JSON.stringify(value));return value;});
}
async function status(root,operationId) {
 const op=await read(location(root,'operations',operationId));if(!op)return null;
 if(op.status==='committing') {let current=await read(headFile(root));const nodes=reader(root);while(current?.hash){if(current.hash===op.committedRoot)return {...op,status:'committed'};const state=await nodes.value(current.hash);if(state.revision<op.resultRevision)break;current=state.previous?{hash:state.previous}:null;}}
 return op;
}
async function commit(root,operationId,roots) {
 const before=await status(root,operationId);if(!before)throw failure('STORAGE_INVALID_OPERATION','저장 작업을 찾지 못했습니다.');if(before.status==='committed'){if(!roots||Object.entries(before.results).some(([key,meta])=>roots[key]!==meta.root))throw failure('STORAGE_CONFLICT','완료된 저장 작업의 내용이 달라 저장하지 않았습니다.',409);return before;}if(before.status==='cancelled')throw failure('STORAGE_CANCELLED','취소된 저장 작업입니다.');
 if(!roots||before.writes.some(write=>typeof roots[write.key]!=='string'))throw failure('STORAGE_PART_MISSING','필요한 저장 자료가 없습니다.');
 const nodes=reader(root);for(const write of before.writes){const refs=await nodes.verify(roots[write.key]);for(const ref of refs)await nodes.size(ref);}
 return writer(root,async()=>{
  const op=await status(root,operationId);if(op.status==='committed'){if(Object.entries(op.results).some(([key,meta])=>roots[key]!==meta.root))throw failure('STORAGE_CONFLICT','완료된 저장 작업의 내용이 달라 저장하지 않았습니다.',409);return op;}if(op.status==='cancelled')throw failure('STORAGE_CANCELLED','취소된 저장 작업입니다.');
  const pointer=await read(headFile(root)),state=await snapshot(root),buckets=new Map(),results={};
  for(const write of op.writes) {
   const prefix=id(write.key).slice(0,2);if(!buckets.has(prefix))buckets.set(prefix,state.buckets[prefix]?await nodes.value(state.buckets[prefix]):{});const bucket=buckets.get(prefix),previous=bucket[write.key];
   if((previous?.revision||0)!==write.expectedRevision)throw failure('STORAGE_CONFLICT','다른 기기에서 자료가 바뀌었습니다. 다시 불러온 뒤 저장하세요.',409);
   if(write.immutable&&previous&&previous.root!==roots[write.key])throw failure('IMMUTABLE_DOCUMENT_CONFLICT','보존 자료를 덮어쓰지 않았습니다.',409);
   results[write.key]={root:roots[write.key],revision:write.expectedRevision+1,operationId};bucket[write.key]=results[write.key];
  }
  const next={...state,revision:state.revision+1,previous:pointer?.hash||null,operationId,buckets:{...state.buckets}};for(const [prefix,bucket]of buckets)next.buckets[prefix]=await encode(root,bucket);
  const rootHash=await encode(root,next),receipt={...op,status:'committing',results,resultRevision:next.revision,committedRoot:rootHash};
  await atomic(root,location(root,'operations',operationId),JSON.stringify(receipt));await atomic(root,headFile(root),JSON.stringify({schemaVersion:2,hash:rootHash}));
  receipt.status='committed';await atomic(root,location(root,'operations',operationId),JSON.stringify(receipt));return receipt;
 });
}
async function cancel(root,operationId) {return writer(root,async()=>{const op=await status(root,operationId);if(!op)return null;if(op.status==='committed')return op;op.status='cancelled';await atomic(root,location(root,'operations',operationId),JSON.stringify(op));return op;});}
async function readDocuments(root,keys,paths={}) {
 if(!Array.isArray(keys)||keys.length>64)throw failure('STORAGE_INVALID_OPERATION','읽을 자료를 확인하지 못했습니다.');const state=await snapshot(root),nodes=reader(root),documents={};
 for(const key of keys){const meta=await entry(root,key,state);documents[key]=meta?{...meta,value:await nodes.select(meta.root,paths[key]||[])}:null;}
 return {snapshotRevision:state.revision,documents};
}
async function writeDocument(root,key,value,{operationId,expectedRevision,immutable=false}={}) {
 const current=await entry(root,key);expectedRevision ??=current?.revision||0;operationId ||=hash(JSON.stringify([key,expectedRevision,value]));
 const rootHash=await encode(root,value);await begin(root,{operationId,writes:[{key,expectedRevision,immutable}]});return commit(root,operationId,{[key]:rootHash});
}
module.exports={snapshot,entry,begin,status,commit,cancel,readDocuments,writeDocument,headFile};
