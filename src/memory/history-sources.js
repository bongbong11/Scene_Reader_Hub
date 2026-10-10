import {readCharm,linkedCharacterBooks} from '../context/memory.js';
import {sourceRp,messageRef} from '../continuity/analysis-window.js';
const MAX_REFERENCE=256*1024;
const check=signal=>signal?.throwIfAborted();
async function boundedRead(task,signal,timeoutMs=10000){
 let timer,abort;
 try{return await Promise.race([Promise.resolve().then(task),new Promise((_,reject)=>{
  timer=setTimeout(()=>reject(Object.assign(new Error('기억 읽기 시간 초과'),{code:'HISTORY_READ_TIMEOUT'})),timeoutMs);
  abort=()=>reject(Object.assign(new Error('취소'),{name:'AbortError'}));signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 })]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
function characterAllowed(entry,context){
 const filter=entry.characterFilter;if(!filter)return true;
 const character=context.characters?.[context.characterId],name=String(character?.avatar||'').replace(/\.[^/.]+$/,'');
 for(const [required,values]of [[filter.names,[name]],[filter.tags,context.tagMap?.[character?.avatar]||[]]])if(required?.length){const match=required.some(v=>values.includes(v));if(filter.isExclude?match:!match)return false;}
 return true;
}
export function historyBooks(context,module){return linkedCharacterBooks(context,module?.world_info);}
export async function readHistorySources({window,context,chatRef,worldInfoModule,books,fingerprint,isCurrent,signal,excluded=[]}){
 check(signal);const sources=[],statuses={chat:'empty',charm:'unavailable',lorebook:'empty'};
 const bridge=window?.__charmBridge;
 // Optional summary failure must not discard usable lorebook/chat sources.
 try{
  const bridgeId=typeof bridge?.getCharId==='function'?bridge.getCharId():null;
  const charm=await boundedRead(()=>readCharm(bridge,{identity:chatRef,isCurrent,timeoutMs:9000,maxChars:MAX_REFERENCE}),signal);
  check(signal);if(!isCurrent())throw Object.assign(new Error('채팅 변경'),{name:'AbortError'});
  statuses.charm=charm.status;
  if(bridgeId!==null&&bridgeId!==bridge.getCharId())statuses.charm='stale';
  else for(const entry of charm.entries||[])sources.push({id:'charm:'+entry.sourceId,kind:'charm_summary',scope:'character_reference',text:entry.text,hash:entry.contentHash,limited:charm.status==='limited'});
 }catch(error){if(signal?.aborted||error.name==='AbortError')throw error;statuses.charm=error.code==='HISTORY_READ_TIMEOUT'?'timeout':'error';}
 const linked=historyBooks(context,worldInfoModule),selected=books?linked.filter(name=>books.includes(name)):linked;
 let errors=0,limited=false;
 for(const name of selected){
  check(signal);
  try{
   const data=await boundedRead(()=>worldInfoModule.loadWorldInfo(name),signal);
   if(!data?.entries||typeof data.entries!=='object')throw new Error('형식');
   for(const [uid,entry]of Object.entries(data.entries)){
    if(entry?.disable||typeof entry?.content!=='string'||!entry.content.trim()||!characterAllowed(entry,context))continue;
    const full=entry.content;limited||=full.length>MAX_REFERENCE;
    sources.push({id:'lore:'+name+':'+uid,kind:'lorebook',scope:'linked_reference',text:full.slice(0,MAX_REFERENCE),hash:fingerprint(full),limited:full.length>MAX_REFERENCE});
   }
  }catch(error){if(signal?.aborted)throw error;errors++;}
 }
 statuses.lorebook=errors?errors===selected.length?'error':'partial':limited?'limited':sources.some(s=>s.kind==='lorebook')?'ready':'empty';
 for(let index=0;index<(context.chat||[]).length;index++){
  check(signal);const message=context.chat[index],text=excluded.includes(index)?'':sourceRp(message);
  if(!text)continue;
  sources.push({id:'chat:'+index,kind:'chat',scope:'current_room',text,hash:fingerprint(String(message.mes||'')),identity:messageRef(chatRef,context.chat,index,fingerprint)});
 }
 statuses.chat=sources.some(s=>s.kind==='chat')?'ready':'empty';
 return {sources,statuses,limited:sources.some(s=>s.limited),signature:fingerprint(sources.map(s=>[s.id,s.hash])),books:selected};
}
export function historyWindow(sources,{cursor={source:0,offset:0},chatRef,checkpointId,fingerprint,maxChars=18000,persona=false}){
 const segments=[];let index=cursor.source||0,offset=cursor.offset||0,budget=maxChars;
 while(index<sources.length&&budget>=128){
  const source=sources[index];let end=Math.min(source.text.length,offset+budget);
  if(end<source.text.length){const boundary=Math.max(source.text.lastIndexOf('\n',end),source.text.lastIndexOf('. ',end));if(boundary>offset+Math.floor(budget/2))end=boundary+1;if(/[\uD800-\uDBFF]/.test(source.text[end-1]))end--;}
  const identity={...(source.identity||{originChatRef:chatRef,messageIndex:-1,role:'reference',swipeId:0,contentHash:source.hash}),sourceKind:source.kind,sourceId:source.id,checkpointId,part:{start:offset,end}};
  segments.push({ref:'r'+segments.length,role:identity.role,text:source.text.slice(offset,end),identity,scope:source.scope,turnId:source.id});budget-=end-offset;
  if(end>=source.text.length){index++;offset=0;}else{offset=end;break;}
 }
 return {id:fingerprint([checkpointId,segments.map(s=>s.identity)]),segments,sourceRefs:segments.map(s=>s.identity),turnCount:segments.filter(s=>s.role==='user').length,persona,next:index>=sources.length?null:{source:index,offset}};
}
