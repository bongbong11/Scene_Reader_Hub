import assert from 'node:assert/strict';

export async function checkCharacterMacro(page,store,requests,setViewportSize) {
    store.settings.global.ownerUnlocked=false;
    store.settings.global.characterMacroEnabled=false;
    if(store.settings.global.injectionPlacementsV1)for(const profile of Object.values(store.settings.global.injectionPlacementsV1.profiles)){profile.characterMacroEnabled=false;profile.character='depth';}
    await page.evaluate(()=>localStorage.removeItem('scene-reader-owner-unlocked-v1'));
    await page.reload();
    await page.locator('#sr-extension-open').evaluate(e=>e.closest('details').open=true);
    await page.locator('#sr-extension-open').click();
    await page.locator('#sr-settings-button').click();
    assert.equal(await page.locator('#sr-injection-placement').evaluate(e=>e.open),false,'placement starts collapsed');
    assert.equal(await page.locator('#sr-character-macro-panel').count(),1);
    assert.equal(await page.locator('#sr-character-macro-panel').evaluate(e=>Boolean(e.closest('.sr-developer-lock'))),false);
    assert.equal(await page.locator('#sr-owner-card').isVisible(),false,'other developer features remain locked');
    await page.locator('#sr-character-mode').evaluate(e=>e.closest('details').open=true);
    await Promise.all([page.waitForResponse(r=>r.url().endsWith('/settings')),page.locator('#sr-character-mode').selectOption('weave')]);
    assert.equal(store.settings.global.injectionPlacementsV1.profiles['openai:Synthetic A'].characterMacroEnabled,true);
    async function previewText() {
        await page.locator('#sr-character-macro-preview').click();
        const text=await page.locator('#sr-macro-preview').innerText();
        return text;
    }
    assert.match(await previewText(),/전송 기록을 비웠습니다/);
    await page.locator('#sr-macro-preview button').click();
    await page.evaluate(()=>{
        const original=HTMLDialogElement.prototype.showModal;
        HTMLDialogElement.prototype.showModal=function(){if(this.id==='sr-macro-preview')throw new Error('Synthetic preview failure');return original.call(this);};
        window.restoreMacroDialog=()=>{HTMLDialogElement.prototype.showModal=original;};
    });
    await page.locator('#sr-character-macro-preview').click();
    await page.waitForFunction(()=>SceneReaderHub.diagnostics().events.some(e=>e.errorKind==='MACRO_PREVIEW_FAILED'&&e.module==='src/ui/macro-preview.js'));
    assert.equal(await page.locator('#sr-macro-preview').count(),0,'failed preview removes the dialog and subscription');
    await page.evaluate(()=>{restoreMacroDialog();delete window.restoreMacroDialog;});
    for(const width of [390,1280]) {
        await setViewportSize({width,height:850});
        const box=await page.locator('#sr-character-macro-panel').boundingBox();
        assert.ok(box.width>0 && box.x>=0 && box.x+box.width<=width+1,'integration stays inside the mobile/desktop dialog');
    }
    await page.locator('#sr-injection-mode').evaluate(e=>e.closest('details').open=true);
    await page.locator('#sr-injection-mode').selectOption('depth');
    await page.locator('#sr-settings-button').click();
    await page.evaluate(async()=>{
        ctx.mainApi='openai';
        mock.chat.splice(0,mock.chat.length,{is_user:true,mes:'Hunter and Rowan discuss the sealed archives.'});
        document.getElementById('send_textarea').value='';
        await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);
    });
    assert.ok(store.chat.lastJudgment.characterDelivery?.text.includes('CHARACTER_EXECUTION'));
    const countBefore=requests.filter(r=>r.url.endsWith('/systemone')).length;
    async function outbound({macro=true,duplicates=false,type='normal'}={}) {
        return page.evaluate(async({macro,duplicates,type})=>{
            await mock.emit('GENERATION_STARTED',type,{},false);
            const marker=mock.macros['scene-reader-character']();
            const render=text=>text.replaceAll('{{user}}',ctx.name1).replaceAll('{{char}}',ctx.name2);
            const prefix=mock.promptManager.preparePrompt(mock.presetSettings.prompts[0]).content;
            const messages=[{role:'system',content:prefix},
                {role:'system',content:'Interpretation before\n'+(macro?marker:'')+'\nInterpretation after'+(duplicates?marker:'')},
                ...Object.values(mock.prompts).filter(p=>typeof p==='string'&&p).map(p=>({role:'system',content:render(p)})),
                {role:'user',content:'Continue.'}];
            await mock.emit('GENERATE_AFTER_DATA',{prompt:messages},false);
            const body={type,messages};
            await mock.emit('CHAT_COMPLETION_SETTINGS_READY',body);
            await fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(body)});
            await mock.emit('GENERATION_ENDED');
            return {body,receipt:SceneReaderHub.diagnostics().events.findLast(e=>e.code==='CHARACTER_MACRO_RECEIPT')};
        },{macro,duplicates,type});
    }
    const full=body=>body.messages.map(m=>m.content).join('\n');
    const selected=store.chat.lastJudgment.characterDelivery.text.replaceAll('{{user}}','User').replaceAll('{{char}}','Hunter');
    const integrated=store.chat.lastJudgment.payload.replaceAll('{{user}}','User').replaceAll('{{char}}','Hunter');
    for(const type of ['normal','regenerate','swipe','continue']) {
        const result=await outbound({type,duplicates:true});
        const text=full(result.body);
        assert.equal(text.split(selected).length-1,1,'all selected person records occur once');
        assert.match(text,/Interpretation before\n\[SCENE_READER_CHARACTER\]/);
        assert.match(text,/\[\/SCENE_READER_CHARACTER\]\nInterpretation after/);
        assert.doesNotMatch(text,/SR_CHARACTER_SLOT_/);
        const envelope=text.match(/\[SCENE_READER_CHARACTER\]([\s\S]*?)\[\/SCENE_READER_CHARACTER\]/)[1];
        assert.match(envelope,/CHARACTER_TO_USER_DIRECTION|CHARACTER_TO_USER_DEFAULT/,'relationship interpretation accompanies records');
        const sceneOnly=result.body.messages.filter(m=>!m.content.includes('[SCENE_READER_CHARACTER]')).map(m=>m.content).join('\n');
        assert.doesNotMatch(sceneOnly,/<CHARACTER_TO_USER_DIRECTION|<CHARACTER_TO_USER_DEFAULT/,'moved interpretation leaves no scene duplicate');
        assert.doesNotMatch(envelope,/[가-힣]|\(Meta:/,'transmitted macro instructions are English without a second Meta');
        assert.equal(result.receipt.resultStatus,'confirmed');
        const sent=requests.filter(r=>r.url.endsWith('/api/backends/chat-completions/generate')).at(-1).body;
        assert.equal(full(sent),text,'the inspected body is actually transmitted');
    }
    await page.evaluate(async()=>{await mock.emit('GENERATION_ENDED');});
    await page.locator('#sr-settings-button').click();
    assert.match(await previewText(),/매크로 반영 확인/);
    assert.equal(await page.locator('#sr-macro-preview pre').textContent(),
        full(requests.filter(r=>r.url.endsWith('/api/backends/chat-completions/generate')).at(-1).body).match(/\[SCENE_READER_CHARACTER\][\s\S]*?\[\/SCENE_READER_CHARACTER\]/)[0]);
    for(const width of [320,390,1280]) {
        await setViewportSize({width,height:720});
        const box=await page.locator('#sr-macro-preview').boundingBox();
        assert.ok(box.x>=0 && box.x+box.width<=width+1,'transmission dialog fits mobile and desktop');
    }
    await page.evaluate(async()=>{await mock.emit('GENERATION_STARTED','normal',{},false);});
    assert.match(await page.locator('#sr-macro-preview').innerText(),/전송 기록을 비웠습니다/);
    assert.equal(await page.locator('#sr-macro-preview pre').textContent(),'','an open preview drops old content immediately');
    await page.locator('#sr-macro-preview button').click();
    await page.locator('#sr-settings-button').click();
    const absent=await outbound({macro:false});
    assert.ok(full(absent.body).includes(integrated));
    assert.ok(!full(absent.body).includes('[SCENE_READER_CHARACTER]'));
    assert.equal(absent.receipt.reasonCode,'missing');
    await page.locator('#sr-settings-button').click();
    await Promise.all([page.waitForResponse(r=>r.url().endsWith('/settings')),page.locator('#sr-character-mode').selectOption('depth')]);
    await page.locator('#sr-settings-button').click();
    const off=await outbound();
    assert.ok(full(off.body).includes(integrated));
    assert.ok(!full(off.body).includes('[SCENE_READER_CHARACTER]'));
    assert.equal(requests.filter(r=>r.url.endsWith('/systemone')).length,countBefore,'switching delivery and rendering macros never judges again');
    console.log('Browser character macro passed: unlocked collapsible integration, separate developer lock, saved setting, mobile/desktop bounds, actual request placement, duplicated/missing/off modes, all regeneration types and zero extra Jev calls.');
}
