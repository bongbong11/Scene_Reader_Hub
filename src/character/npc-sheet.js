// These utilities do not mutate chat history or promote generated character
// details into observed RP continuity.
export const NPC_CORE_SYSTEM = `Extract only the confirmed minimum identity of this registered NPC from the supplied sheet. Return JSON only: {"core":"One or two short English sentences naming the person's role/background and main established relationships."}. Preserve the supplied canonical name. Translate supported facts when the sheet is not in English. Do not infer temperament, hidden history, exceptional access, present emotion, or current RP events. If role or relationships are unspecified, omit them rather than inventing them.`;

export function suggestNpcAliases(name, source = '', blocked = []) {
    const canonical = String(name || '').trim();
    const unavailable = new Set([canonical, ...blocked].map(value => String(value || '').trim().toLocaleLowerCase()));
    const candidates = [];
    const words = canonical.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && /^[A-Za-z][A-Za-z'-]{1,39}$/.test(words[0]) && !/^(?:mr|mrs|ms|dr|sir|lady|lord)$/i.test(words[0])) candidates.push(words[0]);
    for (const match of String(source || '').matchAll(/^\s*(?:alias(?:es)?|aka|also known as|별칭|호칭)\s*:\s*([^\r\n]+)/gim)) {
        candidates.push(...match[1].split(/[,;、]/).map(value => value.trim()));
    }
    const seen = new Set();
    return candidates.filter(value => value && value.length <= 60 && !unavailable.has(value.toLocaleLowerCase()) && !seen.has(value.toLocaleLowerCase()) && seen.add(value.toLocaleLowerCase())).slice(0, 8);
}
export function parseNpcCore(value, name) {
    const core = String(value?.core || '').trim();
    if (!core || core.length > 220 || /[가-힣]/u.test(core) || !/[A-Za-z]/.test(core)) throw new Error('메인 모델에 전달할 NPC 기본 소개를 짧은 영어 문장으로 만들지 못했습니다.');
    return `${name}: ${core}`;
}

export function deriveEnglishCore(source, name) {
    const text = String(source || '');
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const relevant = lines.filter(line => /^(?:ROLE\s*\/\s*BACKGROUND|ROLE|RELATIONSHIP|Name|Occupation|Affiliation)\s*:/i.test(line))
        .filter(line => !/[가-힣]/u.test(line)).slice(0, 2).join(' ');
    if (!relevant || relevant.length > 220) return '';
    return `${name}: ${relevant}`;
}
