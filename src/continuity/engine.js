const SOURCE_TYPES = new Set(['world_fact', 'claim', 'belief', 'intention', 'promise', 'delegation', 'completed_action']);
const ITEM_KINDS = new Set(['commitment', 'plan', 'schedule', 'obligation', 'delegation', 'status']);
const KNOWLEDGE_SOURCES = new Set(['direct', 'observed', 'told', 'reported', 'public', 'role_based', 'privileged']);
const PRESSURES = new Set(['none', 'strained', 'at_risk', 'blocked']);
const LIFECYCLES = new Set(['active', 'confirmed', 'delegated', 'contested', 'cancel_pending', 'resolved', 'cancelled', 'completed']);

export const REASONER_SYSTEM = `<CONTINUITY_REASONER>
You are a continuity dependency reasoner, not a story writer. Identify direct effects of newly established RP on existing promises, schedules, obligations, delegations, important knowledge and access boundaries. Off-screen people and commitments continue to exist, but never invent completed off-screen actions.
Distinguish world_fact, claim, belief, intention, promise, delegation and completed_action. A claim or promise is not a completed action or objective world fact. CHANGED means the verified RP itself changed a state. PRESSURED means an existing state's viability changed but its lifecycle did not. POSSIBLE_FOLLOWUP is only a future candidate, never a fact.
Prefer existing state IDs. Create a new item only for an explicit persistent promise, plan, schedule, obligation or delegation. Never duplicate event, relationship or NPC authoritative state. Do not invent people, secrets, institutions, actions, conflicts or information paths. Unknown knowledge remains unknown. Select only direct causal dependencies. Return one strict JSON object with arrays new_items (max 2), affected (max 3), knowledge_updates (max 4), possible_followups (max 2). Every entry must include a short verbatim evidence excerpt from the supplied RP source and a source_type. Use empty arrays when none apply.
Fields: new_items[{kind,label,lifecycle,owners,source_type,evidence}], affected[{state_id,relation,lifecycle,pressure,reason,source_type,evidence}], knowledge_updates[{fact_id,character,source,summary,source_type,evidence}], possible_followups[{related_state_id,action,reason,source_type,evidence}]. relation is changed or pressured. source_type is one of world_fact, claim, belief, intention, promise, delegation, completed_action. Never label an intention as completed_action.
</CONTINUITY_REASONER>`;

export function emptyContinuity() { return { items: [], knowledge: [], dependencies: [], followups: [], revision: 0 }; }

export function normalizeContinuity(value) {
    const base = value && typeof value === 'object' ? value : {};
    return {
        items: Array.isArray(base.items) ? base.items.slice(0, 40) : [],
        knowledge: Array.isArray(base.knowledge) ? base.knowledge.slice(0, 60) : [],
        dependencies: Array.isArray(base.dependencies) ? base.dependencies.slice(0, 30) : [],
        followups: Array.isArray(base.followups) ? base.followups.slice(0, 20) : [],
        revision: Math.max(0, Number(base.revision) || 0),
    };
}

function short(value, max = 240) { return String(value || '').trim().slice(0, max); }

