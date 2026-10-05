import assert from 'node:assert/strict';

export async function checkCommonPreferences(page,store,requests) {
    if (!await page.locator('#sr-injection-mode').isVisible()) {
        await page.locator('#sr-injection-mode').evaluate(el=>el.closest('details').open=true);
        if (!await page.locator('#sr-injection-mode').isVisible()) await page.locator('#sr-settings-button').click();
    }
    await page.locator('#sr-injection-mode').selectOption('preset');
    await page.locator('#sr-scene-slot-target').selectOption('main');
    await page.locator('#sr-scene-slot-side').selectOption('before');
    await page.locator('#sr-progress-intensity-up').click();
    await page.waitForFunction(()=>document.getElementById('sr-progress-intensity-value').textContent==='1.1');
    assert.equal(store.settings.global.commonPreferences.scenePresetSlot.side,'before');
    assert.equal(store.settings.global.commonPreferences.progressIntensity,1.1);
    const original=structuredClone(store.chat),room=await page.evaluate(()=>ctx.chatId);
    store.chat={preferences:{settingsContract:4,injectionMode:'depth',progressIntensity:0.5,developmentStyle:'dynamic'}};
    const requestsBefore=requests.filter(r=>r.url.endsWith('/systemone')).length;
    await page.evaluate(async()=>{ctx.chatId='settings-scope-room';ctx.name2='Another synthetic actor';await mock.emit('CHAT_CHANGED');});
    assert.equal(await page.locator('#sr-injection-mode').inputValue(),'preset');
    assert.equal(await page.locator('#sr-scene-slot-side').inputValue(),'before');
    assert.equal(await page.locator('#sr-progress-intensity-value').textContent(),'1.1');
    assert.equal(await page.locator('#sr-development-style').inputValue(),'dynamic');
    const failure=async route=>route.fulfill({status:500,json:{ok:false,error:'Synthetic settings save failure'}});
    await page.route('**/storage/settings',failure);
    await page.locator('#sr-injection-mode').selectOption('depth');
    await page.waitForFunction(()=>document.getElementById('sr-injection-mode').value==='preset');
    await page.unroute('**/storage/settings',failure);
    assert.equal(store.settings.global.commonPreferences.injectionMode,'preset');
    store.chat=original;
    await page.evaluate(async room=>{ctx.chatId=room;ctx.name2='Hunter';await mock.emit('CHAT_CHANGED');},room);
    assert.equal(await page.locator('#sr-progress-intensity-value').textContent(),'1.1');
    assert.equal(await page.locator('#sr-scene-slot-side').inputValue(),'before');
    assert.equal(requests.filter(r=>r.url.endsWith('/systemone')).length,requestsBefore,'changing rooms/settings does not run inference');
    await page.reload();await page.locator('#scene-reader-quick-button').waitFor();
    await page.locator('#scene-reader-quick-button').click();
    assert.equal(await page.locator('#sr-injection-mode').inputValue(),'preset');
    assert.equal(await page.locator('#sr-scene-slot-side').inputValue(),'before');
    assert.equal(await page.locator('#sr-progress-intensity-value').textContent(),'1.1');
    console.log('Common settings browser passed: server persistence, different room choices, failed save rollback and reload without extra inference.');
}
