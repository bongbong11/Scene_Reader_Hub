import assert from 'node:assert/strict';

export async function checkNegativeRouting(page,store,requests) {
    const saved=structuredClone({settings:store.settings,chat:store.chat,history:store.history});
    const wasOpen=await page.locator('#scene-reader-dialog').evaluate(node=>node.open);
    try {
        Object.assign(store.settings.global,{enabled:true,autoJudge:true,continuityEnabled:false,characterMacroEnabled:true});
        Object.assign(store.chat.preferences,{worldHostility:true,npcToUser:true,userMisfortune:true,relationshipDirection:'hostile',negativePriority:true,socialEnabled:true,fightSustain:false,villainEnabled:false,worldAgencyEnabled:false,advancedEnabled:false,newGenerationEnabled:false,injectionMode:'depth',worldInjectionMode:'depth'});
        store.settings.global.commonPreferences={injectionMode:'depth',worldInjectionMode:'depth'};
        store.chat.lastJudgment=null;store.chat.pendingPlan=null;
        await page.reload();await page.locator('#scene-reader-quick-button').waitFor();
        const before=requests.filter(r=>r.url.endsWith('/systemone')).length;
        await page.evaluate(async()=>{
            ctx.mainApi='openai';
            mock.chat.splice(0,mock.chat.length,{is_user:true,mes:'Hunter and Rowan discuss the sealed archives.'});
            document.getElementById('send_textarea').value='';
            await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);
        });
        assert.equal(requests.filter(r=>r.url.endsWith('/systemone')).length-before,2);
        assert.equal(store.chat.lastJudgment.decisions.npc_autonomy,'yes');
        assert.equal(store.chat.lastJudgment.decisions.conflict_state,'none');
        const preparedCount=requests.filter(r=>r.url.endsWith('/systemone')).length;
        for(const macro of [true,false]) {
            const body=await page.evaluate(async macro=>{
                await mock.emit('GENERATION_STARTED','normal',{},false);
                const marker=mock.macros['scene-reader-character']();
                const render=text=>text.replaceAll('{{user}}',ctx.name1).replaceAll('{{char}}',ctx.name2);
                const messages=[{role:'system',content:'PRESET '+(macro?marker+marker:'')},...Object.values(mock.prompts).filter(p=>typeof p==='string'&&p).map(p=>({role:'system',content:render(p)})),{role:'user',content:'Continue.'}];
                await mock.emit('GENERATE_AFTER_DATA',{prompt:messages},false);
                const body={type:'normal',messages};
                await mock.emit('CHAT_COMPLETION_SETTINGS_READY',body);
                await fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(body)});
                return body;
            },macro);
            const sent=requests.filter(r=>r.url.endsWith('/api/backends/chat-completions/generate')).at(-1).body;
            assert.deepEqual(sent,body,'inspect the body that the transport actually sent');
            const text=sent.messages.map(m=>m.content).join('\n');
            for(const tag of ['WORLD_HOSTILITY','CHARACTER_TO_USER_DEFAULT','NPC_TO_USER_DEFAULT','USER_MISFORTUNE','INDEPENDENT_PERSPECTIVES','AUTONOMOUS_NPC_DYNAMICS'])assert.equal(text.split('<'+tag+'>').length-1,1,tag);
            assert.equal(text.split('Apply the enabled original negative-bias directives with priority').length-1,1);
            assert.ok(!text.includes('<CONFLICT_EXECUTION>'),'NPC activity alone cannot pull in conflict execution');
            assert.equal(text.includes('[SCENE_READER_CHARACTER]'),macro);
            assert.ok(!text.includes('SR_CHARACTER_SLOT_'));
        }
        assert.equal(requests.filter(r=>r.url.endsWith('/systemone')).length,preparedCount,'delivery causes no new judgment');
        await page.evaluate(()=>mock.emit('GENERATION_ENDED'));
        console.log('Browser negative delivery passed: actual transmitted body, all enabled originals once, original priority once, duplicated/missing macro, NPC activity without full conflict and no extra model calls.');
    } finally {
        store.settings=saved.settings;store.chat=saved.chat;store.history=saved.history;
        await page.reload();await page.locator('#scene-reader-quick-button').waitFor();
        if(wasOpen&&!await page.locator('#scene-reader-dialog').evaluate(node=>node.open))await page.locator('#scene-reader-quick-button').click();
    }
}
