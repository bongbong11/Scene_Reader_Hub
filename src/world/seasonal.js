import {monthlySeason} from './seasonal-data.js';
import {holidayMaterials} from './holiday-calendar.js';
import {validSceneDate} from './scene-date.js';

export const SEASONAL_OPTIONS = {
    us_holidays:'미국 공휴일·행사', uk_holidays:'영국 공휴일·행사', kr_holidays:'한국 공휴일·행사',
    college_football:'미식축구 대학리그', pro_football:'미식축구 프로리그',
    us_university:'미국 대학', uk_university:'영국 대학', hogwarts:'호그와트 학사·행사',
};
export const SEASONAL_SCOPE='Seasonal reference only. Use relevant details when they naturally fit the current scene; do not force their inclusion. The season alone does not establish any event, participation, or outcome.';
export function normalizeSeasonalReferences(value) {
    return [...new Set((Array.isArray(value)?value:[]).filter(key=>Object.hasOwn(SEASONAL_OPTIONS,key)))];
}
export function seasonalEnabled(preferences,world) {
    return Boolean(normalizeSeasonalReferences(preferences?.seasonalReferences).length||automaticSeason(world));
}
const automaticSeason=world=>['us_university','uk_university'].includes(world?.seasonalProfile)?world.seasonalProfile:'';
// The caller supplies a confirmed date. There is deliberately no transcript/date guessing fallback.
export function seasonalWorldNote(preferences,date,world) {
    if(!date||!validSceneDate(date.year,date.month,date.day))return '';
    const selected=normalizeSeasonalReferences(preferences?.seasonalReferences);
    const covered=new Set([...(world?.calendarTopics||[]),...(world?.advanced?.calendar_topics||[])]);
    const automatic=automaticSeason(world);
    const enabled=[...new Set([...selected,...(automatic?[automatic]:[])])];
    const topics=enabled.filter(key=>key===automatic||!covered.has(key)&&!(/_holidays$/.test(key)&&covered.has('holidays')));
    const countries=topics.filter(key=>/_holidays$/.test(key)).map(key=>key.slice(0,2));
    const lines=holidayMaterials(date,countries);
    for(const key of topics) {
        const material=monthlySeason(key,date);
        if(material)lines.push(({us_university:'US university',uk_university:'UK university',college_football:'US college football',pro_football:'NFL',hogwarts:'Hogwarts'}[key]||key)+': '+material);
    }
    if(!lines.length)return '';
    if(topics.includes('hogwarts'))lines.push('School references apply only to relevant Hogwarts participants. Use the established year: the Triwizard Tournament, Yule Ball and exceptional cancellations are not annual defaults; do not invent match dates.');
    if(countries.length)lines.push('Public holidays and cultural occasions differ; local, regional and employer calendars determine closures. One-off holidays are not inferred.');
    if(topics.some(key=>/university|football/.test(key)))lines.push('Typical windows only; the institution, league year and team schedule take priority. No date alone establishes a fixture, qualification, draft selection, contract or debut.');
    const stamp=(date.year===null?'year unspecified ':date.year+'-')+String(date.month).padStart(2,'0')+'-'+String(date.day).padStart(2,'0');
    return '[SEASONAL_REFERENCE '+stamp+']\n'+SEASONAL_SCOPE+'\n'+lines.join('\n')+'\n[/SEASONAL_REFERENCE]';
}
