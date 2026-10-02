// Curated paragraph bundles preserve the supplied world prompts verbatim.
const SPECS = {
    'custom-harry-potter': {
        fixed: [0, 1, 9, 11, 12, 13],
        records: [
            [2, 'society', 'Blood status, family pressure, prejudice or institutions matter.', 'blood,혈통,순혈,머글'],
            [3, 'society', 'The anti-Muggle-born slur is used or discussed.', 'mudblood,잡종,혈통'],
            [4, 'consequence', 'Magic or magical society may be exposed to Muggles.', 'secrecy,머글,비밀,목격'],
            [5, 'knowledge', 'Someone encounters the unfamiliar magical or Muggle world.', 'technology,기술,병원,머글,돈'],
            [6, 'scope', 'The period affects ordinary technology or customs.', 'year,년도,시대,전화,자동차'],
            [7, 'mechanism', 'Magical education, competence, law or access matters.', 'school,spell,학교,수업,마법,법'],
            [8, 'mechanism', 'Travel, communication, healing, money or public services matter.', 'travel,owl,이동,부엉이,치료,돈'],
            [10, 'scope', 'The scene is outside the British magical world.', 'country,국가,미국,프랑스,외국'],
        ],
    },
    'custom-omegaverse': {
        fixed: [0, 1, 7, 11, 13, 14, 15, 16, 17],
        records: [
            [2, 'mechanism', 'Alpha biology matters to a present person.', 'alpha,알파,페로몬'],
            [3, 'mechanism', 'Beta biology or perception matters to a present person.', 'beta,베타,냄새'],
            [4, 'mechanism', 'Omega biology or scent matters to a present person.', 'omega,오메가,향,임신'],
            [5, 'active_state', 'An Omega is actually in heat.', 'heat,히트,발정'],
            [6, 'active_state', 'An Alpha is actually in rut.', 'rut,러트,발정'],
            [8, 'active_state', 'Biological instinct is currently close to the surface.', 'instinct,본능,흥분,러트,히트'],
            [9, 'consequence', 'Claiming, marking or an established physiological bond matters.', 'bond,mark,각인,분리,본딩'],
            [10, 'knowledge', 'A fated mate belief is encountered or discussed.', 'fated,운명,소울메이트'],
            [12, 'society', 'Secondary-sex status affects social or institutional treatment.', 'status,차별,사회,공공,억제제'],
        ],
    },
    'custom-werewolf': {
        fixed: [0, 1, 4, 10, 11, 12, 13, 14, 15],
        records: [
            [2, 'society', 'Pack membership, position or community matters.', 'pack,luna,무리,팩,루나'],
            [3, 'mechanism', 'Mate recognition, rejection or marking matters.', 'mate,짝,각인,거부'],
            [5, 'mechanism', 'Shifting or control of transformation matters.', 'shift,변신,통제'],
            [6, 'society', 'A rogue or lack of Pack protection matters.', 'rogue,로그,추방'],
            [7, 'active_state', 'Animal senses or instincts affect the current interaction.', 'scent,본능,영역,위협,냄새'],
            [8, 'active_state', 'Instinct is close to the surface in the current scene.', 'instinct,본능,영역,위협'],
            [9, 'society', 'Territory, hierarchy, succession or inter-Pack relations matter.', 'territory,영역,계승,충성'],
        ],
    },
};

export function bundledWorldBank(world) {
    if (world.advanced || !world.prompt) return world;
    const spec = SPECS[world.id];
    const generic = world.builtin && !['current', 'campus', 'campus-us', 'campus-uk'].includes(world.id);
    if (!spec && !generic) return world;
    const paragraphs = world.prompt.replace(/^<[A-Z_]+>\s*|\s*<\/[A-Z_]+>$/g, '').split(/\n\s*\n/)
        .map(text => text.trim()).filter(text => text && !text.startsWith('#') && !text.startsWith('{{//'));
    const fixed = spec ? spec.fixed : [0];
    const entries = spec ? spec.records : paragraphs.slice(1).map((_, index) => [index + 1, 'mechanism', 'When this world aspect materially affects the current scene.', world.name]);
    // An edited bundle must never be silently split using obsolete paragraph positions.
    if (spec && new Set([...fixed, ...entries.map(entry => entry[0])]).size !== paragraphs.length) return world;
    return { ...world, prompt: fixed.map(index => paragraphs[index]).join('\n\n'), advanced: {
        version: 1, calendar_topics: world.calendarTopics || [],
        records: entries.map(([index, category, when, keywords]) => ({
            id: `W${String(index + 1).padStart(3, '0')}`, category, when,
            keywords: keywords.split(','), rule: paragraphs[index], source_quote: paragraphs[index].slice(0, 1200),
        })),
    } };
}
