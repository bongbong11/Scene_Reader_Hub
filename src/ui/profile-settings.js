export async function changeAnalysisProfile(deps, profileId) {
    const chatKey = deps.stateChatKey();
    const report = detail => deps.noteDiagnostic?.('profile_settings', {module:'src/ui/profile-settings.js', ...detail});
    deps.invalidateReasonerJobs({reason:'analysis_profile_changed'});
    try {
        await deps.saveGlobal('reasonerProfileId', profileId);
    } catch (error) {
        report({phase:'settings',status:'failed',errorKind:error.code || 'PROFILE_SETTINGS_SAVE_FAILED'});
        throw error;
    }
    report({phase:'settings',status:'succeeded'});
    if (chatKey !== deps.stateChatKey() || deps.settings.reasonerProfileId !== profileId) return;
    const rec = deps.record(true);
    rec.pendingContinuityCandidates = [];
    rec.repetitionGuard = null;
    rec.lastReasonerSource = null;
    rec.lastJudgment = null;
    try {
        await deps.persistChat(chatKey, rec);
        if (chatKey === deps.stateChatKey()) await deps.clearInjection({chatKey});
        report({phase:'cleanup',status:'succeeded'});
    } catch (error) {
        report({phase:'cleanup',status:'failed',errorKind:error.code || 'PROFILE_CLEANUP_FAILED'});
        throw Object.assign(new Error('프로필은 저장됐지만 이전 판독 정리를 마치지 못했습니다. 다시 판독해 주세요.'), {
            code:'PROFILE_CLEANUP_FAILED',phase:'cleanup',settingsSaved:true,cause:error,
        });
    } finally {
        if (chatKey === deps.stateChatKey()) deps.renderReasonerProfiles();
    }
}
