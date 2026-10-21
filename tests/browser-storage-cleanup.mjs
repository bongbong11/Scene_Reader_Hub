import assert from 'node:assert/strict';
export async function checkStorageCleanup(page,setViewportSize){
    assert.equal(await page.locator('#sr-reset-npc,#sr-reset-relationship').count(),0);
    for(const id of ['sr-cleanup-maintenance','sr-cleanup-rooms','sr-cleanup-cleanup','sr-clear-diagnostics','sr-cleanup-chat-metadata'])assert.equal(await page.locator('#sr-data-cleanup #'+id).count(),1);
    await page.locator('#sr-data-cleanup details > summary').click();
    assert.match(await page.locator('#sr-data-cleanup details').textContent(),/リロール|리롤/);
    await page.evaluate(async()=>{
        const {attachStorageMaintenance}=await import('/scripts/extensions/third-party/Scene_Reader_Hub/src/ui/storage-maintenance.js');
        const host=document.createElement('dialog');host.className='sr-story-dialog';host.id='maintenance-fixture';document.body.append(host);host.showModal();
        window.cleanupMode='automatic';window.cleanupStarted=0;window.cleanupResult=null;
        attachStorageMaintenance({document,host,chatKey:()=>ctx.chatId,notify:()=>{},service:{
            status:async()=>({mode:cleanupMode,...(cleanupResult||{status:'waiting'})}),
            configure:async mode=>{cleanupMode=mode;return {mode,status:'waiting'};},
            start:async()=>{cleanupStarted++;cleanupResult={status:'completed',deleted:531,bytes:1024};return {mode:cleanupMode,...cleanupResult};}
        }});
    });
    await page.locator('#sr-storage-cleanup-mode').selectOption('manual');
    await page.waitForFunction(()=>cleanupMode==='manual');assert.equal(await page.evaluate(()=>cleanupStarted),0);
    await page.locator('#sr-storage-cleanup-start').click();
    await page.locator('#sr-storage-cleanup-status').getByText(/삭제 531개/).waitFor();
    for(const width of [320,390,1280]){await setViewportSize({width,height:850});assert.equal(await page.locator('#maintenance-fixture').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);}
    await page.evaluate(()=>{document.getElementById('maintenance-fixture').close();document.getElementById('maintenance-fixture').remove();});
    await page.evaluate(async()=>{
        const {createRoomCleanupUi}=await import('/scripts/extensions/third-party/Scene_Reader_Hub/src/ui/room-cleanup.js');
        const room={chatKey:'character-avatar:Synthetic.png|chat:deleted-room',title:'deleted-room'};
        window.deletedRoomCount=0;window.deleteHandlers={};
        const ui=createRoomCleanupUi({document,notify:()=>{},onChanged:async()=>{},service:{deletedRooms:async()=>({rooms:[room]}),listRooms:async()=>({rooms:[room]}),previewRoom:async()=>({room,token:'verified'}),deleteRoom:async()=>{deletedRoomCount++;}}});
        ui.watch({on:(type,fn)=>{deleteHandlers[type]=fn;}},{CHAT_DELETED:'deleted'});window.openRoomCleanup=ui.open;deleteHandlers.deleted('deleted-room');
    });
    const popup=page.locator('dialog.sr-story-dialog[open]');await popup.getByRole('heading',{name:'삭제한 채팅의 확장 자료'}).waitFor();
    await popup.getByRole('button',{name:'자료 남기기'}).click();assert.equal(await page.evaluate(()=>deletedRoomCount),0);
    await page.evaluate(()=>openRoomCleanup());await popup.getByRole('button',{name:'백업 후 삭제'}).click();assert.equal(await page.evaluate(()=>deletedRoomCount),0);
    await popup.getByRole('checkbox').check();await popup.getByRole('button',{name:'백업 후 삭제'}).click();await popup.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>deletedRoomCount),1);
    console.log('Cleanup UI: grouped controls, small help, manual mode, progress, mobile width and confirmed deletion passed.');
}
