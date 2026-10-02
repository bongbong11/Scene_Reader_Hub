export const STATE_OPEN = '[[SR_STATE]]';
export const STATE_CLOSE = '[[/SR_STATE]]';
export const STATE_MOODS = Object.freeze(['anger', 'joy', 'fear', 'sadness']);
const FIELD_NAMES = new Set(['a', 'c', ...STATE_MOODS]);

const FIELD_ALIASES = { a:'a', arousal:'a', sexualarousal:'a', c:'c', selfcontrol:'c' };
const fieldName = value => {
    const key = String(value).toLowerCase().replace(/[ _-]/g, '');
    return FIELD_ALIASES[key] || key;
};
function findPerson(code, roster) {
    const label = String(code || '').trim();
    const byCode = roster.find(item => item.code.toLowerCase() === label.toLowerCase());
    if (byCode) return byCode;
    const matches = roster.filter(item => item.id === label || item.name?.toLowerCase() === label.toLowerCase());
    return matches.length === 1 ? matches[0] : null;
}
function stateFor(code, fields, roster, reject = () => null) {
    const person = findPerson(code, roster);
    if (!person) return reject('unknown_person');
    const values = { anger: 0, joy: 0, fear: 0, sadness: 0 };
    const targets = {};
    const seen = new Set();
    for (const field of fields) {
        const match = /^([a-z_]+(?:[ -][a-z]+)*)\s*(?:[:=]\s*)?(\d{1,3}(?:\.0+)?)\s*%?\s*(?:@\s*([\p{L}\p{N} .'_-]{1,64}))?$/iu.exec(String(field).trim());
        if (!match) return reject('field_format');
        const key = fieldName(match[1]);
        if (!FIELD_NAMES.has(key)) return reject('unknown_field');
        if (seen.has(key)) return reject('duplicate_field');
        const number = Number(match[2]);
        if (number > 100) return reject('out_of_range');
        if ((key === 'a' || key === 'c') && !person.trackArousal) return reject('disabled_field');
        seen.add(key);
        values[key] = number;
        if (match[3] && key !== 'c') targets[key] = match[3].trim();
    }
    if (person.trackArousal && (!seen.has('a') || !seen.has('c'))) return reject('missing_fields');
    if (!person.trackArousal) { delete values.a; delete values.c; }
    return { id: person.id, values, targets };
}
function readRows(rows, roster, format) {
    const diagnostics = { format, received: rows.length, accepted: 0, rejected: 0, reasons: [] };
    const reason = value => { if (!diagnostics.reasons.includes(value)) diagnostics.reasons.push(value); return null; };
    if (rows.length > 24) return { states: [], diagnostics: {...diagnostics, rejected: rows.length, reasons:['too_many_rows']} };
    const seen = new Set(), blocked = new Set(), states = [];
    for (const {code, fields, invalid} of rows) {
        const person = findPerson(code, roster);
        if (person && seen.has(person.id)) {
            blocked.add(person.id); reason('duplicate_person'); continue;
        }
        if (person) seen.add(person.id);
        const state = invalid ? reason(invalid) : stateFor(code, fields, roster, reason);
        if (state) states.push(state);
    }
    const accepted = states.filter(state => !blocked.has(state.id));
    diagnostics.accepted = accepted.length;
    diagnostics.rejected = rows.length - accepted.length;
    return { states: accepted, diagnostics };
}
export function parseProfileStates(value, roster) {
    const rows = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : null;
    if (!rows) return {states:[],diagnostics:{format:'json',received:0,accepted:0,rejected:0,reasons:['json_format']}};
    return readRows(rows.map(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return {invalid:'json_format'};
        const code = item.code ?? item.id ?? item.name;
        const values = item.values && typeof item.values === 'object' ? item.values : item;
        const person = findPerson(code,roster);
        const fields = Object.entries(values).filter(([key]) => FIELD_NAMES.has(fieldName(key)))
            .filter(([key]) => person?.trackArousal || !['a','c'].includes(fieldName(key)))
            .map(([key,value]) => `${fieldName(key)}${value}${item.targets?.[key] ? `@${item.targets[key]}` : ''}`);
        return {code,fields};
    }), roster, 'json');
}
export function parseStateData(block, roster) {
    let content = String(block || '').trim();
    content = content.replace(/^```[a-z0-9_-]*\s*\n([\s\S]*?)\n```$/i,'$1').trim();
    if (/^[{[]/.test(content)) {
        try { const value = JSON.parse(content); return parseProfileStates(value?.states ?? value,roster); }
        catch { return {states:[],diagnostics:{format:'json',received:0,accepted:0,rejected:0,reasons:['json_format']}}; }
    }
    const lines = content.split(/\r?\n|;\s*(?=C\d+\s*\|)/i).map(line => line.trim()).filter(Boolean);
    return readRows(lines.map(line => {
        const [code,...fields] = line.replace(/^\|\s*|\s*\|$/g,'').split('|');
        return {code,fields,invalid:line.length > 640 ? 'too_long' : ''};
    }),roster,'lines');
}
export function parseStateLines(block, roster) {
    const result = parseStateData(block,roster);
    return result.states.length ? result.states : null;
}

// The whole tail is removed if the closing delimiter is missing. A malformed
// metadata block must never become part of the displayed or saved RP text.
export function extractStateBlock(raw, roster) {
    const source = String(raw || '');
    const start = source.search(/\[\[\s*SR_/i);
    if (start < 0) return { text: source, states: [], found: false, error: 'missing' };
    let before = source.slice(0, start);
    const fence = /(?:^|\r?\n)[ \t]*```[a-z0-9_-]*[ \t]*\r?\n[ \t]*$/i.exec(before);
    if (fence) before = before.slice(0, fence.index);
    const opening = /^\[\[\s*SR_STATE\s*\]\]/i.exec(source.slice(start));
    if (!opening) return { text: before.trimEnd(), states: [], found: true, error: 'opening' };
    const bodyStart = start + opening[0].length;
    const closing = /\[\[\s*\/SR_STATE\s*\]\]/i.exec(source.slice(bodyStart));
    if (!closing) return { text: before.trimEnd(), states: [], found: true, error: 'closing' };
    const end = bodyStart + closing.index;
    let after = source.slice(end + closing[0].length);
    if (fence) after = after.replace(/^[ \t]*(?:\r?\n)?[ \t]*```[ \t]*(?:\r?\n|$)/, '');
    // Preset info blocks may follow the metadata. Remove only metadata, never
    // the rest of the RP reply, and do not choose between conflicting blocks.
    const duplicate = /\[\[\s*SR_/i.test(after);
    if (duplicate) after = extractStateBlock(after, []).text;
    const text = [before.trimEnd(), after.trimStart()].filter(Boolean).join('\n');
    if (duplicate) return { text, states: [], found: true, error: 'trailing' };
    const {states,diagnostics} = parseStateData(source.slice(bodyStart, end), roster);
    return { text, states, diagnostics, found: true, error: states.length || (!diagnostics.received && !diagnostics.reasons.length) ? '' : 'format' };
}

export function normalizeProfileStates(value, roster) {
    return parseProfileStates(value,roster).states;
}

export const selectedStateSwipe = message => Number.isInteger(message?.swipe_id) ? message.swipe_id : 0;

export function latestStateEventForChat(record, chat, fingerprint = null) {
    const messages = Array.isArray(chat) ? chat : [];
    let latestIndex = -1;
    for (let index = messages.length - 1; index >= 0; index--) {
        if (!messages[index]?.is_user && !messages[index]?.is_system && !(record?.nonRpOutputIndices || []).includes(index)) { latestIndex = index; break; }
    }
    const message = messages[latestIndex];
    const matches = (record?.characterStateEvents || []).filter(item => item.outputIndex === latestIndex && (!fingerprint || item.fingerprint === fingerprint(message?.mes || '')));
    return matches.findLast(item => item.swipeId === selectedStateSwipe(message)) || matches.findLast(item => item.swipeId == null) || null;
}

export function latestStateForChat(record, chat, fingerprint = null) {
    return latestStateEventForChat(record, chat, fingerprint)?.states || [];
}

export function stateForEntry(state, entry) {
    if (!state || state.id !== entry?.id) return null;
    const allowed = entry.kind === 'npc' && !entry.trackArousal ? STATE_MOODS : ['a', 'c', ...STATE_MOODS];
    const values = Object.fromEntries(allowed.filter(key => Number.isInteger(state.values?.[key]) && state.values[key] >= 0 && state.values[key] <= 100).map(key => [key, state.values[key]]));
    if (!Object.keys(values).length) return null;
    const keys = Object.keys(values);
    return { id: entry.id, values,
        targets: Object.fromEntries(Object.entries(state.targets || {}).filter(([key, value]) => keys.includes(key) && key !== 'c' && typeof value === 'string' && /^[\p{L}\p{N} .'_-]{1,64}$/u.test(value))),
        changes: Object.fromEntries(Object.entries(state.changes || {}).filter(([key, value]) => keys.includes(key) && ['rising', 'falling', 'steady'].includes(value))),
    };
}

export function storeStateEvent(record, event, limit = 12, previousStates = null) {
    const prior = Array.isArray(record.characterStateEvents) ? record.characterStateEvents : [];
    const states = event.states.map(state => {
        const previous = previousStates ? previousStates.find(person => person.id === state.id) : prior.findLast(item => item.outputIndex < event.outputIndex && item.states.some(person => person.id === state.id))?.states.find(person => person.id === state.id);
        const changes = {};
        for (const [key, value] of Object.entries(state.values)) if (Number.isFinite(previous?.values?.[key])) {
            changes[key] = value > previous.values[key] ? 'rising' : value < previous.values[key] ? 'falling' : 'steady';
        }
        return { ...state, changes: previousStates === null && state.changes ? state.changes : changes };
    });
    const events = [...prior.filter(item => item.outputIndex !== event.outputIndex || (event.swipeId == null ? item.fingerprint !== event.fingerprint : item.swipeId !== event.swipeId)), { ...event, states }];
    // Bound the recovery window by message positions, not by alternative replies.
    // Rerolling one message must not evict its other selectable swipes.
    const retained = new Set([...new Set(events.map(item => item.outputIndex))].sort((a,b)=>b-a).slice(0,limit));
    record.characterStateEvents = events.filter(item => retained.has(item.outputIndex));
}

export function dropStateEventsFrom(record, index, editedSwipe = null) {
    if (!record || !Array.isArray(record.characterStateEvents)) return;
    record.characterStateEvents = record.characterStateEvents.filter(item => item.outputIndex < index || (editedSwipe !== null && item.outputIndex === index && item.swipeId != null && item.swipeId !== editedSwipe));
}
