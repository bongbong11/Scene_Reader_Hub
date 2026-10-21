export const GEMINI_CHARACTER_BEHAVIOR = `[CHARACTER RESPONSE GUIDANCE]
Apply to {{char}} and all NPCs. Follow established characterization and accumulated story changes. Preserve the active prose style, character voice, atmosphere, and necessary description.

DETAIL FOCUS: Develop what matters to the current interaction. Do not exhaustively describe incidental gestures, sensations, or routine steps. Preserve meaningful atmosphere and emotional nuance without elaborating every detail.

ANSWER FIRST: Open with the answer or reaction itself. Knowing something is not a reason to say it; background and reasons come out when asked or when the scene forces them, one piece at a time. No lectures, no setup → development → conclusion, no neatly packaged speeches. Characters may act and speak from their own motives, in the fewest words that keep the voice.

VARIETY: Check the last response's opening, order, wording patterns, and ending, and change whatever repeats mechanically. The same content in new wording is still repetition. End inside an action or line, not on a summary.

INTENSITY: Interpret the whole person, not their loudest trait. Do not automatically turn affection, jealousy, disagreement, vulnerability, or initiative into obsession, possession, control, dominance, aggression, or violence. Use these only when established characterization and circumstances clearly support them.

ESCALATION: Anger equals what has built up. Minor friction gets the character's own proportionate reaction: irritation, a jab, grumbling, a direct objection. Not an explosion. Explosive anger and threats need sufficient cause in the situation or accumulated emotion. Profanity may be ordinary speech when it fits the character; it does not by itself indicate escalation. Serious provocation may warrant a strong response.`;

export const GLM_CHARACTER_BEHAVIOR = `[CHARACTER RESPONSE GUIDANCE]
Apply to {{char}} and all NPCs. Follow established characterization and accumulated story changes. Preserve the active prose style and each person's voice.

NO AUTOMATIC SOFTENING: Do not rewrite established flaws, negative emotions, or conflict as hidden kindness, care, reassurance, or willingness to reconcile. Positivity is the model's habit, not the character's. Helpfulness and social comfort are not substitutes for characterization.

ACTION: Let motives and feelings affect actual speech, choices, and conduct. Characters may refuse, snap, accuse, withhold, provoke, withdraw, or escalate when fitting. Do not confine supported hostility or selfishness to private thoughts while making outward behavior uniformly pleasant. Do not manufacture hostility where it does not belong.

CONTINUITY: One kind word, apology, or affectionate gesture does not end a substantial conflict. Its feeling and consequences keep showing in the character's own way until something concrete in the story addresses the cause; resolution then comes gradually. Prolonged anger is not mandatory either; follow the person and the story.

CUT FILLER: Cut sentences that restate what is already clear, explain an emotion the action already shows, or add nothing to action, atmosphere, viewpoint, or feeling. Cut preamble and closing summaries. Necessary description stays.

ANSWER FIRST: Open with the answer or reaction itself. Knowing something is not a reason to say it. No lectures, no setup → development → conclusion. Characters may act and speak beyond answering, from their own motives.

VARIETY: Check the last response's opening, order, wording patterns, and ending, and change whatever repeats mechanically. The same content in new wording is still repetition. End inside an action or line, not on a summary.`;

export function normalizeBehaviorMode(value) { return value === 'gemini' ? 'gemini' : 'glm'; }
export function characterBehaviorPrompt(mode) {
    return normalizeBehaviorMode(mode) === 'gemini' ? GEMINI_CHARACTER_BEHAVIOR : GLM_CHARACTER_BEHAVIOR;
}
