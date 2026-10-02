export const CHARACTER_VOLUMES = Object.freeze({
    basic: Object.freeze({label:'기본',slots:4,chars:3000,candidates:20,candidateChars:14000}),
    generous: Object.freeze({label:'넉넉하게',slots:6,chars:5000,candidates:20,candidateChars:16000}),
    detailed: Object.freeze({label:'상세하게',slots:8,chars:8000,candidates:20,candidateChars:18000}),
});

export function characterVolume(key) { return CHARACTER_VOLUMES[key] || CHARACTER_VOLUMES.generous; }

export function npcRecordLimit(value) {
    const count = Number(value);
    return [2, 3, 4].includes(count) ? count : 3;
}
