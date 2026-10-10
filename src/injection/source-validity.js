import {visibilityKey,judgmentVisibilityCurrent} from '../context/visibility.js';
export {judgmentVisibilityCurrent};
export function injectionSourceCurrent(value,{chat,chatKey}) {
 return Boolean(value)&&value.chatKey===chatKey&&(value.visibilityKeyV1??'visible')===visibilityKey(chat||[]);
}
function parts(message){
 if(typeof message?.content==='string')return [{object:message,key:'content'}];
 if(Array.isArray(message?.content))return message.content.filter(p=>p?.type==='text'&&typeof p.text==='string').map(object=>({object,key:'text'}));
 return [];
}
export function captureOwnedBlocks(body,texts){
 const result=[];
 for(let index=0;index<(body?.messages||[]).length;index++)for(const [partIndex,part] of parts(body.messages[index]).entries()){
  const text=part.object[part.key],ranges=[];let ambiguous=false;
  for(const block of [...new Set(texts.filter(Boolean))]){const start=text.indexOf(block);if(start>=0){if(text.indexOf(block,start+block.length)>=0)ambiguous=true;ranges.push({start,end:start+block.length,text:block});}}
  const nonOverlapping=ranges.sort((a,b)=>a.start-b.start||b.end-a.end).filter((r,i,all)=>!all.slice(0,i).some(other=>other.start<=r.start&&other.end>=r.end));
  if(nonOverlapping.length)result.push({index,partIndex,role:body.messages[index].role,original:text,ambiguous,ranges:nonOverlapping});
 }
 return result;
}
export function stripOwnedBlocks(body,manifest){
 let removed=0;
 const ambiguous=()=>{throw Object.assign(new Error('숨김 변경 후 주입을 안전하게 분리하지 못했습니다. 다시 실행해 주세요.'),{code:'HUB_STALE_INJECTION'});};
 for(const entry of manifest){
  const candidates=[];
  for(const message of body.messages||[])if(message.role===entry.role)for(const part of parts(message)){
   const text=part.object[part.key],start=text.indexOf(entry.original);
   if(start>=0){if(text.indexOf(entry.original,start+entry.original.length)>=0)ambiguous();candidates.push({part,start});}
  }
  if(candidates.length>1||(entry.ambiguous&&candidates.length))ambiguous();
  if(!candidates.length){if((body.messages||[]).some(m=>parts(m).some(p=>entry.ranges.some(r=>p.object[p.key].includes(r.text)))))ambiguous();continue;}
  const {part,start}=candidates[0];let text=part.object[part.key];
  for(const range of [...entry.ranges].sort((a,b)=>b.start-a.start)){text=text.slice(0,start+range.start)+text.slice(start+range.end);removed++;}
  part.object[part.key]=text;
 }
 return removed;
}
