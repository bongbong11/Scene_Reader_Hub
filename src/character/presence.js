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
 return {type:'choice',instructions:`Observe ${person.name}'s actual participation in the LATEST RP exchange, independently of next-response importance, emotions or record relevance. Identify actual speakers and actors from pronouns, narration and the supplied identity mapping; the name need not be repeated. Dialogue with an NPC does not remove another speaking character. Current texts and calls count, but do not grant access to unsent thoughts or unseen surroundings. A later departure overrides earlier presence. Memories, imagined reactions and unanswered outgoing messages are not current participation. A shared multi-person card title or author label does not establish which member speaks.${person.mainSillyTavernName ? ` This is the single registered main character corresponding to the host card ${person.mainSillyTavernName}; spelling, suffix or language differences do not make them absent.` : ''}`,criteria:PARTICIPATION_CHOICES};
}
const ACTIVE_PARTICIPATION=['direct','remote','continuing'];
export function participationBasis(answer) {
 return Object.hasOwn(PARTICIPATION_CHOICES,answer?.choice||'') ? answer.choice : 'unknown';
}
// Next-response importance is never independent evidence that an actor vanished.
export function resolveCharacterPresence(plan, details, answers, observed={}) {
 for(const person of plan){
  const key=`character_${person.index}_presence`, evidence=Object.hasOwn(observed,person.id)?observed[person.id]:answers[`character_${person.index}_participation`];
  const basis=participationBasis(evidence),legacy=details[key];
  const detail=legacy||{selected:basis,policyEffective:basis,effective:'background',fallbackApplied:basis==='unknown',certainty:certainty(evidence),threshold:0};
  let resolved=detail.effective,reason='policy';
  if([...ACTIVE_PARTICIPATION,'participating'].includes(basis)){resolved='active';reason=basis==='participating'?'participation_group':basis==='continuing'?'continuing_presence':'observed_participation';}
  else if(['departed','reference'].includes(basis)){resolved='absent';reason=basis;}
  else if(!legacy||detail.fallbackApplied){resolved='background';reason='uncertain_presence';}
  Object.assign(detail,{participationEvidence:basis,presenceUncertain:basis==='unknown'&&resolved==='background',effective:resolved,coordinatorFinal:resolved,presenceResolution:reason,threshold:0,
   rule:({participation_group:'참여 확인 · 직접/원격/유지의 세부 구분만 불확실',observed_participation:'최신 RP의 실제 참여 확인',continuing_presence:'장면에 남아 있는 인물 · 발화 강제 없음',uncertain_presence:'참여 미확인 · 부재로 확정하지 않음',departed:'최신 RP의 퇴장·연결 종료',reference:'회상·언급만 확인'})[reason]||detail.rule});
  details[key]=detail;
 }
}
