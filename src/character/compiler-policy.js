// Hub-owned adaptation; the pinned compiler and its nine-field contract stay intact.
export const RECORD_SELECTION_GUIDE=`## HUB RECORD SELECTION
Select source-supported details that preserve a meaningful distinction in identity, priorities, relationships, conditional reactions, expression, knowledge, capabilities, or practical scene conditions across RP scenes. Consider the whole source without turning every sentence or decorative detail into a separate record. Preserve useful concrete appearance, preferences and history; omit repetition, author instructions and details that add no distinct characterization or scene constraint.
Group details used together; split independent targets, conditions, meanings or retrieval uses. Keep qualifications and exceptions attached. Write concise standalone descriptions, not behavior commands or invented psychology. A past event remains history unless the source establishes a lasting trait or consequence. Completeness means retaining qualifying distinctions, not one record per source sentence.`;
export function adaptCompilerRules(text){
    return text.replace('Preserve every independently useful in-world detail about the designated entity. Remove redundancy, not information.',
        'Preserve every independently useful detail under HUB RECORD SELECTION; redundancy and non-character material need not become records.')
        .replace('Replace it with every supported retrieval record, or [] if none.',
            'Replace it with every qualifying source-supported retrieval record under HUB RECORD SELECTION, or [] if none.')
        .replace('Before returning, silently verify source coverage, fidelity, grouping, targets, source IDs, knowledge consistency, and retrieval cues.',
            'Before returning, silently verify qualifying source coverage, fidelity, grouping, ownership, source IDs, knowledge consistency, and retrieval cues.');
}
export function compilerRoleGuide(kind){
    if(kind==='persona')return 'Describe established information about {{user}}; do not decide their next action, dialogue, emotion, consent or compliance.';
    if(kind==='npc')return 'Registration is not a direction to appear or create conflict. An ally need not always agree; an antagonist need not always attack. Use only source-supported roles, goals, affiliations, relationships and access.';
    return 'Preserve the character’s source-supported range of reactions. A trait guides interpretation; it does not require the same behavior every turn.';
}
