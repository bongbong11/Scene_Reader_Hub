export function createCommandBus({onDispatch=()=>{}}={}) {
    const handlers = new Map();
    return {
        register(name,handler) { if(handlers.has(name))throw new Error(`중복 Hub 명령: ${name}`);handlers.set(name,handler); },
        dispatch(name,...args) { const handler=handlers.get(name);if(!handler)throw new Error(`등록되지 않은 Hub 명령: ${name}`);onDispatch(name);return handler(...args); },
        names:() => [...handlers.keys()],
    };
}
