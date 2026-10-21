import {MEMORY_REFERENCE_ENABLED} from "./memory.js";
import {normalizeBehaviorMode} from '../injection/character-behavior.js';
import {CORE_SHA256} from "../vendor/character-reasoner/version.js";
import {knowledgeVaultRevision} from '../integration/knowledge-vault.js';
import {visibilityKey} from './visibility.js';
import {DECISION_CONTRACT_VERSION} from '../decision/policy.js';

// Page query results are a cache, not a new applied file. Immutable page roots
// still invalidate the source when the actual stored bank is replaced.
function bankSource(bank) {
    if(!bank)return bank;
    // Derived search metadata is not a user edit or a new source revision.
    const {npcIndex,...stable}=bank;
    if(!bank.pagedRecords)return stable;
    const {records,recordIndices,...source}=stable;
    return source;
}

export function createSourceRevision(deps) {
function sourceRevisionKey(rec, world, {includeVault = true} = {}) {
    const vaultRevision=includeVault ? knowledgeVaultRevision(deps.window?.KnowledgeVaultV1,deps.stableFingerprint) : '';
    return deps.stableFingerprint({
        visibility:visibilityKey(deps.getContext?.()?.chat||[]),
        ...(rec?.sharedSource?{sharedReference:[rec.sharedSource.baselineId,rec.sharedSource.baselineRevision,rec.sharedSource.assetId,rec.sharedSource.epoch,rec.sharedReference?.sourceCheckpoint]}:{}),
        ...(vaultRevision ? {vaultRevision} : {}),
        world: { id: world?.id || '', name: world?.name || '', hint: world?.hint || '', prompt: world?.prompt || '', franchise: Boolean(world?.franchise), calendarTopics: world?.calendarTopics || [], advanced: world?.advanced || null },
        reasoner: deps.settings.reasonerProfileId || '',
        retrieval: [deps.settings.retrievalProvider, deps.settings.retrievalModel, deps.settings.retrievalVertexAuth, deps.settings.retrievalVertexRegion, deps.settings.retrievalVertexProject],
        memoryReferenceEnabled: MEMORY_REFERENCE_ENABLED,
        decisionContract: DECISION_CONTRACT_VERSION,
        continuityContract: 4,continuityConfig:[deps.settings.continuityEnabled],
        characterSelectorContract: 8,
        injectionAssemblyContract: 19,
        seasonalContract: 2,
        seasonalDate: deps.seasonalDate?.revision() || null,
        characterBehaviorMode: normalizeBehaviorMode(deps.settings.characterBehaviorMode),
        characterStateContract: 2,
        characterStateRevision: Number(rec?.characterStateRevision) || 0,
        sceneGateContract: 4,
        drawContract: 3,
        characterCore: CORE_SHA256,
        characterEnabled: Boolean(deps.characterStore.enabled),
        preferences: Object.fromEntries(Object.entries(rec?.preferences||{}).filter(([key])=>!['injectionMode','worldInjectionMode','scenePresetSlot','worldPresetSlot'].includes(key))), recentTurns: deps.settings.recentTurns,
        lorebooks: MEMORY_REFERENCE_ENABLED && rec?.preferences?.lorebookMemory ? {
            books: deps.linkedCharacterBooks(deps.getContext(), deps.worldInfoModule?.world_info).map(name => [name, deps.lorebookRevisions.get(name) || '']),
            caseSensitive: deps.worldInfoModule?.world_info_case_sensitive,
            wholeWords: deps.worldInfoModule?.world_info_match_whole_words,
        } : null,
        characters: [...deps.characterStore.characters, deps.characterStore.persona, ...deps.characterStore.npcs].filter(Boolean).map((entry) => ({ id: entry.id, name: entry.name, aliases: entry.aliases,
            ...(deps.characterStore.enabled ? { source: entry.source, sourceHash: entry.sourceHash, sourceVisibleToMain: entry.sourceVisibleToMain, npcRole: entry.npcRole, antagonist: entry.antagonist, trackArousal: entry.trackArousal, recordBank: bankSource(entry.recordBank), selectedLore: entry.selectedLore } : {}) })),
    });
}

function stagedRecord(rec) {
    return JSON.parse(JSON.stringify(rec));
}
return {sourceRevisionKey,stagedRecord};
}
