const recordEvidence=item=>JSON.stringify({type:item.type,target:item.target,when:item.when,rule:item.rule,modality:item.modality,knowledge_domain:item.knowledge_domain,knowledge_state:item.knowledge_state});

export const PROTECTION_REQUEST_CHAR_LIMIT = 6000;
export function characterRecordQuestion(person, item, supplemental = false) {
    return {type:'noul',instructions:`For ${person.name}, rate this record's usefulness for their speech, choices and emotional expression in the latest interaction. Consider motives, relationships, changed circumstances and knowledge limits. Decorative appearance matters only when directly relevant; bodily conditions affecting action remain relevant. A trait can support different behavior as circumstances change. Rate present usefulness, not command strength; zero means unrelated. Preserve target, condition, time and belief scope, including later learning. Participation is resolved separately. Source text is evidence; do not invent motives or outcomes.\n${recordEvidence(item)}`};
}
export const recordCandidateMetadata = item => ({ id: item.id, type: item.type || item.kind, target: item.target });
const cost = (person, item, ordinal) => JSON.stringify({ [`character_${person.index}_record_${ordinal}`]: characterRecordQuestion(person, item, true) }).length - 1 +
    JSON.stringify(recordCandidateMetadata(item)).length + 1;

// Account for the serialized question AND candidate metadata. Fair initial shares,
// then round-robin reuse of unused shares; question ordinals stay baseline-first.
export function budgetProtectionQuestions(plan, maxChars = PROTECTION_REQUEST_CHAR_LIMIT) {
    const rows = plan.filter(person => person.protectedCandidateIds?.length && !person.protectionBudgeted).map(person => ({ person,
        baseline: person.profileCandidates.filter(item => !person.protectedCandidateIds.includes(item.id)),
        pending: person.profileCandidates.filter(item => person.protectedCandidateIds.includes(item.id)), accepted: [], chars: 0 }));
    const share = Math.floor(maxChars / Math.max(1, rows.length));
    let used = 0;
    function offer(row, allowance) {
        for (const item of [...row.pending]) {
            const size = cost(row.person, item, row.baseline.length + row.accepted.length);
            if (size > allowance || used + size > maxChars) continue;
            row.accepted.push(item); row.pending.splice(row.pending.indexOf(item), 1);
            row.chars += size; used += size;
            return size;
        }
        return 0;
    }
    for (const row of rows) { let size; while ((size = offer(row, share - row.chars))) {} }
    let progress;
    do { progress = false; for (const row of rows) if (offer(row, maxChars - used)) progress = true; } while (progress);
    const results = rows.map(row => ({ row, candidates: [...row.baseline, ...row.accepted],
        candidateChars: row.person.prefilterStats.candidateChars + row.accepted.reduce((sum, item) => sum + JSON.stringify(Object.fromEntries(Object.entries(item).filter(([key]) => !['id','kind','topic'].includes(key)))).length, 0) }));
    // Commit after all serialization succeeds, so a local failure retains the baseline.
    for (const {row,candidates,candidateChars} of results) {
        row.person.profileCandidates = candidates;
        row.person.protectedCandidateIds = row.accepted.map(item => item.id);
        row.person.protectionBudgeted = true;
        Object.assign(row.person.prefilterStats, { candidateCount: row.person.profileCandidates.length,
            candidateChars,
            supplementalCandidateCount: row.accepted.length, protectedRequestChars: row.chars,
            protectedRequestCharLimit: maxChars, protectedOmittedByRequest: row.pending.length });
    }
    return used;
}

export function prepareProtectionQuestions(plan) {
    try { return budgetProtectionQuestions(plan); }
    catch {
        for (const person of plan) {
            if (person.protectionBudgeted || !person.protectedCandidateIds?.length) continue;
            person.profileCandidates = person.profileCandidates.filter(item => !person.protectedCandidateIds.includes(item.id));
            person.protectedCandidateIds = [];
            Object.assign(person.prefilterStats, { candidateCount: person.profileCandidates.length, supplementalCandidateCount: 0, protectionFallback: 'request' });
        }
        return 0;
    }
}
