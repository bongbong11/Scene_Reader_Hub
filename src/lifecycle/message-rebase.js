import {jsonValueEqual} from '../shared/json-value.js';
import {sourceRefsKey} from '../continuity/source-refs.js';

export function isSingleMessageDeletion(before, after, index) {
    if (!Array.isArray(before) || before.length !== after.length + 1) return false;
    const identity = ({hidden:_hidden,...message}) => message;
    return after.every((message, position) => jsonValueEqual(identity(message), identity(before[position < index ? position : position + 1])));
}

// Only coordinate fields change when an excluded OOC message is removed.
// RP content, selected swipes, values and diagnostic history remain intact.
export function rebaseExcludedDeletion(record, history, index, fingerprint) {
    const coordinates = new Set(['messageIndex','outputIndex','assistantIndex','contextEndIndex','group']);
    const indexLists = new Set(['nonRpOutputIndices','sourceIndices','source_indices','messageIndices']);
    const seen=new WeakSet(),keys=new Map();
    function visit(value) {
        if (!value || typeof value !== 'object') return;
        if(seen.has(value))return;seen.add(value);
        for (const [key, child] of Object.entries(value)) {
            if (coordinates.has(key) && Number.isInteger(child) && child > index) value[key] = child - 1;
            else if (key === 'chatCount' && Number.isInteger(child) && child > index) value[key] = child - 1;
            else if (indexLists.has(key) && Array.isArray(child)) value[key] = child.filter(item=>item !== index).map(item=>Number.isInteger(item) && item > index ? item - 1 : item);
            else visit(child);
        }
        if(typeof fingerprint==='function'){
            if(value.contract===6&&Array.isArray(value.turnRefs)){const next=sourceRefsKey(value.turnRefs,fingerprint);keys.set(value.sourceKey,next);value.sourceKey=next;}
            else if(Array.isArray(value.refs)&&typeof value.key==='string'&&(Number.isInteger(value.outputIndex)||Number.isInteger(value.group)))value.key=sourceRefsKey(value.refs,fingerprint);
        }
    }
    visit(record);visit(history);
    const rebased=new WeakSet();
    function updateKeys(value){
        if(!value||typeof value!=='object'||rebased.has(value))return;rebased.add(value);
        if(Array.isArray(value.processedKeys))value.processedKeys=value.processedKeys.map(key=>keys.get(key)||key);
        if(typeof value.sourceKey==='string'&&keys.has(value.sourceKey))value.sourceKey=keys.get(value.sourceKey);
        Object.values(value).forEach(updateKeys);
    }
    updateKeys(record);updateKeys(history);
    // Prepared payload identity includes the old host positions; rebuild it.
    record.lastJudgment = null;
}
