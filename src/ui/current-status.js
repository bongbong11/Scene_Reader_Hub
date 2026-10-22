import {createCurrentStatusModel} from './current-status-model.js';
import {MASCOT_ICON_URL,MASCOT_ERROR_URL} from './mascot.js';

const STATES={idle:'확인 전',unused:'사용 안 함',not_run:'실행 전',needs_setup:'설정 필요',running:'진행 중',success:'완료',failed:'오류',cancelled:'중단',skipped:'주입할 내용 없음'};
const TITLES={error:'확인할 문제가 있습니다',success:'주입·연속성 상태',neutral:'주입·연속성 상태'};
function resultLabel(row) {
    if(row.id==='delivery')return ({success:'확인됨',idle:'확인 전',failed:'오류',skipped:'주입할 내용 없음'})[row.state] || STATES[row.state];
    if(row.id==='continuity')return ({running:'실행 중',success:'실행 완료'})[row.state] || STATES[row.state];
    return STATES[row.state];
}

export function createCurrentStatusView({hub,document,getScope=()=>'',getContinuityEnabled=()=>true}) {
    const model=createCurrentStatusModel({getContinuityEnabled});
    let sequence=0,scope=getScope(),open=false,bound=null,boundDialog=null;
    function sync() {
        const snapshot=hub.snapshot(),nextScope=getScope();
        if(scope!==nextScope){scope=nextScope;model.reset();sequence=snapshot.events.at(-1)?.sequence || sequence;}
        for(const event of snapshot.events)if(event.sequence>sequence){model.accept(event);sequence=event.sequence;}
        return model.snapshot();
    }
    function render() {
        const state=sync(),button=document.getElementById('sr-current-status');
        if(button){button.dataset.tone=state.tone;button.title=`현재 상태 · ${TITLES[state.tone]}`;button.setAttribute('aria-label',button.title);button.setAttribute('aria-expanded',String(open));}
        const quick=document.getElementById('scene-reader-quick-button');
        if(quick){
            quick.dataset.srHealth=state.tone;quick.title=state.tone==='error'?'씬판독기 열기 · 확인할 문제가 있습니다':'씬판독기';quick.setAttribute('aria-label',quick.title);
            const icon=quick.querySelector('img'),url=state.tone==='error'?MASCOT_ERROR_URL:MASCOT_ICON_URL;
            if(icon && icon.src!==url)icon.src=url;
        }
        const panel=document.getElementById('sr-current-status-panel');
        if(!panel)return;
        panel.hidden=!open;
        if(!open)return;
        const title=document.createElement('strong');title.textContent=TITLES[state.tone];
        const note=document.createElement('p');note.className='sr-status-note';note.textContent='실제 주입은 전송 요청에서, 연속성 추론은 분석 실행 결과로 확인합니다. 자세한 분석 내용은 아래 연속성 추론에서 확인하세요.';
        const rows=document.createElement('div');rows.className='sr-status-rows';
        const order={delivery:0,continuity:1};
        for(const row of state.rows.filter(row=>row.id in order||row.state==='failed').sort((a,b)=>(order[a.id]??2)-(order[b.id]??2))){
            const item=document.createElement('div');item.className='sr-status-row';item.dataset.state=row.state;item.dataset.statusId=row.id;
            const label=document.createElement('span');label.textContent=row.label;
            const result=document.createElement('b');result.textContent=resultLabel(row);
            const detail=document.createElement('small');detail.textContent=row.message;
            item.append(label,result,detail);rows.append(item);
        }
        panel.replaceChildren(title,note,rows);
    }
    function togglePanel() {
        open=!open;render();
        if(open)document.getElementById('sr-current-status-panel')?.scrollIntoView({block:'nearest'});
    }
    function closePanel() {open=false;render();}
    function unbind() {
        bound?.removeEventListener('click',togglePanel);
        boundDialog?.removeEventListener('toggle',render);
        boundDialog?.removeEventListener('close',closePanel);
        bound=null;boundDialog=null;
    }
    function bind() {
        const button=document.getElementById('sr-current-status');
        if(button && bound!==button){
            unbind();
            bound=button;
            button.addEventListener('click',togglePanel);
            boundDialog=document.getElementById('scene-reader-dialog');
            boundDialog?.addEventListener('toggle',render);
            boundDialog?.addEventListener('close',closePanel);
        }
        render();
    }
    const unsubscribe=hub.subscribe(render);
    return {bind,render,dispose:()=>{unsubscribe();unbind();}};
}
