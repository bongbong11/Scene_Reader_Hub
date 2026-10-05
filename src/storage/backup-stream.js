import {STORAGE_API_URL} from './contract.js';
import {digest} from './shared-document.js';
export function downloadStoredFile(document,route,params,filename) {const anchor=document.createElement('a');anchor.href=STORAGE_API_URL+'/v2/'+route+'?'+new URLSearchParams(params);anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();}
export async function importBackupStream(file,post,{signal}={}) {
 if(!/\.srbackup$/i.test(file.name))return post('backup/import',{snapshot:JSON.parse(await file.text())},{signal});
 const reader=file.stream().getReader(),decoder=new TextDecoder();let committed=false,buffer='',header,footer,parts=0,operationId=digest(['backup-import',file.name,file.size,Date.now(),Math.random()]);
 try{while(true){signal?.throwIfAborted();const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});if(buffer.length>3*1048576&&!buffer.includes('\n'))throw new Error('백업 조각이 너무 큽니다.');let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;const frame=JSON.parse(line);
  if(!header){if(frame.format!=='scene-reader-backup'||frame.schemaVersion!==2)throw new Error('지원하지 않는 백업 형식입니다.');header=frame;await post('v2/operations/begin',{operationId,writes:[{key:'metadata:import-'+operationId,expectedRevision:0}]},{signal});}
  else if(frame.complete){if(footer)throw new Error('백업 종료 정보가 중복됐습니다.');footer=frame;}
  else{if(footer)throw new Error('백업 종료 뒤에 자료가 있습니다.');await post('v2/operations/part',{operationId,hash:frame.hash,text:frame.text},{signal});parts++;}
 }if(done)break;}
 if(buffer.trim()||!footer||parts!==header.partCount||parts!==footer.partCount)throw new Error('백업 파일 일부가 빠졌습니다. 현재 자료는 변경하지 않았습니다.');
 const result=await post('v2/backup/import/finish',{operationId,backup:header.backup,partCount:parts},{signal});committed=true;return result;
 }finally{if(header&&!committed)await post('v2/operations/cancel',{operationId},{allowFailure:true}).catch(()=>{});await reader.cancel().catch(()=>{});reader.releaseLock();}
}
