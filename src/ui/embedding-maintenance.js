import { notifySceneReaderToast } from './toasts.js';

export function renderEmbeddingProgress(document,{kind,phase,totalCount,reusedCount,generatedCount}) {
    if(phase!=='syncing')return;
    const node=document.getElementById('sr-embedding-progress');
    if(node)node.textContent=`${kind==='world'?'세계관':'인물'} · 전체 ${totalCount}개 · 기존 ${reusedCount}개 재사용 · 생성 ${generatedCount}개`;
}
export function renderRetrievalProgress({document,updateActivity},progress) {
    renderEmbeddingProgress(document,progress);
    const {kind,phase,count,error}=progress,label=kind==='world'?'세계관':'인물';
    const message=phase==='checking'?`${label} 검색 데이터 확인 중…`
        :phase==='indexing'?`${label} 누락·갱신 기록 ${count}개 벡터화 중…`
        :phase==='querying'?`${label} 관련 기록 검색 중…`
        :phase==='fallback'?`${label} 임베딩 검색 실패 · 글자 검색으로 진행 (${error})`:'';
    if(message)updateActivity(message);
}

export function bindEmbeddingMaintenance(deps) {
    const el=id=>deps.document.getElementById(id);
    const button=el('sr-embedding-rebuild'),full=el('sr-embedding-full-rebuild'),cancel=el('sr-embedding-cancel');
    const run=async forceRebuild=>{
        if(button?.disabled || full?.disabled)return;
        if(forceRebuild && !deps.window.confirm('현재 채팅의 인물·선택 세계관 임베딩을 전부 다시 계산합니다. 정상 기록도 처리하며 시간과 API 사용량이 늘어납니다. 진행할까요?'))return;
        for(const target of [button,full])if(target){target.disabled=true;target.setAttribute('aria-busy','true');}
        if(cancel)cancel.hidden=false;
        const label=button?.querySelector('span');
        if(label)label.textContent='임베딩 확인 중…';
        try {
            const result=await deps.embeddingMaintenance.rebuild({forceRebuild});
            const message=`임베딩 확인 완료 · 기존 ${result.reusedCount}개 재사용 · 생성 ${result.generatedCount}개`;
            if(el('sr-embedding-progress'))el('sr-embedding-progress').textContent=message;
            if(deps.updateActivity)deps.updateActivity(message+' · 판독을 실행해 주세요.',{done:true});
            else notifySceneReaderToast(deps.window,'success',message+' · 판독을 실행해 주세요.','씬판독기');
        } catch(error) {
            if(!['AbortError','StaleRunError'].includes(error?.name)){
                deps.updateActivity?.('임베딩 작업 실패 · 저장된 원본은 유지했습니다. 전체 진단 로그를 확인해 주세요.',{error:true});
                throw error;
            }
            if(el('sr-embedding-progress'))el('sr-embedding-progress').textContent='임베딩 작업 중단 · 재시도하면 완료된 기록을 재사용합니다.';
            if(deps.updateActivity)deps.updateActivity('임베딩 작업을 중단했습니다.',{done:true});
            else notifySceneReaderToast(deps.window,'info','임베딩 작업을 중단했습니다.','씬판독기');
        } finally {
            for(const target of [button,full])if(target){target.disabled=false;target.removeAttribute('aria-busy');}
            if(cancel)cancel.hidden=true;
            if(label)label.textContent='임베딩 재시도';
        }
    };
    button?.addEventListener('click',()=>deps.runUiTask(run(false),'임베딩 재시도를 완료하지 못했습니다.'));
    full?.addEventListener('click',()=>deps.runUiTask(run(true),'전체 임베딩을 완료하지 못했습니다.'));
    cancel?.addEventListener('click',()=>deps.embeddingMaintenance.cancel());
}
