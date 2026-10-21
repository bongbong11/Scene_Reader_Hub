import {SEASONAL_OPTIONS} from '../world/seasonal.js';
import {formatSceneDate} from '../world/scene-date.js';

export function seasonalTemplate() {
    return '<details class="sr-settings-collapsible sr-seasonal-options"><summary>추가 참고 <small class="sr-seasonal-caption">행사·학기·스포츠 시즌</small></summary>'+
        '<p class="sr-help">확인한 장면 날짜에 맞는 재료만 참고합니다. 행사나 참가를 강제하지 않으며, 이야기 속 일정이 우선합니다.</p>'+
        '<div class="sr-chip-grid">'+Object.entries(SEASONAL_OPTIONS).map(([key,label])=>'<label class="checkbox_label"><input id="sr-season-'+key+'" type="checkbox"><span>'+label+'</span></label>').join('')+'</div>'+
        '<div class="sr-season-date-row"><small id="sr-season-date-status">시즌 참고를 선택하면 날짜를 확인합니다.</small><button type="button" id="sr-season-date-check" class="menu_button">날짜 확인</button></div></details>';
}
export function createSeasonalDateUi({document}) {
    let modal=null,shownToken='';
    function close(){modal?.close();modal?.remove();modal=null;shownToken='';}
    function render(value) {
        const node=document.getElementById('sr-season-date-status');
        if(node)node.textContent=value.status==='confirmed'?'시즌 기준: '+formatSceneDate(value.date)+' · 확인한 날짜 항목':
            ({disabled:'시즌 참고를 선택하면 날짜를 확인합니다.',missing:'최신 RP에서 날짜를 찾지 못해 시즌 참고를 쉬고 있어요.',awaiting_output:'프리셋이 바뀌었어요. 새 답변에서 날짜를 확인합니다.',unconfirmed:'날짜 항목 확인이 필요해요. 판독은 계속할 수 있어요.'}[value.status]||'');
        if(modal&&shownToken!==value.token)close();
    }
    function confirm(value,{accept}) {
        if(shownToken===value.token&&modal)return;
        close();shownToken=value.token;
        modal=document.createElement('dialog');modal.className='sr-date-confirm';
        const title=document.createElement('strong');title.textContent='현재 장면 날짜가 맞나요?';
        const help=document.createElement('p');help.className='sr-help';help.textContent='앞으로 이 항목에서 날짜만 읽을게요. 다른 날짜라면 항목을 골라 주세요.';
        const select=document.createElement('select');select.className='text_pole';select.setAttribute('aria-label','현재 날짜 항목');
        value.candidates.forEach((candidate,index)=>{
            const option=document.createElement('option');option.value=String(index);
            option.textContent=formatSceneDate(candidate.date)+' · '+candidate.label+(candidate.profile.order?' · '+(candidate.profile.order==='mdy'?'월/일/연도':'일/월/연도'):'');
            select.append(option);
        });
        const sample=document.createElement('p');sample.className='sr-date-sample';
        const update=()=>{sample.textContent=value.candidates[Number(select.value)]?.preview||'';};
        select.addEventListener('change',update);update();
        const status=document.createElement('p');status.className='sr-help';status.setAttribute('role','status');
        const actions=document.createElement('div');actions.className='sr-date-actions';
        const yes=document.createElement('button'),later=document.createElement('button');
        yes.type=later.type='button';yes.className=later.className='menu_button';yes.textContent='맞아요';later.textContent='나중에';
        const current=modal;
        yes.addEventListener('click',async()=>{
            yes.disabled=true;
            try{await accept(Number(select.value));if(modal===current)close();}
            catch(error){status.textContent=error.message;yes.disabled=false;}
        });
        later.addEventListener('click',close);modal.addEventListener('cancel',event=>{event.preventDefault();close();});
        actions.append(yes,later);modal.append(title,help,select,sample,status,actions);
        document.body.append(modal);modal.showModal();
    }
    return {render,confirm};
}

