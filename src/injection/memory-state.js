import {selectEvolutionForActors,evolutionMatchesBase} from '../character/evolution.js';
const footer='Use these states where relevant; do not repeatedly mention them. Preserve scope and private knowledge. Plans are not completed actions. New supported changes may update them.';
const clean=t=>String(t||'').replace(/[<>]/g,'').trim();
export function packMemoryState(lines,limit) {const wrapper='<CURRENT_STATE>\n\n'+footer+'\n</CURRENT_STATE>';let size=wrapper.length;const selected=[],omitted=[];for(const item of lines){if(size+item.text.length+1<=limit){selected.push(item);size+=item.text.length+1;}else omitted.push(item.id);}return {text:selected.length?'<CURRENT_STATE>\n'+selected.map(x=>x.text).join('\n')+'\n'+footer+'\n</CURRENT_STATE>':'',ids:selected.map(x=>x.id),omitted};}
export function buildMemoryStateBlock(record,{actors=[],selectedContinuity=null,chosenContinuity=[],limit=1000,store}={}) {
 const names=new Map(actors.map(a=>[a.id,a.name]));const lines=[];
 // A compact replacement travels through the canonical record slot exactly
 // once. Budget-exceeded rewrites are review material, not a second instruction.
 for(const e of selectEvolutionForActors(record.characterEvolutionV1,actors.map(a=>a.id)).filter(e=>!e.baseRef&&evolutionMatchesBase(e,store)&&(e.scope?.targetIds||[]).every(id=>names.has(id))).slice(-3)){
  const targets=(e.scope?.targetIds||[]).map(id=>names.get(id)).filter(Boolean).join(', '),text=e.compactRule||e.stateSummary;
  if(text)lines.push({id:e.id,text:`${clean(names.get(e.actorId)||'Registered person')}${targets?' toward '+clean(targets):''}: ${e.epistemic&&e.epistemic!=='established'?'['+e.epistemic+'] ':''}${clean(text)}`});
 }
 for(const e of selectedContinuity?.items||[])lines.push({id:e.id,text:`${(e.owners||[]).map(id=>clean(names.get(id)||id)).join(', ')}: ${e.epistemic&&e.epistemic!=='established'?'['+e.epistemic+'] ':''}${clean(e.label)} (${clean(e.lifecycle)}${e.pressure&&e.pressure!=='none'?', '+clean(e.pressure):''}).`});
 for(const e of selectedContinuity?.dependencies||[])if(e.pressure&&e.pressure!=='none')lines.push({id:e.stateId,text:`Established ${clean(e.stateId)} remains ${clean(e.pressure)}${e.reason?': '+clean(e.reason):''}. Do not silently mark it resolved.`});
 if(chosenContinuity?.data?.action)lines.push({id:chosenContinuity.id,text:`Optional secondary beat: ${clean(chosenContinuity.data.action)}. Only a supported bounded step; no unseen completed action.`});
 return packMemoryState(lines,limit);
}
