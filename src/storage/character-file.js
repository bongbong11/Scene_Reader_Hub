import {digest} from './shared-document.js';
export async function readCharacterFile(file,post,form,{signal,onProgress=()=>{}}={}) {
 if(file.size>128*1048576)throw new Error('인물 JSON은 현재 최대 128MiB까지 등록할 수 있습니다.');
 if(file.size<=2*1048576)return {raw:await file.text()};
 const migration=await post('v2/migration/status',{}, {signal});if(!['completed','cleaned','empty'].includes(migration.migration?.status))throw new Error('먼저 확장 위의 자료 이사 버튼으로 이전 자료를 옮긴 뒤 큰 파일을 등록해 주세요.');
 const operationId=digest([file.name,file.size,file.lastModified,Date.now(),Math.random()]);await post('v2/character/import/begin',{operationId,size:file.size,form},{signal});
 for(let offset=0;offset<file.size;offset+=1048576){signal?.throwIfAborted();const bytes=new Uint8Array(await file.slice(offset,offset+1048576).arrayBuffer());let binary='';for(let at=0;at<bytes.length;at+=8192)binary+=String.fromCharCode(...bytes.subarray(at,at+8192));await post('v2/character/import/part',{operationId,offset,data:btoa(binary)},{signal});onProgress(Math.min(file.size,offset+bytes.length),file.size);}
 let result;try{do{signal?.throwIfAborted();result=await post('v2/character/import/finish',{operationId},{signal});if(result.status==='failed')throw new Error(result.error||'인물 파일 확인에 실패했습니다.');if(result.status==='running')await new Promise(resolve=>setTimeout(resolve,400));}while(result.status==='running');}catch(error){await post('v2/character/import/cancel',{operationId},{allowFailure:true}).catch(()=>{});throw error;}return {outputs:result.outputs,raw:JSON.stringify(result.outputs.length===1?result.outputs[0]:{entities:result.outputs})};
}
