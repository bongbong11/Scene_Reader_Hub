// Persistent preset content is a note and a macro, never a turn's RP payload.
export const PRESET_ENTRIES = Object.freeze({
    scene: Object.freeze({identifier:'scene-reader-hub-slot-v1',name:'🐵 씬판독기주입위치',macro:'scene-reader-hub',
        note:'씬판독기 주입용 프롬프트입니다. 이 항목을 드래그해 주입 위치를 옮기거나 토글로 켜고 끌 수 있습니다. 아래 매크로는 이번 실행의 주입문으로 자동 치환되므로 유지해 주세요.'}),
    world: Object.freeze({identifier:'scene-reader-hub-world-slot-v1',name:'🐵 씬판독기세계관주입위치',macro:'scene-reader-hub-world',
        note:'씬판독기 세계관·시즌 참고 주입용 프롬프트입니다. 이 항목을 드래그해 주입 위치를 옮기거나 토글로 켜고 끌 수 있습니다. 아래 매크로는 이번 실행의 주입문으로 자동 치환되므로 유지해 주세요.'}),
    character: Object.freeze({identifier:'scene-reader-hub-character-slot-v1',name:'🐵 인물판독주입',macro:'scene-reader-hub-character',
        note:'씬판독기 인물 판독 주입용 프롬프트입니다. 드래그와 토글로 위치·사용 여부를 정합니다. 아래 매크로를 유지해 주세요.'}),
});
export const entryText=kind=>`{{// ${PRESET_ENTRIES[kind].note}}}\n{{${PRESET_ENTRIES[kind].macro}}}`;
export const entryHasMacro=(prompt,kind)=>new RegExp('\\{\\{\\s*'+PRESET_ENTRIES[kind].macro+'\\s*\\}\\}','i').test(prompt?.content||'');
