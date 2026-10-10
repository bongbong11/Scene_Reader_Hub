import {splitOocText,isVisibleRoleplayMessage} from '../context/messages.js';
import {selectedStateSwipe} from '../character/state-contract.js';
import {ANALYSIS_LIMITS,normalizeAnalysisRuntime} from './analysis-contract.js';
export function sourceRp(message) {if(!isVisibleRoleplayMessage(message)||message.extra?.ooc_chat)return '';const value=splitOocText(message.mes);return value.malformed?'':value.rpText.trim();}
export function messageRef(chatRef,chat,index,fingerprint) {const m=chat[index];return {originChatRef:chatRef,messageIndex:index,role:m?.is_user?'user':'assistant',swipeId:selectedStateSwipe(m),contentHash:fingerprint(String(m?.mes||''))};}
export function validateSourceRefs(refs,{chatRef,chat,fingerprint,allowHidden=false}) {return refs.every(ref=>{const m=chat[ref.messageIndex],rp=m&&splitOocText(m.mes);return ref.originChatRef===chatRef&&m&&!m.is_system&&!m.extra?.ooc_chat&&ref.role===(m.is_user?'user':'assistant')&&ref.swipeId===selectedStateSwipe(m)&&ref.contentHash===fingerprint(String(m.mes||''))&&(allowHidden?Boolean(rp?.rpText.trim())&&!rp.malformed:Boolean(sourceRp(m)));});}
export function observeCompletedTurn(value,{chatRef,chat,outputIndex,fingerprint,generationType='',cycleId=''}) {
 const runtime=normalizeAnalysisRuntime(value),output=chat[outputIndex];
 if(!output||output.is_user||output.is_system||!sourceRp(output))return runtime;
 if(Number.isInteger(runtime.coveredThrough)&&outputIndex<=runtime.coveredThrough&&!runtime.turnRefs.some(turn=>turn.outputIndices.includes(outputIndex)))return runtime;
 let userIndex=outputIndex-1;while(userIndex>=0&&!chat[userIndex]?.is_user)userIndex--;
 const previous=runtime.turnRefs.find(turn=>turn.outputIndices.includes(outputIndex));
 const userRef=userIndex>=0?messageRef(chatRef,chat,userIndex,fingerprint):null;
 const group=previous||(['continue','swipe','regenerate'].includes(generationType)&&userRef?runtime.turnRefs.find(turn=>turn.userRef?.messageIndex===userIndex):null);
 if(group){group.refs=group.refs.filter(ref=>ref.messageIndex!==outputIndex);group.refs.push(messageRef(chatRef,chat,outputIndex,fingerprint));if(!group.outputIndices.includes(outputIndex))group.outputIndices.push(outputIndex);}
 else if(userRef||generationType==='normal')runtime.turnRefs.push({id:fingerprint([chatRef,cycleId||userRef||outputIndex,outputIndex]),userRef,outputIndices:[outputIndex],refs:[...(userRef&&sourceRp(chat[userIndex])?[userRef]:[]),messageRef(chatRef,chat,outputIndex,fingerprint)]});
 runtime.anchor??={chatRef,startIndex:runtime.turnRefs[0]?.refs[0]?.messageIndex??outputIndex};return runtime;
}
function consumed(runtime,ref,section) {return runtime.rangeLedger.filter(r=>['complete','not_requested'].includes(r.coverage?.[section])).flatMap(r=>r.refs||[]).filter(r=>r.contentHash===ref.contentHash&&r.messageIndex===ref.messageIndex&&r.originChatRef===ref.originChatRef).map(r=>r.part||{start:0,end:Infinity});}
function contiguousThrough(parts) {let end=0;for(const part of parts.sort((a,b)=>a.start-b.start)){if(part.start>end)break;end=Math.max(end,part.end);}return end;}
export function pendingTurnCount(value,{chat,persona=false}={}) {const runtime=normalizeAnalysisRuntime(value);return runtime.turnRefs.filter(turn=>turn.refs.some(ref=>['continuity','evolution',...(persona?['persona']:[])].some(section=>contiguousThrough(consumed(runtime,ref,section))<sourceRp(chat[ref.messageIndex]).length))).length;}
export function buildAnalysisWindow(value,{chatRef,chat,fingerprint,persona=false,maxChars=ANALYSIS_LIMITS.sourceChars}) {
 const runtime=normalizeAnalysisRuntime(value),segments=[],seen=new Set();let budget=maxChars;
 for(const turn of runtime.turnRefs)for(const ref of turn.refs){
  const key=JSON.stringify([ref.originChatRef,ref.messageIndex,ref.contentHash]);if(seen.has(key))continue;seen.add(key);
  if(!validateSourceRefs([ref],{chatRef,chat,fingerprint}))continue;
  const text=sourceRp(chat[ref.messageIndex]);
  const sections=['continuity','evolution',...(persona?['persona']:[])];
  let start=Math.min(...sections.map(section=>{let end=0;for(const part of consumed(runtime,ref,section).sort((a,b)=>a.start-b.start)){if(part.start>end)break;end=Math.max(end,part.end);}return end;}));
  if(start>=text.length)continue;if(budget<128)break;
  let end=Math.min(text.length,start+budget);
  if(end<text.length){const boundary=Math.max(text.lastIndexOf('\n',end),text.lastIndexOf('. ',end));if(boundary>start+Math.floor(budget/2))end=boundary+1;}
  const segment={ref:'r'+segments.length,identity:{...ref,part:{start,end}},role:ref.role,text:text.slice(start,end),turnId:turn.id};segments.push(segment);budget-=segment.text.length;
 }
 return {id:fingerprint(segments.map(s=>s.identity)),segments,sourceRefs:segments.map(s=>s.identity),turnCount:new Set(segments.map(s=>s.turnId)).size,persona};
}

export function pruneAnalysisRuntime(value,{chat,persona=false,fingerprint}) {
 const runtime=normalizeAnalysisRuntime(value),sections=['continuity','evolution',...(persona?['persona']:[])];
 // An unread hidden message is a gap, not an empty successfully scanned range.
 const covered=ref=>{const message=chat[ref.messageIndex],rp=message&&splitOocText(message.mes);return Boolean(rp?.rpText.trim())&&!rp.malformed&&(!fingerprint||validateSourceRefs([ref],{chatRef:ref.originChatRef,chat,fingerprint,allowHidden:true}))&&sections.every(section=>contiguousThrough(consumed(runtime,ref,section))>=rp.rpText.trim().length);};
 runtime.coverageGaps=runtime.turnRefs.flatMap(t=>t.refs).filter(ref=>!sourceRp(chat[ref.messageIndex])&&!covered(ref)).map(ref=>({...ref,reason:'source_unavailable'}));
 const done=turn=>turn.refs.every(covered);
 const discarded=[],remaining=[];for(const turn of runtime.turnRefs)(done(turn)?discarded:remaining).push(turn);
 if(discarded.length){
  const through=Math.max(...discarded.flatMap(t=>t.refs.map(r=>r.messageIndex)));
  runtime.coveredThrough=Math.max(runtime.coveredThrough??-1,through);runtime.turnRefs=remaining;
  const needed=new Set(runtime.turnRefs.flatMap(t=>t.refs.map(r=>JSON.stringify([r.messageIndex,r.contentHash]))));
  runtime.rangeLedger=runtime.rangeLedger.map(r=>({...r,refs:r.refs.filter(ref=>needed.has(JSON.stringify([ref.messageIndex,ref.contentHash])))})).filter(r=>r.refs.length);
 }
 return runtime;
}
