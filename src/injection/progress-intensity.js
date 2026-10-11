import {normalizeDevelopmentPreferences} from '../decision/settings.js';

export function progressIntensityInstruction(value) {
    const intensity=normalizeDevelopmentPreferences({progressIntensity:value}).progressIntensity;
    if(intensity===1)return '';
    const expression=intensity<1
        ? 'Use a restrained but concrete reaction or attempt within the selected beat. Do not omit selected conduct, stall, or soften required conflict instructions.'
        : 'Make available non-user reactions, choices and attempts more direct and decisive within the selected beat instead of repeatedly delaying them.';
    return `<PROGRESS_EXPRESSION intensity="${intensity.toFixed(1)}">${expression} This changes expression only: preserve characterization, knowledge, access, user choices, relationship and resolution pace, drawn arrivals, and the existing plot-beat limit. Do not invent success, increase harm, or add another event.</PROGRESS_EXPRESSION>`;
}
