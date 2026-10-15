export function activityQuestions(enabled) {
    if (!enabled) return {};
    return {
        world_npc_activity: {
            type:'choice',
            instructions:"Does the place or current activity support surrounding people's own activity or participation? Consider everyday public settings and established people as well as direct interaction. They need not address the main characters. This selects scene guidance, not permission for a new arrival; do not require another question to approve it.",
            criteria:{none:'A private or solitary scene has no relevant surrounding activity.',active:'People in this setting have natural background, practical, or directly involved roles.',unclear:'The setting or activity is not available.'},
        },
        world_physical_opposition: {
            type:'choice',
            instructions:"Does the characterization and current interaction support physical confrontation by a character or NPC? A fight need not have started; concrete anger, rivalry, hostility or escalating conflict can support it. No villain label or negative-bias setting is required. Do not turn ordinary disagreement into a compulsory fight. This is independent of the other selections.",
            criteria:{none:'The interaction does not call for physical confrontation.',active:'Physical confrontation fits the participants and present circumstances.',unclear:'Insufficient context for this direction.'},
        },
    };
}
