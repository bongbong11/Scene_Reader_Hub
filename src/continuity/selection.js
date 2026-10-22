import {eligibleSource} from './source-eligibility.js';
import {visibleItemState} from './state-updates.js';

export function confirmedContinuity(state,{record,chatRef,chat,fingerprint,inherited=false}) {
    const options={record,chatRef,chat,fingerprint,inherited};
    const valid=item=>!item.userExcluded&&(!(item.sourceRefs?.length)||eligibleSource(item.sourceRefs,options));
    return {...state,items:(state.items||[]).filter(valid).map(item=>visibleItemState(item,options)),knowledge:(state.knowledge||[]).filter(valid),dependencies:(state.dependencies||[]).filter(valid),followups:(state.followups||[]).filter(valid),references:(state.references||[]).filter(valid)};
}

export function selectActiveContinuity(state,transcript,{actorIds=[],opportunity=0,limits={}}={}) {
    const ids=new Set(actorIds.flatMap(actor=>typeof actor==='object'&&actor?[actor.id,actor.name,...(actor.aliases||[])]:[actor]).filter(Boolean).map(id=>String(id).toLocaleLowerCase()));
    const hay=String(transcript||'').toLocaleLowerCase();
    const relevant=e=>[...(e.owners||[]),e.character].some(id=>id&&ids.has(String(id).toLocaleLowerCase()))||[e.label,e.summary,e.factId,e.action,...(e.owners||[])].some(text=>String(text||'').length>=3&&hay.includes(String(text).toLocaleLowerCase()));
    const active=e=>!['completed','resolved','cancelled'].includes(e.lifecycle);
    const visible=list=>(list||[]).filter(item=>!item.userExcluded);
    const latest=Math.max(0,...['items','knowledge','dependencies'].flatMap(key=>visible(state[key]).map(e=>Date.parse(e.updatedAt)||0)));
    const score=e=>Number(relevant(e))*2+Number(latest>0&&Date.parse(e.updatedAt)===latest)*3;
    const ranked=list=>[...list].sort((a,b)=>score(b)-score(a)||(Date.parse(b.updatedAt)||0)-(Date.parse(a.updatedAt)||0));
    // Relevance orders bounded context; it is not a second admission test.
    // Off-screen obligations remain usable even without a repeated name/phrase.
    const items=ranked(visible(state.items).filter(active)).slice(0,limits.items??4);
    const selectedIds=new Set(items.map(item=>item.id));
    const knowledge=ranked(visible(state.knowledge)).sort((a,b)=>Number((b.relatedStateIds||[]).some(id=>selectedIds.has(id)))-Number((a.relatedStateIds||[]).some(id=>selectedIds.has(id)))).slice(0,limits.knowledge??3);
    const dependencies=ranked(visible(state.dependencies)).slice(0,limits.dependencies??2);
    const followups=ranked(visible(state.followups).filter(e=>e.status==='available'&&!e.executed&&e.lastOffered!==opportunity&&!(state.items||[]).some(item=>item.id===e.relatedStateId&&!active(item))))
        .sort((a,b)=>Number(selectedIds.has(b.relatedStateId))-Number(selectedIds.has(a.relatedStateId))||(a.lastOffered??-1)-(b.lastOffered??-1)).slice(0,limits.followups??2);
    return {items,knowledge,dependencies,followups,references:ranked(visible(state.references)).slice(0,limits.references??2)};
}
