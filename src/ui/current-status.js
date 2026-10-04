import {createCurrentStatusModel} from './current-status-model.js';
import {MASCOT_ICON_URL,MASCOT_ERROR_URL} from './mascot.js';

const STATES={idle:'미확인 / 미사용',running:'진행 중',success:'성공',failed:'확인 필요',cancelled:'중단',skipped:'건너뜀'};
const TITLES={error:'확인할 문제가 있습니다',success:'실행·요청 포함 확인 완료',neutral:'대기 / 진행 중 / 확인 전'};

export function createCurrentStatusView({hub,document,getScope=()=>''}) {
    const model=createCurrentStatusModel();
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
        const note=document.createElement('p');note.className='sr-status-note';note.textContent='현재 접속에서 확인한 상태입니다. 새 판독 시 갱신되며, 준비 완료와 실제 요청 포함은 따로 표시합니다.';
        const rows=document.createElement('div');rows.className='sr-status-rows';
        for(const row of state.rows){
            const item=document.createElement('div');item.className='sr-status-row';item.dataset.state=row.state;
            const label=document.createElement('span');label.textContent=row.label;
            const result=document.createElement('b');result.textContent=STATES[row.state];
            const detail=document.createElement('small');detail.textContent=row.message+(row.code?` (${row.code})`:'');
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
