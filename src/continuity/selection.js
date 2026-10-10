import {validateSourceRefs} from './analysis-window.js';
export function confirmedContinuity(state,{chatRef,chat,fingerprint,inherited=false}) {
 const valid=item=>!(item.sourceRefs?.length)||item.sourceRefs.every(ref=>ref.originChatRef?ref.originChatRef===chatRef?validateSourceRefs([ref],{chatRef,chat,fingerprint,allowHidden:true}):inherited:true);
 return {...state,items:(state.items||[]).filter(valid),knowledge:(state.knowledge||[]).filter(valid),dependencies:(state.dependencies||[]).filter(valid),followups:(state.followups||[]).filter(valid)};
}
export function selectActiveContinuity(state,transcript,{actorIds=[],opportunity=0,limits={}}={}) {
 const ids=new Set(actorIds),hay=String(transcript||'').toLocaleLowerCase();
 const relevant=e=>[...(e.owners||[]),e.character].some(id=>ids.has(id))||[e.label,e.summary,e.factId,e.action,...(e.owners||[])].some(text=>String(text||'').length>=3&&hay.includes(String(text).toLocaleLowerCase()));
 const active=e=>!['completed','resolved','cancelled'].includes(e.lifecycle);
 const ranked=list=>[...list].sort((a,b)=>Number(relevant(b))-Number(relevant(a)));
 return {items:ranked((state.items||[]).filter(e=>active(e)&&relevant(e))).slice(0,limits.items??4),knowledge:ranked((state.knowledge||[]).filter(relevant)).slice(0,limits.knowledge??3),dependencies:ranked((state.dependencies||[]).filter(e=>relevant(e)||e.stateId==='event:current'||e.stateId==='relationship:current')).slice(0,limits.dependencies??2),followups:(state.followups||[]).filter(e=>e.status==='available'&&!e.executed&&e.expiry>=opportunity&&e.lastOffered!==opportunity&&relevant(e)).slice(-(limits.followups??2))};
}
