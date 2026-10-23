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
 console.log('Compact continuity browser passed: real completion, first/next reply, duplicate suppression, persisted partial result, next-turn actual request, desktop/mobile fields.');
}
