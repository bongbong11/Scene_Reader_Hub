import {attachStorageMaintenance} from './storage-maintenance.js';
import {createRoomCleanupUi} from './room-cleanup.js';
import {persistCleanChatMetadata} from '../storage/chat-cleanup.js';
// User choices never hold a generation hook open. No model calls belong here.
export function createSharedStorageUi(deps) {
    let dialog,seen='',scope='',accountScope,busy=false;const inspected=new Map();
    const doc=deps.document;
    const roomCleanup=createRoomCleanupUi({document:doc,service:deps.service,notify:deps.notify,onChanged:reload});
    const node=(tag,text,className)=>{const element=doc.createElement(tag);if(text)element.textContent=text;if(className)element.className=className;return element;};
    function close(){if(dialog?.open)dialog.close();}
    async function reload(){await deps.hydrate();deps.refresh();inspected.delete(deps.chatKey());await refresh();}
    async function action(button,task) {
        if(busy)return;busy=true;button.disabled=true;
        const current=deps.chatKey();
        try{const result=await task();if(current===deps.chatKey()){close();await reload();deps.notify(result?.migrationComplete?'자료 이사 완료! 이제 최신 버전에서 사용할 수 있어요.':result?.deleted?'이야기 자료를 삭제했어요. 삭제 전 백업은 백업 목록에서 관리할 수 있어요.':result?.cleaned?'이전 파일을 정리했어요. 새 자료와 백업은 그대로 있어요.':'자료 연결과 저장을 확인했습니다.');if(result?.migrationComplete)await showCleanup();}}
        catch(error){if(current===deps.chatKey()){
            // A server may have committed before the response failed. Read the
            // actual pointer before allowing another generation or save.
            try{await deps.hydrate();deps.refresh();inspected.delete(current);}catch{}
            const message=dialog?.querySelector('[role=alert]');if(message)message.textContent=error.message;else deps.notify(error.message);
        }}
        finally{busy=false;button.disabled=false;}
    }
    function button(text,task,navigation=false){const button=node('button',text,'menu_button');button.type='button';button.addEventListener('click',()=>{if(busy)return;void (navigation?Promise.resolve().then(task).catch(error=>deps.notify(error.message)):action(button,task));});return button;}
    function create(title,description) {
        if(!dialog){dialog=node('dialog','','sr-story-dialog');doc.body.append(dialog);dialog.addEventListener('cancel',()=>deps.service.cancel());}
        dialog.replaceChildren(node('h3',title),node('p',description,'sr-help sr-explanation'));
        const alert=node('p','','sr-story-alert');alert.setAttribute('role','alert');dialog.append(alert);
        return dialog;
    }
    const show=()=>{if(!dialog.open)dialog.showModal();};
    async function showCleanup() {
        const panel=create('이전 파일 정리','옛 버전 자료를 가져오거나, 이사가 끝난 이전 파일을 정리해요.');
        panel.append(node('p','이 브라우저에 남아 있는 옛 추가 세계관을 서버로 가져와요. 채팅 기록은 가져오지 않아요.','sr-help sr-explanation'),
            button('옛 세계관 가져오기',()=>deps.service.importBrowserWorlds()),
            node('p','자료 이사를 마친 이전 파일만 삭제해요. 새 자료와 복구용 백업은 그대로 남아요.','sr-help sr-explanation'),
            button('이관 전 파일 삭제',async()=>{await deps.service.account.cleanup();return {cleaned:true};}),
            button('닫기',async()=>close(),true));show();
    }
    async function showMigration() {
        const panel=create('자료도 새 버전으로 이사해요 📦','저장해 둔 인물·세계관·이야기 자료를 최신 버전에서 쓸 수 있게 옮겨요. 먼저 백업하고, 빠진 자료가 없는지도 확인해요. 이전 자료는 끝난 뒤 정리할지 선택할 수 있어요.');
        const progress=node('p','','sr-help');progress.id='sr-migration-progress';progress.setAttribute('role','status');panel.append(progress);
        panel.append(button('나중에',async()=>close(),true),button('옮기기 시작',async()=>{await deps.service.migrateAll();return {migrationComplete:true};}));show();
    }
    async function showStoryDeletion(storylineId){
        const current=deps.chatKey(),info=await deps.service.inspectDeletion(storylineId);if(current!==deps.chatKey())return;
        const panel=create('이야기 자료 삭제',`‘${info.title}’의 씬판독기 자료를 삭제해요. 실리태번의 대화는 지우지 않아요. 삭제 전 복구용 백업을 한 번 남깁니다.`);
        panel.append(node('p',info.rooms.length?'함께 삭제할 방 자료: '+info.rooms.map(room=>room.title).join(' · '):'현재 연결된 방은 없어요. 보관된 이야기 자료만 삭제합니다.','sr-help sr-explanation'));
        const label=node('label','','checkbox_label'),confirm=node('input');confirm.type='checkbox';label.append(confirm,node('span','위 이야기와 연결된 방 자료 삭제를 확인했어요.'));panel.append(label);
        panel.append(button('이야기 삭제',()=>{if(!confirm.checked)throw new Error('삭제할 자료를 확인하고 체크해 주세요.');return deps.service.deleteStory(storylineId,info.token);}),button('취소',async()=>close(),true));show();
    }
    async function open(mode) {
        if(mode==='migrate'){await showMigration();return;}
        if(mode==='cleanup'){await showCleanup();return;}
        if(mode==='rooms'){await roomCleanup.open();return;}
        if(mode==='maintenance'){
            const panel=create('저장 파일 정리','사용하지 않는 저장 조각과 끝난 작업을 정리해요. 방 자료나 백업 자체를 삭제하는 기능은 아니에요.');
            attachStorageMaintenance({document:doc,host:panel,service:deps.service.maintenance,chatKey:deps.chatKey,notify:deps.notify});
            panel.append(button('닫기',async()=>close(),true));show();return;
        }
        const current=deps.chatKey();let state;
        try{state=await deps.service.inspect();if(current!==deps.chatKey())return;}
        catch(error){deps.notify(error.message);return;}
        if(state.status==='active'||state.status==='archived') {
            const panel=create('이야기 연결',state.status==='archived'?'이야기는 다른 방에서 이어지고 있어요. 이 방에는 당시 기록이 남아 있어요.':'이 방은 이미 이전 이야기를 이어가고 있어요. 그대로 대화하면 됩니다.');
            panel.append(node('p','이 방의 현재 진행을 유지하면서 별개의 이야기로 나눠요. 다른 방의 진행은 바뀌지 않아요.','sr-help sr-explanation'),
                button('현재 진행에서 분기',()=>deps.service.connect({storylineId:state.source.storylineId,mode:'branch'})));
            if(state.status==='active') {
                const management=node('details','','sr-settings-collapsible');
                management.append(node('summary','인물 자료 관리'),
                    node('p','같은 캐릭터로 이야기를 시작할 때 쓸 인물 자료와 기본 전개 설정을 관리해요.','sr-help sr-explanation'),
                    button('현재 자료를 기본으로 저장',()=>deps.service.updateBaseline()));
                if(state.source.latestBaselineRevision>state.source.baselineRevision)management.append(button('최신 인물 자료 적용',()=>deps.service.updateBaseline({restoreRevision:state.source.latestBaselineRevision})));
                const available=(state.source.baselineRevisions||Array.from({length:state.source.baselineRevision},(_,i)=>i+1)).filter(revision=>revision!==state.source.baselineRevision).sort((a,b)=>b-a);
                if(available.length){
                    const revisions=node('select','','text_pole');
                    for(const revision of available){const option=node('option','인물 자료 · 버전 '+revision);option.value=String(revision);revisions.append(option);}
                    const label=node('label','저장된 버전 선택');label.append(revisions);management.append(label,button('선택한 자료 적용',()=>deps.service.updateBaseline({restoreRevision:Number(revisions.value)})));
                }
                panel.append(management);
            }
            const remove=node('details');remove.append(node('summary','이야기 정리'),button('이 이야기 삭제…',()=>showStoryDeletion(state.source.storylineId),true));panel.append(remove,button('닫기',async()=>close(),true));show();return;
        }
        if(state.status==='legacy' && mode!=='connect') {
            const panel=create('기존 자료 이관','현재 인물·세계관·설정과 진행을 공통 자료와 이야기로 옮깁니다. 먼저 백업하고, 저장 확인 뒤 전환합니다.');
            const reference=node('textarea');reference.rows=3;reference.maxLength=1800;reference.className='text_pole';reference.placeholder='이어하기 참고 (선택): 현재 장소와 미해결 상황을 짧게 적어 주세요.';
            const label=node('label','이어하기 참고 (선택)');label.append(reference);panel.append(label);
            if(deps.record()?.pendingPlan?.outputText)panel.append(node('p','최근 응답 일부가 아직 미검증 상태입니다. 확정된 진행만 공유하고 미확인 내용은 이 방에 보존합니다.','sr-help sr-explanation'));
            panel.append(button('자료 이관하기',()=>deps.service.migrate({summary:reference.value})),button('나중에',async()=>{await deps.service.defer();close();}));show();return;
        }
        const data=await deps.service.catalog();if(current!==deps.chatKey())return;
        data.stories=data.stories.filter(item=>item.ready!==false);
        if(!data.stories.length){deps.notify('먼저 자료가 있는 방에서 기존 자료 이관을 진행해 주세요.');return;}
        const panel=create('이야기 연결','자료를 가져올 이야기를 고른 뒤, 이어갈지 새로 시작할지 선택하세요. 실리태번의 대화 메시지를 복사하는 기능은 아니에요.');
        const select=node('select','','text_pole');select.id='sr-story-select';
        for(const story of [...data.stories].reverse()){const option=node('option',story.title);option.value=story.id;select.append(option);}
        const label=node('label','가져올 이야기');label.append(select);panel.append(label);
        panel.append(node('p','이전 진행과 전개 선택을 그대로 가져와요. 이후 이야기는 이 방에서 이어집니다.','sr-help sr-explanation'),
            button('이어가기',()=>deps.service.connect({storylineId:select.value,mode:'continue'})),
            node('p','인물 자료와 기본 전개 설정만 가져와 새로 시작해요. 이전 사건·감정·금고 정보는 가져오지 않아요.','sr-help sr-explanation'),
            button('새 이야기 시작',()=>deps.service.connect({storylineId:select.value,mode:'new'})),
            button('나중에 선택',async()=>{await deps.service.defer();close();}));show();
        const remove=node('details');remove.append(node('summary','이야기 정리'),button('선택한 이야기 삭제…',()=>showStoryDeletion(select.value),true));panel.append(remove);
    }
    async function refresh() {
        const key=deps.chatKey();if(!doc.getElementById('sr-shared-storage'))return;
        const currentAccount=deps.service.scope?.();if(accountScope!==currentAccount){accountScope=currentAccount;inspected.clear();seen='';close();}
        if(scope!==key){scope=key;close();deps.service.cancel();}
        if(!deps.ready()){
            inspected.delete(key);
            const roomLink=doc.getElementById('sr-room-link');if(roomLink)roomLink.hidden=true;
            const line=doc.getElementById('sr-story-status');if(line)line.textContent='현재 채팅의 자료를 불러오는 중';
            return;
        }
        void deps.service.maintenance?.refreshContext().catch(()=>{});
        let state=inspected.get(key);
        if(deps.record()?.sharedSource){state={status:deps.record().sharedSource.active?'active':'archived'};inspected.set(key,state);}
        else if(!state){inspected.set(key,{status:'loading'});try{state=await deps.service.inspect();inspected.set(key,state);}catch{state={status:'unavailable'};inspected.set(key,state);}}
        if(key!==deps.chatKey())return;
        const line=doc.getElementById('sr-story-status');
        line.textContent=({active:'같은 이야기로 이어가는 중',archived:'이전 방의 기록 · 최신 이야기와 분리',legacy:'기존 방식 · 자료 이관 가능',choose:'새 채팅 · 이야기 연결 선택 가능',empty:'기존 방식',loading:'자료 연결 확인 중',unavailable:'자료 연결 확인 필요'})[state.status] || '자료 연결 확인 필요';
        const identity=key+':'+state.status;
        const migration=await deps.service.account.inspect();if(key!==deps.chatKey())return;
        // Reading a room must not migrate it or create a protective backup.
        const roomLink=doc.getElementById('sr-room-link');if(roomLink)roomLink.hidden=state.status!=='legacy';
        const move=doc.getElementById('sr-migration-button'),row=doc.getElementById('sr-migration-row');
        row.hidden=!['eligible','running','paused','failed'].includes(migration.status);move.textContent=['paused','failed'].includes(migration.status)?'📦 이사 계속':'📦 자료 이사';move.disabled=busy||migration.status==='running';
        if(!busy && doc.getElementById('scene-reader-dialog')?.open && !state.deferred && state.status==='choose' && seen!==identity && deps.ready() && !deps.isBusy()) {
            seen=identity;void open('connect').catch(error=>deps.notify(error.message));
        }
    }
    function bind() {
        if(doc.getElementById('sr-shared-storage'))return;
        const host=doc.getElementById('sr-backup-list')?.parentElement;if(!host)return;
        const section=node('section','','sr-settings-card');section.id='sr-shared-storage';section.append(node('h3','자료·이야기 연결'));
        const roomLink=button('이 방 자료 연결',async()=>open('room'),true);roomLink.id='sr-room-link';roomLink.hidden=true;section.append(roomLink);
        const row=node('div','','sr-action-row');row.append(button('이야기 연결',async()=>open('connect'),true));section.append(row);host.before(section);
        const cleaning=doc.getElementById('sr-cleanup-actions');
        for(const [mode,title]of [['maintenance','저장 파일 정리'],['rooms','방 자료 삭제…'],['cleanup','이전 파일 정리']]){const item=button(title,async()=>open(mode),true);item.id='sr-cleanup-'+mode;cleaning?.append(item);}
        const metadata=button('채팅의 옛 확장 정보 정리',async()=>{await persistCleanChatMetadata(deps);deps.notify('채팅의 옛 씬판독기 정보를 정리했어요. 대화와 다른 확장 정보는 그대로예요.');},true);metadata.id='sr-cleanup-chat-metadata';cleaning?.append(metadata);
        const migrationRow=node('div','','sr-migration-row');migrationRow.id='sr-migration-row';migrationRow.hidden=true;
        const move=button('📦 자료 이사',async()=>open('migrate'),true);move.id='sr-migration-button';move.classList.add('sr-migration-button');migrationRow.append(move);doc.querySelector('.sr-header')?.after(migrationRow);
        deps.service.account.subscribe(state=>{const progress=doc.getElementById('sr-migration-progress');if(progress)progress.textContent=state.status==='running'?`자료를 옮기고 있어요${state.files?.length?` · ${state.converted?.length||0}/${state.files.length}`:''}`:state.status==='completed'?'백업과 자료 확인을 마쳤어요.':'';if(['completed','cleaned'].includes(state.status))migrationRow.hidden=true;});
        const line=node('p','','sr-help sr-explanation');line.id='sr-story-status';line.setAttribute('role','status');doc.querySelector('.sr-main')?.prepend(line);
        void refresh().catch(()=>{});
    }
    return {bind,refresh:()=>void refresh().catch(()=>{}),open,watchDeletions:roomCleanup.watch};
}
