import assert from 'node:assert/strict';
import path from 'node:path';
export async function checkOpportunitySettings(page,store,requests,setViewportSize,root) {
    await page.locator('#sr-settings-button').click();
    await page.locator('[data-sr-tab="flow"]').click();
    await setViewportSize({width:844,height:390});
    const saved={...store.chat.preferences};
    const count=()=>requests.filter(r=>/systemone|\/api\/vector\/|chat-completions\/generate/.test(r.url)).length;
    const before=count();
    for(const id of ['sr-new-generation-enabled','sr-spontaneous-mode','sr-advanced-style','sr-appearance-chance'])assert.equal(await page.locator('#'+id).count(),1,'one compact control per setting');
    await page.locator('#sr-new-generation-enabled').check();
    await page.locator('[data-sr-tab="advanced"]').click();
    await page.locator('#sr-advanced-enabled').uncheck();
    await page.locator('[data-sr-tab="flow"]').click();
    await page.locator('#sr-spontaneous-mode').selectOption('off');
    await page.waitForFunction(()=>!document.getElementById('sr-advanced-style').disabled);
    await page.locator('#sr-spontaneous-mode').selectOption('both');
    await page.waitForFunction(()=>!document.getElementById('sr-advanced-style').disabled);
    await page.locator('#sr-appearance-chance').selectOption('75');
    await page.locator('#sr-advanced-style').selectOption('very_active');
    await page.locator('#sr-new-generation-enabled').uncheck();
    await page.waitForFunction(()=>document.getElementById('sr-spontaneous-mode').disabled);
    assert.equal(await page.locator('#sr-appearance-chance').isDisabled(),true);
    assert.equal(await page.locator('#sr-advanced-style').isDisabled(),true);
    assert.equal(store.chat.preferences.spontaneousMode,'both');
    assert.equal(store.chat.preferences.appearanceChance,75);
    assert.equal(store.chat.preferences.advancedStyle,'very_active');
    assert.equal(await page.locator('#sr-development-style').isDisabled(),false,'ordinary development remains usable');
    assert.equal(await page.locator('#sr-relationship-pace').isDisabled(),false,'relationship settings remain usable');
    await page.locator('#sr-new-generation-enabled').check();
    await page.waitForFunction(()=>!document.getElementById('sr-spontaneous-mode').disabled);
    await page.waitForLoadState('networkidle');
    await page.locator('#sr-advanced-style').selectOption('off');
    await Promise.all([page.waitForResponse(response=>response.url().endsWith('/storage/chat')&&response.request().postDataJSON()?.value?.preferences?.appearanceChance===0),page.locator('#sr-appearance-chance').selectOption('0')]);
    await page.waitForLoadState('networkidle');
    assert.equal(store.chat.preferences.advancedStyle,'off');assert.equal(store.chat.preferences.appearanceChance,0,JSON.stringify(requests.filter(r=>r.body?.value?.preferences||r.body?.chat?.preferences).slice(-6).map(r=>({url:r.url,p:(r.body.value||r.body.chat).preferences}))));
    await page.reload();await page.locator('#scene-reader-quick-button').waitFor();await page.locator('#scene-reader-quick-button').click();await page.locator('[data-sr-tab="flow"]').click();
    for(const mode of ['off','event','person','both']){
        await page.locator('#sr-spontaneous-mode').selectOption(mode);await page.waitForLoadState('networkidle');
        assert.equal(await page.locator('#sr-advanced-style').inputValue(),'off');assert.equal(await page.locator('#sr-appearance-chance').inputValue(),'0');
    }
    assert.equal(await page.locator('#sr-advanced-style').isDisabled(),false,'zero can be changed back without switching generation off/on');
    assert.match(await page.locator('#sr-generation-help').textContent(),/돌발을 꺼도/);assert.match(await page.locator('#sr-generation-help').textContent(),/0%.*돌발/);
    for(const size of [{width:320,height:700},{width:360,height:740},{width:390,height:844},{width:1280,height:900}]) {
        await setViewportSize(size);await page.locator('.sr-opportunity-controls').scrollIntoViewIfNeeded();
        const fit=await page.locator('.sr-opportunity-controls').evaluate(card=>{
            const r=card.getBoundingClientRect();return {overflow:card.scrollWidth>card.clientWidth+1,
                controls:[...card.querySelectorAll('select')].map(node=>{const n=node.getBoundingClientRect();return {inside:n.left>=r.left-1&&n.right<=r.right+1,height:n.height};})};
        });
        assert.equal(fit.overflow,false);assert.ok(fit.controls.every(x=>x.inside&&x.height>=28&&x.height<=29));
        if(size.width===390||size.width===1280)await page.screenshot({path:path.join(root,'artifacts',`opportunity-${size.width}.png`)});
    }
    assert.equal(count(),before,'changing settings performs no inference, embedding or generation');
    assert.equal(await page.locator('.sr-tabs [data-sr-tab]').count(),4);
    if(saved.advancedEnabled){await page.locator('[data-sr-tab="advanced"]').click();await page.locator('#sr-advanced-enabled').check();await page.locator('[data-sr-tab="flow"]').click();}
    await page.locator('#sr-advanced-style').selectOption(saved.advancedStyle);
    await page.locator('#sr-appearance-chance').selectOption(String(saved.appearanceChance));
    await page.locator('#sr-spontaneous-mode').selectOption(saved.spontaneousMode||'off');
    if(saved.newGenerationEnabled===false)await page.locator('#sr-new-generation-enabled').uncheck();
    console.log('Browser opportunities passed: zero probabilities survive reload and all modes, compact controls, independent off switch, ordinary settings remain usable, zero inference from settings, 320/360/390/1280px fit.');
}
