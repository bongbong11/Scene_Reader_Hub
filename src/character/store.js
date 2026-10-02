import { buildCore } from "./profile.js";
export function defaultCharacterStore() { return { schemaVersion: 7, enabled: false, characters: [], persona: null, npcs: [], recordGroups:[], updatedAt: null }; }
export function normalizeCharacterStore(value) {
    const base = defaultCharacterStore();
    if (!value || typeof value !== 'object') return base;
    const normalize = (entry, kind) => {
        if (!entry || typeof entry !== 'object' || !String(entry.name || '').trim()) return null;
        const npcRole = kind === 'npc' && ['villain', 'ally', 'mixed'].includes(entry.npcRole) ? entry.npcRole : entry.antagonist ? 'villain' : 'mixed';
        const result = { ...entry, id: String(entry.id || `${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`), kind,
            name: String(entry.name).trim(), source: String(entry.source || ''), aliases: [...new Set((Array.isArray(entry.aliases) ? entry.aliases : String(entry.aliases || '').split(',')).map(v => String(v).trim()).filter(Boolean))],
            sourceVisibleToMain: Object.hasOwn(entry, 'sourceVisibleToMain') ? Boolean(entry.sourceVisibleToMain) : kind !== 'npc', sourceHash: String(entry.sourceHash || ''),
            npcRole: kind === 'npc' ? npcRole : '', antagonist: kind === 'npc' && npcRole === 'villain', trackArousal: kind === 'npc' && Boolean(entry.trackArousal), provenance: entry.provenance && typeof entry.provenance === 'object' ? entry.provenance : null,
            coreEnglish: kind === 'npc' ? String(entry.coreEnglish || '').trim() : '' };
        // Legacy analyses stay in the record for backup/recovery, but never become verified items.
        result.core = buildCore(result);
        return result;
    };
    return { ...value, ...base, enabled: Boolean(value.enabled), updatedAt: value.updatedAt || null,
        recordGroups:(Array.isArray(value.recordGroups) ? value.recordGroups : []).filter(group=>group && ['character','persona','npc'].includes(group.kind) && Array.isArray(group.versions)),
        characters: (Array.isArray(value.characters) ? value.characters : []).map(e => normalize(e, 'character')).filter(Boolean),
        persona: normalize(value.persona, 'persona'), npcs: (Array.isArray(value.npcs) ? value.npcs : []).map(e => normalize(e, 'npc')).filter(Boolean) };
}
