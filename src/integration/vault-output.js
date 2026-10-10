// Optional output audit. The vault supplies its schema and retains storage ownership.
export function vaultAnalysisBridge(window) {
    const bridge = window?.KnowledgeVaultV1;
    try { if (typeof bridge?.isEnabled === 'function' && bridge.isEnabled() !== true) return null; }
    catch { return null; }
    return bridge?.version === '0.1.0' && typeof bridge.beginAnalysis === 'function'
        && typeof bridge.commitAnalysis === 'function' && typeof bridge.analysisCurrent === 'function' ? bridge : null;
}
