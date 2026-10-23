import {applyItemUpdate} from './state-updates.js';
export {selectActiveContinuity as selectContinuityContext} from './selection.js';

import {SOURCE_TYPES} from './response.js';
export {REASONER_SYSTEM,validateReasonerResult,continuityValidationCounts,CONTINUITY_VALIDATION_LABELS} from './response.js';

export function emptyContinuity() { return { items: [], knowledge: [], dependencies: [], followups: [], revision: 0 }; }

export function normalizeContinuity(value) {
    const base = value && typeof value === 'object' ? value : {};
    return {
        items: Array.isArray(base.items) ? base.items : [],
        knowledge: Array.isArray(base.knowledge) ? base.knowledge : [],
        dependencies: Array.isArray(base.dependencies) ? base.dependencies.slice(0, 30) : [],
        followups: Array.isArray(base.followups) ? base.followups.slice(0, 20) : [],
        ...(Array.isArray(base.references)?{references:base.references.slice(-6)}:{}),
        revision: Math.max(0, Number(base.revision) || 0),
    };
}

function short(value, max = 240) { return String(value || '').trim().slice(0, max); }

export function applyContinuityVerdicts(continuity, candidates, decisions, { opportunity = 0, now = new Date().toISOString() } = {}) {
    const next = normalizeContinuity(continuity);
    const accepted = [];
    candidates.forEach((candidate, index) => {
        const verdict = decisions[`continuity_candidate_${index}`];
        if (candidate.type === 'reference') {
            if (verdict !== 'supported') return;
            next.references ||= [];
            if (!next.references.some(item=>item.id===candidate.id)) next.references.push({id:candidate.id,...candidate.data,sourceRefs:candidate.sourceIdentity.refs,updatedAt:now});
            next.references=next.references.slice(-6);
            accepted.push({...candidate,verdict});
            return;
        }
        if (candidate.type === 'knowledge') {
            if (verdict !== 'supported') return;
            const existing = next.knowledge.find((item) => item.factId === candidate.data.factId && item.character === candidate.data.character);
            const entry = { ...candidate.data, sourceType:candidate.sourceType, sourceRefs: candidate.sourceIdentity?.refs || [candidate.sourceIdentity], updatedAt: now };
            if (existing) Object.assign(existing, entry); else next.knowledge.push(entry);
            accepted.push({ ...candidate, verdict });
            return;
        }
        if (candidate.type === 'new_item' && verdict === 'accept_changed') {
            const id = `continuity:${candidate.id}`;
            if (!next.items.some((item) => item.id === id)) next.items.push({ id, ...candidate.data, sourceType:candidate.sourceType, pressure: 'none', sourceRefs: candidate.sourceIdentity?.refs || [candidate.sourceIdentity], updatedAt: now });
            accepted.push({ ...candidate, verdict });
        } else if (candidate.type === 'affected' && ((candidate.data.relation === 'changed' && verdict === 'accept_changed') || (candidate.data.relation === 'pressured' && verdict === 'accept_pressured'))) {
            const item = next.items.find((entry) => entry.id === candidate.data.stateId);
            if (item) {
                applyItemUpdate(item,candidate,now);
            } else {
                const existing = next.dependencies.find((entry) => entry.stateId === candidate.data.stateId);
                const dependency = { stateId: candidate.data.stateId, pressure: candidate.data.pressure ?? existing?.pressure ?? 'none', reason: candidate.data.reason, owners:candidate.data.owners||[], sourceRefs: candidate.sourceIdentity?.refs || [candidate.sourceIdentity], updatedAt: now };
                if (existing) Object.assign(existing, dependency); else next.dependencies.push(dependency);
            }
            accepted.push({ ...candidate, verdict });
        } else if (candidate.type === 'followup' && ['followup_only', 'accept_pressured'].includes(verdict)) {
            if (next.followups.some((item) => item.id === candidate.id)) return;
            // Older clients read this field; it no longer expires an unexecuted thread.
            next.followups.push({ id: candidate.id, ...candidate.data, sourceRefs: candidate.sourceIdentity?.refs || [candidate.sourceIdentity], opportunity, lastOffered: null, status: 'available', executed: false, expiry:Number.MAX_SAFE_INTEGER });
            accepted.push({ ...candidate, verdict });
        }
    });
    if (accepted.length) next.revision += 1;
    // The session storage budget rejects oversized additions. Do not silently
    // discard an earlier unresolved state to make room for a newer one.
    next.dependencies = next.dependencies.slice(-30);
    next.followups = next.followups.slice(-20);
    return { continuity: next, accepted };
}

export function continuityLines(selected, chosenFollowup = null, eventFollowups = []) {
    const lines = [];
    const usable = (value, max) => { const text = String(value || '').trim(); return text && text.length <= max ? text : ''; };
    for (const item of selected?.items || []) {
        const label = usable(item.label, 140);
        if (label) lines.push(`${label}: ${item.lifecycle}${item.pressure && item.pressure !== 'none' ? `; pressure=${item.pressure}` : ''}${item.time?`; time=${short(item.time,80)}`:''}${item.summary?`; ${short(item.summary,240)}`:''}${item.reason?`; ${short(item.reason,160)}`:''}${item.impact?`; unresolved: ${short(item.impact,160)}`:''}.`);
    }
    for (const item of selected?.knowledge || []) {
        const summary = usable(item.summary || item.factId, 240);
        if (summary) lines.push(`${short(item.character, 80)} has ${item.source} information concerning ${summary}; source type=${SOURCE_TYPES.has(item.sourceType)?item.sourceType:'unspecified'}.`);
    }
    for (const item of selected?.dependencies || []) lines.push(`${short(item.stateId, 60)} remains in its established lifecycle; pressure=${item.pressure}${item.reason?`; ${short(item.reason,160)}`:''}.`);
    for (const item of selected?.references || []) lines.push(`Uninterpreted prior RP (${item.role}): ${short(item.text,600)}. Distinguish statements and plans from completed actions.`);
    const action = usable(chosenFollowup?.data?.action, 180);
    if (action) lines.push(`Carry the selected established thread forward: ${action}. Perform its next supported step within the current interaction; do not claim an unseen action already happened.`);
    for(const item of eventFollowups.slice(0,1)) {
        const step=usable(item.data?.action,180);
        if(step&&item.id!==chosenFollowup?.id)lines.push(`Within the selected event, carry out its established next step: ${step}. This supports that event, not a second plot; do not claim an unseen completion.`);
    }
    return lines;
}

export function buildContinuityInjection(selected, chosenFollowup = null, eventFollowups = []) {
    const lines = continuityLines(selected, chosenFollowup, eventFollowups);
    return lines.length ? `<CONTINUITY_CONTEXT>\n${lines.join('\n')}\nTreat pressure as context, not a completed off-screen action.\n</CONTINUITY_CONTEXT>` : '';
}
