import assert from 'node:assert/strict';
import { createRecordBank } from '../src/character/records.js';

export async function checkRecordProtection(page, store, requests, setReview) {
    const record=i=>({type:'core',target:'self',when:['always'],rule:`Uses established habit number ${i}.`,modality:'habit',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'});
    const actor=(name,id,kind)=>{
        const entry={name,id,kind,npcRole:kind==='npc'?'mixed':'',source:`${name} has established habits and bounded archive access.`,selectedLore:[],sourceVisibleToMain:true};
        entry.recordBank=createRecordBank({entity_type:kind,entity_name:name,records:[...Array.from({length:26},(_,i)=>record(i)),
            {...record(26),type:'knowledge',target:'Zorven',when:['sealed archives'],rule:'Does not know the sealed archive password.',modality:'fact',knowledge_domain:'secret',knowledge_state:'does_not_know'},
            {...record(27),type:'boundary',target:'Zorven',when:['sealed archives'],rule:'Never discloses a sealed archive seal.',modality:'negation'}]},entry,'browser-protection');
        return entry;
    };
    store.characters={enabled:true,characters:[actor('Hunter','guard-main','character')],npcs:[actor('Rowan','guard-npc','npc')]};
    store.chat={preferences:{settingsContract:4,characterVolume:'generous',npcRecordLimit:4}};
    store.settings.global.jevProvider='typesafe';
    setReview((key,q)=>/^character_\d+_record_/.test(key) ? (q.instructions.includes('Uses established habit') ? (Number(key.split('_').at(-1))<2?0.9:0.1) : 0.9) : 0.9);
    try {
        await page.reload();await page.locator('#sr-extension-open').evaluate(e=>e.closest('details').open=true);await page.locator('#sr-extension-open').click();
        await page.evaluate(()=>{mock.chat.splice(0,mock.chat.length,{is_user:true,mes:'Hunter and Rowan enter hallway.'});document.getElementById('send_textarea').value='';});
        await page.locator('[data-sr-tab="characters"]').click();
        const before=requests.filter(r=>r.url.endsWith('/systemone')).length;
        await page.evaluate(async()=>{await mock.emit('GENERATION_AFTER_COMMANDS','normal',{},false);});
        assert.equal(requests.filter(r=>r.url.endsWith('/systemone')).length-before,2,'supplements stay inside the existing gate and decision calls');
        const decision=requests.filter(r=>r.url.endsWith('/systemone')).at(-1).body;
        const guardKeys=Object.keys(decision.questions).filter(key=>decision.questions[key].instructions?.startsWith('Should this stored constraint'));
        const supplementalCount=store.chat.lastJudgment.characterTrace.reduce((sum,p)=>sum+p.protection.candidates,0);
        assert.ok(supplementalCount>=2&&supplementalCount<=4,'supplement only guards omitted by the real lexical/vector baseline');
        assert.equal(guardKeys.length,supplementalCount);
        for(const p of decision.state.character_profiles.people)for(const [i,item] of p.profileCandidates.entries())assert.ok(decision.questions[`character_${p.index}_record_${i}`]);
        assert.ok(store.chat.lastJudgment.characterTrace.every(p=>p.protection.candidates>=1 && p.protection.injected===p.protection.candidates));
        assert.match(await page.locator('#sr-character-turn-results').textContent(),/경계·지식 제한 보강/);
        assert.match(await page.locator('#sr-character-turn-results').textContent(),/주입문 준비됨/,'assembled character records do not claim actual delivery');
        assert.doesNotMatch(await page.locator('#sr-character-turn-results').textContent(),/이번 응답에 주입/);
        const outbound=await page.evaluate(()=>mock.outbound());
        const text=outbound.messages.map(m=>m.content).join('\n');
        assert.match(text,/Does not know the sealed archive password/);assert.match(text,/Never discloses a sealed archive seal/);
        const diagnostics=await page.evaluate(()=>SceneReaderHub.diagnostics().events);
        assert.ok(diagnostics.some(e=>e.code==='CHARACTER_PROTECTION_CANDIDATES'&&e.supplementalCount===supplementalCount));
        assert.ok(diagnostics.some(e=>e.code==='CHARACTER_PROTECTION_PREPARED'&&e.injectedCount===supplementalCount));
        assert.ok(diagnostics.some(e=>e.code==='PROMPT_OBSERVED'&&e.phase==='request'&&e.scene==='confirmed'));
        const events=diagnostics.filter(e=>e.code?.startsWith('CHARACTER_PROTECTION'));
        assert.ok(!JSON.stringify(events).includes('archive password'),'stage logs contain counts, not source or rules');
        console.log('Browser protection passed: two actors, question/metadata alignment, bounded existing calls, saved traces, results UI, stage diagnostics and actual outbound request inclusion.');
    } finally { setReview(null); }
}
