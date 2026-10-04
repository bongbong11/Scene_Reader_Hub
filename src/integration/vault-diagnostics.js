// Copy only the companion's bounded, anonymous diagnostics schema.
const enums = new Set('unknown selection injection audit validation storage lifecycle idle reading judged registered skipped error analyzing checked capacity cancelled repair success partial saved failed no_change learned uncertain invalid rollback assembly request confirmed missing unavailable not_expected full told observed read reported world private missing_or_invalid_result learner_validation_failed actor_unresolved invalid_method_or_scope confidence_rejected evidence_rejected scope_mismatch too_many_learners no_new_holder accepted source_truncated stale disabled duplicate no_cards no_source PROFILE_UNAVAILABLE PROFILE_AUDIT_FAILED VAULT_STORAGE_FAILED storage_failed analysis_failed PROFILE_TIMEOUT NETWORK_TIMEOUT NETWORK_ERROR HTTP_401 HTTP_403 HTTP_429 HTTP_500 INVALID_JSON'.split(' '));
const numbers = new Set('reportVersion eventLimit droppedEvents cardCount omittedCards cardPosition holderCount savedAcquisitionCount omittedAcquisitions seq candidateCount unassessedCount assessedCount relevantCount omittedCount checkedCount learnedCount partialCount unresolvedCount changedCount outputIndex durationMs'.split(' '));
for (const code of ['PROFILE_INVALID_RESPONSE','PROFILE_AUTH_FAILED','PROFILE_FORBIDDEN','PROFILE_RATE_LIMIT','PROFILE_SERVER_ERROR','PROFILE_NETWORK_ERROR','PROFILE_CANCELLED','PROFILE_BILLING','PROFILE_REQUEST_TOO_LARGE','PROFILE_NOT_FOUND','PROFILE_REQUEST_REJECTED']) enums.add(code);
const booleans = new Set(['enabled','public','evidencePresent','relevant']);
const collections = new Set(['cards','acquisitions','events','includedCards','selections']);
function project(value, key='', depth=0) {
    if (depth>7) return undefined;
    if (value===null) return null;
    if (numbers.has(key)) return typeof value==='number' && Number.isFinite(value) ? Math.max(0,Math.min(1000000,Math.floor(value))) : undefined;
    if (booleans.has(key)) return typeof value==='boolean'?value:undefined;
    if (['stage','status','code','scope','method','reason','phase'].includes(key)) return enums.has(value)?value:'unknown';
    if (['cardRef','actorRef','auditRef','ref'].includes(key)) return typeof value==='string' && /^(?:card-|actor-|vault-audit-)\d+$/.test(value)?value:undefined;
    if (key==='module') return ['index.js','vault/acquisition.js','vault/analysis-runtime.js'].includes(value)?value:undefined;
    if (key==='at') return typeof value==='string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value)?value:undefined;
    if (key==='sceneDate') return typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)?value:undefined;
    if (collections.has(key)) return Array.isArray(value)?value.slice(0,key==='acquisitions'?20:120).map(v=>project(v,key==='includedCards'?'ref':'',depth+1)).filter(v=>v!==undefined):undefined;
    if (!['','lastFailure','receipt'].includes(key) || !value || typeof value!=='object' || Array.isArray(value)) return undefined;
    return Object.fromEntries(Object.entries(value).slice(0,60).map(([k,v])=>[k,project(v,k,depth+1)]).filter(([,v])=>v!==undefined));
}
export function vaultDiagnosticReport(host) {
    try {
        const bridge=host?.KnowledgeVaultV1;
        if (bridge?.version!=='0.1.0' || typeof bridge.diagnostics!=='function') return {};
        const report=bridge.diagnostics();
        if (report?.reportVersion!==1) return {knowledgeVault:{status:'unavailable'}};
        return {knowledgeVault:project(report)};
    } catch { return {knowledgeVault:{status:'unavailable'}}; }
}
