// A request-local marker reserves the normal quiet-prompt budget, then moves only
// our instruction to the final user message. No chat or preset data is changed.
let sequence = 0;
export function installReviewMessage(host, prompt, report = () => {}) {
    const bus = host.eventSource, events = host.event_types;
    if (host.main_api !== 'openai' || !bus?.makeLast || !bus?.removeListener ||
        !events?.CHAT_COMPLETION_PROMPT_READY || !events?.CHAT_COMPLETION_SETTINGS_READY) {
        throw Object.assign(new Error('마지막 사용자 입력으로 확인하려면 SillyTavern의 채팅 완성 연결을 사용하세요.'), {code:'REVIEW_PLACEMENT_UNSUPPORTED'});
    }
    // Correlation only, not an authentication token; works on HTTP mobile hosts.
    const id = `${Date.now().toString(36)}-${++sequence}-${Math.random().toString(36).slice(2)}`;
    const start = `<sr-review-${id}>`, end = `</sr-review-${id}>`;
    const wrapped = `${start}\n${prompt}\n${end}`;
    let confirmed = false;
    function relocate(messages, final) {
        if (!Array.isArray(messages)) return false;
        let instruction = null;
        function strip(text) {
            if (typeof text !== 'string') return text;
            let from = text.indexOf(start);
            while (from >= 0) {
                const to = text.indexOf(end, from + start.length);
                if (to < 0) return text;
                instruction ??= text.slice(from + start.length, to).trim();
                text = text.slice(0, from) + text.slice(to + end.length);
                from = text.indexOf(start);
            }
            return text;
        }
        const next = messages.flatMap(message => {
            if (!message || typeof message !== 'object') return [message];
            const marked = text => typeof text === 'string' && text.includes(start) && text.includes(end);
            if (!(Array.isArray(message.content) ? message.content.some(part => part?.type === 'text' && marked(part.text)) : marked(message.content))) return [message];
            const content = Array.isArray(message.content)
                ? message.content.flatMap(part => {
                    if (part?.type !== 'text' || !marked(part.text)) return [part];
                    const text=strip(part.text);return text.trim() ? [{...part,text}] : [];
                })
                : strip(message.content);
            if ((Array.isArray(content) ? !content.length : !String(content || '').trim()) && !message.tool_calls) return [];
            return [{...message, content}];
        });
        if (instruction === null) return false; // unrelated generations are untouched
        next.push({role:'user', content:final ? instruction : `${start}\n${instruction}\n${end}`});
        messages.splice(0, messages.length, ...next);
        if (final) confirmed = true;
        try { report({code:final ? 'REVIEW_USER_MESSAGE_READY' : 'REVIEW_USER_MESSAGE_PREPARED',
            status:'info', phase:final ? 'request' : 'assembly', role:'user', position:'last', messageCount:messages.length}); }
        catch { /* Optional diagnostics must not affect the request. */ }
        return true;
    }
    const onPrompt = data => {
        if (!data?.dryRun && relocate(data?.chat, false)) bus.makeLast(events.CHAT_COMPLETION_SETTINGS_READY, onRequest);
    };
    const onRequest = data => { relocate(data?.messages, true); };
    const dispose = () => {
        bus.removeListener(events.CHAT_COMPLETION_PROMPT_READY, onPrompt);
        bus.removeListener(events.CHAT_COMPLETION_SETTINGS_READY, onRequest);
    };
    try {
        bus.makeLast(events.CHAT_COMPLETION_PROMPT_READY, onPrompt);
        bus.makeLast(events.CHAT_COMPLETION_SETTINGS_READY, onRequest);
    } catch (error) { dispose(); throw error; }
    return {quietPrompt:wrapped, dispose, verify() {
        if (!confirmed) throw Object.assign(new Error('확인 명령의 마지막 사용자 입력 배치를 확인하지 못했습니다. 결과를 적용하지 않았습니다.'), {code:'REVIEW_PLACEMENT_UNCONFIRMED'});
    }};
}
