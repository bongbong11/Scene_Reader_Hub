import {jsonValueEqual} from '../shared/json-value.js';

export function isSingleMessageDeletion(before, after, index) {
    if (!Array.isArray(before) || before.length !== after.length + 1) return false;
    const identity = ({hidden:_hidden,...message}) => message;
    return after.every((message, position) => jsonValueEqual(identity(message), identity(before[position < index ? position : position + 1])));
}

// Only coordinate fields change when an excluded OOC message is removed.
// RP content, selected swipes, values and diagnostic history remain intact.
export function rebaseExcludedDeletion(record, history, index) {
    const coordinates = new Set(['messageIndex','outputIndex','assistantIndex','contextEndIndex','group']);
    const indexLists = new Set(['nonRpOutputIndices','sourceIndices','source_indices','messageIndices']);
    function visit(value) {
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
            if (coordinates.has(key) && Number.isInteger(child) && child > index) value[key] = child - 1;
            else if (key === 'chatCount' && Number.isInteger(child) && child > index) value[key] = child - 1;
            else if (indexLists.has(key) && Array.isArray(child)) value[key] = child.filter(item=>item !== index).map(item=>Number.isInteger(item) && item > index ? item - 1 : item);
            else visit(child);
        }
    }
    visit(record);visit(history);
    // Prepared payload identity includes the old host positions; rebuild it.
    record.lastJudgment = null;
}
