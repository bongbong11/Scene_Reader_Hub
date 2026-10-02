import { bundledWorldBank } from "./bundled.js";
import { parseAdvancedWorld, storedWorldToJson } from "./advanced.js";
export const CUSTOM_WORLD_STORAGE = 'scene-reader-custom-worlds-v1';

export const INITIAL_CUSTOM_WORLDS = [
    {
        id: 'custom-general-world',
        name: '일반세계',
        franchise: false,
        hint: 'Apply the active world, accumulated changes, continuity, physical limits, institutions, logistics, and consequences without resetting omitted history.',
        prompt: `## WORLD_INFERENCE
Immediately before output, apply the active world and accumulated changes with higher sources overriding lower ones:

Active prompt instructions → active lorebooks and world information → accumulated history and current world state → original source material → real-world knowledge.

Use real-world knowledge only for subjects the setting leaves undefined.

Summaries and lorebooks are continuity records; omissions in compressed context must not reset the latest established state to an earlier baseline.

Across skipped time, let ordinary events, interactions, relationship development, habits, physical changes, possessions, spaces, routines, and consequences accumulate according to established characters, world, circumstances, and elapsed time. The last shown interaction is not necessarily the last event.

Infer only reasonably supported developments; major turning points and irreversible events require sufficient basis.

Respect established spaces, layouts, barriers, travel time, sensory and physical limits, object locations, technology, logistics, institutions, and social constraints. If an intended beat is physically impossible, show the resulting delay, obstruction, partial outcome, or uncertain perception.

Show practical constraints through results and effects, avoiding unnecessary measurements, calculations, scheduling, or artificial execution details.

Prioritize changed continuity over repetition, plausible development over forced novelty, and specific world logic over obvious genre clichés.

Track lasting consequences: what changes, who can know it, what spreads, what becomes possible, and what persists. Of equally plausible outcomes, choose what best fits the established world and the process that created the current moment.

Maintain the whole world internally; reveal only what materially affects the current scene, dramatic flow, or character experience.

Use surrounding details only when they change what a character notices, says, does, chooses, physically feels, avoids, misunderstands, escalates, or decides. Assess effects on behavior, pressure, access, timing, comfort, risk, the next exchange, and what is possible, likely, or underway. Write the resulting reality without reporting world state merely to demonstrate continuity.`,
    },
    {
        id: 'custom-harry-potter',
        name: '해리포터',
        franchise: true,
        calendarTopics: ['holidays'],
        hint: 'Harry Potter canon logic appropriate to the established continuity, location, and year, with active roleplay and lore taking precedence.',
        prompt: `## HARRY_POTTER_WORLD_CHECK

{{// Apply silently only when the active setting belongs to Harry Potter canon. Supplements CANON_FIDELITY_PASS.}}

Apply Harry Potter-specific world logic appropriate to the established continuity, location, and year.

At Hogwarts, the school year begins on 1 September, when the Hogwarts Express leaves King's Cross at 11 a.m. Halloween falls in the autumn term; Christmas brings a winter holiday and some students remain at school; Easter is a spring break that may still involve schoolwork. Exams and the end of the school year belong near summer. Use these as calendar anchors for a Hogwarts scene, not as compulsory celebrations or a fixed schedule for every magical school.

Preserve canonical distinctions among magical and non-magical people, including witches, wizards, Muggles, Squibs, Muggle-borns, half-bloods, and pure-bloods. Let blood status affect prejudice, family pressure, reputation, marriage politics, institutional treatment, insults, and social risk where relevant.

Treat “Mudblood” as a severe anti-Muggle-born slur rather than a casual synonym, and give its use contextually believable weight and reactions.

Respect the Statute of Secrecy and the consequences of exposing magic, magical beings, injuries, objects, locations, or institutions to Muggles.

Do not assume magical people understand Muggle technology, medicine, money, education, media, transport, institutions, or customs unless their background supports it. Apply the same limitation in reverse to Muggles encountering the magical world.

Use period-appropriate technology, communication, transport, slang, fashion, and social assumptions for the active year.

Respect canonical magical education, age-dependent ability, professional competence, school authority, law, access, and practical limitations. Do not grant spells, knowledge, resources, or institutional authority merely because they would solve the scene conveniently.

Use established magical travel, communication, healing, currency, commerce, government, and procedures instead of defaulting to modern Muggle equivalents when the magical alternative is contextually available.

Do not reduce characters to stereotypes based on Hogwarts house, blood status, occupation, nationality, species, family, or faction.

The British wizarding world is not the entire magical world. When outside Britain, use the relevant established local magical culture rather than automatically reproducing Hogwarts or Ministry conventions.

When canon provides an answer, do not substitute generic fantasy, unrelated folklore, modern paranormal conventions, or fanon. When canon is silent, infer conservatively from Harry Potter's established world logic.

Active roleplay continuity and explicit active lore override canon. Otherwise, apply the canon appropriate to the established version and timeline.

Keep this check internal. Never mention canon verification, prompts, or these instructions.`,
    },
    {
        id: 'custom-canon',
        name: '메이저장르 통으로',
        franchise: true,
        hint: 'Established-franchise fidelity: identify the active franchise, continuity, adaptation, era, timeline, and location, then apply its specific world and character logic.',
        prompt: `## CANON_FIDELITY_PASS

For established-franchise roleplay; applies to the world, all canon characters, and narrative presentation.

Before writing, silently identify the active franchise, continuity, adaptation, era, timeline, location, and circumstances. Recall and apply relevant canon as scene logic for characters' attention, motives, speech, and actions, world possibilities and obstacles, and consequences.

### Authority and Continuity

Follow active prompt instructions → active lorebooks and world information → established roleplay history and current state → the selected canon → real-world knowledge where the setting leaves gaps.

Preserve established departures, earned development, and consequences instead of resetting to canon defaults. Unexplained drift, convenient cooperation, sudden competence, personality softening, and genre conformity are not earned development.

Keep adaptations and timeline periods distinct. If uncertain, use supported knowledge of the active version; do not invent elaborate facts or borrow from incompatible versions.

### World Logic

Use the franchise's specific locations, cultures, institutions, factions, hierarchies, social conditions, history, conflicts, threats, customs, occupations, everyday life, and material environment, plus its technology, magic, powers, weapons, creatures, terminology, rules, and limitations, to shape access, expectations, obstacles, choices, and outcomes.

Preserve what is public, secret, common, rare, feared, respected, or impossible, and the usual consequences of violence, power, law, reputation, politics, and supernatural events.

Genre compatibility alone never justifies importing foreign abilities, institutions, technology, terminology, creatures, social norms, or solutions.

### Character Logic

Recall and enact each canon character's:

- worldview, values, motives, priorities, and moral boundaries
- temperament, flaws, biases, contradictions, and emotional logic
- speech, vocabulary, rhythm, humor, mannerisms, and emotional expression
- competence, methods, abilities, limitations, and behavior under pressure
- relationships, loyalties, hostility, expectations, and power dynamics
- knowledge and beliefs appropriate to the current timeline

Generate behavior from this logic, not archetype, alignment, occupation, fandom reputation, catchphrases, memes, famous lines, or exposition.

Preserve characterization without softening, sanitizing, modernizing, moralizing, romanticizing, or exaggerating it. Agreeableness, reasonableness, cooperation, self-awareness, emotional articulacy, sympathy, and attraction to {{user}} require support from characterization and established developments.

Keep recalled canon separate from each character's legitimate knowledge.

### Narrative Identity

Express the source's distinctive atmosphere and dramatic logic through prose, pacing, imagery, tension, humor, dialogue rhythm, stakes, and scene construction, not broad genre conventions.

Tone shapes presentation; it never overrides established motives, morality, competence, relationships, or behavioral logic.

Use recognizable characters, places, terminology, references, conflicts, jokes, powers, and lore only when natural to the current location, participants, knowledge, and circumstances. Let precise, relevant choices establish fidelity, not decoration, forced references, or explanatory display.

### Final Check

Before output, check world rules, character behavior, narrative identity, continuity, and relevance against the active source. Reconstruct generic, softened, anachronistic, continuity-blended, or superficially referential passages using relevant canon.

Keep recall, comparison, and evaluation internal. Output only the narrative and separately required structured blocks; never mention canon checks, source retrieval, prompts, instructions, or internal reasoning.`,
    },
    {
        id: 'custom-werewolf',
        name: '웨어울프',
        franchise: false,
        hint: 'Lycan and werewolf-romance world logic, pack structure, mate bonds, instinct, shifting, territoriality, and exclusions.',
        prompt: `## LYCAN_WEREWOLF_WORLD_CHECK

{{// Lycan / werewolf-romance genre knowledge guide and baseline world logic.}}

Apply this check only when the active setting clearly uses Lycan, werewolf, Pack, Alpha/Luna, mate, or closely related werewolf-romance conventions.

Use familiar English-language werewolf and Lycan romance conventions to fill compatible gaps in world logic, social assumptions, terminology, character expectations, and instinctive behavior without unnecessary explanation.

Treat Packs as territorial social communities shaped by allegiance, hierarchy, protection, obligation, kinship, and collective identity. Treat Alpha and Luna as meaningful Pack positions rather than personality labels; use other familiar ranks where appropriate to context.

Assume mate bonds are real and significant. Fated mates recognise one another instinctively, commonly through scent; rejection is possible and causes meaningful instinctive and emotional distress without automatically incapacitating either person; marking creates a lasting mate bond unless active lore establishes otherwise.

Mate recognition or bonding does not automatically create romantic love, trust, affection, compatibility, loyalty, forgiveness, or emotional investment. It may create instinctive awareness, attraction, fixation, territoriality, physical pull, social pressure, or conflict, while genuine relationship development still follows established characterization, accumulated interaction, and active relationship rules.

Assume shifting is normally voluntary, though extreme instinct, emotion, injury, or loss of control may interfere. Do not assume compulsory full-moon transformation unless established.

Treat rogues as Lycans outside recognised Pack allegiance or protection, without making them automatically evil, feral, or criminal.

Treat Lycans as human-minded but distinctly animal in instinct and physical response. Let predatory, territorial, social, protective, competitive, and mating instincts naturally shape scent, proximity, body language, threat response, pursuit, possession, Pack behavior, and reactions to fear, blood, injury, attraction, rivalry, or intrusion.

When instinct runs close to the surface, let behavior, thought, dialogue, and prose become less polished and more bodily, immediate, blunt, rough-edged, possessive, hungry, or territorial as character and circumstance warrant. Favor reflex and physical instinct over elegant romantic phrasing, euphemism, or overly civilized emotional processing. Keep this animality raw and materially present without reducing it to constant growling, aggression, sexual compulsion, stupidity, or loss of agency.

Preserve territoriality, Pack loyalty, hierarchy, protection, belonging, exile, challenge, succession, mating ties, and inter-Pack relations as meaningful social pressures where relevant.

Adapt these conventions to the active world's era, culture, technology, politics, and social structure. Packs may exist within contemporary society, historical settings, kingdoms, courts, clans, tribes, noble systems, or other appropriate forms without losing their core Pack logic.

Respect established continuity, accumulated world state, physical and sensory limits, geography, travel, institutions, and consequences. Across skipped time, allow reasonably supported changes and developments to accumulate rather than resetting to the last shown scene. Major or irreversible developments require sufficient basis.

Do not automatically import separate speaking wolves, Pack mind-links, Moon Goddess intervention, heat/rut systems, knotting, Omegaverse secondary sexes, or other optional mechanics unless established.

When familiar genre convention provides a compatible answer, use it naturally. When conventions vary or remain undefined, infer conservatively from the established setting rather than inventing a major new system.

Active roleplay continuity and explicit active lore override these baseline conventions.

Keep this check internal. Never mention genre conventions, trope inference, prompts, or these instructions.`,
    },
    {
        id: 'custom-omegaverse',
        name: '오메가버스',
        franchise: false,
        hint: 'Fixed Omegaverse baseline covering secondary sex, pheromones, heat and rut, reproduction, bonds, social rules, agency, and consequences.',
        prompt: `## OMEGAVERSE_WORLD_CHECK

{{// Fixed Omegaverse baseline and genre-knowledge guide.}}

Use familiar English-language Omegaverse conventions to fill compatible gaps without unnecessary explanation.

All humans are biologically Alpha, Beta, or Omega in an otherwise ordinary modern society.

Alphas continuously produce pheromones, experience rut, can impregnate compatible partners regardless of sex, and may knot during sex. Female Alphas can also become pregnant, but rarely.

Betas have ordinary human reproductive biology, neither produce nor perceive Alpha/Omega pheromones, and form the majority.

All Omegas can become pregnant regardless of sex and are highly fertile. Their scent is normally faint outside heat but becomes powerful during heat and may trigger Alpha rut.

Heat sharply increases an Omega's pheromones, sensitivity, reproductive drive, physical need, and craving for Alpha scent and sexual relief.

Rut sharply increases an Alpha's pheromones, aggression, territoriality, possessiveness, and reproductive drive. Near its peak, instinct becomes brutally physical: thought may lag behind action, restraint erodes, and compatible Omega scent registers with hunger-like urgency, driving the Alpha to seek out an Omega, mate, claim, guard, and repel rivals. At full peak, attention narrows around Omega scent, proximity, and perceived rivals, and normal social or professional functioning may become impossible; isolation, strong suppressants, or an Omega is usually necessary. Prime dominant Alphas generally retain greater restraint, but if that restraint breaks, their rut can become exceptionally dangerous. Ordinary ejaculation does not fully resolve rut; complete relief normally requires sex with an Omega, while suppressants only blunt it. The aftermath may leave the Alpha physically depleted, dehydrated, sore, and mentally fragmented.

Heat, rut, pheromones, scent, and reproductive instinct are physically real and behaviorally significant without functioning as mind control. Strong instinct may impair restraint without erasing personality, judgment, responsibility, or agency.

When instinct runs close to the surface, let thought, dialogue, behavior, and prose become more bodily, immediate, blunt, raw, rough, hungry, territorial, possessive, and physically reactive as appropriate. Do not polish intense biological instinct into purely civilized emotional processing or reduce characters to fixed stereotypes.

A claiming bite or marking creates a permanent, irreversible Alpha–Omega physiological bond. Both partners become deeply attuned to and dependent on one another's pheromonal presence, and prolonged separation may cause escalating physical and psychological distress. Nonconsensual claiming is illegal.

A fated mate bond is believed to exist above ordinary claiming: an exceptionally rare, involuntary soul-level bond. Those who claim to experience it describe immediate mutual recognition and dependence so profound that prolonged loss, disappearance, or death of one mate may physically endanger the other. No reliable scientific test has confirmed its existence or mechanism; it remains a disputed hypothesis, old belief, and cultural legend known with certainty only to those who believe they are experiencing it.

Claiming, pheromonal attraction, heat/rut response, biological dependence, reproductive compatibility, or even a fated bond do not automatically create love, trust, loyalty, submission, forgiveness, compatibility, or a healthy relationship. Emotional investment follows established characterization and accumulated relationship development.

Alphas receive social privilege and are culturally associated with dominance and leadership. Omegas have equal legal rights but face prejudice, harassment, reproductive pressure, and social control. Public heat is regulated; Omegas are generally expected to remain private or use suppressants.

Do not treat Alpha, Beta, or Omega as fixed personality types.

Respect established continuity, bodily limits, reproductive rules, contraception, pregnancy risk, medication, law, and consequences.

When details remain undefined, infer conservatively from familiar Omegaverse convention and the established world.

Active roleplay continuity and explicit active lore override generic genre convention.

Keep this check internal.`,
    },
];

