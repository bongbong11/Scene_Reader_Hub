export const CHARACTER_LIVE_SYSTEM = `Select stored rules for this registered person when they would help the NEXT RP response stay true to that person.

Judge necessity from the current RP, this person's actual participation, established relationships and continuity, and the specific issue being handled. A rule is not needed merely because its topic or a similar word appears in the chat.

Current dialogue, conduct, or thoughts can warrant a stored relationship, expression, knowledge, or boundary record without a new event. Choose zero when no stored record is relevant. Choose distinct applicable IDs up to the number of available slots. Prefer target-specific and conditional records over repeated generic traits. Do not select a rule to fill a quota or repeat an existing scene instruction.

A stored rule is a durable character boundary, not proof of this person's current emotion, current knowledge, or next action. Later established RP continuity may change how the rule applies.

Use only supplied IDs. Do not rewrite a rule or create a new one. Keep observation of what has happened separate from a proposal for what this person should do next.`;

export const PROFILE_SELECT = CHARACTER_LIVE_SYSTEM;
export const CONTEXT_SELECT = 'Choose one current or continuity item only if it materially affects this person in the next response. A world fact is not automatically this person\'s knowledge. Choose none when nothing needs emphasis.';
export const DIRECTION_SELECT = 'Choose one character-consistent response direction from the actual scene and legitimate information. This is a proposal, not an established action. Choose none when no extra direction is needed.';
export const ACCESS_INSTRUCTION = `For this person and this specific information, identify the narrowest acquisition route established by a supplied stored record, verified continuity, or RP evidence.

Model-visible material, another person's knowledge, intimacy, intelligence, profession, status, intuition, or a convenient deduction cannot by itself provide access. Preserve the difference between a world fact, a report, a belief, a suspicion, and a past state whose present validity is unknown.`;
export const ACCESS_CHOICES = {
    none: 'No legitimate acquisition route is established. This does not prove permanent ignorance.',
    observed: 'This person directly perceived or experienced it, within actual sensory and attention limits.',
    reported: 'This person was told or received a report. Preserve who reported it, when, and the report\'s uncertainty; hearing a claim does not prove its truth.',
    inferred: 'This person can form a bounded suspicion from accessible clues. Do not turn suspicion into exact hidden knowledge or a confirmed fact.',
    public: 'The information was publicly or ordinarily available to this person at the relevant time.',
    stored_knowledge: 'This exact information was previously established as acquired by this person.',
    profile_supported: 'This person\'s lived experience or role supports general subject knowledge, but not a hidden case-specific fact.',
    private_access: 'Established authority or access supports this exact private information.',
};
export const PRESENCE_CHOICES = {
    absent: 'No meaningful role in the next response.',
    background: 'Present or continuity-relevant, but not taking part in the current interaction.',
    active: 'Taking part in the current interaction through speech, their own viewpoint thought, choice, action, refusal, or response. Current incoming texts, chat messages and phone-call replies count as direct participation even from another location; being remembered or imagined by someone else does not. A separate new plot beat is unnecessary.',
};
