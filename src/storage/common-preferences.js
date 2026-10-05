import { CHAT_DEFAULTS } from './contract.js';
import { normalizePresetSlot } from '../injection/preset-catalog.js';

export const COMMON_PREFERENCE_KEYS = Object.freeze(['injectionMode','worldInjectionMode','scenePresetSlot','worldPresetSlot','progressIntensity']);
export function commonPreferences(value = {}) {
    const result = {};
    for (const key of COMMON_PREFERENCE_KEYS) {
        if (!Object.hasOwn(value || {}, key)) continue;
        const input = value[key];
        if (key.endsWith('PresetSlot')) result[key] = normalizePresetSlot(input);
        else if (key === 'progressIntensity') result[key] = Number.isFinite(Number(input)) ? Math.max(0.5, Math.min(1.5, Number(input))) : CHAT_DEFAULTS[key];
        else result[key] = input === 'macro' ? 'preset' : ['depth','preset'].includes(input) ? input : CHAT_DEFAULTS[key];
    }
    return result;
}
export function effectivePreferences(room = {}, settings = {}) {
    return {...room,...commonPreferences(settings.commonPreferences)};
}
export function roomPreferences(value = {}) {
    return structuredClone(Object.fromEntries(Object.entries(value).filter(([key]) => !COMMON_PREFERENCE_KEYS.includes(key))));
}
// Preserve the first opened existing room's choices once; later rooms cannot
// replace a common choice. Opening the home screen never seeds defaults.
export function migrateCommonPreferences(settings, source) {
    const prior = commonPreferences(settings.commonPreferences), legacy = commonPreferences(source);
    const next = {...legacy,...prior};
    return Object.keys(next).some(key => !Object.hasOwn(prior,key)) ? next : null;
}
