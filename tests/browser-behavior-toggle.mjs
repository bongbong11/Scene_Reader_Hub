import assert from 'node:assert/strict';
import {characterBehaviorPrompt} from '../src/injection/character-behavior.js';

export async function checkBehaviorToggle(page,store,requests,setViewportSize) {
    const button=mode=>page.locator(`[data-sr-behavior="${mode}"]`);
    const inference=()=>requests.filter(r=>/systemone|\/api\/vector\/|chat-completions\/generate/.test(r.url)).length;
    const initial=store.settings.global.characterBehaviorMode||'glm';
    const calls=inference();
    for(const mode of ['gemini','glm','gemini']) {
        await button(mode).click();
        await page.waitForFunction(mode=>document.querySelector(`[data-sr-behavior="${mode}"]`).getAttribute('aria-pressed')==='true'&&!document.querySelector(`[data-sr-behavior="${mode}"]`).disabled,mode);
        assert.equal(store.settings.global.characterBehaviorMode,mode);
    }
    assert.equal(inference(),calls,'switching alone never starts inference');
    await page.reload();await page.locator('#scene-reader-quick-button').click();
    assert.equal(await button('gemini').getAttribute('aria-pressed'),'true');
    for(const width of [320,390,600,1280]) {
        await setViewportSize({width,height:720});
        const layout=await page.locator('.sr-behavior-toggle').evaluate(node=>{
            const box=node.getBoundingClientRect(),title=document.querySelector('.sr-header h2').getBoundingClientRect();
            return {left:box.left,right:box.right,bottom:box.bottom,titleTop:title.top,reachable:[...node.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));})};
        });
        assert.ok(layout.left>=0&&layout.right<=width&&layout.bottom<=layout.titleTop+1&&layout.reachable,'small toggle fits above header and is clickable');
        if(width===390||width===1280)await page.screenshot({path:`artifacts/behavior-${width}.png`});
    }
    const fail=route=>route.fulfill({status:500,json:{ok:false,error:'Synthetic save failure'}});
    await page.route('**/storage/settings',fail);
    await button('glm').click();
    await page.waitForFunction(()=>!document.querySelector('[data-sr-behavior="glm"]').disabled);
    assert.equal(await button('gemini').getAttribute('aria-pressed'),'true');
    await page.unroute('**/storage/settings',fail);
    const originalRoom=await page.evaluate(()=>ctx.chatId);
    await page.evaluate(async()=>{ctx.chatId='behavior-global-room';await mock.emit('CHAT_CHANGED');});
    assert.equal(await button('gemini').getAttribute('aria-pressed'),'true','another room keeps the global choice');
    await page.evaluate(async key=>{ctx.chatId=key;await mock.emit('CHAT_CHANGED');},originalRoom);
    // Real Hub preparation and host request: both switch directions, both delivery paths.
    const originalMacro=Boolean(store.settings.global.injectionPlacementsV1?.profiles?.['openai:Synthetic A']?.characterMacroEnabled??store.settings.global.characterMacroEnabled);
    for(const macro of [false,true]) {
    if(Boolean(store.settings.global.injectionPlacementsV1?.profiles?.['openai:Synthetic A']?.characterMacroEnabled??store.settings.global.characterMacroEnabled)!==macro)await Promise.all([
        page.waitForResponse(r=>r.url().endsWith('/storage/settings')),
        page.locator('#sr-character-macro').evaluate((el,checked)=>{el.checked=checked;el.dispatchEvent(new Event('change',{bubbles:true}));},macro),
    ]);
    for(const mode of ['gemini','glm','gemini']) {
        if(await button(mode).getAttribute('aria-pressed')!=='true') {
            await button(mode).click();
            await page.waitForFunction(mode=>document.querySelector(`[data-sr-behavior="${mode}"]`).getAttribute('aria-pressed')==='true'&&!document.querySelector(`[data-sr-behavior="${mode}"]`).disabled,mode);
            const registered=await page.evaluate(()=>Object.values(mock.prompts).join('\n'));
            assert.ok(!registered.includes('[CHARACTER RESPONSE GUIDANCE]'),'old registered prompt is cleared before the next preparation');
        }
        await page.evaluate(async()=>{
            ctx.mainApi='openai';
            mock.chat.splice(0,mock.chat.length,{is_user:true,mes:'Two colleagues discuss their unfinished plan.'});
            document.getElementById('send_textarea').value='';
            await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);
        });
        const prompt=characterBehaviorPrompt(mode);
        assert.equal(store.chat.lastJudgment.payload.split(prompt).length-1,1);
        assert.equal(store.chat.lastJudgment.characterDelivery.text.split(prompt).length-1,1);
        const body=await page.evaluate(async macro=>{
            await mock.emit('GENERATION_STARTED','normal',{},false);
            const marker=macro?mock.macros['scene-reader-character']():'';
            const render=text=>text.replaceAll('{{char}}',ctx.name2).replaceAll('{{user}}',ctx.name1);
            const messages=[{role:'system',content:'Interpretation before\n'+marker+'\nInterpretation after'},
                ...Object.values(mock.prompts).filter(p=>typeof p==='string'&&p).map(p=>({role:'system',content:render(p)})),
                {role:'user',content:'Continue.'}];
            await mock.emit('GENERATE_AFTER_DATA',{prompt:messages},false);
            const body={type:'normal',messages};await mock.emit('CHAT_COMPLETION_SETTINGS_READY',body);
            await fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(body)});
            return body;
        },macro);
        const text=body.messages.map(m=>m.content).join('\n').replaceAll('{{char}}','Hunter').replaceAll('{{user}}','User');
        const rendered=prompt.replaceAll('{{char}}','Hunter').replaceAll('{{user}}','User');
        assert.equal(text.split(rendered).length-1,1,'selected prompt arrives in actual request');
        assert.equal(text.includes('INTENSITY: Interpret the whole person'),mode==='gemini','old variant never survives switching');
        assert.equal(text.includes('NO AUTOMATIC SOFTENING:'),mode==='glm','GLM correction never remains in Gemini mode');
        assert.equal(text.includes('[SCENE_READER_CHARACTER]'),macro);
        assert.doesNotMatch(text,/<GEMINI_CHARACTER_BALANCE>|<CHARACTER_BEHAVIOR>/,'old full behavior blocks are gone');
        await page.evaluate(()=>mock.emit('GENERATION_ENDED'));
    }
    }
    if(!originalMacro)await Promise.all([page.waitForResponse(r=>r.url().endsWith('/storage/settings')),page.locator('#sr-character-macro').evaluate(el=>{el.checked=false;el.dispatchEvent(new Event('change',{bubbles:true}));})]);
    if(initial!=='gemini') {await button(initial).click();await page.waitForFunction(()=>!document.querySelector('[data-sr-behavior="glm"]').disabled);}
    console.log('Behavior browser passed: small header toggle, mobile fit, reload persistence, save rollback, real preparation and transmitted variants.');
}
