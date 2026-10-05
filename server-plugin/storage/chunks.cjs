const fs=require('node:fs/promises');
const {LIMITS,failure}=require('./limits.cjs');
const {hash,location,atomic,read,safeFile}=require('./paths.cjs');
function references(node) {return [...(node.links||[]),...(node.type==='object'?node.entries.map(item=>item[1]):['array','concat','merge','text'].includes(node.type)?node.refs:[])];}
function validate(node) {
 if(!node||typeof node!=='object'||Array.isArray(node)||!['value','object','array','concat','merge','text','textPart'].includes(node.type))throw failure('STORAGE_CORRUPT','저장 조각 형식이 올바르지 않습니다.');
 if(node.type==='object'&&(!Array.isArray(node.entries)||node.entries.some(item=>!Array.isArray(item)||item.length!==2||typeof item[0]!=='string')||new Set(node.entries.map(item=>item[0])).size!==node.entries.length))throw failure('STORAGE_CORRUPT','저장 목록이 올바르지 않습니다.');
 if(['array','concat','merge','text'].includes(node.type)&&!Array.isArray(node.refs))throw failure('STORAGE_CORRUPT','저장 참조 목록이 올바르지 않습니다.');
 if(node.links!==undefined&&!Array.isArray(node.links))throw failure('STORAGE_CORRUPT','저장 연결이 올바르지 않습니다.');
 if(node.type==='concat'&&(!Array.isArray(node.counts)||node.counts.length!==node.refs.length||node.counts.some(count=>!Number.isSafeInteger(count)||count<0)))throw failure('STORAGE_CORRUPT','기록 페이지 길이가 올바르지 않습니다.');
 if(node.type==='merge'&&(!Array.isArray(node.keyRanges)||node.keyRanges.length!==node.refs.length||node.keyRanges.some(range=>!Array.isArray(range)||range.length!==2||range.some(key=>typeof key!=='string'))))throw failure('STORAGE_CORRUPT','저장 색인 범위가 올바르지 않습니다.');
 if(references(node).some(ref=>typeof ref!=='string'||!/^[a-f0-9]{64}$/.test(ref)))throw failure('STORAGE_CORRUPT','저장 참조가 올바르지 않습니다.');
 if(node.type==='textPart'&&typeof node.text!=='string')throw failure('STORAGE_CORRUPT','저장 텍스트가 올바르지 않습니다.');
 if(node.type==='value'&&!Object.hasOwn(node,'value'))throw failure('STORAGE_CORRUPT','저장 값이 없습니다.');return node;
}
async function put(root,ref,text) {
 if(typeof text!=='string'||Buffer.byteLength(text)>LIMITS.partBytes||hash(text)!==ref)throw failure('STORAGE_CORRUPT','저장 조각의 크기나 검증값이 맞지 않습니다.');validate(JSON.parse(text));
 const file=location(root,'chunks',ref);try{const prior=await fs.readFile(await safeFile(root,file),'utf8');if(hash(prior)!==ref)throw failure('STORAGE_CORRUPT','기존 저장 조각을 확인하지 못했습니다.');return;}catch(error){if(error.code!=='ENOENT')throw error;}
 await atomic(root,file,text);
}
function reader(root) {
 const cache=new Map(),sizes=new Map();let bytes=0;
 async function node(ref) {
  const file=location(root,'chunks',ref);if(cache.has(ref))return cache.get(ref).value;
  let text;try{text=await fs.readFile(await safeFile(root,file),'utf8');}catch(error){if(error.code==='ENOENT')throw failure('STORAGE_PART_MISSING','저장 자료 일부가 없습니다. 백업 복구를 확인하세요.');throw error;}
  if(Buffer.byteLength(text)>LIMITS.partBytes||hash(text)!==ref)throw failure('STORAGE_CORRUPT','저장 조각 검증에 실패했습니다.');const value=validate(JSON.parse(text));
  const size=Buffer.byteLength(text);while(cache.size&&bytes+size>LIMITS.cacheBytes){const key=cache.keys().next().value;bytes-=cache.get(key).size;cache.delete(key);}cache.set(ref,{value,size});bytes+=size;return value;
 }
 async function value(ref,depth=0) {
  if(depth===0)await size(ref);
  if(depth>256)throw failure('STORAGE_CORRUPT','저장 참조가 너무 깊습니다.');const item=await node(ref);
  if(item.type==='value')return item.value;if(item.type==='textPart')return item.text;
  if(item.type==='object'){const result={};for(const [key,child]of item.entries)Object.defineProperty(result,key,{value:await value(child,depth+1),enumerable:true,writable:true,configurable:true});return result;}
  const parts=[];for(const child of item.refs)parts.push(await value(child,depth+1));
  if(item.type==='text')return parts.join('');if(item.type==='array')return parts;if(item.type==='concat')return parts.flat();if(item.type==='merge')return Object.fromEntries(parts.flatMap(part=>Object.entries(part)));
 }
 async function select(ref,keys) {
  if(!keys.length)return value(ref);const item=await node(ref);
  if(item.type==='object'){const child=item.entries.find(([key])=>key===String(keys[0]));return child?select(child[1],keys.slice(1)):undefined;}
  if(item.type==='value'){let result=item.value;for(const key of keys)result=result&&Object.hasOwn(result,key)?result[key]:undefined;return result;}
  if(item.type==='merge'&&item.keyRanges){const index=item.keyRanges.findIndex(([first,last])=>String(keys[0])>=first&&String(keys[0])<=last);return index<0?undefined:select(item.refs[index],keys);}let result=await value(ref);for(const key of keys)result=result?.[key];return result;
 }
 async function verify(ref,seen=new Set(),depth=0) {if(seen.has(ref))return seen;if(depth>256)throw failure('STORAGE_CORRUPT','저장 참조가 너무 깊습니다.');seen.add(ref);const item=await node(ref);for(const child of references(item))await verify(child,seen,depth+1);return seen;}
 async function size(ref,depth=0){
  if(sizes.has(ref))return sizes.get(ref);if(depth>256)throw failure('STORAGE_CORRUPT','저장 참조가 너무 깊습니다.');const item=await node(ref);let length=2;
  if(item.type==='value')length=Buffer.byteLength(JSON.stringify(item.value));
  else if(item.type==='textPart')length=Buffer.byteLength(JSON.stringify(item.text));
  else if(item.type==='object'){for(let at=0;at<item.entries.length;at++){const [key,child]=item.entries[at];length+=Buffer.byteLength(JSON.stringify(key))+1+await size(child,depth+1)+(at?1:0);if(length>LIMITS.documentBytes)break;}}
  else for(let at=0;at<item.refs.length;at++){length+=await size(item.refs[at],depth+1)+(['concat','merge','text'].includes(item.type)?-2:0)+(item.type==='text'||at===0?0:1);if(length>LIMITS.documentBytes)break;}
  if(length>LIMITS.documentBytes)throw failure('STORAGE_QUOTA','자료를 합친 크기가 현재 등록 한도를 넘습니다.');sizes.set(ref,length);return length;
 }

 return {node,value,select,verify,size};
}
async function encode(root,value) {
 const emit=async node=>{const text=JSON.stringify(node),ref=hash(text);await put(root,ref,text);return ref;};
 async function build(item,depth=0) {
  if(depth>128)throw failure('STORAGE_SCHEMA_UNSUPPORTED','자료의 중첩 단계가 너무 깊습니다.');
  const text=JSON.stringify({type:'value',value:item});if(Buffer.byteLength(text)<=LIMITS.pageBytes){const links=new Set();const visit=value=>{if(value&&typeof value==='object'){for(const ref of value.storageRefs||[])if(/^[a-f0-9]{64}$/.test(ref))links.add(ref);for(const [key,child]of Object.entries(value))if(key!=='storageRefs')visit(child);}};visit(item);return emit({type:'value',value:item,...(links.size?{links:[...links]}:{})});}
  if(typeof item==='string'){const refs=[];for(let at=0;at<item.length;){let end=Math.min(item.length,at+32768);if(end<item.length&&/[\uD800-\uDBFF]/.test(item[end-1]))end--;refs.push(await emit({type:'textPart',text:item.slice(at,end)}));at=end;}return emit({type:'text',refs});}
  if(Array.isArray(item)) {
   const refs=[],counts=[];let page=[],size=0;
   for(const entry of item){const count=Buffer.byteLength(JSON.stringify(entry));if(size+count>LIMITS.pageBytes/2&&page.length){counts.push(page.length);refs.push(await build(page,depth+1));page=[];size=0;}if(count>LIMITS.pageBytes/2){refs.push(await emit({type:'array',refs:[await build(entry,depth+1)]}));counts.push(1);}else{page.push(entry);size+=count;}}
   if(page.length){counts.push(page.length);refs.push(await build(page,depth+1));}return emit({type:'concat',refs,counts});
  }
  const keys=Object.keys(item).sort();if(keys.length>64){const refs=[],keyRanges=[];let group=[],used=0;const flush=async()=>{if(!group.length)return;refs.push(await build(Object.fromEntries(group),depth+1));keyRanges.push([group[0][0],group.at(-1)[0]]);group=[];used=0;};for(const key of keys){const size=Buffer.byteLength(JSON.stringify({[key]:item[key]}));if(size>LIMITS.pageBytes/2){await flush();refs.push(await emit({type:'object',entries:[[key,await build(item[key],depth+1)]]}));keyRanges.push([key,key]);continue;}if(used+size>LIMITS.pageBytes/2||group.length>=256)await flush();group.push([key,item[key]]);used+=size;}await flush();return emit({type:'merge',refs,keyRanges});}
  const entries=[];for(const key of keys){if(key==='storageRefs'&&Array.isArray(item[key])){const refs=[],counts=[];for(let at=0;at<item[key].length;at+=1024){const page=item[key].slice(at,at+1024);refs.push(await emit({type:'value',value:page,links:page}));counts.push(page.length);}entries.push([key,await emit({type:'concat',refs,counts})]);}else entries.push([key,await build(item[key],depth+1)]);}return emit({type:'object',entries});
 }
 return build(value);
}
module.exports={put,reader,encode,references,validate};
