// Hydration removes the legacy sceneReader metadata only after reading the
// server store. Persist that already-migrated metadata via the host's own API;
// never walk messages and guess which other extensions' logs are disposable.
export async function persistCleanChatMetadata({getContext,ready,isBusy,module='sceneReader'}){
    if(isBusy())throw new Error('생성과 저장을 마친 뒤 정리해 주세요.');
    const context=getContext();
    if(!context.chatId||!ready())throw new Error('저장된 채팅방의 자료를 먼저 불러와 주세요.');
    if(Object.hasOwn(context.chatMetadata||{},module))throw new Error('옛 확장 자료가 아직 남아 있어요. 자료 이사를 마친 뒤 다시 열어 주세요.');
    if(typeof context.saveMetadata!=='function')throw new Error('현재 SillyTavern에서 채팅 정보 저장을 지원하지 않습니다.');
    await context.saveMetadata();
}
