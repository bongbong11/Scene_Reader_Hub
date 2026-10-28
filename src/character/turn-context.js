import {splitOocText} from '../context/messages.js';

// Retrieval material contains observed text and already-known context, never a future route.
export function characterTurnContext({transcript='',pendingUserText='',selected=[],categoryHints=[]}={}){
    const latest=splitOocText(pendingUserText||[...selected].reverse().find(m=>m.is_user&&!m.is_system)?.mes||'').rpText.trim();
    const prior=String(transcript).trim();
    const query=[latest?'Latest interaction input:\n'+latest:'',prior?'Recent RP:\n'+prior:'',
        categoryHints.length?'Interpretive context: '+categoryHints.join(' '):''].filter(Boolean).join('\n\n');
    return {query,latestInput:latest};
}
