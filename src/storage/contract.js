import { ADVANCED_DEFAULT_ELEMENTS } from "../world/advanced-library.js";

// Deliberately retain Scene Reader storage and prompt identifiers across replacement.
export const MODULE = 'sceneReader';
export const INJECT_KEY = 'scene-reader-router';
export const WORLD_INJECT_KEY = 'scene-reader-world';
export const STATE_CAPTURE_KEY = 'scene-reader-state-capture';
export const IN_CHAT = 1;
export const SYSTEM_ROLE = 0;
export const JEV_KEY_STORAGE = 'sceneReader.jevApiKey';
export const JEV_API_URL = '/api/plugins/scene-reader-jev/systemone';
export const STORAGE_API_URL = '/api/plugins/scene-reader-jev/storage';
export const JEV_MODEL = 'jev-latest';
export const PROMPT_MACRO = 'scene-reader';
export const WORLD_PROMPT_MACRO = 'scene-reader-world';
export const MAX_TRANSCRIPT_CHARS = 18000;
export const STATE_DB_NAME = 'scene-reader-state';
export const STATE_DB_STORE = 'chat-snapshots';
export const STATE_HISTORY_LIMIT = 12;
export const OWNER_UNLOCK_STORAGE = 'scene-reader-owner-unlocked-v1';
export const OWNER_PROMPT_STORAGE = 'scene-reader-owner-prompt-v1';
export const OWNER_PASSWORD_HASH = 'cb5ec39967a4c59c8b08b4396291761f404f51bcf23d42b4cff47011169feab2';
export const DEFAULTS = {
    enabled: true,
    showChatIcon: true,
    autoJudge: true,
    recentTurns: 3,
    showConfidence: true,
    ownerUnlocked: false,
    continuityEnabled: false,
    reasonerProfileId: '',
    jevProvider: 'typesafe',
    retrievalProvider: 'transformers',
    retrievalModel: '',
    retrievalVertexAuth: 'express',
    retrievalVertexRegion: 'global',
    retrievalVertexProject: '',
};
export const CHAT_DEFAULTS = {
    charmMemory: false, lorebookMemory: false,
    worldDirection: 'natural',
    relationshipDirection: 'dynamic',
    negativePriority: false,
    settingsContract: 4,
    progressIntensity: 1,
    characterVolume: 'generous',
    npcRecordLimit: 3,
    newGenerationEnabled: true,
    spontaneousMode: 'off',
    developmentStyle: 'balanced',
    progressionMode: 'natural',
    judgmentStyle: 'balanced',
    injectionMode: 'depth',
    worldInjectionMode: 'preset',
    scenePresetSlot: {identifier:'main',side:'after'},
    worldPresetSlot: {identifier:'main',side:'after'},
    selectedWorldId: 'current',
    seasonalReferences: [],
    advancedEnabled: false,
    advancedStyle: 'balanced',
    advancedElements: ADVANCED_DEFAULT_ELEMENTS,
    relationshipPace: 'medium',
    resolutionPace: 'medium',
    physicalIntimacyPace: 'medium',
    allowUserImpersonation: false,
    profileEmotionJudgment: false,
    fightSustain: false,
    villainEnabled: true,
    appearanceChance: 10,
    socialEnabled: false,
    worldHostility: false,
    privatePromptEnabled: false,
    npcToUser: false,
    userMisfortune: false,
};
