// Optional output audit. The vault supplies its schema and retains storage ownership.
export function vaultAnalysisBridge(window) {
    const bridge = window?.KnowledgeVaultV1;
    return bridge?.version === '0.1.0' && typeof bridge.beginAnalysis === 'function'
        && typeof bridge.commitAnalysis === 'function' && typeof bridge.analysisCurrent === 'function' ? bridge : null;
}
export function notifyVaultOutput(deps, rec, outputIndex) {
    if (!vaultAnalysisBridge(deps.window) || !deps.settings.enabled) return;
    const output = deps.getContext().chat?.[outputIndex];
    if (!output || output.is_user || output.is_system || output.extra?.ooc_chat || !String(output.mes || '').trim()) return;
    const pending = { outputIndex, outputText: String(output.mes), outputFingerprint: deps.stableFingerprint(output.mes),
        sourceKey: deps.sourceRevisionKey(rec, deps.selectedWorld(rec)), inputKey: rec.pendingPlan?.inputKey || '' };
    // A background audit must never hold the chat's generation event open.
    void deps.postVerifiedCharacterOutput(rec, pending, {}, 'vault_output').catch(() => {
        deps.noteDiagnostic?.('auxiliary_usage', { module: 'src/integration/vault-output.js', status: 'failed', errorKind: 'PROFILE_AUDIT_FAILED' });
    });
}
