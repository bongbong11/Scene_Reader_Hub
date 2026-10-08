import assert from 'node:assert/strict';
import {defaultCharacterStore} from '../src/character/store.js';
import {importRecordVersion,deleteRecordVersion,applyRecordVersion} from '../src/character/versions.js';
import {deleteCharacterRecords,characterDeletionTarget} from '../src/character/deletion.js';
import {recordBundleRows} from '../src/ui/record-bundles.js';
const output=(kind,name)=>({entity_type:kind,entity_name:name,records:[{type:'core',target:'self',when:['conversation'],rule:'Speaks clearly.',modality:'habit',basis:'explicit',source_ids:['S001'],knowledge_domain:'none',knowledge_state:'none'}]});
for(const kind of ['character','npc','persona']) {
    const first=importRecordVersion(defaultCharacterStore(),output(kind,'First'),'Bundle');
    const second=importRecordVersion(first.store,output(kind,'First'),'Other bundle');
    const peer=importRecordVersion(second.store,output(kind,'Second'),'Bundle');
    const original=JSON.stringify(peer.store),id=first.entry.id;
    assert.equal(characterDeletionTarget(peer.store,kind,id).count,2);
    const next=deleteCharacterRecords(peer.store,kind,id);
    assert.equal(JSON.stringify(peer.store),original,'nothing changes before persistence succeeds');
    assert.ok(!JSON.stringify(recordBundleRows(next,kind)).includes(id));
    assert.equal(recordBundleRows(next,kind)[0].people[0].name,'Second','a sibling in the same file remains');
    assert.throws(()=>applyRecordVersion(next,first.store.recordGroups[0].id,first.store.recordGroups[0].versions[0].id));
    assert.equal(characterDeletionTarget(next,kind,peer.entry.id).count,1);
    const allGone=deleteCharacterRecords(next,kind,peer.entry.id);assert.equal(recordBundleRows(allGone,kind).length,0);
    const version=first.store.recordGroups[0].versions[0];
    const noFiles=deleteRecordVersion(first.store,first.store.recordGroups[0].id,version.id);
    assert.equal(recordBundleRows(noFiles,kind).length,1);
    assert.equal(recordBundleRows(deleteCharacterRecords(noFiles,kind,id),kind).length,0,'a name with zero files is removable');
    assert.throws(()=>deleteCharacterRecords(peer.store,'wrong',id));
    assert.throws(()=>deleteCharacterRecords(next,kind,id));
}
console.log('Person deletion passed: all actor types, active and archived entries, all versions across bundles, siblings preserved, empty names removable, immutable staged updates.');
