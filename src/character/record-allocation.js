import { isProtectiveRecord } from './record-protection.js';

export function allocateRecordIds(person, decisions, details = {}) {
    const supplemental = new Set(person.protectedCandidateIds || []);
    const approved = person.profileCandidates.map((item, ordinal) => ({ item, ordinal,
        score: details[`character_${person.index}_record_${ordinal}`]?.certainty || 0 }))
        .filter(({ ordinal }) => decisions[`character_${person.index}_record_${ordinal}`] === 'yes');
    const compare = (a, b) => Number(isProtectiveRecord(b.item)) - Number(isProtectiveRecord(a.item)) || b.score - a.score || a.ordinal - b.ordinal;
    const limit = person.profileSlotLimit || 6;
    const baseline = approved.filter(({ item }) => !supplemental.has(item.id)).sort(compare).slice(0, limit);
    const extras = approved.filter(({ item }) => supplemental.has(item.id)).sort(compare).slice(0, limit - baseline.length);
    return [...baseline, ...extras].map(({ item }) => item.id);
}

export function protectionTrace(person, trace) {
    const ids = person.protectedCandidateIds || [], yes = new Set(trace.jevSelectedRuleIds);
    return { candidates: ids.length, requestChars: person.prefilterStats?.protectedRequestChars || 0,
        omittedByCandidateLimit: person.prefilterStats?.protectedOmittedByLimit || 0,
        omittedByCandidateChars: person.prefilterStats?.protectedOmittedByChars || 0,
        omittedByRequest: person.prefilterStats?.protectedOmittedByRequest || 0,
        notApproved: ids.filter(id => !yes.has(id)).length,
        excludedByPresence: ids.filter(id => trace.excludedByPresenceRuleIds.includes(id)).length,
        omittedBySlots: ids.filter(id => trace.omittedBySlotRuleIds.includes(id)).length,
        omittedByInjectionChars: ids.filter(id => trace.omittedRuleIds.includes(id)).length,
        injected: ids.filter(id => trace.injectedRuleIds.includes(id)).length,
        fallback: person.prefilterStats?.protectionFallback || '' };
}
