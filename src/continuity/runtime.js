import {sourceRp} from './analysis-window.js';
export function createContinuityRuntime(deps) {
function pendingExternalCandidates(rec, sourceRevision) {
    return deps.activePendingCandidates(rec?.pendingContinuityCandidates, {
        chatKey: deps.stateChatKey(),
        chat: deps.getContext().chat,
        sourceRevision,
    });
}

function sourceUserRpForOutput(outputIndex) {
    const chat = deps.getContext().chat || [];
    for (let index = Number(outputIndex) - 1; index >= 0; index -= 1) {
        if (!chat[index]?.is_user) continue;
        const rp=sourceRp(chat[index]);if(rp)return rp;
    }
    return '';
}

async function commitContinuityCandidates(rec, candidates, decisions, details, run = null) {
    run?.assert();
    const chatKey = run?.identity || deps.stateChatKey();
    if (!deps.settings.continuityEnabled || !candidates.length) return [];
    const result = deps.applyContinuityVerdicts(deps.continuityView(rec), candidates, decisions, { opportunity: rec.sceneOpportunity });
    const processed = new Set(candidates.map((item) => item.id));
    rec.pendingContinuityCandidates = (rec.pendingContinuityCandidates || []).filter((item) => !processed.has(item.id));
    rec.lastContinuityTrace = { ...(rec.lastContinuityTrace || {}), status: 'verified', verdicts: candidates.map((item, index) => {
        const detail = details[`continuity_candidate_${index}`] || {};
        return { label: item.label, type: item.type, selected: detail.selected || '응답 없음', certainty: detail.certainty || 0, threshold: detail.threshold || 0, verdict: decisions[`continuity_candidate_${index}`] || 'reject', reason: detail.fallbackApplied ? '확신도 부족·기본값 적용' : 'Jev 선택 유지' };
    }) };
    if (!result.accepted.length) return [];
    deps.assignContinuity(rec, result.continuity);
    const sourceIndex = Math.min(...result.accepted.map((item) => Number(item.sourceIdentity?.assistantIndex)));
    const history = [...(run?.history || await deps.loadStateHistory(chatKey))];
    run?.assert();
    const applyToSnapshot = (snapshot) => {
        if (!snapshot) return;
        deps.assignContinuity(snapshot, deps.applyContinuityVerdicts(deps.continuityView(snapshot), candidates, decisions, { opportunity: rec.sceneOpportunity }).continuity);
    };
    for (const entry of history) {
        if (Number(entry.assistantIndex) === sourceIndex) {
            entry.after ||= {};
            applyToSnapshot(entry.after);
        } else if (Number(entry.assistantIndex) > sourceIndex) {
            entry.before ||= {}; entry.after ||= {};
            applyToSnapshot(entry.before);
            applyToSnapshot(entry.after);
        }
    }
    applyToSnapshot(rec.pendingPlan?.stateSnapshot);
    if (run) run.history = history; else await deps.saveStateHistory(history, chatKey);
    run?.assert();
    return result.accepted;
}
return {pendingExternalCandidates,sourceUserRpForOutput,commitContinuityCandidates};
}
