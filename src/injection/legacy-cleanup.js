import { INJECT_KEY, WORLD_INJECT_KEY, STATE_CAPTURE_KEY, IN_CHAT, SYSTEM_ROLE } from '../storage/contract.js';

// Exact keys owned by Scene Reader. No prefix sweep or stored-preset edits.
export async function clearLegacyPrompts(setExtensionPrompt,keys=[INJECT_KEY,WORLD_INJECT_KEY,STATE_CAPTURE_KEY]) {
    for(const key of keys)await setExtensionPrompt(key,'',IN_CHAT,0,false,SYSTEM_ROLE);
}

export function registerEmptyLegacyMacros(macros) {
    if(typeof macros?.register!=='function')return;
    for(const name of ['scene-reader','scene-reader-world'])macros.register(name,{
        category:macros.category?.MISC ?? 'misc',description:'구버전 호환용 빈 매크로입니다. 프리셋 항목 주입 설정을 사용하세요.',returns:'빈 문자열',handler:()=>'',
    });
}
