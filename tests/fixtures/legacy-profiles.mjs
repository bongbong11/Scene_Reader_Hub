// Test-only constructors for pre-retrieval saved data. Never imported by runtime.
import { stableFingerprint } from '../../decision-engine.js';
import { PROFILE_VERSION, ITEM_KINDS } from '../../src/characters/profile.js';
export function prepareProfileItems(value) {
    if (!value || !Array.isArray(value.items) || value.items.length > 10) {
        throw new Error('시트 해석 형식 오류: items 배열은 최대 10개여야 합니다.');
    }
    const items = [], rejected = [], seen = new Set();
    for (const candidate of value.items) {
        const id = String(candidate?.id || '');
        const reject = (reason) => rejected.push({ id, reason });
        if (!/^c[1-9]\d*$/.test(id) || seen.has(id)) { reject('항목 ID가 없거나 중복됩니다.'); continue; }
        seen.add(id);
        if (!ITEM_KINDS.includes(candidate.kind)) { reject('지원하지 않는 규칙 종류입니다.'); continue; }
        const topic = String(candidate.topic || '').trim();
        const target = String(candidate.target || '').trim();
        const rule = String(candidate.rule || '').trim();
        if (!topic || topic.length > 80 || !rule || rule.length > 400 ||
            (candidate.kind === 'relationship' && !target) ||
            (candidate.kind !== 'relationship' && target)) {
            reject('규칙의 주제·대상·길이를 확인하세요.'); continue;
        }
        if (/[가-힣]/u.test(rule) || !/[A-Za-z]/.test(rule)) {
            reject('주입 규칙은 영어로 작성해야 합니다.'); continue;
        }
        items.push({ id, kind: candidate.kind, topic, target, rule });
    }
    return { items, rejected };
}

export function createProfile(items, { characterId, sourceHash, source, analysisId, rejected = [] }) {
    return {
        version: PROFILE_VERSION,
        sourceHash,
        sourceFingerprint: stableFingerprint(source),
        analysisId,
        items: items.map((item) => ({
            ...item,
            localId: item.id,
            id: `char:${characterId}@${sourceHash}:${analysisId}:${item.id}`,
        })),
        rejected,
        status: items.length ? 'ready' : 'empty',
        analyzedAt: new Date().toISOString(),
    };
}

