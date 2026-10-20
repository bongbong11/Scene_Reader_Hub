import {continuityLines} from '../continuity/engine.js';

const key = value => String(value || '').trim().toLocaleLowerCase();
const text = value => String(value || '').trim();

// Route already-selected context. This never selects actors or adds a verdict.
export function splitCharacterContext(selected, people = [], deliveredKnowledge = []) {
    const scene = {...selected, items:[], knowledge:[], dependencies:[]};
    const moved = {items:[], knowledge:[], dependencies:[]};
    const lines = [];
    const byId = new Map(people.filter(person=>person.id).map(person=>[person.id, person]));
    const actors = [...byId.values()];
    const find = value => {
        const matches = actors.filter(person=>[person.id, person.name, ...(person.aliases || []), ...(person.core?.aliases || [])].some(name=>key(name) && key(name)===key(value)));
        return matches.length===1 ? matches[0] : null;
    };
    const owners = item => {
        if (!item.owners?.length) return null;
        const found = item.owners.map(find);
        // Preserve the supplied owners even when they have no registered sheet.
        // Routing existing context is not another actor eligibility decision.
        const names = [...new Set(found.map((person,index)=>person?.name || text(item.owners[index])))].filter(Boolean);
        return names.length ? names : null;
    };
    let duplicateKnowledge = 0;
    for (const item of selected?.knowledge || []) {
        const person = item.characterId ? byId.get(item.characterId) : find(item.character);
        const rendered = continuityLines({knowledge:[item]});
        if (!rendered.length) { scene.knowledge.push(item); continue; }
        const duplicate = person && deliveredKnowledge.some(other=>other.characterId===person.id &&
            text(other.subject)===text(item.factId) && text(other.text)===text(item.summary) &&
            other.source===(item.source || 'verified_continuity') &&
            text(other.sourceType)===text(item.source_type || item.sourceType) &&
            text(other.occurredAt)===text(item.occurredAt || item.time));
        moved.knowledge.push(item);
        if (duplicate) duplicateKnowledge++;
        else lines.push(...rendered);
    }
    for (const item of selected?.items || []) {
        const names = owners(item), rendered = continuityLines({items:[item]});
        if (!names || !rendered.length) { scene.items.push(item); continue; }
        moved.items.push(item);
        lines.push(`${names.join(', ')} — ${rendered[0]}`);
    }
    for (const item of selected?.dependencies || []) {
        const related = moved.items.find(other=>other.id===item.stateId);
        const names = owners(item) || (related ? owners(related) : null);
        if (!names && item.stateId!=='relationship:current') { scene.dependencies.push(item); continue; }
        moved.dependencies.push(item);
        lines.push(`${names ? names.join(', ')+' — ' : ''}${continuityLines({dependencies:[item]})[0]}`);
    }
    return {scene, moved, duplicateKnowledge,
        text:lines.length ? `<CHARACTER_CONTINUITY>\n${lines.join('\n')}\nThese are scoped prior states, not proof of present participation or completed off-screen actions.\n</CHARACTER_CONTINUITY>` : ''};
}
