import assert from 'node:assert/strict';
export async function checkPresetSlots(page,store,requests){
    await page.locator('[data-sr-tab="flow"]').click();
    await page.locator('#sr-injection-mode').evaluate(e=>e.closest('details').open=true);
    if(!await page.locator('#sr-injection-mode').isVisible())await page.locator('#sr-settings-button').click();
    const saved=JSON.stringify(store.characters);
    await page.evaluate(()=>mock.emit('GENERATION_ENDED'));
    const choose=async(kind,index)=>{
        await page.locator(kind==='scene'?'#sr-injection-mode':'#sr-world-injection-mode').selectOption('entry');
        await page.locator(`[data-sr-kind="${kind}"][data-sr-gap="${index}"]`).click();
        await page.waitForFunction(kind=>document.getElementById(kind==='scene'?'sr-injection-mode':'sr-world-injection-mode').value==='entry'||mock.toasts?.some(t=>t.level==='error'),kind);
        assert.equal(await page.locator(kind==='scene'?'#sr-injection-mode':'#sr-world-injection-mode').inputValue(),'entry',JSON.stringify(await page.evaluate(()=>mock.toasts)));
        await page.waitForTimeout(100);
    };
    await choose('scene',0);await choose('world',3);
    const names=await page.evaluate(()=>mock.promptManager.getPromptOrderForCharacter().map(r=>r.identifier));
    assert.equal(names[0],'scene-reader-hub-slot-v1');assert.equal(names.at(-1),'scene-reader-hub-world-slot-v1');
    assert.equal(await page.evaluate(()=>mock.presetSettings.model),'unchanged-model');
    assert.equal(await page.evaluate(()=>mock.presetSettings.prompts.find(p=>p.identifier==='main').content),'Rules for {{user}}.');
    assert.ok(requests.some(r=>r.url==='/api/presets/save'));
    await page.evaluate(async()=>{mock.chat.splice(0,mock.chat.length,{is_user:true,mes:'Hunter and Wade discuss the council.'});await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
    const body=await page.evaluate(()=>mock.outbound()),full=body.messages.map(m=>m.content).join('\n');
    assert.equal(full.split('data-kind="scene"').length-1,1);assert.ok(full.indexOf('data-kind="scene"')<full.indexOf('Rules for User.'));
    assert.ok(!full.includes('SR_HUB_'));assert.ok(!full.includes('이 항목을 드래그'));assert.ok(!full.includes('{{scene-reader-hub'));assert.match(await page.evaluate(()=>mock.prompts['scene-reader-router']),/SCENE_READER_CHARACTER/,'person depth stays independent of scene entry');
    await page.locator('#sr-character-macro-preview').click();assert.match(await page.locator('#sr-macro-preview').innerText(),/기본 판정·전개에 통합/);await page.locator('#sr-macro-preview button').click();
    // Third mode opens a cancellable picker, then saves a distinct person macro.
    await page.evaluate(()=>mock.emit('GENERATION_ENDED'));
    const beforePicker=requests.filter(r=>r.url==='/api/presets/save').length;
    await page.locator('#sr-character-mode').selectOption('entry');
    await page.locator('#sr-position-dialog').waitFor();
    for(const width of [320,390,1280]){
        await page.setViewportSize({width,height:720});
        assert.ok(await page.locator('#sr-position-dialog').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&e.scrollWidth<=e.clientWidth+1;}));
        if(width===390)await page.screenshot({path:'artifacts/person-position-390.png'});
    }
    await page.locator('#sr-position-dialog > button').click();
    assert.equal(await page.locator('#sr-character-mode').inputValue(),'depth');
    assert.equal(requests.filter(r=>r.url==='/api/presets/save').length,beforePicker);
    await page.locator('#sr-character-mode').selectOption('entry');
    await page.locator('#sr-position-dialog [data-sr-gap="1"]').click();
    await page.waitForFunction(()=>document.getElementById('sr-character-mode').value==='entry'&&!document.getElementById('sr-character-mode').disabled);
    assert.equal(await page.locator('#sr-position-dialog').count(),0);
    const personPrompt=await page.evaluate(()=>mock.presetSettings.prompts.find(p=>p.identifier==='scene-reader-hub-character-slot-v1'));
    assert.equal(personPrompt.name,'🐵 인물판독주입');assert.equal(personPrompt.role,'system');assert.match(personPrompt.content,/\{\{scene-reader-hub-character\}\}/);
    assert.ok(await page.locator('.sr-toast-message').filter({hasText:'🐵 인물판독주입 항목을 저장했습니다.'}).count());
    const separate=await page.evaluate(()=>mock.outbound()),separateText=separate.messages.map(m=>m.content).join('\n');
    assert.equal(separateText.split('[SCENE_READER_CHARACTER]').length-1,1);
    assert.equal(await page.locator('#sr-character-mode').evaluate(e=>getComputedStyle(document.querySelector('label[for="'+e.id+'"]')).fontWeight),await page.locator('#sr-injection-mode').evaluate(e=>getComputedStyle(document.querySelector('label[for="'+e.id+'"]')).fontWeight));
    await page.evaluate(()=>mock.emit('GENERATION_ENDED'));
    await page.locator('#sr-character-mode').selectOption('depth');await page.waitForFunction(()=>!document.getElementById('sr-character-mode').disabled);
    await page.evaluate(async()=>{mock.promptManager.getPromptOrderForCharacter().find(r=>r.identifier==='scene-reader-hub-slot-v1').enabled=false;await mock.emit('SETTINGS_UPDATED');});
    const off=await page.evaluate(()=>mock.outbound());assert.ok(!off.messages.some(m=>String(m.content).includes('data-kind="scene"')));
    assert.ok(await page.evaluate(()=>SceneReaderHub.diagnostics().events.some(e=>e.code==='PRESET_SLOT_RESULT'&&e.reason==='prompt_disabled')));
    await page.evaluate(async()=>{await mock.emit('GENERATION_ENDED');mock.promptManager.getPromptOrderForCharacter().find(r=>r.identifier==='scene-reader-hub-slot-v1').enabled=true;await mock.emit('SETTINGS_UPDATED');});
    await choose('scene',0);assert.equal(await page.evaluate(()=>mock.presetSettings.prompts.filter(p=>p.identifier==='scene-reader-hub-slot-v1').length),1);
    const before=requests.filter(r=>r.url.endsWith('/systemone')).length;
    await page.locator('#sr-clean-legacy-injection').click();await page.waitForFunction(()=>[...document.querySelectorAll('.sr-toast-message')].some(n=>n.textContent.includes('이전 임시 주입을 정리')));
    assert.equal(requests.filter(r=>r.url.endsWith('/systemone')).length,before);assert.equal(JSON.stringify(store.characters),saved);
    assert.equal(store.settings.global.injectionPlacementsV1.retired,true);assert.ok(!Object.hasOwn(store.settings.global.commonPreferences,'injectionMode'));
    await page.reload();await page.locator('#scene-reader-quick-button').click();
    assert.equal(await page.locator('#sr-injection-mode').inputValue(),'entry');assert.equal(await page.evaluate(()=>mock.presetSettings.prompts.filter(p=>p.identifier==='scene-reader-hub-slot-v1').length),1);
    // Leave the other integration cases on their original depth route.
    await page.locator('#sr-injection-mode').evaluate(e=>e.closest('details').open=true);await page.locator('#sr-settings-button').click();
    await page.locator('#sr-injection-mode').selectOption('depth');await page.waitForFunction(()=>!document.getElementById('sr-injection-mode').disabled);await page.locator('#sr-world-injection-mode').selectOption('depth');
    await page.waitForFunction(()=>document.getElementById('sr-world-injection-mode').value==='depth'&&!document.getElementById('sr-world-injection-mode').disabled);
    if(await page.locator('#sr-settings-button').isVisible())await page.locator('#sr-settings-button').click();
    console.log('Native preset browser passed: named save/reload, scene/world slots, unchanged source prompts/model, real substitution, toggle exclusion, preview, idempotence and exact legacy cleanup.');
}
