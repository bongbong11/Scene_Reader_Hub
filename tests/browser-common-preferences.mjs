import assert from 'node:assert/strict';
export async function checkCommonPreferences(page,store,requests){
    await page.evaluate(()=>mock.emit('GENERATION_ENDED'));
    await page.locator('#sr-injection-mode').evaluate(e=>e.closest('details').open=true);
    if(!await page.locator('#sr-injection-mode').isVisible())await page.locator('#sr-settings-button').click();
    await page.locator('#sr-injection-mode').selectOption('entry');await page.locator('[data-sr-kind="scene"][data-sr-gap="0"]').click();
    await page.waitForFunction(()=>!document.getElementById('sr-injection-mode').disabled&&document.getElementById('sr-injection-mode').value==='entry');
    const original=structuredClone(store.chat),room=await page.evaluate(()=>ctx.chatId),before=requests.filter(r=>r.url.endsWith('/systemone')).length;
    store.chat={preferences:{settingsContract:4,injectionMode:'depth',developmentStyle:'dynamic'}};
    await page.evaluate(async()=>{ctx.chatId='settings-scope-room';await mock.emit('CHAT_CHANGED');});
    assert.equal(await page.locator('#sr-injection-mode').inputValue(),'entry');assert.equal(await page.locator('#sr-development-style').inputValue(),'dynamic');
    const fail=route=>route.fulfill({status:500,json:{ok:false,error:'Synthetic save failure'}});
    await page.route('**/storage/settings',fail);await page.locator('#sr-injection-mode').selectOption('depth');
    await page.waitForFunction(()=>!document.getElementById('sr-injection-mode').disabled&&document.getElementById('sr-injection-mode').value==='entry');await page.unroute('**/storage/settings',fail);
    assert.equal(store.settings.global.injectionPlacementsV1.profiles['openai:Synthetic A'].scene,'entry');
    store.chat=original;await page.evaluate(async room=>{ctx.chatId=room;await mock.emit('CHAT_CHANGED');},room);
    assert.equal(requests.filter(r=>r.url.endsWith('/systemone')).length,before);
    await page.reload();await page.locator('#scene-reader-quick-button').click();assert.equal(await page.locator('#sr-injection-mode').inputValue(),'entry');
    console.log('Placement scope browser passed: same preset across rooms, independent room choices, failed save rollback, persistent reload without inference.');
}
