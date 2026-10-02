import { stableFingerprint } from "../decision/policy.js";
import { recordBankIsCurrent } from "./records.js";

export const PROFILE_VERSION = 2;
export const ITEM_KINDS = ['behavior', 'relationship', 'knowledge', 'speech'];
export const ITEM_LABELS = {
    behavior: '판단·행동 방식',
    relationship: '상대에 따른 태도',
    knowledge: '지식·능력·접근 범위',
    speech: '대화 방식',
};

export function profileIsCurrent(entry) {
    const profile = entry?.profile;
    return profile?.version === PROFILE_VERSION &&
        profile.sourceHash === entry.sourceHash &&
        profile.sourceFingerprint === stableFingerprint(entry.source);
}

export function currentProfileItems(entry) {
    // Legacy reader for recovery/tests; canonical banks use the live record selector.
    if (entry?.recordBank) return [];
    if (!profileIsCurrent(entry)) return [];
    const prefix = `char:${entry.id}@${entry.sourceHash}:${entry.profile.analysisId}:`;
    return (entry.profile.items || []).filter((item) =>
        item.id?.startsWith(prefix) && ITEM_KINDS.includes(item.kind) &&
        typeof item.rule === 'string' && Boolean(item.rule.trim()) &&
        !/[가-힣]/u.test(item.rule));
}

export function profileStatus(entry) {
    if (entry?.recordBank) return recordBankIsCurrent(entry)
        ? `인물 기록 ${entry.recordBank.records.length}개 저장 · 이번 턴 관련 기록 선택 가능`
        : '재판독 필요 · 원문 또는 추출 기준 변경';
    if (!entry?.source?.trim()) return '시트 필요';
    if (entry.profile && !profileIsCurrent(entry)) return '재판독 필요 · 이전 규칙 미적용';
    if (!entry.profile) return '시트 저장됨 · 판독 필요';
    return '이전 인물 규칙 보관 중 · 새 인물 기록 추출 필요';
}

// Core is separate from the selectable rules and preserves only identity.
export function buildCore(entry) {
    const source = String(entry.source || '');
    const lines = source.split(/\r?\n/).filter((line) =>
        /^(?:\s*[-*]\s*)?(?:name|role|occupation|affiliation|relationship|이름|역할|직업|소속|관계)\s*:/i.test(line));
    const fallback = source.split(/\r?\n/).find((line) => line.trim() && line.length <= 280);
    const excerpts = [];
    for (const text of (lines.length ? lines : fallback ? [fallback] : [])) {
        if (text.length > 160 || excerpts.length >= 3 ||
            excerpts.reduce((sum, item) => sum + item.text.length, 0) + text.length > 320) continue;
        excerpts.push({ text, start: source.indexOf(text), end: source.indexOf(text) + text.length });
    }
    return {
        name: entry.name,
        aliases: entry.aliases || [],
        sourceFingerprint: stableFingerprint(source),
        excerpts,
    };
}
