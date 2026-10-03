import { safeDetail } from './events.js';
// Extracted from Scene Reader 0.26.2; behavior preserved.
export function createDiagnostics(deps) {
function noteDiagnostic(stage, detail = {}) {
    detail=safeDetail(detail);
    deps.hub?.report(stage, stage.toUpperCase(), detail);
    deps.diagnosticEvents.push({ at: new Date().toISOString(), stage, chat: deps.stableFingerprint(deps.stateChatKey()), ...detail });
    if (deps.diagnosticEvents.length > 80) deps.diagnosticEvents.splice(0, deps.diagnosticEvents.length - 80);
}

function diagnosticSnapshot() {
    const rec=deps.record();
    const judgment=rec?.lastJudgment;
    const route=judgment?.sceneIntimacy?.route || rec?.sceneIntimacy?.route || 'normal';
    const sourceCurrent=judgment ? judgment.sourceKey===deps.sourceRevisionKey(rec,deps.selectedWorld(rec)) : null;
    return {
        hub: deps.hub?.snapshot() || null,
        automatic:{chatReady:deps.chatReadyKey===deps.stateChatKey(),enabled:Boolean(deps.settings?.enabled),autoJudge:Boolean(deps.settings?.autoJudge),cycleMode:deps.activeGenerationCycle?.mode||'',cycleInputMatches:judgment&&deps.activeGenerationCycle?.inputKey?judgment.inputKey===deps.activeGenerationCycle.inputKey:null,lastJudgmentAt:judgment?.judgedAt||null,sourceCurrent},
        opportunities:judgment?.drawDiagnostics||{status:route==='paused'?'scene_paused':'not_judged'},
        scene:{route,phase:judgment?.sceneIntimacy?.phase||rec?.sceneIntimacy?.phase||'',level:judgment?.sceneIntimacy?.level??rec?.sceneIntimacy?.level??null,error:judgment?.sceneIntimacy?.error||rec?.sceneIntimacy?.error||'',evidenceId:judgment?.sceneIntimacy?.evidence||null},
        storage:{available:deps.serverStoreAvailable,version:deps.storageVersion,chatReady:deps.chatReadyKey===deps.stateChatKey(),savedJudgment:Boolean(judgment)},
        retrieval:{provider:deps.settings?.retrievalProvider||'',worldStatus:judgment?.worldSelection?.retrievalStatus||'',worldCandidates:judgment?.worldSelection?.candidateIds?.length||0,worldApplied:judgment?.worldSelection?.appliedIds?.length||0,characterCandidates:(judgment?.characterTrace||[]).reduce((count,person)=>count+(person.candidateCount||0),0)},
        characters:{enabled:Boolean(deps.characterStore.enabled),characters:deps.characterStore.characters.length,npcs:deps.characterStore.npcs.length,persona:Boolean(deps.characterStore.persona),selectedRecords:(judgment?.characterTrace||[]).reduce((count,person)=>count+(person.injectedRuleIds?.length||0),0)},
        injection:{judgmentChars:judgment?.payload?.length||0,activeChars:deps.activeInjectionPayload.length,worldChars:judgment?.worldPayload?.length||0,macroChars:deps.activeMacroPayload.length,worldMacroChars:deps.activeWorldMacroPayload.length,activeMatchesJudgment:judgment?deps.activeInjectionPayload===String(judgment.payload||''):deps.activeInjectionPayload.length===0},
    };
}

return {noteDiagnostic, diagnosticSnapshot};
}
