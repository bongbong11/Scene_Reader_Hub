export const SEASONAL_OPTIONS = {
    holidays: '시즌 행사',
    college_football: '미식축구 대학리그',
    pro_football: '미식축구 프로리그',
    us_university: '미국 대학',
    uk_university: '영국 대학',
};

const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12, jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

export function recentSceneDate(transcript) {
    const text = String(transcript || '');
    const found = [];
    const patterns = [
        /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g,
        /\b(\d{4})\s*년\s*(\d{1,2})\s*월(?:\s*(\d{1,2})\s*일)?/g,
        /\b(\d{1,2})\s*월(?:\s*(\d{1,2})\s*일)?/g,
        /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/gi,
    ];
    for (const [kind, pattern] of patterns.entries()) for (const match of text.matchAll(pattern)) {
        if (kind === 2 && /\d{4}\s*년\s*$/.test(text.slice(0, match.index))) continue;
        const prefix = text.slice(Math.max(0, match.index - 24), match.index).toLocaleLowerCase();
        if (/(?:내일|다음\s*(?:주|달|해)|지난\s*(?:주|달|해)|작년|예정|tomorrow|next\s+(?:week|month|year)|last\s+(?:week|month|year))\s*[:：]?\s*$/.test(prefix)) continue;
        const year = kind <= 1 ? Number(match[1]) : kind === 3 && match[3] ? Number(match[3]) : null;
        const month = kind <= 1 ? Number(match[2]) : kind === 2 ? Number(match[1]) : MONTHS[match[1].toLowerCase()];
        const day = kind <= 1 ? Number(match[3]) || null : kind === 2 ? Number(match[2]) || null : kind === 3 ? Number(match[2]) : null;
        if (year !== null && (year < 1800 || year > 2300)) continue;
        if (month < 1 || month > 12 || day !== null && (day < 1 || day > 31)) continue;
        if (day !== null && new Date(Date.UTC(year ?? 2000, month - 1, day)).getUTCDate() !== day) continue;
        found.push({ index: match.index, end: match.index + match[0].length, year, month, day });
    }
    return found.sort((a, b) => b.end - a.end || a.index - b.index)[0] || null;
}

function easterDate(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k + 7) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    return { month, day: (h + l - 7 * m + 114) % 31 + 1 };
}

function holiday(date) {
    if (date.month === 10 && date.day !== null && date.day >= 24 || date.month === 11 && date.day !== null && date.day <= 2) return 'Halloween week may affect local activities and atmosphere.';
    if (date.month === 12 && (date.day === null || date.day >= 18) || date.month === 1 && date.day !== null && date.day <= 3) return 'Christmas and winter holidays may affect gatherings, closures, travel, and routines.';
    if (date.year && date.day !== null) {
        const easter = easterDate(date.year);
        const days = (Date.UTC(date.year, date.month - 1, date.day) - Date.UTC(date.year, easter.month - 1, easter.day)) / 86400000;
        if (Math.abs(days) <= 7) return 'Easter week may affect holidays, travel, and routines where observed.';
    }
    return '';
}

export function seasonalWorldNote(preferences, transcript, world) {
    const enabled = Array.isArray(preferences?.seasonalReferences) ? preferences.seasonalReferences.filter(key => Object.hasOwn(SEASONAL_OPTIONS, key)) : [];
    if (!enabled.length) return '';
    const date = recentSceneDate(transcript);
    if (!date) return '';
    const covered = new Set([...(world?.calendarTopics || []), ...(world?.advanced?.calendar_topics || [])]);
    const lines = [];
    for (const key of enabled) {
        if (covered.has(key)) continue;
        if (key === 'holidays') { const value = holiday(date); if (value) lines.push(value); }
        if (key === 'college_football' && [8, 9, 10, 11, 12, 1].includes(date.month)) lines.push('In a US college-football setting, this is broadly the college season or postseason; use only a plausible local game or campus occasion.');
        if (key === 'pro_football' && [9, 10, 11, 12, 1, 2].includes(date.month)) lines.push('In a US professional-football setting, this is broadly the season or postseason; do not assert a specific fixture or result.');
        if (key === 'us_university') lines.push(date.month >= 8 && date.month <= 12 ? 'A typical US university is in the autumn semester, with a winter break around late December.' : date.month >= 1 && date.month <= 5 ? 'A typical US university is in the spring semester, with exams toward its end.' : 'A typical US university is on summer break or a summer session.');
        if (key === 'uk_university') lines.push(date.month >= 9 && date.month <= 12 ? 'A typical UK university is in its autumn term, with a winter break around late December.' : date.month >= 1 && date.month <= 3 ? 'A typical UK university is in its winter or spring term.' : date.month >= 4 && date.month <= 6 ? 'A typical UK university is in its spring or summer term, often with assessments toward its end.' : 'A typical UK university is in its long summer vacation or a summer session.');
    }
    return lines.length ? `Seasonal context for the RP's stated ${date.year ? `${date.year}-` : ''}${String(date.month).padStart(2, '0')}${date.day ? `-${String(date.day).padStart(2, '0')}` : ''}: ${lines.join(' ')} Use only when the setting and location support it; these are possibilities, not already-occurring events.` : '';
}
