import { rollNpcProfile, rollVillainProfile } from '../../prompt-library.js';
import { overrideDecision } from './coordinator.js';

export const ARRIVALS = {
    none: 'No offered arrival can naturally fit this scene now; preserve existing interaction.',
    visit: 'A plausible direct visit fits the location, access and ongoing interaction.',
    encounter: 'A natural encounter fits an established activity or route.',
    participate: 'Someone can naturally join or become involved in the current activity.',
    background: 'A peripheral person can become locally involved without inventing prior presence or knowledge.',
    contact: 'A plausible remote contact fits; do not default to calls/messages just because the scene is quiet.',
};
export function makeAppearanceOffer(rec, key, random = Math.random) {
    if (rec.appearanceOffer?.key === key && rec.appearanceOffer.chance === (Number(rec.preferences.appearanceChance)||10) && rec.appearanceOffer.villainAllowed === Boolean(rec.preferences.villainEnabled)) return rec.appearanceOffer;
    const chance = Number(rec.preferences.appearanceChance) || 10;
    const roll = 1 + Math.floor(random() * 100);
    const availableNpc = true;
    const availableVillain = rec.preferences.villainEnabled;
    const passed = (availableNpc || availableVillain) && roll <= chance;
    const kind = availableVillain && (!availableNpc || random() < 0.3) ? 'villain' : 'npc';
    const candidate = passed ? (kind === 'villain' ? {...rollVillainProfile(random),status:'pending'} : rollNpcProfile('natural',random)) : null;
    return {key,roll,chance,villainAllowed:Boolean(rec.preferences.villainEnabled),passed:Boolean(passed),kind,candidate,opportunity:rec.sceneOpportunity,at:new Date().toISOString()};
}
export function addAppearanceQuestions(questions, offer) {
    // New-person eligibility is judged once, via arrival mode, after the common draw.
    for (const key of ['npc_route','villain_route']) {
        if (!questions[key]) continue;
        questions[key] = {...questions[key],criteria:{...questions[key].criteria}};
        delete questions[key].criteria.create;
        delete questions[key].criteria.replace;
        questions[key].instructions += ' This question manages existing people only. A separately offered new person uses arrival_mode; do not require existing-person routing to approve that arrival.';
    }
    if (offer.passed && questions.npc_knowledge) questions.npc_knowledge.instructions += ' For the offered new candidate, only its bounded general role competence and what it could perceive on arrival are available. A proposed entrance cannot establish prior observation, acquaintance, or hidden scene-specific access.';
    if (offer.passed) questions.arrival_mode = {type:'choice',instructions:'A common appearance draw has ALREADY passed. Evaluate the offered candidate once: can a proportionate entrance fit current location, access, world and interaction? It need not be indispensable or advance a major plot. Static, emotional or quiet scenes can admit a natural arrival. Do not assume another answer. Choose one fitting method, or none for a concrete incompatibility. Do not duplicate a registered sheet person. This is a proposal, not established presence.',criteria:ARRIVALS};
}
export function applyAppearanceOffer(rec, details, decisions) {
    if (rec.preferences.settingsContract < 3) return;
    const offer=rec.appearanceOffer;
    // Ignore injected/obsolete create answers unless the drawn offer was accepted.
    for (const key of ['npc_route','villain_route']) if (['create','replace'].includes(decisions[key])) overrideDecision(details,decisions,key,'none','새 인물은 선추첨·등장 판정 경로로만 연결');
    if (!offer?.passed || !Object.hasOwn(ARRIVALS,decisions.arrival_mode) || decisions.arrival_mode==='none') return;
    // Existing cast participation is handled independently by character records.
    // A valid offered arrival must reach the common action budget for selection.
    const key=offer.kind==='villain'?'villain_route':'npc_route';
    overrideDecision(details,decisions,key,'create','등장 선추첨 통과 · 자연스러운 등장 방식 선택');
    if(offer.kind==='npc') {
        overrideDecision(details,decisions,'npc_target','none','새로 제안된 인물은 기존 인물 대상 선택과 분리');
        overrideDecision(details,decisions,'npc_role','participant','당첨된 인물의 자연스러운 참여');
        overrideDecision(details,decisions,'npc_weight','brief','첫 등장은 현재 장면에 맞게 짧게');

    }
}
