import {parseReasonerReply} from '../continuity/json-parser.js';
export {parseReasonerReply} from '../continuity/json-parser.js';
export const REASONER_MAX_TOKENS = 1200;



export function listConnectionProfiles(service) {
    return service.getSupportedProfiles().map((profile) => ({
        id: String(profile.id),
        name: String(profile.name || profile.id),
        model: String(profile.model || '모델 이름 없음'),
        mode: String(profile.mode || ''),
    }));
}



export async function requestWithConnectionProfile(service, profileId, system, state, { testing = false, maxTokens = REASONER_MAX_TOKENS } = {}) {
    const profile = service.getProfile(profileId);
    service.validateProfile(profile);
    const messages = testing
        ? [{ role: 'system', content: 'Return a JSON object only.' }, { role: 'user', content: 'Return exactly {"ok":true}.' }]
        : [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(state) }];
    let response;
    try {
        response = await service.sendRequest(profileId, messages, maxTokens, {
            stream: false,
            extractData: true,
            includePreset: false,
            includeInstruct: true,
        });
    } catch (error) {
        throw new Error(error?.cause?.message || error?.message || 'SillyTavern 연결 요청에 실패했습니다.');
    }
    let result;
    try { result = parseReasonerReply(response?.content ?? response); }
    catch (error) { throw new Error(`연결 모델이 완전한 JSON을 반환하지 않았습니다. 출력 길이와 연결 프로필을 확인하세요. (${error.message})`); }
    if (testing && result.ok !== true) throw new Error('선택한 모델의 연결 확인 응답이 올바르지 않습니다.');
    return { result, profile: { id: profile.id, name: profile.name || profile.id, model: profile.model || '모델 이름 없음' } };
}
