// Blank only the target's standard sheet slots in this request's prepared copies.
// Never toggle, save or rewrite the user's preset or character/persona data.
export function installReviewSheetFilter(manager,kind,report=()=>{}) {
    if(!['character','persona'].includes(kind)||typeof manager?.preparePrompt!=='function')throw Object.assign(new Error('현재 인물 설명을 제외할 요청 연결을 준비하지 못했습니다.'),{code:'REVIEW_SHEET_UNSUPPORTED'});
    const identifiers=new Set(kind==='persona'?['personaDescription']:['charDescription','charPersonality']);
    const previous=manager.preparePrompt, excluded=new Set();
    function prepare(...args){
        const prepared=previous.apply(this,args);
        if(disposed||!prepared||!identifiers.has(prepared.identifier))return prepared;
        if(prepared.content)excluded.add(prepared.identifier);
        return Object.assign(Object.create(Object.getPrototypeOf(prepared)),prepared,{content:''});
    }
    manager.preparePrompt=prepare;
    let disposed=false;
    return ()=>{
        if(disposed)return;disposed=true;
        if(manager.preparePrompt===prepare)manager.preparePrompt=previous;
        report({code:'REVIEW_SHEET_FILTERED',status:'info',phase:'assembly',subjectKind:kind,excludedSlots:[...excluded]});
    };
}
