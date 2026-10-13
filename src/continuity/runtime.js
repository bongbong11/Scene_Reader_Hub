import {sourceRp} from './source-refs.js';
import {commitAnalyzedContinuity} from './commit-analysis.js';
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
    const history = [...(run?.history || await deps.loadStateHistory(chatKey))];
    run?.assert();
    const result = commitAnalyzedContinuity(rec,history,candidates);
    if (!result.accepted.length) return [];
    const processed = new Set(result.accepted.map(item=>item.id));
    rec.pendingContinuityCandidates = (rec.pendingContinuityCandidates || []).filter(item=>!processed.has(item.id));
    rec.lastContinuityTrace = { ...(rec.lastContinuityTrace || {}), status:'verified', verdicts: result.accepted.map(item=>({type:item.type,verdict:item.verdict,reason:'연결모델 분석 · 형식과 가시 근거 확인'})) };
    if (run) run.history = history; else await deps.saveStateHistory(history, chatKey);
    run?.assert();
    return result.accepted;
}
return {pendingExternalCandidates,sourceUserRpForOutput,commitContinuityCandidates};
}
