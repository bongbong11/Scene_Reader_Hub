import { currentRecords } from './records.js';

export const isProtectiveRecord = record => record.type === 'boundary' ||
    (record.type === 'knowledge' && ['does_not_know', 'misunderstands'].includes(record.knowledge_state));
const words = text => new Set(String(text || '').toLocaleLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || []);

// Supplement only: baseline identity, order, text and budgets are never rewritten.
export function supplementRecordCandidates(entry, baseline, transcript, { limit, maxChars, categoryHints = [], stats = {} }) {
    const query = words(transcript), own = words([entry.name, ...(entry.aliases || [])].join(' '));
    const seen = new Set(baseline.map(item => item.id));
    const overlap = text => [...words(text)].filter(term => query.has(term) && !own.has(term)).length;
    const ranked = currentRecords(entry).map((record, index) => ({ record, index, id: `record:${entry.id}:${index}` }))
        .filter(item => isProtectiveRecord(item.record) && !seen.has(item.id))
        .map(item => ({ ...item, score: overlap(item.record.target) * 4 + overlap(item.record.when) * 3 +
            overlap([item.record.rule, item.record.knowledge_domain].join(' ')) + (categoryHints.includes(item.record.type) ? 3 : 0) }))
        .sort((a, b) => b.score - a.score || a.index - b.index);
    // Offer both restriction families first, then remaining records (including several knowledge limits).
    const first = [];
    for (const item of ranked) if (!first.some(other => other.record.type === item.record.type)) first.push(item);
    const ordered = [...first, ...ranked.filter(item => !first.includes(item))];
    const effectiveLimit = Math.min(limit + 2, 20), added = [];
    let used = stats.candidateChars || 0, omittedByChars = 0, omittedByLimit = 0;
    for (const item of ordered) {
        if (baseline.length + added.length >= effectiveLimit || added.length >= 2) { omittedByLimit++; continue; }
        const size = JSON.stringify(item.record).length;
        if (used + size > maxChars) { omittedByChars++; continue; }
        used += size;
        added.push({ ...item.record, id: item.id, kind: item.record.type, topic: item.record.knowledge_domain || 'none' });
    }
    Object.assign(stats, { baselineCandidateCount: baseline.length, protectedOmittedCount: ranked.length,
        supplementalCandidateCount: added.length, protectedCandidateChars: used - (stats.candidateChars || 0),
        protectedOmittedByChars: omittedByChars, protectedOmittedByLimit: omittedByLimit, effectiveLimit });
    return added;
}
