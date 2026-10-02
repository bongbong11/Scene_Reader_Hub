import assert from 'node:assert/strict';
import { importRecordVersion, applyRecordVersion, deleteRecordVersion, bankOutput } from '../../src/characters/versions.js';
import { defaultCharacterStore, normalizeCharacterStore, buildLiveCharacterPlan, resolveLiveCharacterPlan, buildCharacterInjection } from '../../character-library.js';
import { recordBankIsCurrent } from '../../src/characters/records.js';
import { validateImport } from '../../src/vendor/character-reasoner/index.js';
const output=(kind,name,rule=`${name} suspects the invitation is a trap.`)=>({entity_type:kind,entity_name:name,source_set_id:'external-sheet',records:[{type:'knowledge',target:'self',when:['before confirmation'],rule,modality:'possibility',basis:'explicit',source_ids:['external-source'],knowledge_domain:'event',knowledge_state:'suspects'}]});
for(const kind of ['character','persona','npc']) {
    const first=importRecordVersion(defaultCharacterStore(),output(kind,'Rowan'),'My sheet');
    assert.equal(first.entry.source,'','standalone imports need no pasted source or copied prompt');
    assert.equal(recordBankIsCurrent(first.entry),true);
    assert.deepEqual(bankOutput(first.entry.recordBank),{...validateImport(output(kind,'Rowan')).output,source_set_id:'external-sheet'});
    const older=first.store.recordGroups[0].versions[0];
    const second=importRecordVersion(first.store,output(kind,'Rowan','Rowan doubts the invitation is genuine.'),'My sheet');
    const group=second.store.recordGroups[0];
    assert.equal(group.versions.length,2);assert.equal(second.entry.id,first.entry.id);
    assert.equal(first.store.recordGroups[0].versions.length,1,'update does not mutate current store before persistence');
    const applied=applyRecordVersion(normalizeCharacterStore(JSON.parse(JSON.stringify(second.store))),group.id,older.id);
    assert.equal(applied.entry.appliedRecordVersion,older.id);
    const plan=buildLiveCharacterPlan([applied.entry],{canonicalOnly:true,transcript:'Rowan studies the invitation.'});
    const resolved=resolveLiveCharacterPlan(plan,{character_0_presence:'active',character_0_record_0:'yes'});
    assert.match(buildCharacterInjection(resolved).text,/suspects the invitation is a trap/);
    assert.doesNotMatch(buildCharacterInjection(resolved).text,/doubts the invitation is genuine/);
    const deleted=deleteRecordVersion(applied.store,group.id,older.id);
    const entry=kind==='persona'?deleted.persona:(kind==='npc'?deleted.npcs:deleted.characters)[0];
    assert.equal(entry.recordBank,undefined);assert.ok(entry.id,'deleting a version keeps Sheet Cast ownership');
    const snapshot=JSON.stringify(second.store);
    assert.throws(()=>importRecordVersion(second.store,{...output(kind,'Rowan'),records:[{...output(kind,'Rowan').records[0],knowledge_state:'none'}]},'My sheet'),/knowledge/);
    assert.equal(importRecordVersion(second.store,output(kind,'Rowan'),'').store.recordGroups.some(group=>group.name==='Rowan'),true);
    assert.equal(JSON.stringify(second.store),snapshot);
    second.entry.source='Changed source';
    assert.equal(recordBankIsCurrent(second.entry),false);
    assert.throws(()=>applyRecordVersion(second.store,group.id,older.id),/원문/);
}
{
    const first=importRecordVersion(defaultCharacterStore(),output('character','Rowan'),'Main');
    assert.throws(()=>importRecordVersion(first.store,output('npc','Rowan'),'Duplicate'),/이미 다른 인물/);
}
{
    const first=importRecordVersion(defaultCharacterStore(),output('persona','Alice'),'Alice sheet');
    const aliceGroup=first.store.recordGroups[0], aliceVersion=aliceGroup.versions[0];
    const second=importRecordVersion(first.store,output('persona','Bob'),'Bob sheet');
    assert.equal(second.store.persona.name,'Bob');
    const restored=applyRecordVersion(second.store,aliceGroup.id,aliceVersion.id);
    assert.equal(restored.store.persona.name,'Alice');
    assert.equal(recordBankIsCurrent(restored.store.persona),true);
    assert.equal(restored.store.recordGroups.length,2);
    const aliased=importRecordVersion({...first.store,persona:{...first.entry,aliases:['Alicia']}},output('persona','Alicia'),'Alice sheet');
    assert.equal(aliased.entry.id,first.entry.id,'an alias import must not create a duplicate identity');
    assert.ok(aliased.entry.aliases.includes('Alice'));
}
console.log('Character transfer passed: standalone CR JSON parity, all three actor kinds, date versions, apply/copy/delete, durable ownership, failed imports and stale versions.');
