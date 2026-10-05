import { MEMORY_REFERENCE_ENABLED } from "../memory/context.js";
import { CORE_SHA256 } from "../vendor/character-reasoner/version.js";
import { knowledgeVaultRevision } from '../integration/knowledge-vault.js';

export function createSourceRevision(deps) {
function sourceRevisionKey(rec, world, {includeVault = true} = {}) {
    const vaultRevision=includeVault ? knowledgeVaultRevision(deps.window?.KnowledgeVaultV1,deps.stableFingerprint) : '';
    return deps.stableFingerprint({
        ...(rec?.sharedSource?{sharedReference:[rec.sharedSource.baselineId,rec.sharedSource.baselineRevision,rec.sharedSource.assetId,rec.sharedSource.epoch,rec.sharedReference?.sourceCheckpoint]}:{}),
        ...(vaultRevision ? {vaultRevision} : {}),
        world: { id: world?.id || '', name: world?.name || '', hint: world?.hint || '', prompt: world?.prompt || '', franchise: Boolean(world?.franchise), calendarTopics: world?.calendarTopics || [], advanced: world?.advanced || null },
        reasoner: deps.settings.reasonerProfileId || '',
        retrieval: [deps.settings.retrievalProvider, deps.settings.retrievalModel, deps.settings.retrievalVertexAuth, deps.settings.retrievalVertexRegion, deps.settings.retrievalVertexProject],
        memoryReferenceEnabled: MEMORY_REFERENCE_ENABLED,
        characterSelectorContract: 6,
        injectionAssemblyContract: 6,
        characterStateContract: 2,
        characterStateRevision: Number(rec?.characterStateRevision) || 0,
        sceneGateContract: 2,
        drawContract: 2,
        characterCore: CORE_SHA256,
        characterEnabled: Boolean(deps.characterStore.enabled),
        preferences: rec?.preferences, recentTurns: deps.settings.recentTurns,
        lorebooks: MEMORY_REFERENCE_ENABLED && rec?.preferences?.lorebookMemory ? {
            books: deps.linkedCharacterBooks(deps.getContext(), deps.worldInfoModule?.world_info).map(name => [name, deps.lorebookRevisions.get(name) || '']),
            caseSensitive: deps.worldInfoModule?.world_info_case_sensitive,
            wholeWords: deps.worldInfoModule?.world_info_match_whole_words,
        } : null,
        characters: [...deps.characterStore.characters, deps.characterStore.persona, ...deps.characterStore.npcs].filter(Boolean).map((entry) => ({ id: entry.id, name: entry.name, aliases: entry.aliases,
            ...(deps.characterStore.enabled ? { source: entry.source, sourceHash: entry.sourceHash, sourceVisibleToMain: entry.sourceVisibleToMain, npcRole: entry.npcRole, antagonist: entry.antagonist, trackArousal: entry.trackArousal, recordBank: entry.recordBank, selectedLore: entry.selectedLore } : {}) })),
    });
}

function stagedRecord(rec) {
    return JSON.parse(JSON.stringify(rec));
}
return {sourceRevisionKey,stagedRecord};
}
