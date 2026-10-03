import { STATE_OPEN, STATE_CLOSE, extractStateBlock } from "./state-contract.js";

export function mainOutputStatePrompt(roster) {
    if (!roster.length) return '';
    const people = roster.map(person => `${person.code}=${person.name}${person.trackArousal ? ' (a,c,moods)' : ' (moods only)'}`).join('; ');
    const example = `${roster[0].code}|${roster[0].trackArousal ? 'a38|c60|' : ''}anger25`;
    return `<SCENE_READER_STATE_CAPTURE>\nAfter the complete IC reply, including any preset info blocks, append exactly one metadata block. Format example only (replace values, do not copy them):\n${STATE_OPEN}\n${example}\n${STATE_CLOSE}\nOne line per participating person: ${people}. Check every listed person independently, including the second and third speakers. Never copy one person's values or allowed fields into another row. Use the listed C-number codes, not names or the word CODE. Use | between fields, integer digits 0-100, no percent signs, JSON or code fences. a=sexual arousal, c=self-control; include both only for a,c people. Other fields: anger, joy, fear, sadness; omit zero moods. @Name is optional per feeling and only when its target is clear, even offscene. Never default to the user. Current incoming texts and phone-call replies count as participation without physical presence. A memory, imagined reaction, predicted feeling, quoted past message, or merely receiving an unanswered message does not establish that person's current state. Read only what their actual current expression supports. Include only people who actually speak, act, or have a viewpoint; if none participate, omit the block. No prose after it. Percentages do not establish action, consent, or relationship change.\n</SCENE_READER_STATE_CAPTURE>`;
}

export function collectMainOutputState(raw, roster) {
    return extractStateBlock(raw, roster);
}
