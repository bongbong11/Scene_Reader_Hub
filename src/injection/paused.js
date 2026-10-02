import { META_CLOSE, META_OPEN, activeWorldReference, fixedSceneSettings } from './assemble.js';

export function buildPausedInjection({settings,privatePrompt='',referenceLines=[],activeWorldName=''}={}) {
    const blocks=[activeWorldReference(activeWorldName),fixedSceneSettings(settings,privatePrompt)].filter(Boolean);
    for(const line of referenceLines)if(String(line).trim())blocks.push(String(line).trim());
    return `${META_OPEN}\n\n${blocks.join('\n\n')}\n\n${META_CLOSE}\n)`;
}
