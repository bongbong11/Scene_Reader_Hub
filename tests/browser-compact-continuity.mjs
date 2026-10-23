import assert from 'node:assert/strict';
export async function checkCompactContinuity(page,store,setViewportSize,root){
 await page.locator('#scene-reader-quick-button').click();
 await page.locator('#sr-settings-button').click();
 await page.locator('#sr-reasoner-profile').selectOption('test-profile');
 await page.locator('#sr-continuity-enabled').check();
 await page.locator('[data-sr-tab="flow"]').click();
 await page.evaluate(async()=>{mock.chat.push({is_user:true,mes:'What does the note say?'});await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);mock.chat.push({is_user:false,mes:'Hunter reads the note.'});await mock.emit('MESSAGE_RECEIVED',1);await mock.emit('GENERATION_ENDED');});
 await page.waitForFunction(()=>document.querySelector('#sr-continuity-results')?.textContent.includes('Hunter is reading the note.'));
 assert.equal(store.chat.continuity.context.current_situation,'Hunter is reading the note.');
 assert.equal(await page.evaluate(()=>mock.compactRequests.length),1,'first completed reply is collected');
 await page.evaluate(async()=>{await mock.emit('MESSAGE_RECEIVED',1);});
 assert.equal(await page.evaluate(()=>mock.compactRequests.length),1,'duplicate completed event sends no second analysis');
 await page.locator('#sr-run').click();
 await page.waitForFunction(()=>!document.querySelector('#sr-run').disabled);
 assert.match(store.chat.lastJudgment.payload,/Current situation: Hunter is reading the note/);
 const body=await page.evaluate(()=>mock.outbound());
 const text=body.messages.map(message=>message.content).join('\n');
 assert.match(text,/Current situation: Hunter is reading the note/);
 assert.doesNotMatch(text,/fieldSources|processedKeys|CONTINUITY_PARTIAL_RESULT|remaining_effects"/);
 await page.evaluate(async()=>{mock.compactResponse={current_situation:'Hunter puts the note down.'};mock.chat.push({is_user:true,mes:'We should wait.'});await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);mock.chat.push({is_user:false,mes:'Hunter puts the note down.'});await mock.emit('MESSAGE_RECEIVED',3);await mock.emit('GENERATION_ENDED');});
 await page.waitForFunction(()=>document.querySelector('#sr-continuity-results')?.textContent.includes('Hunter puts the note down.'));
 assert.equal(await page.evaluate(()=>mock.compactRequests.length),2,'the next reply needs no three-turn accumulation');
 assert.equal(store.chat.continuity.context.remaining_effects,'The answer still leaves doubt.','a missing field retains the previous value');
 const result=page.locator('#sr-continuity-results');
 await result.evaluate(node=>{node.closest('details').open=true;});
 assert.match(await result.textContent(),/일부 반영/);assert.doesNotMatch(await result.textContent(),/약속·일정|후속 후보|소재 편중|3개마다/);
 assert.ok(!(await page.evaluate(()=>mock.errors)).some(message=>message.includes('저장 판정 없이')),'normal context refresh cannot trigger an orphaned injection error');
 for(const size of [{width:1280,height:900},{width:390,height:844}]){
  await setViewportSize(size);await result.scrollIntoViewIfNeeded();
  assert.equal(await result.evaluate(node=>node.scrollWidth<=node.clientWidth+1),true,'compact fields fit the mobile panel');
  await page.screenshot({path:`${root}/artifacts/compact-continuity-${size.width}.png`});
 }
 // The partial result remains pending across room entry and an actual reload.
 const savedChat=await page.evaluate(()=>mock.chat);
 store.chat.auxiliaryStateV1.retryAfter=0;
 const beforeEntry=await page.evaluate(()=>mock.compactRequests.length);
 await page.evaluate(async()=>{await mock.emit('CHAT_CHANGED');await mock.emit('CHAT_CHANGED');});
 await page.waitForFunction(()=>document.querySelector('#sr-continuity-results')?.textContent.includes('미처리 내용 대기'));
 assert.equal(await page.evaluate(()=>mock.compactRequests.length),beforeEntry,'room entry does not retry pending work');
 assert.equal(await page.locator('#sr-continuity-retry').count(),0,'no new retry button');
 await page.locator('#sr-run').click();await page.waitForFunction(()=>!document.querySelector('#sr-run').disabled);
 assert.equal(await page.evaluate(()=>mock.compactRequests.length),beforeEntry,'manual scene reading is not continuity retry');
 await page.addInitScript(chat=>{Object.defineProperty(window,'mock',{configurable:true,get(){return this.__testMock;},set(value){value.chat=structuredClone(chat);this.__testMock=value;}});},savedChat);
 await page.reload();await page.locator('#scene-reader-quick-button').waitFor();
 await page.locator('#scene-reader-quick-button').click();
 await page.locator('[data-sr-tab="flow"]').click();
 await page.waitForFunction(()=>document.querySelector('#sr-continuity-results')?.textContent.includes('미처리 내용 대기'));
 assert.equal(await page.evaluate(()=>mock.profileRequestCount||0),0,'reload does not invoke continuity or another profile request');
 assert.ok(store.chat.auxiliaryStateV1.pending.turns.length>0,'pending source survives reload');
 await page.evaluate(async()=>{mock.chat.push({is_user:true,mes:'Continue.'});await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);mock.chat.push({is_user:false,mes:'Hunter answers the question.'});await mock.emit('MESSAGE_RECEIVED',5);await mock.emit('GENERATION_ENDED');});
 await page.waitForFunction(()=>document.querySelector('#sr-continuity-results')?.textContent.includes('수집 완료'));
 assert.equal(await page.evaluate(()=>mock.compactRequests.length),1,'next completed turn resumes collection once');
 const resumed=await page.evaluate(()=>JSON.stringify(mock.compactRequests[0]));
 assert.match(resumed,/Hunter puts the note down/,'unfinished turn is included in the resumed request');
 assert.equal(store.chat.auxiliaryStateV1.pending.turns.length,0,'resumed collection clears only processed pending work');
 console.log('Compact continuity browser passed: real completion, first/next reply, duplicate suppression, persisted partial result, next-turn actual request, desktop/mobile fields.');
}