function evidencePresent(evidence, sourceText) {
    const compact = (value) => String(value || '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
    return compact(evidence).length >= 4 && compact(sourceText).includes(compact(evidence));
}

export function validateReasonerResult(raw, { sourceText, continuity, sourceIdentity } = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Continuity Reasoner 응답 형식이 잘못됐습니다.');
    const current = normalizeContinuity(continuity);
    const knownIds = new Set(current.items.map((item) => item.id));
    const candidates = [];
    const add = (type, value, index) => {
        if (!value || typeof value !== 'object') return;
        const evidence = short(value.evidence, 260);
        const sourceType = short(value.source_type, 40);
        if (!SOURCE_TYPES.has(sourceType) || !evidencePresent(evidence, sourceText)) return;
        const id = `${type}:${index}:${sourceIdentity.outputFingerprint}`;
        const base = { id, type, evidence, sourceType, sourceIdentity, label: '', data: {} };
        if (type === 'new_item') {
            if (!ITEM_KINDS.has(value.kind) || !['promise', 'delegation', 'world_fact'].includes(sourceType)) return;
            const label = short(value.label, 140);
            if (!label) return;
            base.label = label;
            base.data = { kind: value.kind, label, lifecycle: LIFECYCLES.has(value.lifecycle) ? value.lifecycle : 'active', owners: Array.isArray(value.owners) ? value.owners.map((item) => short(item, 60)).slice(0, 4) : [] };
        } else if (type === 'affected') {
            const stateId = short(value.state_id, 100);
            if (!stateId || (!knownIds.has(stateId) && !/^(event|relationship|npc):/.test(stateId))) return;
            const relation = short(value.relation, 40);
            if (!['changed', 'pressured'].includes(relation)) return;
            base.label = `${stateId} · ${relation}`;
            base.data = { stateId, relation, lifecycle: LIFECYCLES.has(value.lifecycle) ? value.lifecycle : null, pressure: PRESSURES.has(value.pressure) ? value.pressure : 'strained', reason: short(value.reason, 240) };
        } else if (type === 'knowledge') {
            const factId = short(value.fact_id, 100);
            const character = short(value.character, 80);
            if (!factId || !character || !KNOWLEDGE_SOURCES.has(value.source)) return;
            base.label = `${character} · ${factId}`;
            base.data = { factId, character, source: value.source, summary: short(value.summary, 160) };
        } else if (type === 'followup') {
            const relatedStateId = short(value.related_state_id, 100);
            const action = short(value.action, 180);
            if (!relatedStateId || !action || (!knownIds.has(relatedStateId) && !/^(event|relationship|npc):/.test(relatedStateId))) return;
            base.label = action;
            base.data = { relatedStateId, action, reason: short(value.reason, 240) };
        }
        candidates.push(base);
    };
    for (const [field, type, limit] of [['new_items', 'new_item', 2], ['affected', 'affected', 3], ['knowledge_updates', 'knowledge', 4], ['possible_followups', 'followup', 2]]) {
        const entries = Array.isArray(raw[field]) ? raw[field] : [];
        entries.slice(0, limit).forEach((value, index) => add(type, value, index));
    }
    const selected = [];
    for (const type of ['new_item', 'affected', 'knowledge', 'followup']) {
        const first = candidates.find((item) => item.type === type);
        if (first) selected.push(first);
    }
    for (const candidate of candidates) {
        if (selected.length >= 5) break;
        if (!selected.includes(candidate)) selected.push(candidate);
    }
    return selected;
}

export function continuityQuestion(candidate) {
    const label = String(candidate.label || '').slice(0, 180);
    const evidence = String(candidate.evidence || '').slice(0, 300);
    const common = `Evaluate only established RP and the candidate's exact source. Candidate: ${label}. Source excerpt: ${evidence}. OOC is not evidence. A proposed future act is not a completed act.`;
    if (candidate.type === 'knowledge') return { type: 'choice', instructions: common, criteria: { supported: 'This exact person acquired the important information by the claimed path.', unsupported: 'No demonstrated information path, wrong person, or only an inference.', unclear: 'The path remains ambiguous.' } };
    return { type: 'choice', instructions: common, criteria: {
        accept_changed: 'The verified RP directly established the proposed durable item or actually changed the existing state. Claims and intentions do not prove completion.',
        accept_pressured: 'The existing state is still active, but verified RP directly puts it under causal pressure. Do not change its lifecycle.',
        followup_only: 'Only a plausible future action follows. Nothing has happened yet and no established state changed.',
        reject: 'Unsupported, stale, already executed, unrelated, or invented.'
    } };
}

export function applyContinuityVerdicts(continuity, candidates, decisions, { opportunity = 0, now = new Date().toISOString() } = {}) {
    const next = normalizeContinuity(continuity);
    const accepted = [];
    candidates.forEach((candidate, index) => {
        const verdict = decisions[`continuity_candidate_${index}`];
        if (candidate.type === 'knowledge') {
            if (verdict !== 'supported') return;
            const existing = next.knowledge.find((item) => item.factId === candidate.data.factId && item.character === candidate.data.character);
            const entry = { ...candidate.data, sourceRefs: [candidate.sourceIdentity], updatedAt: now };
            if (existing) Object.assign(existing, entry); else next.knowledge.push(entry);
            accepted.push({ ...candidate, verdict });
            return;
        }
        if (candidate.type === 'new_item' && verdict === 'accept_changed') {
            const id = `continuity:${candidate.id}`;
            if (!next.items.some((item) => item.id === id)) next.items.push({ id, ...candidate.data, pressure: 'none', sourceRefs: [candidate.sourceIdentity], updatedAt: now });
            accepted.push({ ...candidate, verdict });
        } else if (candidate.type === 'affected' && ((candidate.data.relation === 'changed' && verdict === 'accept_changed') || (candidate.data.relation === 'pressured' && verdict === 'accept_pressured'))) {
            const item = next.items.find((entry) => entry.id === candidate.data.stateId);
            if (item) {
                if (verdict === 'accept_changed' && candidate.data.lifecycle) item.lifecycle = candidate.data.lifecycle;
                if (verdict === 'accept_pressured') item.pressure = candidate.data.pressure;
                item.updatedAt = now;
            } else {
                const existing = next.dependencies.find((entry) => entry.stateId === candidate.data.stateId);
                const dependency = { stateId: candidate.data.stateId, pressure: candidate.data.pressure, reason: candidate.data.reason, sourceRefs: [candidate.sourceIdentity], updatedAt: now };
                if (existing) Object.assign(existing, dependency); else next.dependencies.push(dependency);
            }
            accepted.push({ ...candidate, verdict });
        } else if (candidate.type === 'followup' && ['followup_only', 'accept_pressured'].includes(verdict)) {
            if (next.followups.some((item) => item.id === candidate.id)) return;
            next.followups.push({ id: candidate.id, ...candidate.data, sourceRefs: [candidate.sourceIdentity], opportunity, lastOffered: null, status: 'available', executed: false, expiry: opportunity + 3 });
            accepted.push({ ...candidate, verdict });
        }
    });
    if (accepted.length) next.revision += 1;
    next.items = next.items.slice(-40);
    next.knowledge = next.knowledge.slice(-60);
    next.dependencies = next.dependencies.slice(-30);
    next.followups = next.followups.slice(-20);
    return { continuity: next, accepted };
}

export function selectContinuityContext(continuity, transcript, { opportunity = 0 } = {}) {
    const current = normalizeContinuity(continuity);
    const haystack = String(transcript || '').toLocaleLowerCase();
    const relevant = (entry) => [entry.label, entry.factId, entry.character, entry.relatedStateId, entry.action, ...(entry.owners || [])]
        .some((value) => String(value || '').length >= 3 && haystack.includes(String(value).toLocaleLowerCase()));
    return {
        items: current.items.filter(relevant).slice(-3),
        knowledge: current.knowledge.filter(relevant).slice(-3),
        dependencies: current.dependencies.filter((entry) => relevant(entry) || entry.stateId === 'event:current' || entry.stateId === 'relationship:current').slice(-2),
        followups: current.followups.filter((entry) => entry.status === 'available' && !entry.executed && entry.expiry >= opportunity && entry.lastOffered !== opportunity && (relevant(entry) || current.items.some((item) => item.id === entry.relatedStateId && relevant(item)))).slice(-2),
    };
}

export function buildContinuityInjection(selected, chosenFollowup = null) {
    const lines = [];
    const usable = (value, max) => { const text = String(value || '').trim(); return text && text.length <= max && !/[가-힣]/u.test(text) ? text : ''; };
    for (const item of selected?.items || []) {
        const label = usable(item.label, 140);
        if (label) lines.push(`${label}: ${item.lifecycle}${item.pressure && item.pressure !== 'none' ? `; pressure=${item.pressure}` : ''}.`);
    }
    for (const item of selected?.knowledge || []) {
        const summary = usable(item.summary || item.factId, 160);
        if (summary) lines.push(`${short(item.character, 80)} has a ${item.source} information source concerning ${summary}; preserve whether it is a report, observation, or verified fact.`);
    }
    for (const item of selected?.dependencies || []) lines.push(`${short(item.stateId, 60)} remains in its established lifecycle; pressure=${item.pressure}.`);
    const action = usable(chosenFollowup?.data?.action, 180);
    if (action) lines.push(`Optional secondary beat: ${action}. Execute only a causally supported, bounded step; do not claim an unseen action already happened.`);
    return lines.length ? `<CONTINUITY_CONTEXT>\n${lines.join('\n')}\nTreat pressure as context, not a completed off-screen action.\n</CONTINUITY_CONTEXT>` : '';
}
