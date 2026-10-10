import {applyEvolutionCandidates} from './evolution.js';
import {selectRecordCandidates, scopedRecordLine} from "./record-selection.js";
import {currentRecords, recordBankIsCurrent} from "./records.js";
import {splitOocText} from "../context/messages.js";
import {currentProfileItems, profileIsCurrent, buildCore} from "./profile.js";
import {selectRelevantChunks} from "./selection.js";
import {CHARACTER_LIVE_SYSTEM, PROFILE_SELECT, CONTEXT_SELECT, DIRECTION_SELECT, ACCESS_INSTRUCTION, ACCESS_CHOICES, PRESENCE_CHOICES} from "./prompts.js";
import {characterVolume, npcRecordLimit} from "./volume.js";
import {supplementRecordCandidates} from './record-protection.js';
import {prepareProtectionQuestions, characterRecordQuestion} from './record-questions.js';
import {allocateRecordIds, protectionTrace} from './record-allocation.js';
import {participationQuestion} from './presence.js';

const DIRECTIONS = { none: 'No separate direction is needed.', speak: 'Let a direct line lead.', act: 'Let concrete conduct lead.', selective: 'Respond only to what matters to this person.', withhold: 'Withhold information for an established motive.', evade: 'Evade for an established motive.', deceive: 'Deceive only if the person has an established motive and knows what is being concealed.', withdraw: 'Withdraw when the person can actually do so.', confront: 'Confront a supported live issue.' };
const ACCESS_LABELS = { observed: 'Directly perceived', reported: 'Was told', public: 'Publicly available', stored_knowledge: 'Previously established for this person', profile_supported: 'Within supported lived or role knowledge', private_access: 'Has established private access' };
const CHARACTER_INJECTION_PREAMBLE='Scoped character constraints, not scripted actions. Preserve belief, report, ignorance and time scope; expertise does not require a lecture.';
const AFFECT_CHOICES = {
    none: 'The previous output state does not affect this person in the next response.',
    inward: 'Carry the relevant feeling in viewpoint thought or restraint, if this viewpoint is available.',
    visible: 'Let the relevant feeling color speech, attention, or a small action in the ongoing scene.',
    active: 'Let the relevant feeling contribute to a character-led action that fits the current scene and established limits.',
};
function affectSummary(state, selectedFields = null) {
    if (!state?.values) return '';
    const labels = { a: 'sexual arousal', c: 'self-control', anger: 'anger', joy: 'joy', fear: 'fear', sadness: 'sadness' };
    return Object.entries(labels).filter(([key]) => (!selectedFields || selectedFields.includes(key) || (key === 'c' && selectedFields.includes('a'))) && Number.isFinite(state.values[key]) && (['a','c'].includes(key) || state.values[key] > 0))
        .map(([key, label]) => `${label} ${state.values[key]}%${state.targets?.[key] ? ` toward ${state.targets[key]}` : ''}`).join(', ');
}
function affectFields(state, { includeArousal = true } = {}) {
    return ['a', 'anger', 'joy', 'fear', 'sadness'].filter(key => (includeArousal || key !== 'a') && Number.isFinite(state?.values?.[key]) && (key === 'a' || state.values[key] > 0));
}
const NEED_GROUPS = {
    identity: ['fact','core','value','boundary','capability'],
    relationship: ['relationship'],
    knowledge: ['knowledge'],
    expression: ['reaction','expression'],
};
export function addCharacterNeedsQuestions(request, people = []) {
    if (!people.some(person => currentRecords(person).length)) return;
    request.state.scope += ' Character category needs only help rank stored record retrieval; they do not establish a fact, knowledge, action, or a requirement to inject a record.';
    for (const [group, types] of Object.entries(NEED_GROUPS)) request.questions[`character_need_${group}`] = {
        type: 'noul',
        instructions: `Would a stored ${types.join('/')} character constraint plausibly matter for the next response by a registered active person? Judge from current interaction and its established continuity. A quiet dialogue can make a relationship or expression relevant. Answer independently of other groups; this only guides retrieval, and no new fact or action may be invented.`,
    };
}
export function characterCategoryHints(answers = {}) {
    return Object.entries(NEED_GROUPS).filter(([group]) => Number(answers[`character_need_${group}`]?.noul) >= 0.45).flatMap(([,types]) => types);
}

