import {sourceRp} from './source-refs.js';
export function createContinuityRuntime(deps) {

function sourceUserRpForOutput(outputIndex) {
    const chat = deps.getContext().chat || [];
    for (let index = Number(outputIndex) - 1; index >= 0; index -= 1) {
        if (!chat[index]?.is_user) continue;
        const rp=sourceRp(chat[index]);if(rp)return rp;
    }
    return '';
}

return {sourceUserRpForOutput};
}
