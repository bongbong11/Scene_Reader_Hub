const LABELS = {retrieval:'인물 검색', decision:'Jev 판독', scene:'장면 확인', 'storage.inject':'저장 확인'};
export function createFailureStop({ onChange = () => {} } = {}) {
    let failure = null;
    return {
        snapshot: () => failure ? {...failure} : null,
        pause(error, stage) {
            failure = { stage, code:error.code || 'STAGE_FAILED', at:new Date().toISOString(),
                message:`${LABELS[stage] || '판독'} 오류로 이번 판독·주입을 중단했습니다. 연결을 확인한 뒤 ‘지금 판독’으로 재시도할 수 있습니다. 다음 자동 판독도 계속 사용할 수 있습니다.` };
            onChange();
        },
        recovered() { if (failure) { failure = null; onChange(); } },
    };
}
