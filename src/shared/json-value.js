// Compare the JSON value persisted by the host; object property order is not data.
export function jsonValueEqual(left, right) {
    if (left === right) return true;
    if (left === null || right === null || typeof left !== typeof right) return false;
    if (typeof left !== 'object') return false;
    if (Array.isArray(left) || Array.isArray(right)) {
        return Array.isArray(left) && Array.isArray(right) && left.length === right.length
            && Array.from(left).every((value, index) => jsonValueEqual(value ?? null, right[index] ?? null));
    }
    const leftKeys = Object.keys(left).filter(key => left[key] !== undefined);
    const rightKeys = Object.keys(right).filter(key => right[key] !== undefined);
    return leftKeys.length === rightKeys.length
        && leftKeys.every(key => Object.hasOwn(right, key) && jsonValueEqual(left[key], right[key]));
}