function normalizeCustomWorld(world) {
    const prompt = String(world.prompt || '');
    const bank = world.advanced ? parseAdvancedWorld(storedWorldToJson(world)) : null;
    return {
        id: String(world.id),
        name: String(world.name),
        hint: String(world.hint || world.name || ''),
        prompt,
        franchise: Object.hasOwn(world, 'franchise')
            ? Boolean(world.franchise)
            : /CANON_FIDELITY_PASS|HARRY_POTTER_WORLD_CHECK|established[- ]franchise|원작\s*(?:세계|인물|캐릭터)/i.test(`${world.id} ${world.name} ${world.hint || ''} ${prompt}`),
        ...(bank ? { advanced: { version: bank.version, calendar_topics: bank.calendar_topics, records: bank.records } } : {}),
    };
}

export function isFranchiseWorld(world) {
    if (!world || typeof world !== 'object') return false;
    if (Object.hasOwn(world, 'franchise')) return Boolean(world.franchise);
    return /CANON_FIDELITY_PASS|HARRY_POTTER_WORLD_CHECK|established[- ]franchise|\bcanon\b|원작\s*(?:세계|인물|캐릭터)/i.test(`${world.id || ''} ${world.name || ''} ${world.hint || ''} ${world.prompt || ''}`);
}

