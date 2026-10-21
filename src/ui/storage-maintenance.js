const reasons={pending_upload:'아직 이어서 저장할 수 있는 업로드가 있어 파일 삭제를 기다리고 있어요.',unresolved_commit:'저장 완료 여부를 확인하지 못한 작업이 있어요.',unknown_operation:'형식을 확인할 수 없는 작업이 있어요. 오류 코드를 확인해 주세요.',migration:'자료 이사를 먼저 마쳐 주세요.'};
export function maintenanceText(state={}){
    const count=(state.deleted||0)+(state.operationFiles||0)+(state.temporaryFiles||0);
    const summary=`삭제 ${count}개 · 확보 ${((state.bytes||0)/1048576).toFixed(2)} MB`;
    if(state.status==='running')return '사용처를 확인하며 정리 중이에요. '+summary;
    if(state.status==='waiting')return state.requested?'저장 작업이 끝나면 정리를 이어가요. '+summary:'아직 정리 결과가 없어요.';
    if(state.status==='failed')return `정리를 마치지 못했어요. ${summary} · ${state.code||'STORAGE_MAINTENANCE_FAILED'} — 필요한 저장 자료의 손상 여부를 확인해 주세요.`;
    if(state.status==='deferred')return `${summary} · ${reasons[state.reason]||'확인할 자료가 있어 일부 정리를 보류했어요.'}`;
    return `${summary} · 정리 완료${state.recentChunks||state.recentOperations?' (최근 저장·재시도 자료는 잠시 보관해요)':''}`;
}
export function attachStorageMaintenance({document,host,service,chatKey,notify}){
    const startKey=chatKey();let timer,disposed=false,lastStatus='',busy=false;
    const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
    const label=node('label','정리 방식 '),select=node('select');select.id='sr-storage-cleanup-mode';select.className='text_pole';
    for(const [value,title]of [['automatic','자동 정리'],['manual','수동 정리']]){const option=node('option',title);option.value=value;select.append(option);}label.append(select);
    const help=node('p','현재 캐릭터의 불필요한 이전 자료와, 어느 방에서도 쓰지 않는 저장 조각을 정리해요. 다른 방의 자료·백업·이어갈 이야기는 유지해요. 수동을 선택하면 ‘지금 정리’를 누를 때만 정리합니다.');help.className='sr-help sr-explanation';
    const status=node('p','정리 설정을 확인하고 있어요.');status.id='sr-storage-cleanup-status';status.setAttribute('role','status');
    const start=node('button','지금 정리');start.type='button';start.className='menu_button';start.id='sr-storage-cleanup-start';
    host.append(help,label,status,start);
    const live=()=>!disposed&&chatKey()===startKey&&host.open;
    function render(state){
        if(!live())return;select.value=state.mode;status.textContent=maintenanceText(state);start.disabled=state.status==='running'||state.requested||busy;
        if(['running','waiting'].includes(lastStatus)&&state.status==='completed')notify(maintenanceText(state));lastStatus=state.status;
        clearTimeout(timer);if(state.status==='running'||state.requested)timer=setTimeout(()=>void load(),1500);
    }
    async function load(){try{render(await service.status());}catch(error){if(live()){status.textContent=error.message;start.disabled=true;select.disabled=true;}}}
    async function act(task){if(busy)return;busy=true;start.disabled=true;select.disabled=true;try{render(await task());}catch(error){if(live())status.textContent=error.message;}finally{busy=false;if(live()){select.disabled=false;void load();}}}
    select.addEventListener('change',()=>void act(()=>service.configure(select.value)));
    start.addEventListener('click',()=>void act(()=>service.start()));
    const stop=()=>{disposed=true;clearTimeout(timer);};host.addEventListener('close',stop,{once:true});
    void load();return stop;
}