function relevant(text, query) {
    const terms = String(query).toLocaleLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) || [];
    const haystack = String(text).toLocaleLowerCase();
    return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}
function contextItems(entry, selected, knowledge, memory, transcript) {
    const items = [];
    for (const item of knowledge || []) {
        const owned = item.characterId ? item.characterId === entry.id : String(item.character || '').toLocaleLowerCase() === entry.name.toLocaleLowerCase();
        if (!owned) continue;
        const text = String(item.summary || '').trim();
        if (!text) continue;
        items.push({ id: `knowledge:${entry.id}:${String(item.factId || items.length)}`, characterId: entry.id, source: item.source || 'verified_continuity', type: 'acquired_knowledge', text,
            sourceType: item.source_type || item.sourceType || '', occurredAt: item.occurredAt || item.time || '', subject: item.factId || '', score: 6 + relevant(text, transcript) });
    }
    selected.forEach((message, index) => {
        if (message.is_system || message.extra?.ooc_chat === true) return;
        const raw = message.is_user ? splitOocText(message.mes).rpText : String(message.mes || '');
        if (!raw.trim()) return;
        // A raw exchange has no inferred truth type. The speaker and index remain attached.
        // Keep the selected message intact; a clipped sentence could lose a denial or time qualifier.
        const text = raw.trim();
        items.push({ id: `rp:${message.extra?.sceneReaderPending ? 'pending' : String(message._sceneReaderIndex ?? index)}:${index}`, characterId: null,
            source: 'recent_rp', type: 'raw_message', text, speaker: message.name || (message.is_user ? 'USER' : 'CHARACTER'),
            messageIndex: message._sceneReaderIndex ?? index, occurredAt: message.send_date || message.time || null, score: 1 + index / Math.max(1, selected.length) + relevant(text, entry.name) });
    });
    // Memory is reference material, not proof that this person knows it.
    for (const item of (memory?.entries || [])) {
        const text = String(item.text || item.content || '').trim();
        if (text) items.push({ id: `memory:${String(item.sourceId || items.length)}`, characterId: null, source: 'memory_reference', type: 'reference_excerpt', text,
            speaker: 'MEMORY', occurredAt: null, score: relevant(text, transcript) });
    }
    return items.filter(item => item.text.length <= 1800).sort((a,b) => b.score - a.score).slice(0, 4).map(({score,...item}) => item);
}
export function buildLiveCharacterPlan(entries = [], { selected = [], transcript = '', knowledge = [], memory = null, persona = null, canonicalOnly = false, volume = 'generous', npcSlots = 3, retrievalResults = new Map(), categoryHints = [], protection = true, evolution = null, fingerprint = null, actorIds = entries.map(e=>e.id) } = {}) {
    const bounds=characterVolume(volume);
    return entries.map((entry, index) => {
        const slots = entry.kind === 'npc' ? npcRecordLimit(npcSlots) : bounds.slots;
        // The production caller always uses bounded canonical record candidates.
        // Legacy profile readers are retained only for recovery and compatibility tests.
        const recordMode = canonicalOnly || Boolean(entry.recordBank);
        const prefilterStats={};
        const retrieved = retrievalResults.get(entry.id) || { indices: [], status: 'lexical' };
        const profileCandidates = recordMode ? selectRecordCandidates(entry, transcript,{limit:Math.min(bounds.candidates,slots+8),maxChars:bounds.candidateChars,stats:prefilterStats,semanticIndices:retrieved.indices,categoryHints}) : currentProfileItems(entry).map(item => ({
            id: item.id, kind: item.kind, topic: item.topic, target: item.target, rule: item.rule,
        }));
        let protectedCandidateIds = [];
        if (recordMode && protection) {
            try {
                const extras = supplementRecordCandidates(entry, profileCandidates, transcript, { limit: Math.min(bounds.candidates, slots+8), maxChars: bounds.candidateChars, categoryHints, stats: prefilterStats });
                protectedCandidateIds = extras.map(item => item.id);
                profileCandidates.push(...extras);
            } catch { prefilterStats.protectionFallback = 'candidate'; }
        }
        if(evolution&&fingerprint){
            const effective=applyEvolutionCandidates(entry,profileCandidates,evolution,fingerprint,actorIds);
            profileCandidates.splice(0,profileCandidates.length,...effective);
        }
        prefilterStats.retrievalStatus = retrieved.status;
        if (retrieved.error) prefilterStats.retrievalError = retrieved.error;
        return { index, id: entry.id, name: entry.name, kind: entry.kind, ...(entry.cardCast ? {cardCast:entry.cardCast} : {}), volume, profileSlotLimit:slots, storedRecordCount:entry.recordBank?.records?.length || 0, prefilterStats, npcRole: entry.kind === 'npc' ? entry.npcRole || (entry.antagonist ? 'villain' : 'mixed') : '', antagonist: Boolean(entry.antagonist), trackArousal: entry.trackArousal === true, sourceVisibleToMain: entry.sourceVisibleToMain,
            intimacyReference: recordBankIsCurrent(entry) ? String(entry.recordBank?.intimacy_reference?.text || '').trim() : '',
            core: recordMode ? { name:entry.name, aliases:entry.aliases || [], excerpts:[] } : buildCore(entry), coreEnglish: recordMode ? '' : entry.coreEnglish || '',
            recordStatus: recordMode ? (recordBankIsCurrent(entry) ? 'current' : entry.recordBank ? 'stale' : entry.profile || entry.legacyProfile ? 'legacy' : 'missing') : 'legacy',
            recordMode, recordBankCurrent:recordMode && recordBankIsCurrent(entry), profileCandidates, protectedCandidateIds, contextCandidates: contextItems(entry, selected, knowledge, memory, transcript),
            sourceExcerpt: !recordMode && profileIsCurrent(entry) ? selectRelevantChunks(entry.source, transcript, 1)[0] || '' : '',
            // Persona stays a reference and is never an autonomous response target.
            personaReference: !recordMode && persona?.source ? selectRelevantChunks(persona.source, transcript, 1)[0] || '' : '' };
    });
}
export function buildCharacterTurnQuestions(plan = [], observed = {}) {
    prepareProtectionQuestions(plan);
    const questions = {};
    for (const person of plan) {
        const prefix = `character_${person.index}`;
        if(!Object.hasOwn(observed,person.id))questions[`${prefix}_participation`]=participationQuestion(person);
        if(!person.recordMode) {
        questions[`${prefix}_presence`] = { type: 'choice', instructions: `Judge ${person.name}'s role in the next response from actual RP. Physical co-location is not required: the author of current incoming texts or call replies is participating, while a name in memories, speculation, an old quoted message or someone else's thoughts is not current participation. Do not give a remote sender access to unsent thoughts or unseen surroundings. A previously active person may remain present without being named again, but registration or model visibility alone does not make someone a participant. In an NPC-only exchange, mark an uninvolved main character absent or background.${person.cardCast ? ` This card represents several separate people. The shared card title or message author label does not prove ${person.name} participated. Decide this person's presence separately from all other card members, using the latest actual RP; an earlier appearance does not override a later departure.` : ''}${person.mainSillyTavernName ? ` This is the registered main character for SillyTavern character ${person.mainSillyTavernName}; differing sheet language or spelling alone is not evidence of absence.` : ''}`, criteria: PRESENCE_CHOICES };
        }
        for (const field of affectFields(person.priorState, { includeArousal: !person.sexualConductManaged })) questions[`${prefix}_affect_${field}`] = {
            type: 'choice',
            instructions: `${person.name}'s prior completed RP output carried ${affectSummary(person.priorState, [field])}. Choose its expression in the NEXT response, or none if no longer relevant. Use the new input, current scene, and this person's stored limits. Ordinary conversation and other feelings may coexist with it; no new event or relationship milestone is required. It is not proof of an action, consent, relationship change, or another person's knowledge. Answer independently of presence and record choices; code will suppress this if the person is not active.`,
            criteria: AFFECT_CHOICES,
        };
        if (person.recordMode) {
            for (const [ordinal,item] of person.profileCandidates.entries()) questions[`${prefix}_record_${ordinal}`] = characterRecordQuestion(person, item, person.protectedCandidateIds?.includes(item.id));
        } else {
            const profileChoices = { none: 'No profile item needs emphasis.', ...Object.fromEntries(person.profileCandidates.map(item => [item.id, `${item.kind} / ${item.topic} / ${item.target || person.name}: ${item.rule}`])) };
            for (let slot=1;slot<=Math.min(person.profileSlotLimit || 6,person.profileCandidates.length);slot++) questions[`${prefix}_profile_slot_${slot}`] = { type: 'choice', instructions: PROFILE_SELECT, criteria: profileChoices };
        }
        const contextChoices = { none: 'No context item needs emphasis.', ...Object.fromEntries(person.contextCandidates.map(item => [item.id, `${item.source} / ${item.speaker || item.characterId || ''} / message ${item.messageIndex ?? 'stored'} / ${item.occurredAt || 'time unknown'}`])) };
        for (const slot of [1,2].slice(0,person.contextCandidates.length)) questions[`${prefix}_context_slot_${slot}`] = { type: 'choice', instructions: CONTEXT_SELECT, criteria: contextChoices };
        person.contextCandidates.forEach((item, ordinal) => {
            if (item.characterId === person.id && item.type === 'acquired_knowledge') return;
            questions[`${prefix}_context_access_${ordinal}`] = { type:'choice', instructions: `${ACCESS_INSTRUCTION}\nPerson: ${person.name}. Candidate: ${item.id}.`, criteria: ACCESS_CHOICES };
        });
        if (person.recordMode) continue;
        questions[`${prefix}_response_direction`] = { type: 'choice', instructions: DIRECTION_SELECT, criteria: DIRECTIONS };
        questions[`${prefix}_response_basis`] = { type: 'choice', instructions: 'Identify the evidence needed for the proposed response direction independently of the other answers. Choose scene for an action supported by the visible exchange alone; choose an information ID only when the direction actually depends on that information. Do not assume the person has access to a selected item.',
            criteria: { none: 'No supported independent basis is established.', scene: 'The visible present exchange alone supports the direction.', ...Object.fromEntries(person.contextCandidates.map(item => [item.id, `The direction requires ${item.id}.`])) } };
    }
    return questions;
}
function selectedIds(person, decisions, kind, details = {}) {
    if (kind === 'profile' && person.recordMode) return allocateRecordIds(person, decisions, details);
    const prefix = `character_${person.index}_${kind}_slot_`;
    const allowed = new Set((kind === 'profile' ? person.profileCandidates : person.contextCandidates).map(item => item.id));
    const slots = kind === 'profile' ? Array.from({length:person.profileSlotLimit || 6},(_,index)=>index+1) : [1,2];
    return [...new Set(slots.map(slot=>decisions[`${prefix}${slot}`]).filter(id => id && id !== 'none' && allowed.has(id)))].slice(0, slots.length);
}
export function resolveLiveCharacterPlan(plan, decisions, details = {}) {
    return plan.map(person => {
        const prefix = `character_${person.index}`;
        const presence = decisions[`${prefix}_presence`] || 'absent';
        const profileIds = presence === 'active' ? selectedIds(person, decisions, 'profile', details) : [];
        const jevSelectedRuleIds = person.recordMode ? person.profileCandidates.filter((item,ordinal)=>decisions[`${prefix}_record_${ordinal}`]==='yes').map(item=>item.id) : profileIds;
        const contextIds = presence === 'active' ? selectedIds(person, decisions, 'context') : [];
        const denied = [], accepted = [];
        for (const id of contextIds) {
            const item = person.contextCandidates.find(candidate => candidate.id === id);
            const ordinal = person.contextCandidates.indexOf(item);
            const access = item.characterId === person.id && item.type === 'acquired_knowledge' ? 'stored_knowledge' : decisions[`${prefix}_context_access_${ordinal}`] || 'none';
            if (access === 'none' || !Object.hasOwn(ACCESS_CHOICES, access)) denied.push(item);
            else accepted.push({ ...item, access });
        }
        let direction = !person.recordMode && presence === 'active' && Object.hasOwn(DIRECTIONS, decisions[`${prefix}_response_direction`]) ? decisions[`${prefix}_response_direction`] : 'none';
        const affectSelections = presence === 'active' ? affectFields(person.priorState, { includeArousal: !person.sexualConductManaged }).map(field => ({field, expression: decisions[`${prefix}_affect_${field}`]})).filter(item => item.expression !== 'none' && Object.hasOwn(AFFECT_CHOICES, item.expression)) : [];
        // The Jev questions are parallel; validate the chosen action against access here.
        const basis = decisions[`${prefix}_response_basis`] || 'none';
        const basisItem = person.contextCandidates.find(item => item.id === basis);
        if ((basis === 'none' && ['deceive', 'withhold', 'confront'].includes(direction)) ||
            (basisItem && !accepted.some(item => item.id === basis)) ||
            (denied.length && !accepted.length && ['deceive', 'withhold'].includes(direction))) direction = 'none';
        return { ...person, presence, presenceUncertain:Boolean(details[`${prefix}_presence`]?.presenceUncertain), participationEvidence:details[`${prefix}_presence`]?.participationEvidence || 'unknown', presenceResolution:details[`${prefix}_presence`]?.presenceResolution || 'policy', profileIds, jevSelectedRuleIds, profileItems: profileIds.map(id => person.profileCandidates.find(item => item.id === id)), contextIds,
            contextItems: accepted, denied, direction, affectSelections, excludedReason: denied.length ? '접근 근거 없는 정보는 제외 · 독립적인 직접 반응은 유지' : '' };
    });
}
function contextLine(person, item) {
    if (item.type === 'acquired_knowledge') {
        const source = item.sourceType === 'claim' || ['reported','told'].includes(item.source) ? 'Was told' :
            ['belief','believed'].includes(item.sourceType) ? 'Believes' : ['suspicion','suspected'].includes(item.sourceType) ? 'Suspects' :
            ['observed','direct'].includes(item.source) ? 'Directly observed' : item.source === 'public' ? 'Publicly available' :
            'Previously established for this person';
        return `${person.name} · ${source}${item.occurredAt ? ` (${item.occurredAt})` : ''}: ${item.text}. Preserve whether this was a report, belief, observation, or past state; do not silently make it a verified current fact.`;
    }
    if (item.type === 'raw_message') return `${person.name}: may respond to ${item.speaker || 'another speaker'}'s message ${item.messageIndex ?? ''} only through ${item.access} access; a statement, claim, question, suspicion, or plan is not automatically a world fact or completed action.`;
    const source = ACCESS_LABELS[item.access] || 'Has bounded access to';
    return `${person.name} · ${source} this reference${item.occurredAt ? ` (${item.occurredAt})` : ''}; its truth and present validity are not established by access alone: ${item.text}`;
}
export function buildCharacterInjection(plan = [], { conflictActive = false, volume = plan[0]?.volume || 'generous', maxChars:charBudget = null } = {}) {
    const maxChars=Math.min(characterVolume(volume).chars,charBudget??Infinity);
    const selections = [], traces = [];
    for (const person of plan) {
        traces.push({ index: person.index, id: person.id, name: person.name, kind: person.kind, presence: person.presence,
            presenceUncertain:person.presenceUncertain,participationEvidence:person.participationEvidence,presenceResolution:person.presenceResolution,
            profileIds: person.profileIds, contextIds: person.contextIds, deniedIds: person.denied.map(item => item.id), direction: person.direction, affectSelections: person.affectSelections || [], priorAffect: person.priorState || null, recordMode:person.recordMode,
            recordStatus:person.recordStatus, storedRecordCount:person.storedRecordCount || 0, candidateCount:person.profileCandidates?.length || 0, prefilterStats:person.prefilterStats || {},
            recordSelections:person.profileItems.map(item=>({id:item.id,type:item.type,rule:item.rule,source_ids:item.source_ids,knowledge_state:item.knowledge_state})), excludedReason: person.excludedReason });
        if (person.presence !== 'active') continue;
        // Continuing actors retain constraints without being forced to speak or act.
        const chosen = [];
        if (!person.sourceVisibleToMain && person.kind === 'npc') {
            const excerpt = person.core.excerpts.map(item => item.text).filter(text => !/[가-힣]/u.test(text)).join(' · ');
            const recordCore = person.recordMode ? person.profileCandidates.filter(item=>!person.profileIds.includes(item.id) && ['fact','core'].includes(item.type) && (!item.when?.length || item.when.every(value=>['none','always','unconditional',''].includes(String(value).toLowerCase())))).slice(0,1).map(item=>scopedRecordLine(person.name,item)).join(' ') : '';
            const fallbackText = `Registered person: ${person.name}. Use only established identity and current RP; do not invent missing traits or knowledge.`;
            const core = person.recordMode ? (recordCore || fallbackText) : person.coreEnglish || (excerpt ? `${person.name}: ${excerpt}` : '');
            if (core) chosen.push({ priority: 100, mandatory: true, text: core, fallbackText:person.recordMode ? fallbackText : '' });
        }
        if (person.kind === 'npc' && person.antagonist && conflictActive) chosen.push({ priority: 85, mandatory: true, text: `${person.name}: Opposition follows established motives and limits.` });
        if (person.denied.length) chosen.push({ priority: 90, mandatory: true, text: `${person.name}: Do not treat unshared scene or reference material as this person's knowledge.` });
        for (const item of person.profileItems) chosen.push({ supplemental: person.protectedCandidateIds?.includes(item.id) === true, priority: item.type === 'boundary' || (item.type === 'knowledge' && ['does_not_know','misunderstands'].includes(item.knowledge_state)) ? 80 : 70, personIndex: person.index, ruleId: item.id, text: person.recordMode ? scopedRecordLine(person.name,item) : `${person.name}: ${item.rule}` });
        for (const expression of ['inward', 'visible', 'active']) {
            const fields = (person.affectSelections || []).filter(item => item.expression === expression).map(item => item.field);
            if (!fields.length) continue;
            const phrasing = { inward: 'through available viewpoint thought or restraint', visible: 'through speech, attention, or a small action', active: 'through a fitting character-led action' }[expression];
            chosen.push({ priority: 68, text: `${person.name}: Prior state ${affectSummary(person.priorState, fields)}. Let it register ${phrasing} within the current interaction; respect established limits and do not turn a feeling into automatic consent or relationship change.` });
        }
        if (person.kind === 'npc') {
            const role = {ally:'ally',villain:'villain',mixed:'mixed'}[person.npcRole] || 'mixed';
            chosen.push({priority:65,mandatory:true,text:`${person.name} · ${role} role: let established motives and limits color relevant conduct; the label supplies no new knowledge.`});
        }
        for (const item of person.contextItems) {
            // Source text remains available to Jev. Do not copy non-English
            // reference prose into the English execution prompt.
            if (item.type !== 'raw_message' && /[가-힣]/u.test(item.text)) continue;
            chosen.push({ priority: 60, text: contextLine(person, item) });
        }
        if (!person.recordMode && person.direction !== 'none') chosen.push({ priority: 50, text: `${person.name} · Direction: ${DIRECTIONS[person.direction]}` });
        chosen.sort((a,b)=>b.priority-a.priority);
        selections.push(...chosen.map(item => ({ ...item, personIndex: person.index })));
    }
    const groups=new Map();
    for(const item of selections.filter(item=>!item.supplemental)){if(!groups.has(item.personIndex))groups.set(item.personIndex,[]);groups.get(item.personIndex).push(item);}
    const selected=[];
    for(let round=0;[...groups.values()].some(items=>items.length>round);round++)for(const items of groups.values())if(items[round])selected.push(items[round]);
    const supplementalGroups = new Map();
    for (const item of selections.filter(item=>item.supplemental)) {
        if (!supplementalGroups.has(item.personIndex)) supplementalGroups.set(item.personIndex, []);
        supplementalGroups.get(item.personIndex).push(item);
    }
    for(let round=0;[...supplementalGroups.values()].some(items=>items.length>round);round++)for(const items of supplementalGroups.values())if(items[round])selected.push(items[round]);
    const lines = [], includedItems = [], includedRules = new Set(), injectedPeople = new Set();
    const mandatory = selected.filter(item => item.mandatory);
    const wrappedSize = items => `<CHARACTER_EXECUTION>\n${CHARACTER_INJECTION_PREAMBLE}\n${items.map(item=>item.text).join('\n')}\n</CHARACTER_EXECUTION>`.length;
    for (const item of [...mandatory].sort((a,b)=>b.text.length-a.text.length)) {
        if (wrappedSize(mandatory) <= maxChars) break;
        if (item.fallbackText && item.fallbackText.length < item.text.length) {
            item.text = item.fallbackText;
            item.identityFallback = true;
        }
    }
    // Reserve identity and denied-access notices before optional records fill the budget.
    const packingOrder = [...selected.filter(item => item.mandatory), ...selected.filter(item => !item.mandatory)];
    for (const item of packingOrder) {
        if (`<CHARACTER_EXECUTION>\n${CHARACTER_INJECTION_PREAMBLE}\n${[...lines,item.text].join('\n')}\n</CHARACTER_EXECUTION>`.length > maxChars) continue;
        lines.push(item.text);
        includedItems.push(item);
        if (Number.isInteger(item.personIndex)) injectedPeople.add(item.personIndex);
        if (item.ruleId) includedRules.add(item.ruleId);
    }
    for (const trace of traces) {
        trace.injected = injectedPeople.has(trace.index);
        trace.injectedRuleIds = trace.profileIds.filter(id => includedRules.has(id));
        trace.omittedRuleIds = trace.profileIds.filter(id => !includedRules.has(id));
        const person = plan.find(item => item.index === trace.index);
        trace.evolutionSelectedCount=person.profileItems.filter(item=>item.evolutionChangeId).length;
        trace.evolutionInjectedCount=person.profileItems.filter(item=>item.evolutionChangeId&&includedRules.has(item.id)).length;
        trace.jevSelectedRuleIds = person.jevSelectedRuleIds || trace.profileIds;
        trace.omittedBySlotRuleIds = trace.presence === 'active' ? trace.jevSelectedRuleIds.filter(id => !trace.profileIds.includes(id)) : [];
        trace.excludedByPresenceRuleIds = trace.presence === 'active' ? [] : trace.jevSelectedRuleIds;
        trace.protection = protectionTrace(person, trace);
        trace.omittedReason = trace.omittedRuleIds.length ? '인물 주입 길이 한도' : '';
        trace.zeroReason = trace.profileIds.length ? '' : trace.presence !== 'active' ? `참여 판정: ${trace.presence}` : trace.candidateCount ? 'Jev가 관련 기록을 선택하지 않음' : trace.recordStatus !== 'current' ? `저장 기록 상태: ${trace.recordStatus}` : '관련 후보 없음';
        trace.blockChars = includedItems.filter(item=>item.personIndex===trace.index).map(item=>item.text).join('\n').length;
        trace.identityFallback = includedItems.some(item=>item.personIndex===trace.index && item.identityFallback);
        trace.omittedMandatoryCount = mandatory.filter(item=>item.personIndex===trace.index && !includedItems.includes(item)).length;
    }
    const text=lines.length ? `<CHARACTER_EXECUTION>\n${CHARACTER_INJECTION_PREAMBLE}\n${lines.join('\n')}\n</CHARACTER_EXECUTION>` : '';
    return { text, traces, charCount:text.length, charLimit:maxChars };
}
export { CHARACTER_LIVE_SYSTEM };