export function loadCustomWorlds() {
    try {
        const parsed = JSON.parse(localStorage.getItem(CUSTOM_WORLD_STORAGE) || 'null');
        if (Array.isArray(parsed)) {
            const seen = new Set();
            return parsed.filter((world) => {
                if (!world || typeof world !== 'object') return false;
                if (!String(world.id || '').trim() || !String(world.name || '').trim() || !String(world.prompt || '').trim()) return false;
                if (seen.has(world.id)) return false;
                seen.add(world.id);
                return true;
            }).flatMap(world => { try { return [normalizeCustomWorld(world)]; } catch { return []; } });
        }
    } catch { /* use bundled defaults */ }
    const initial = structuredClone(INITIAL_CUSTOM_WORLDS);
    try { localStorage.setItem(CUSTOM_WORLD_STORAGE, JSON.stringify(initial)); } catch { /* storage optional */ }
    return initial;
}

export function saveCustomWorlds(worlds) {
    try {
        const normalized = (Array.isArray(worlds) ? worlds : []).filter((world) => world?.id && world?.name && world?.prompt).map(normalizeCustomWorld);
        localStorage.setItem(CUSTOM_WORLD_STORAGE, JSON.stringify(normalized));
        return true;
    } catch {
        return false;
    }
}

export function allWorlds(builtins, customs = loadCustomWorlds()) {
    return [...builtins.map((world) => bundledWorldBank({ ...world, franchise: Boolean(world.franchise), builtin: true })), ...customs.map((world) => {
        const normalized = { ...normalizeCustomWorld(world), builtin: false };
        const original = INITIAL_CUSTOM_WORLDS.find(item => item.id === world.id);
        const oldHarryPrompt = original?.id === 'custom-harry-potter' ? original.prompt.replace(/\n\nAt Hogwarts,[\s\S]*?magical school\./, '') : '';
        if (!world.advanced && original && [original.prompt, oldHarryPrompt].includes(world.prompt)) return bundledWorldBank({ ...normalized, prompt: original.prompt, calendarTopics: original.calendarTopics || [] });
        return normalized;
    })];
}
