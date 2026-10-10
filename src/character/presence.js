import {certainty} from '../decision/policy.js';

export const PARTICIPATION_CHOICES = {
    unknown:'No reliable current participation evidence.',
    direct:'This person actually speaks, acts, or has a live viewpoint in the latest RP exchange, with no later departure.',
    remote:'This person actually sends a current message or speaks on a current call, with no later end to that exchange.',
    continuing:'This person remains in the ongoing scene but does not actively respond in the latest exchange.',
    departed:'A later departure, ended call, or scene change explicitly removes this person from the current interaction.',
    reference:'Only a memory, quoted past message, speculation, name mention, or unanswered outgoing message references this person.',
};

export function participationQuestion(person) {
 return {type:'choice',instructions:`Observe ${person.name}'s actual participation in the LATEST RP exchange, independently of next-response importance, emotions or record relevance. Dialogue with an NPC does not remove another speaking character. Current texts and calls count, but do not grant access to unsent thoughts or unseen surroundings. A later departure overrides earlier presence. Memories, imagined reactions and unanswered outgoing messages are not current participation. A shared multi-person card title or author label does not establish which member speaks.${person.mainSillyTavernName ? ' Differing sheet language or spelling alone is not absence.' : ''}`,criteria:PARTICIPATION_CHOICES};
}
const ACTIVE_PARTICIPATION=['direct','remote','continuing'];
export function participationBasis(answer) {
 if(!Object.hasOwn(PARTICIPATION_CHOICES,answer?.choice||''))return 'unknown';
 if(certainty(answer)>=0.55)return answer.choice;
 // Direct/remote/continuing compete as subtypes, but all establish involvement.
 // Do not mistake subtype uncertainty for uncertainty that this actor participates.
 const values=Object.keys(PARTICIPATION_CHOICES).map(key=>answer.probabilities?.[key]);
 if(ACTIVE_PARTICIPATION.includes(answer.choice)&&values.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1)
  &&Math.abs(values.reduce((sum,v)=>sum+v,0)-1)<=0.06
  &&ACTIVE_PARTICIPATION.reduce((sum,key)=>sum+answer.probabilities[key],0)>=0.75)return 'participating';
 return 'unknown';
}
// Next-response importance is never independent evidence that an actor vanished.
export function resolveCharacterPresence(plan, details, answers, observed={}) {
 for(const person of plan){
  const key=`character_${person.index}_presence`, evidence=Object.hasOwn(observed,person.id)?observed[person.id]:answers[`character_${person.index}_participation`];
  const basis=participationBasis(evidence),legacy=details[key];
  const detail=legacy||{selected:basis,policyEffective:'background',effective:'background',fallbackApplied:basis==='unknown',certainty:certainty(evidence),threshold:0.55};
  let resolved=detail.effective,reason='policy';
  if([...ACTIVE_PARTICIPATION,'participating'].includes(basis)){resolved='active';reason=basis==='participating'?'participation_group':basis==='continuing'?'continuing_presence':'observed_participation';}
  else if(['departed','reference'].includes(basis)){resolved='absent';reason=basis;}
  else if(!legacy||detail.fallbackApplied){resolved='background';reason='uncertain_presence';}
  Object.assign(detail,{participationEvidence:basis,presenceUncertain:basis==='unknown'&&resolved==='background',effective:resolved,coordinatorFinal:resolved,presenceResolution:reason,
   rule:({participation_group:'참여 확인 · 직접/원격/유지의 세부 구분만 불확실',observed_participation:'최신 RP의 실제 참여 확인',continuing_presence:'장면에 남아 있는 인물 · 발화 강제 없음',uncertain_presence:'참여 미확인 · 부재로 확정하지 않음',departed:'최신 RP의 퇴장·연결 종료',reference:'회상·언급만 확인'})[reason]||detail.rule});
  details[key]=detail;
 }
}
