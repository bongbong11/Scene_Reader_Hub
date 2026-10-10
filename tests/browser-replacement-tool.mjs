import assert from 'node:assert/strict';
import path from 'node:path';
export async function checkReplacementTool(page,store,requests,setViewportSize,root){
 const saved=structuredClone(store),reload=async()=>{await page.reload();await page.locator('#scene-reader-quick-button').waitFor();await page.locator('#scene-reader-quick-button').click();await page.locator('[data-sr-tab="characters"]').click();};
 try{
  store.settings.global.ownerUnlocked=false;if(store.settings.owner)store.settings.owner.unlocked=false;await page.evaluate(()=>localStorage.removeItem('scene-reader-owner-unlocked-v1'));await reload();assert.equal(await page.locator('#sr-replacement-open').isVisible(),false);
  store.settings.global.ownerUnlocked=true;
  store.characters={enabled:true,characters:[{id:'review-actor',kind:'character',name:'Review Actor',aliases:[],source:'A guarded adult.',recordBank:{entity_type:'character',entity_name:'Review Actor',analysisId:'review-original',intimacy_reference:{text:'',source_ids:[]},records:Array.from({length:12},(_,i)=>({id:'r'+i,type:'core',target:'',when:[],rule:'Original guarded disposition '+i,modality:'tendency',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'}))}}],npcs:[],persona:null,recordGroups:[]};
  await reload();await page.locator('#sr-replacement-open').click();const modal=page.locator('.sr-replacement-dialog');await modal.waitFor();
  const before=await page.evaluate(()=>JSON.stringify(mock.chat)),jevBefore=requests.filter(r=>r.url.endsWith('/systemone')).length;
  await modal.locator('[data-review]').click();await modal.locator('[data-status]').filter({hasText:'확인 완료'}).waitFor();
  assert.match(await modal.locator('[data-answer]').inputValue(),/경계심/);assert.equal(await page.evaluate(()=>JSON.stringify(mock.chat)),before);assert.equal(requests.filter(r=>r.url.endsWith('/systemone')).length,jevBefore,'quiet review sends no Jev request');
  assert.equal(await page.evaluate(()=>mock.quietRequests.length),1);assert.equal(await page.evaluate(()=>mock.quietRequests[0].skipWIAN),false);
  await modal.locator('[data-copy]').click();await modal.locator('[data-status]').filter({hasText:'복사 완료'}).waitFor();const copied=await page.evaluate(()=>navigator.clipboard.readText());for(let i=0;i<12;i++)assert.ok(copied.includes('Original guarded disposition '+i));
  await modal.locator('[data-answer]').fill('한글로 직접 고친 검토 내용');await modal.locator('[data-copy]').click();await modal.locator('[data-status]').filter({hasText:'복사 완료'}).waitFor();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/한글로 직접 고친 검토 내용/);
  for(const size of [{width:320,height:640},{width:390,height:844},{width:844,height:390},{width:1280,height:900}]){await setViewportSize(size);const fit=await modal.evaluate(el=>{const r=el.getBoundingClientRect(),body=el.querySelector('.sr-replacement-body');return {width:r.width,height:r.height,vw:innerWidth,vh:innerHeight,overflow:body.scrollWidth>body.clientWidth+1};});assert.ok(fit.width<=fit.vw&&fit.height<=fit.vh);assert.equal(fit.overflow,false);if(size.width===390)await page.screenshot({path:path.join(root,'artifacts','replacement-mobile.png')});}
  await modal.locator('[data-close]').click();await page.locator('#sr-replacement-open').click();assert.equal(await modal.locator('[data-answer]').inputValue(),'','answer is transient');await modal.locator('[data-close]').click();
 }finally{Object.assign(store,saved);await reload();}
}
