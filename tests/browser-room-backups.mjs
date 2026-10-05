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
        createStorageView({document,record:()=>null,escapeHtml:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;'),readState:()=>({backupList:[{id:'synthetic-backup',createdAt:'2026-01-01T00:00:00Z',reason:'before_story_link',source:{characterName:'시험용캐릭터'.repeat(12),chatName:'시험용새채팅방'.repeat(12)}}]})}).renderBackups();
        const panel=document.getElementById('sr-current-status-panel');if(panel)panel.hidden=true;
    });
    await page.locator('#sr-settings-button').click();
    assert.match(await page.locator('#sr-backup-list').textContent(),/전체 백업.*이야기 연결 전 자동 백업/);
    for(const width of [320,390,1280]){
        await setViewportSize({width,height:850});await page.locator('#sr-backup-list').scrollIntoViewIfNeeded();
        const box=await page.locator('#sr-backup-list').boundingBox();assert.ok(box.x>=-1&&box.x+box.width<=width+1,'named backup fits viewport');
        assert.equal(await page.locator('#sr-backup-list').evaluate(node=>node.scrollWidth<=node.clientWidth+1),true,'long names wrap without horizontal overflow');
    }
    console.log('Room/backup browser passed: pending room read hides prior preview and payload; empty room stays empty; named automatic backup fits 320/390/1280px.');
}
