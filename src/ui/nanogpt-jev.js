import {notifySceneReaderToast} from './toasts.js';
export function renderJevConnection(deps) {
    const el=id=>deps.document.getElementById(id), nano=deps.settings.jevConnection==='nanogpt';
    if(el('sr-jev-connection'))el('sr-jev-connection').value=nano?'nanogpt':'typesafe';
    if(el('sr-jev-typesafe'))el('sr-jev-typesafe').hidden=nano;
    if(el('sr-jev-nanogpt'))el('sr-jev-nanogpt').hidden=!nano;
    if(el('sr-nano-jev-model'))el('sr-nano-jev-model').value=deps.settings.jevNanoModel||'typesafe/jev-1.14';
    if(el('sr-official-jev-model'))el('sr-official-jev-model').value=deps.settings.jevOfficialModel||'jev-latest';
}
export function bindNanoJev(deps) {
    const el=id=>deps.document.getElementById(id);
    let busy=false;
    const status=text=>{if(el('sr-nano-jev-status'))el('sr-nano-jev-status').textContent=text;};
    const controls=['sr-jev-connection','sr-nano-jev-model','sr-official-jev-model','sr-nano-jev-save','sr-nano-jev-test','sr-jev-save','sr-jev-test'];
    const run=async task=>{
        if(busy)return;busy=true;for(const id of controls)if(el(id))el(id).disabled=true;
        try{await task();}catch(error){status(error.message);notifySceneReaderToast(deps.window,'error',error.message,'씬판독기');}
        finally{busy=false;for(const id of controls)if(el(id))el(id).disabled=false;renderJevConnection(deps);}
    };
    const invalidate=()=>{deps.invalidateReasonerJobs();deps.invalidatePreparedJudgment();};
    el('sr-jev-connection')?.addEventListener('change',event=>void run(async()=>{
        const value=event.target.value;invalidate();await deps.clearInjection();await deps.saveGlobal('jevConnection',value);renderJevConnection(deps);
        status('구독 전용 키를 저장하거나 저장된 키 연결 확인을 누르세요.');
    }));
    el('sr-nano-jev-model')?.addEventListener('change',event=>void run(async()=>{
        const value=event.target.value;invalidate();await deps.clearInjection();await deps.saveGlobal('jevNanoModel',value);status('모델을 바꿨습니다. 연결 확인을 눌러 주세요.');
    }));
    el('sr-official-jev-model')?.addEventListener('change',event=>void run(async()=>{
        const value=event.target.value;invalidate();await deps.clearInjection();await deps.saveGlobal('jevOfficialModel',value);deps.updateKeyStatus('모델을 바꿨습니다. 연결 확인을 눌러 주세요.');
    }));
    const probe=async key=>{
        status('구독 전용 키와 Jev 판독 응답 확인 중…');
        const data=await deps.callJev({state:{text:'Scene Reader connection test.'},questions:{connection:{type:'choice',instructions:'Is this explicitly a connection test?',criteria:{yes:'Explicit connection test.',no:'Not a connection test.'}}}},30000,null,{provider:'nanogpt',model:deps.settings.jevNanoModel||'typesafe/jev-1.14',key});
        if(data.answers.connection?.choice!=='yes')throw new Error('나노GPT Jev 연결 확인 판독값이 올바르지 않습니다.');
    };
    el('sr-nano-jev-save')?.addEventListener('click',()=>void run(async()=>{
        const input=el('sr-nano-jev-key'),key=input.value.trim(),settings=deps.settings;
        if(key)await probe(key);
        if(settings!==deps.settings)throw new Error('설정을 다시 불러왔습니다. 현재 계정에서 키 저장을 다시 눌러 주세요.');
        await deps.storagePost('nanogpt/key',{key});
        if(input.value.trim()===key)input.value='';invalidate();
        status(key?'구독 전용 확인 · 나노GPT 키 저장 완료':'저장된 나노GPT 키를 삭제했습니다.');
        notifySceneReaderToast(deps.window,'success',key?'나노GPT 키를 서버에 저장했습니다.':'나노GPT 키를 삭제했습니다.','씬판독기');
    }));
    el('sr-nano-jev-test')?.addEventListener('click',()=>void run(async()=>{
        if(el('sr-nano-jev-key').value.trim())throw new Error('새 키는 키 저장을 먼저 누르세요.');
        await probe('');status('구독 전용 확인 · Jev 판독 응답 확인');
        notifySceneReaderToast(deps.window,'success','나노GPT Jev 연결에 성공했습니다.','씬판독기');
    }));
    renderJevConnection(deps);
}
