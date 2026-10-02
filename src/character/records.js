import { CORE_SHA256 } from "../vendor/character-reasoner/version.js";
import { stableFingerprint } from "../decision/policy.js";
import { API_VERSION, RECORD_VERSION, COMPILER_VERSION, buildSources, promptText, compileResult, hardValidateRecords, validateImport } from "../vendor/character-reasoner/index.js";
const PREVIOUS_CORE_SHA256 = 'cba337f701c7760b1414e394bb27c24c65ec23e0267197d2b4d8f68b21c35c11';
const PRIOR_NPC_GUIDANCE_SHA256 = '188587338d3f4cad54d8e6f217418d13b437b18b0ddaaa3ca6d60ee724685783';
const PRIOR_RELEASE_CORE_SHA256 = 'a47ce2f4e7c738b1095044067ff9a33661f2ee5235b00a2fd77891a8d1fbedd6';

export const RECORD_LABELS = { fact:'사실·정체성', core:'성향·습관', value:'가치·목표', relationship:'관계', knowledge:'지식 상태', reaction:'조건별 반응', expression:'표현', boundary:'경계·제한', capability:'능력·접근' };
export function sourceSnapshot(entry) {
    return { entity_type:entry.kind, entity_name:entry.name, npc_role:entry.npcRole === 'villain' ? 'antagonist' : entry.npcRole,
        sources:buildSources(entry.kind, entry.source, entry.selectedLore || []) };
}
export function recordSourceFingerprint(entry) { return stableFingerprint(sourceSnapshot(entry)); }
export function compilerRequest(entry) {
    const draft = sourceSnapshot(entry);
    if (!draft.sources.length) throw new Error('시트 또는 선택한 로어북 원문이 필요합니다.');
    return { draft, prompt:promptText(draft) };
}
export function createRecordBank(input, entry, analysisId) {
    const draft = sourceSnapshot(entry);
    const output = compileResult(input, draft);
    return { coreFingerprint:CORE_SHA256, apiVersion:API_VERSION, recordVersion:RECORD_VERSION, compilerVersion:COMPILER_VERSION,
        sourceFingerprint:recordSourceFingerprint(entry), analysisId, analyzedAt:new Date().toISOString(),
        ...output, sources:draft.sources,
        recordIds:output.records.map((_, i) => `char:${entry.id}@${analysisId}:r${i+1}`) };
}
export function recordBankIsCurrent(entry) {
    const bank=entry?.recordBank;
    const currentCore = bank?.coreFingerprint===CORE_SHA256 && bank.apiVersion===API_VERSION && bank.compilerVersion===COMPILER_VERSION;
    const compatiblePrevious = (bank?.coreFingerprint===PREVIOUS_CORE_SHA256 && bank.apiVersion===1 && bank.compilerVersion==='1.0.0') ||
        ([PRIOR_NPC_GUIDANCE_SHA256, PRIOR_RELEASE_CORE_SHA256].includes(bank?.coreFingerprint) && bank.apiVersion===API_VERSION && bank.compilerVersion==='1.1.0');
    if (!bank || !(currentCore || compatiblePrevious) || bank.recordVersion!==RECORD_VERSION || bank.sourceFingerprint!==recordSourceFingerprint(entry)) return false;
    try {
        if (bank.sourceMethod === 'external_json_import') {
            const imported = validateImport(bank);
            return imported.output.entity_type === entry.kind && imported.output.entity_name === entry.name &&
                JSON.stringify(imported.output.records) === JSON.stringify(bank.records) &&
                JSON.stringify(imported.output.intimacy_reference) === JSON.stringify(bank.intimacy_reference || {text:'',source_ids:[]});
        }
        const records=structuredClone(bank.records);
        const sources=sourceSnapshot(entry).sources;
        hardValidateRecords(records, new Set(sources.map(source=>source.id)));
        const reference=validateImport(bank).output.intimacy_reference;
        if(JSON.stringify(reference)!==JSON.stringify(bank.intimacy_reference || {text:'',source_ids:[]}) || reference.source_ids.some(id=>!sources.some(source=>source.id===id)))return false;
        return bank.entity_type===entry.kind && bank.entity_name===entry.name &&
            JSON.stringify(records)===JSON.stringify(bank.records) &&
            JSON.stringify(bank.sources)===JSON.stringify(sources);
    } catch { return false; }
}
export function createImportedRecordBank(input, entry, analysisId) {
    const imported = validateImport(input);
    if (imported.output.entity_type !== entry.kind || imported.output.entity_name !== entry.name) throw new Error('JSON의 인물 종류와 이름이 적용할 인물과 다릅니다.');
    return { ...imported.output, source_set_id:imported.source_set_id, import_log:imported.import_log,
        sourceMethod:'external_json_import', sources:[], coreFingerprint:CORE_SHA256,
        apiVersion:API_VERSION, recordVersion:RECORD_VERSION, compilerVersion:COMPILER_VERSION,
        sourceFingerprint:recordSourceFingerprint(entry), analysisId, analyzedAt:new Date().toISOString(),
        recordIds:imported.output.records.map((_,i)=>`char:${entry.id}@${analysisId}:r${i+1}`) };
}
export function currentRecords(entry) { return recordBankIsCurrent(entry) ? entry.recordBank.records : []; }
