import {normalizeOpportunities} from '../scene/opportunities.js';
import {restoreOpportunityPreferences} from '../scene/opportunity-settings.js';
import { normalizePresetSlot } from '../injection/preset-catalog.js';
import { effectivePreferences } from './common-preferences.js';
// Shared storage contract retained across extension replacement.
export function createRecordRepository(deps) {
function record(create = false) {
    const key = deps.stateChatKey();
    if (!deps.chatRecords.has(key) && create) deps.chatRecords.set(key, {lastJudgment:null,pendingPlan:null});
    const value = deps.chatRecords.get(key) || null;
    if (value && create) {
        deps.migrateKnowledge(value);
        const saved = value.preferences || {};
        value.preferences = Object.fromEntries(Object.entries(deps.CHAT_DEFAULTS).map(([key, fallback]) => [key, Object.hasOwn(saved, key) ? saved[key] : Array.isArray(fallback) ? [...fallback] : fallback]));
        if (!Object.hasOwn(saved, 'relationshipDirection')) value.preferences.relationshipDirection = saved.characterToUser ? 'hostile' : 'dynamic';
        const validValue = (valueToCheck, choices, fallback) => Object.hasOwn(choices, valueToCheck) ? valueToCheck : fallback;
        value.preferences.worldDirection = validValue(value.preferences.worldDirection, deps.WORLD_DIRECTIONS, deps.CHAT_DEFAULTS.worldDirection);
        value.preferences.relationshipDirection = validValue(value.preferences.relationshipDirection, deps.RELATIONSHIP_DIRECTIONS, deps.CHAT_DEFAULTS.relationshipDirection);
        const migratedDevelopment = deps.normalizeDevelopmentPreferences(saved);
        value.preferences = deps.normalizeDevelopmentPreferences({...value.preferences, developmentStyle:migratedDevelopment.developmentStyle});
        value.preferences.advancedStyle = validValue(value.preferences.advancedStyle, deps.ADVANCED_STYLES, deps.CHAT_DEFAULTS.advancedStyle);
        value.preferences.characterVolume = ['basic','generous','detailed'].includes(value.preferences.characterVolume) ? value.preferences.characterVolume : deps.CHAT_DEFAULTS.characterVolume;
        value.preferences.npcRecordLimit = [2,3,4].includes(Number(value.preferences.npcRecordLimit)) ? Number(value.preferences.npcRecordLimit) : deps.CHAT_DEFAULTS.npcRecordLimit;
        for (const key of ['relationshipPace', 'resolutionPace']) value.preferences[key] = validValue(value.preferences[key], deps.PACE_OPTIONS, deps.CHAT_DEFAULTS[key]);
        value.preferences.physicalIntimacyPace = deps.normalizePhysicalPace(value.preferences.physicalIntimacyPace);
        for (const key of ['injectionMode', 'worldInjectionMode']) value.preferences[key] = value.preferences[key]==='macro' ? 'preset' : ['depth', 'preset'].includes(value.preferences[key]) ? value.preferences[key] : deps.CHAT_DEFAULTS[key];
        for(const key of ['scenePresetSlot','worldPresetSlot'])value.preferences[key]=normalizePresetSlot(value.preferences[key]);
        value.preferences.selectedWorldId = typeof value.preferences.selectedWorldId === 'string' && value.preferences.selectedWorldId ? value.preferences.selectedWorldId : deps.CHAT_DEFAULTS.selectedWorldId;
        value.preferences.seasonalReferences = [...new Set((Array.isArray(value.preferences.seasonalReferences) ? value.preferences.seasonalReferences : []).filter(key => Object.hasOwn(deps.SEASONAL_OPTIONS, key)))];
        value.preferences.advancedElements = [...new Set((Array.isArray(value.preferences.advancedElements) ? value.preferences.advancedElements : []).filter((key) => deps.ADVANCED_ELEMENTS[key]))];
        if (!value.preferences.advancedElements.length) value.preferences.advancedElements = [...deps.ADVANCED_DEFAULT_ELEMENTS];
        for (const key of ['charmMemory', 'lorebookMemory', 'advancedEnabled', 'negativePriority', 'fightSustain', 'villainEnabled', 'socialEnabled', 'worldHostility', 'privatePromptEnabled', 'npcToUser', 'userMisfortune', 'allowUserImpersonation', 'profileEmotionJudgment']) value.preferences[key] = Boolean(value.preferences[key]);
        for (const key of ['appearanceChance']) value.preferences[key] = Math.max(1, Math.min(100, Number(value.preferences[key]) || deps.CHAT_DEFAULTS[key]));
        restoreOpportunityPreferences(value,saved);
        value.opportunities=normalizeOpportunities(value.opportunities);
        const pacing = value.pacingState && typeof value.pacingState === 'object' ? value.pacingState : {};
        const relation = pacing.relationship && typeof pacing.relationship === 'object' ? pacing.relationship : {};
        const event = pacing.event && typeof pacing.event === 'object' ? pacing.event : {};
        value.pacingState = {
            relationship: {
                closer: Math.max(0, Number(relation.closer) || 0),
                distant: Math.max(0, Number(relation.distant) || 0),
                lastBeat: String(relation.lastBeat || 'none'),
                evidence: Array.isArray(relation.evidence) ? relation.evidence.slice(-8) : [],
            },
            event: {
                qualifiedSteps: Math.max(0, Number(event.qualifiedSteps) || 0),
                evidence: Array.isArray(event.evidence) ? event.evidence.slice(-8) : [],
            },
        };
        const relationship = value.relationshipState && typeof value.relationshipState === 'object' ? value.relationshipState : {};
        value.relationshipState = { motion: String(relationship.motion || 'none'), trust: String(relationship.trust || 'none'), intimacy: String(relationship.intimacy || 'none'), romance: String(relationship.romance || 'none'), lastBeat: String(relationship.lastBeat || 'none') };
        const observation = value.observationState && typeof value.observationState === 'object' ? value.observationState : {};
        value.observationState = { relationshipMotion: String(observation.relationshipMotion || 'unclear'), trustSignal: String(observation.trustSignal || 'unclear'), intimacySignal: String(observation.intimacySignal || 'unclear'), romanceEvidence: String(observation.romanceEvidence || 'unclear'), unresolved: String(observation.unresolved || 'unclear'), evidenceKey: String(observation.evidenceKey || '') };
        const sceneState = value.sceneState && typeof value.sceneState === 'object' ? value.sceneState : {};
        value.sceneState = { unresolved: String(sceneState.unresolved || relationship.unresolved || 'none') };
        value.backgroundEvents = Array.isArray(value.backgroundEvents) ? value.backgroundEvents.slice(0, 3) : [];
        value.advancedEntities = Array.isArray(value.advancedEntities) ? value.advancedEntities.slice(0, 24) : [];
        value.sceneOpportunity = Math.max(1, Number(value.sceneOpportunity) || 1);
        const progression = value.progressionState && typeof value.progressionState === 'object' ? value.progressionState : {};
        value.progressionState = {
            turnsSinceMeaningfulProgress: Math.max(0, Math.min(8, Number(progression.turnsSinceMeaningfulProgress) || 0)),
            lastOutputFingerprint: String(progression.lastOutputFingerprint || ''),
        };
        value.deferredRoutes = Object.fromEntries(Object.entries(value.deferredRoutes || {})
            .filter(([key, count]) => ['event', 'advanced_event', 'advanced_scene', 'npc', 'villain'].includes(key) && Number.isFinite(Number(count)))
            .map(([key, count]) => [key, Math.max(0, Math.min(3, Number(count) || 0))]));
        value.observedOpportunityKeys = Array.isArray(value.observedOpportunityKeys) ? value.observedOpportunityKeys.slice(-12) : [];
        const continuity = value.continuity && typeof value.continuity === 'object' ? value.continuity : {};
        value.continuity = deps.normalizeContinuity(continuity);
        value.pendingContinuityCandidates = Array.isArray(value.pendingContinuityCandidates) ? value.pendingContinuityCandidates : [];
        value.nonRpOutputIndices = Array.isArray(value.nonRpOutputIndices) ? value.nonRpOutputIndices.filter(Number.isInteger).slice(-20) : [];
    }
    if (value?.preferences) value.preferences = effectivePreferences(value.preferences, deps.settings);
    return value;
}

function preferences() {
    return record(true).preferences;
}

async function persistChat(chatKey = deps.stateChatKey(), value = record()) {
    const snapshot = structuredClone(value);
    if(snapshot?.preferences)restoreOpportunityPreferences(snapshot,snapshot.preferences);
    const saving = deps.saveServerChat(chatKey, snapshot);
    await Promise.all([saving, chatKey === deps.stateChatKey() ? deps.reconcileInjection({report:false}) : null]);
}
return {record, preferences, persistChat};
}
