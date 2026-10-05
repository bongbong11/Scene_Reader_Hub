import {encodeTree,decodeTree,hashPart} from './tree-codec.js';
import {digest,fail} from './shared-document.js';
export function createPagedTransport(post,{noteDiagnostic}={}) {
 let capabilityPromise;const revisions=new Map(),cache=new Map(),uploaded=new Set();let used=0;
 async function capabilities(){return capabilityPromise ||=post('v2/capabilities',{}, {allowFailure:true}).catch(()=>null);}
 async function get(ref,signal) {
  if(cache.has(ref))return cache.get(ref).node;
  const response=await post('v2/parts/read',{hashes:[ref]},{signal});const part=response.parts?.find(part=>part.hash===ref);
  if(!part||hashPart(part.text)!==ref)throw fail('STORAGE_CORRUPT','저장 조각 검증에 실패했습니다.');
  const node=JSON.parse(part.text),size=new TextEncoder().encode(part.text).length;
  while(cache.size&&used+size>8*1048576){const key=cache.keys().next().value;used-=cache.get(key).size;cache.delete(key);}cache.set(ref,{node,size});used+=size;
  const refs=node.type==='object'?node.entries.map(item=>item[1]):node.refs;
  if(refs?.length){const missing=refs.filter(key=>!cache.has(key));for(let at=0;at<missing.length;at+=12){const batch=await post('v2/parts/read',{hashes:missing.slice(at,at+12)},{signal});for(const part of batch.parts){if(hashPart(part.text)!==part.hash)throw fail('STORAGE_CORRUPT','저장 조각 검증에 실패했습니다.');const bytes=new TextEncoder().encode(part.text).length;while(cache.size&&used+bytes>8*1048576){const key=cache.keys().next().value;used-=cache.get(key).size;cache.delete(key);}cache.set(part.hash,{node:JSON.parse(part.text),size:bytes});used+=bytes;}}}
  return node;
 }
 async function read(key,{signal}={}) {
  const response=await post('v2/metadata',{keys:[key]},{signal}),meta=response.documents[key];revisions.set(key,meta?.revision||0);return meta?decodeTree(meta.root,ref=>get(ref,signal),{signal}):null;
 }
 async function select(key,path,{signal}={}){const response=await post('v2/read',{keys:[key],paths:{[key]:path}},{signal}),meta=response.documents[key];revisions.set(key,meta?.revision||0);return meta?.value??null;}
 async function writeMany(writes,{signal,operationId,prepare}={}) {
  operationId ||=digest(writes.map(item=>[item.key,item.value,revisions.get(item.key)||0]));
  const descriptors=writes.map(item=>({key:item.key,expectedRevision:item.expectedRevision ?? revisions.get(item.key)??0,immutable:item.immutable===true}));
  const prior=await post('v2/operations/begin',{operationId,writes:descriptors},{signal});
  if(prior.operation.status==='committed'){for(const [key,meta]of Object.entries(prior.operation.results))revisions.set(key,meta.revision);return prior.operation;}
  const roots={},known=new Set();
  const emit=async(hash,text)=>{if(!known.has(hash)&&!uploaded.has(hash)){await post('v2/operations/part',{operationId,hash,text},{signal});known.add(hash);}return hash;};
  for(const item of writes)roots[item.key]=await encodeTree(prepare?await prepare(emit):item.value,emit,{signal});
  let result;
  try{result=await post('v2/operations/commit',{operationId,roots},{signal});}
  catch(error){const status=await post('v2/operations/status',{operationId},{allowFailure:true});if(status?.operation?.status!=='committed')throw error;if(Object.entries(roots).some(([key,root])=>status.operation.results?.[key]?.root!==root))throw error;result=status;noteDiagnostic?.('storage_resolution',{module:'src/storage/paged-transport.js',phase:'v2/operations/commit',status:'succeeded',code:'STORAGE_COMMIT_RECOVERED'});}
  for(const hash of known){uploaded.add(hash);if(uploaded.size>32768)uploaded.delete(uploaded.values().next().value);}for(const [key,meta]of Object.entries(result.operation.results))revisions.set(key,meta.revision);return result.operation;
 }
 return {capabilities,read,select,write:(key,value,options={})=>writeMany([{key,value,immutable:options.immutable}],options),writeMany,clear(){capabilityPromise=undefined;revisions.clear();cache.clear();uploaded.clear();used=0;},revision:key=>revisions.get(key)||0};
}
