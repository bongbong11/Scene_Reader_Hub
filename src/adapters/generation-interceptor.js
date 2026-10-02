// SillyTavern awaits this named manifest interceptor before prompt assembly.
export function installGenerationInterceptor({window,prepareFallback,ready}) {
    window.SceneReaderHubBeforeGenerate = async (_chat,_contextSize,_abort,type) => {
        await ready();
        return prepareFallback(type);
    };
}
