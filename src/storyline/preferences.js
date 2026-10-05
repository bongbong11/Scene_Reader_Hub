import { clone, SHARED_LINK, chatRef, fail } from '../storage/shared-document.js';
import { roomPreferences } from '../storage/common-preferences.js';

export async function preferencesForConnection({mode,story,baseline,currentRecord,catalog,post,signal}) {
    if (mode==='new') return clone(baseline.defaultPreferences || {});
    if (mode==='branch') return {...clone(baseline.defaultPreferences || {}),...roomPreferences(currentRecord?.preferences || {})};
    let preferences=story.checkpoints?.[story.headCheckpointId]?.state?.continuationPreferences;
    if (!preferences) {
        // Older checkpoints stored selections only in the active room runtime.
        const source=catalog.rooms.find(room=>room.chatRef===story.activeChatRef && room.storylineId===story.id);
        if (!source || chatRef(source.chatKey)!==story.activeChatRef) throw fail('STORYLINE_SETTINGS_SOURCE_MISSING','이어받을 방의 설정을 찾지 못했습니다. 이전 방을 열어 저장한 뒤 다시 시도하세요.');
        const saved=await post('bootstrap',{chatKey:source.chatKey},{signal});
        const link=saved.chat?.[SHARED_LINK];
        if (link?.storylineId!==story.id || link.epoch!==story.epoch) throw fail('STORYLINE_SETTINGS_SOURCE_CHANGED','이전 방의 이야기 연결이 바뀌었습니다. 다시 불러와 주세요.');
        preferences=saved.chat?.runtime?.preferences || {};
    }
    return {...clone(baseline.defaultPreferences || {}),...roomPreferences(preferences)};
}
