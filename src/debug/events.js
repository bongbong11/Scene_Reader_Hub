const OMIT = /key|secret|token|password|prompt|transcript|payload|text|source/i;
export function safeDetail(detail = {}) {
    return Object.fromEntries(Object.entries(detail).filter(([key]) => !OMIT.test(key) || /^(inputKey|sourceKey|runKey|payloadChars|worldChars|textChars|promptHash|promptChars)$/.test(key)).map(([key,value]) =>
        [key, typeof value === 'string' ? value.replace(/(?:Bearer\s+|sk-)[\w.-]+/gi,'[redacted]').slice(0,240) : ['number','boolean'].includes(typeof value) || value === null ? value : Array.isArray(value) ? value.slice(0,20).map(x=>String(x).slice(0,80)) : '[structured]']));
}
export function createEventJournal({limit = 240, now = () => new Date().toISOString(), onEvent = () => {}} = {}) {
    const events = [];
    let sequence = 0;
    function emit({cycleId = '',stage = 'lifecycle',module = '',code = '',status = 'info',durationMs = 0,...detail}) {
        const event = Object.freeze({sequence:++sequence,at:now(),cycleId,stage,module,code,status,durationMs,...safeDetail(detail)});
        events.push(event);
        if(events.length > limit) events.splice(0,events.length-limit);
        try { onEvent(event); } catch { /* Diagnostics cannot change execution. */ }
        return event;
    }
    return {emit,snapshot:() => events.map(e=>({...e})),clear:() => {events.length = 0;}};
}
