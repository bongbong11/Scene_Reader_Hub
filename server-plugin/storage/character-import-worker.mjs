import {parentPort,workerData} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {validateImport,compileResult,buildSources} from '../vendor/character-core.mjs';
const require=createRequire(import.meta.url),{pack}=require('./character-packer.cjs');
try{
 let parsed;try{parsed=JSON.parse(await readFile(workerData.file,'utf8'));}catch{throw new Error('인물 JSON 문법이 올바르지 않습니다. 완성된 파일을 다시 확인해 주세요.');}const values=Array.isArray(parsed)?parsed:parsed?.entities||[parsed];
 if(!Array.isArray(values)||!values.length||values.length>6)throw new Error('인물 JSON에는 1~6명이 필요합니다.');
 const outputs=[],names=new Set();
 for(const value of values){let {output,source_set_id}=validateImport(value);if(workerData.form?.source)output=compileResult(value,{entity_type:value.entity_type,entity_name:value.entity_name,sources:buildSources(value.entity_type,workerData.form.source,workerData.form.selectedLore||[])});
  const name=output.entity_name.trim().toLocaleLowerCase();if(names.has(name))throw new Error('인물 이름이 중복됐습니다.');names.add(name);if(values.length>1&&output.entity_type!=='character')throw new Error('다인 파일은 캐릭터 기록만 함께 저장할 수 있습니다.');outputs.push(await pack(workerData.root,{...output,...(source_set_id?{source_set_id}:{})}));
 }
 parentPort.postMessage({ok:true,outputs});
}catch(error){parentPort.postMessage({ok:false,error:error.message,code:'CHARACTER_IMPORT_INVALID'});}
