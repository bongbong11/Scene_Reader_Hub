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

function diagnosticChecks(snapshot=diagnosticSnapshot()) {
    const check=(ok,detail)=>({result:ok?'pass':'check',detail});
    return {
        automatic:[check(snapshot.automatic.chatReady,'현재 채팅의 저장 상태를 읽었는지'),check(snapshot.automatic.sourceCurrent!==false,'마지막 판정이 현재 설정·시트와 일치하는지')],
        opportunities:[check(Boolean(snapshot.opportunities?.key)||snapshot.opportunities?.status==='scene_paused',snapshot.opportunities?.status==='scene_paused'?'장면 일시 정지로 사건·인물 추첨을 건너뜀':'사건·인물 등장 단계별 판정 기록이 있는지')],
        scene:[check(!snapshot.scene.error,'장면 중단·복귀 판정에 확인 실패가 없는지')],
        storage:[check(snapshot.storage.available,'서버 저장소가 응답하는지'),check(snapshot.storage.version>=2,'저장소 버전이 지원 범위인지')],
        retrieval:[check(Boolean(deps.RETRIEVAL_PROVIDERS[snapshot.retrieval.provider]),'선택한 검색 방식이 지원되는지')],
        characters:[check(Number.isInteger(snapshot.characters.characters)&&Number.isInteger(snapshot.characters.npcs),'인물 목록을 읽을 수 있는지')],
        injection:[check(snapshot.automatic.sourceCurrent!==false || snapshot.injection.activeChars===0,'오래된 인물·세계관 판정문이 활성 주입으로 남지 않았는지'),check(snapshot.injection.activeChars===0 || snapshot.injection.activeMatchesJudgment,'활성 주입문이 마지막 판정과 일치하는지')],
    };
}
return {noteDiagnostic, diagnosticSnapshot, diagnosticChecks};
}
