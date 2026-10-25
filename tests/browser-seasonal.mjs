import assert from 'node:assert/strict';
export async function checkSeasonal(page,store,requests,setViewportSize) {
    const calls=()=>requests.filter(r=>/systemone|\/api\/vector\/|chat-completions\/generate/.test(r.url)).length;
    store.chat.preferences={...store.chat.preferences,selectedWorldId:'current',seasonalReferences:['holidays','us_university']};
    store.settings.global.characterReviewPrompt='retired';
    await page.reload();await page.locator('#scene-reader-quick-button').click();
    await page.locator('.sr-seasonal-options').evaluate(e=>e.open=true);
    assert.equal(await page.locator('#sr-season-holidays').count(),0);
    assert.deepEqual(store.chat.preferences.seasonalReferences,['us_university'],'obsolete selection actually removed from storage');
    assert.ok(!('characterReviewPrompt' in store.settings.global));
    const hogwarts=page.locator('#sr-season-hogwarts');
    assert.equal(await hogwarts.isChecked(),false);
    await hogwarts.check();
    for(let i=0;i<100&&!store.chat.preferences.seasonalReferences.includes('hogwarts');i++)await page.waitForTimeout(50);
    assert.ok(store.chat.preferences.seasonalReferences.includes('hogwarts'));
    await page.reload();await page.locator('#scene-reader-quick-button').click();
    await page.locator('.sr-seasonal-options').evaluate(e=>e.open=true);
    assert.equal(await hogwarts.isChecked(),true,'explicit selection survives reload');
    await hogwarts.uncheck();
    for(let i=0;i<100&&store.chat.preferences.seasonalReferences.includes('hogwarts');i++)await page.waitForTimeout(50);
    assert.ok(!store.chat.preferences.seasonalReferences.includes('hogwarts'));

    await page.evaluate(async()=>{mock.chat=[{is_user:false,mes:"Scene.\n'''\nCurrent Date: 10/11/2026\n'''"}];ctx.chat=mock.chat;await mock.emit('GENERATION_ENDED');});
    const modal=page.locator('.sr-date-confirm');
    await modal.waitFor();
    const initial=calls();
    assert.equal(await modal.locator('option').count(),2,'numeric ambiguity is selectable');
    for(const width of [320,390,1280]) {
        await setViewportSize({width,height:720});
        assert.ok(await modal.evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&node.scrollWidth<=node.clientWidth+1;}));
        if(width===390)await page.screenshot({path:'artifacts/seasonal-date-390.png'});
    }
    await modal.locator('select').selectOption('1'); // d/m/y
    await modal.locator('button').filter({hasText:'나중에'}).click();
    assert.match(await page.locator('#sr-season-date-status').textContent(),/확인/);
    await page.locator('#sr-season-date-check').click();
    await modal.locator('select').selectOption('1');
    const fail=route=>route.fulfill({status:500,json:{error:'Synthetic date format save failure'}});
    await page.route('**/storage/settings',fail);
    await modal.locator('button').filter({hasText:'맞아요'}).click();
    await modal.locator('[role="status"]').filter({hasText:'Synthetic'}).waitFor();
    assert.equal(await modal.isVisible(),true);
    await page.unroute('**/storage/settings',fail);
    await modal.locator('button').filter({hasText:'맞아요'}).click();
    await page.waitForFunction(()=>!document.querySelector('.sr-date-confirm'));
    assert.match(await page.locator('#sr-season-date-status').textContent(),/2026-11-10/);
    await page.evaluate(async()=>{mock.chat[0].mes='Current Date: 11/12/2026';await mock.emit('GENERATION_ENDED');});
    assert.match(await page.locator('#sr-season-date-status').textContent(),/2026-12-11/);
    await page.evaluate(async()=>{mock.presetSettings.prompts[0].content+=' New status format.';await mock.emit('OAI_PRESET_CHANGED_AFTER');});
    assert.match(await page.locator('#sr-season-date-status').textContent(),/2026-12-11/);
    assert.equal(await modal.count(),0,'unrelated preset changes do not reopen confirmation');
    await page.evaluate(async()=>{mock.chat.push({is_user:false,mes:'The conversation continues.'});await mock.emit('GENERATION_ENDED');});
    assert.match(await page.locator('#sr-season-date-status').textContent(),/2026-12-11.*마지막 확인 날짜 유지/);
    assert.equal(await modal.count(),0,'date-free replies retain the date without confirmation');
    await page.evaluate(async()=>{mock.chat.push({is_user:false,mes:'<Status><date>2027-01-04</date></Status>'});await mock.emit('GENERATION_ENDED');});
    await modal.waitFor();await modal.locator('button').filter({hasText:'맞아요'}).click();
    await page.waitForFunction(()=>!document.querySelector('.sr-date-confirm'));
    assert.match(await page.locator('#sr-season-date-status').textContent(),/2027-01-04/);
    await page.evaluate(async()=>{mock.chat.at(-1).is_hidden=true;await mock.emit('GENERATION_ENDED');});
    assert.doesNotMatch(await page.locator('#sr-season-date-status').textContent(),/2027-01-04/);
    await page.evaluate(async()=>{mock.chat.at(-1).is_hidden=false;mock.chat.at(-1).mes='<Status><date>2027-01-05</date></Status>';await mock.emit('GENERATION_ENDED');});
    assert.match(await page.locator('#sr-season-date-status').textContent(),/2027-01-05/);
    assert.equal(calls(),initial,'date discovery, confirmation and changes use no inference/embedding');
    console.log('Seasonal browser passed: saved cleanup, ambiguous dates, failure retry, preset change, hidden/edit invalidation, no inference and mobile layout.');
}

