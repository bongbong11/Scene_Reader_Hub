import {sha256Fallback} from '../shared/security.js';
const encoder=new TextEncoder();
export const hashPart=text=>sha256Fallback(text);
export function storageReferences(value,result=new Set()) {if(value&&typeof value==='object'){if(Array.isArray(value.storageRefs))for(const ref of value.storageRefs)if(/^[a-f0-9]{64}$/.test(ref))result.add(ref);for(const [key,item]of Object.entries(value))if(key!=='storageRefs')storageReferences(item,result);}return [...result];}
export async function encodeTree(value,emit,{pageBytes=256*1024,signal}={}) {
 let ticks=0;
 const put=async node=>{signal?.throwIfAborted();const text=JSON.stringify(node);return emit(hashPart(text),text);};
 async function build(item,depth=0) {
  signal?.throwIfAborted();if(depth>128)throw new Error('자료의 중첩 단계가 너무 깊습니다.');if(++ticks%32===0)await new Promise(resolve=>setTimeout(resolve,0));
  if(encoder.encode(JSON.stringify({type:'value',value:item})).length<=pageBytes){const links=storageReferences(item);return put({type:'value',value:item,...(links.length?{links}:{})});}
  if(typeof item==='string'){const refs=[];for(let at=0;at<item.length;){let end=Math.min(item.length,at+32768);if(end<item.length&&/[\uD800-\uDBFF]/.test(item[end-1]))end--;refs.push(await put({type:'textPart',text:item.slice(at,end)}));at=end;}return put({type:'text',refs});}
  if(Array.isArray(item)){const refs=[],counts=[];let page=[],size=0;for(const entry of item){const count=encoder.encode(JSON.stringify(entry)).length;if(size+count>pageBytes/2&&page.length){counts.push(page.length);refs.push(await build(page,depth+1));page=[];size=0;}if(count>pageBytes/2){refs.push(await put({type:'array',refs:[await build(entry,depth+1)]}));counts.push(1);}else{page.push(entry);size+=count;}}if(page.length){counts.push(page.length);refs.push(await build(page,depth+1));}return put({type:'concat',refs,counts});}
  const keys=Object.keys(item).sort();if(keys.length>64){const refs=[],keyRanges=[];let group=[],used=0;const flush=async()=>{if(!group.length)return;refs.push(await build(Object.fromEntries(group),depth+1));keyRanges.push([group[0][0],group.at(-1)[0]]);group=[];used=0;};for(const key of keys){const size=encoder.encode(JSON.stringify({[key]:item[key]})).length;if(size>pageBytes/2){await flush();refs.push(await put({type:'object',entries:[[key,await build(item[key],depth+1)]]}));keyRanges.push([key,key]);continue;}if(used+size>pageBytes/2||group.length>=256)await flush();group.push([key,item[key]]);used+=size;}await flush();return put({type:'merge',refs,keyRanges});}
  const entries=[];for(const key of keys){if(key==='storageRefs'&&Array.isArray(item[key])){const refs=[],counts=[];for(let at=0;at<item[key].length;at+=1024){const page=item[key].slice(at,at+1024);refs.push(await put({type:'value',value:page,links:page}));counts.push(page.length);}entries.push([key,await put({type:'concat',refs,counts})]);}else entries.push([key,await build(item[key],depth+1)]);}return put({type:'object',entries});
 }return build(value);
}
export async function decodeTree(ref,get,{signal,depth=0}={}) {
 signal?.throwIfAborted();if(depth>256)throw new Error('저장 참조가 너무 깊습니다.');const item=await get(ref);const children=async refs=>{const result=[];for(const child of refs)result.push(await decodeTree(child,get,{signal,depth:depth+1}));return result;};
 if(item.type==='value')return item.value;if(item.type==='textPart')return item.text;
 if(item.type==='object'){const result={};for(const [key,child]of item.entries)Object.defineProperty(result,key,{value:await decodeTree(child,get,{signal,depth:depth+1}),enumerable:true,writable:true,configurable:true});return result;}
 const parts=await children(item.refs);if(item.type==='text')return parts.join('');if(item.type==='array')return parts;if(item.type==='concat')return parts.flat();if(item.type==='merge')return Object.fromEntries(parts.flatMap(part=>Object.entries(part)));throw new Error('저장 조각 형식을 확인하지 못했습니다.');
}
