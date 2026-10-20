import assert from 'node:assert/strict';
export async function checkRoomBackups(page,setViewportSize) {
    let release,entered;
    const reached=new Promise(resolve=>entered=resolve),wait=new Promise(resolve=>release=resolve);
    const handler=async route=>{entered();await wait;await route.fulfill({json:{ok:true,storageVersion:3,migrated:true,chat:null,characters:{enabled:true,characters:[],npcs:[],recordGroups:[]},history:[],backups:[]}});};
    await page.route('**/storage/bootstrap',handler);
    await page.evaluate(()=>{
        document.getElementById('sr-character-preview').hidden=false;
        document.getElementById('sr-character-analysis-result').textContent='PREVIOUS_ROOM_PRIVATE_RECORD';
        document.getElementById('sr-prompt-preview').textContent='PREVIOUS_ROOM_PROMPT';
        ctx.chatId='synthetic-empty-room';ctx.chat=mock.chat=[];
        window.roomChange=mock.emit('CHAT_CHANGED');
    });
    await reached;
    assert.equal(await page.locator('#sr-character-preview').isVisible(),false,'prior preview closes before server response');
    assert.ok(!(await page.locator('#sr-character-analysis-result').textContent()).includes('PREVIOUS_ROOM'));
    assert.ok(!(await page.locator('#sr-prompt-preview').textContent()).includes('PREVIOUS_ROOM'));
    release();await page.evaluate(()=>window.roomChange);await page.unroute('**/storage/bootstrap',handler);
    assert.ok(!(await page.locator('#sr-character-analysis-list').textContent()).includes('Hunter'));
    await page.evaluate(async()=>{
        const {createStorageView}=await import('/scripts/extensions/third-party/Scene_Reader_Hub/src/ui/results/storage.js');
        const {backupSource}=await import('/scripts/extensions/third-party/Scene_Reader_Hub/src/storage/backup-label.js');
        window.backupContext={name2:'시험용캐릭터'.repeat(12),chatId:'시험용새채팅방'.repeat(12)};
        window.backupView=createStorageView({document,getContext:()=>window.backupContext,record:()=>null,escapeHtml:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;'),readState:()=>({backupList:[{id:'synthetic-backup',createdAt:'2026-01-01T00:00:00Z',reason:'before_story_link',source:backupSource(window.originalBackupContext)},{id:'other-backup',createdAt:'2026-01-01T00:00:00Z',source:{characterName:'Other actor',chatName:'Other room'}},{id:'old-backup',createdAt:'2026-01-01T00:00:00Z'}]})});
        window.originalBackupContext={...window.backupContext};window.backupView.renderBackups();
        const panel=document.getElementById('sr-current-status-panel');if(panel)panel.hidden=true;
    });
    await page.locator('#sr-settings-button').click();
    assert.match(await page.locator('#sr-backup-list').textContent(),/전체 백업.*이야기 연결 전 자동 백업/);
    assert.equal(await page.locator('#sr-backup-list .sr-backup-item').count(),1);
    for(const width of [320,390,1280]){
        await setViewportSize({width,height:850});await page.locator('#sr-backup-list').scrollIntoViewIfNeeded();
        const box=await page.locator('#sr-backup-list').boundingBox();assert.ok(box.x>=-1&&box.x+box.width<=width+1,'named backup fits viewport');
        assert.equal(await page.locator('#sr-backup-list').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true,'long names wrap without horizontal overflow');
    }
    await page.evaluate(()=>{window.backupContext={chatId:'empty-room',name2:'Other actor'};window.backupView.renderBackups();});
    assert.equal(await page.locator('#sr-backup-list .sr-backup-item').count(),0);
    await page.evaluate(()=>{window.backupContext={chatId:null};window.backupView.renderBackups();});
    assert.equal(await page.locator('#sr-backup-list .sr-backup-item').count(),3);
    assert.match(await page.locator('#sr-backup-list').textContent(),/이름 정보 없는 백업/);
    await page.evaluate(()=>{window.backupContext=window.originalBackupContext;window.backupView.renderBackups();});
    assert.equal(await page.locator('#sr-backup-list .sr-backup-item').count(),1);
    const passive=await page.evaluate(async()=>{
        const {createSharedStorageUi}=await import('/scripts/extensions/third-party/Scene_Reader_Hub/src/ui/shared-storage.js');
        const doc=document.implementation.createHTMLDocument('synthetic');
        doc.body.innerHTML='<div id="sr-shared-storage"></div><div id="sr-story-status"></div><button id="sr-room-link"></button><div id="sr-migration-row"><button id="sr-migration-button"></button></div>';
        let key='one',migrations=0,inspections=0,status='completed';
        const ui=createSharedStorageUi({document:doc,chatKey:()=>key,ready:()=>true,isBusy:()=>false,record:()=>({}),notify:()=>{},hydrate:async()=>{},refresh:()=>{},service:{scope:()=>1,cancel(){},inspect:async()=>{inspections++;return {status:'legacy'};},migrate:async()=>{migrations++;},account:{inspect:async()=>({status})}}});
        for(status of ['completed','cleaned'])for(key of ['one','two','one','two']){ui.refresh();await new Promise(resolve=>setTimeout(resolve,0));}
        return {migrations,inspections,available:!doc.getElementById('sr-room-link').hidden};
    });
    assert.equal(passive.migrations,0,'room visits never auto-migrate or create their backups');
    assert.equal(passive.inspections,2);assert.equal(passive.available,true);
    await page.evaluate(async()=>{
        const {openBackupRestore}=await import('/scripts/extensions/third-party/Scene_Reader_Hub/src/ui/backup-restore.js');
        window.restoreCalls=[];window.restoreInvalidated=0;
        window.restoreResult=openBackupRestore({document,getContext:()=>({chatId:'new-room',name2:'Synthetic',characterId:0,characters:[{avatar:'Synthetic.png'}]}),invalidate:()=>window.restoreInvalidated++,
            post:async(route,body)=>{
                window.restoreCalls.push({route,body});
                if(route==='v2/capabilities')return {features:['room-backup-restore']};
                if(route==='v2/backup/rooms')return {rooms:[{ref:'a'.repeat(64),title:'Earlier room',sameOwner:true},{ref:'b'.repeat(64),title:'Other character',sameOwner:false}]};
                if(!body.confirmOwner&&body.sourceRef==='b'.repeat(64))throw new Error('가져올 자료를 확인해 주세요.');
                return {restored:true};
            }},'synthetic');
    });
    const recovery=page.locator('dialog.sr-story-dialog[open]');
    await recovery.getByRole('heading',{name:'백업 복원',exact:true}).waitFor();
    assert.equal(await recovery.getByRole('checkbox').count(),0,'same-owner recovery does not show the cross-character confirmation');
    for(const width of [320,390,1280]){
        await setViewportSize({width,height:850});
        assert.equal(await recovery.evaluate(node=>node.scrollWidth<=node.clientWidth+1),true);
    }
    await recovery.getByLabel('복구할 원본 방').selectOption('b'.repeat(64));
    await recovery.getByRole('button',{name:'이 방으로 복원',exact:true}).click();
    await recovery.getByRole('alert').filter({hasText:'가져올 자료를 확인'}).waitFor();
    await recovery.getByRole('checkbox').check();
    await recovery.getByRole('button',{name:'이 방으로 복원',exact:true}).click();
    assert.equal((await page.evaluate(()=>window.restoreResult)).restored,true);
    assert.equal(await recovery.count(),0);
    assert.equal(await page.evaluate(()=>window.restoreCalls.some(call=>call.route==='backup/restore')),false,'room recovery never invokes all-room restore');
    await page.evaluate(async()=>{
        const {createSharedStorageUi}=await import('/scripts/extensions/third-party/Scene_Reader_Hub/src/ui/shared-storage.js');
        window.storyDeleted=false;
        window.storyUi=createSharedStorageUi({document,chatKey:()=>ctx.chatId,ready:()=>true,isBusy:()=>true,record:()=>null,notify:()=>{},hydrate:async()=>{},refresh:()=>{},
            service:{inspect:async()=>({status:'choose'}),catalog:async()=>({stories:[{id:'synthetic',title:'Earlier story'}]}),
                inspectDeletion:async()=>({title:'Earlier story',rooms:[{title:'Earlier room'}],token:'synthetic'}),
                deleteStory:async()=>{window.storyDeleted=true;return {deleted:true};},cancel(){},account:{inspect:async()=>({status:'cleaned'})}}});
        await window.storyUi.open('connect');
    });
    await recovery.getByRole('button',{name:'이어가기',exact:true}).waitFor();
    await recovery.getByText('이야기 정리',{exact:true}).click();
    await recovery.getByRole('button',{name:'선택한 이야기 삭제…',exact:true}).click();
    await recovery.getByRole('heading',{name:'이야기 자료 삭제',exact:true}).waitFor();
    await recovery.getByRole('button',{name:'이야기 삭제',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.storyDeleted),false,'no story deletion before explicit confirmation');
    await recovery.getByRole('checkbox').check();
    await recovery.getByRole('button',{name:'이야기 삭제',exact:true}).click();
    await recovery.waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>window.storyDeleted),true);
    await page.evaluate(()=>window.storyUi.open('cleanup'));
    await recovery.getByRole('button',{name:'옛 세계관 가져오기',exact:true}).waitFor();
    assert.equal(await recovery.getByRole('button',{name:'복구·기존 방식',exact:true}).count(),0);
    await recovery.getByRole('button',{name:'닫기',exact:true}).click();
    console.log('Room/backup browser passed: pending room read hides prior preview and payload; empty room stays empty; named automatic backup fits 320/390/1280px.');
}
