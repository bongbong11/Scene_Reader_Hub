import assert from 'node:assert/strict';
import { prepareKnowledgeVault, publishKnowledgeVault, knowledgeVaultRevision } from '../src/integration/knowledge-vault.js';
import {createSourceRevision} from '../src/context/source-revision.js';
import {stableFingerprint} from '../src/decision/policy.js';

const captured = [];
const bridge = {
    version: '0.1.0',
    getSceneInput: () => [{ secret_id: 'v1', title: 'Secret', text: 'Hidden fact', knownBy: ['user'], truthScope: 'private' }],
    publishSceneResult: value => captured.push(value),
};
const frame = { questions: {} };
const cards = prepareKnowledgeVault(frame, bridge);
assert.equal(cards.length, 1);
assert.ok(frame.questions.vault_0);
publishKnowledgeVault(bridge, cards, { vault_0: { choice: 'mixed_or_uncertain' } });
assert.equal(captured[0].vault_injections[0].mode, 'masked_boundary');
assert.equal(captured[0].knowledge_vault[0].scene_access, 'uncertain');
publishKnowledgeVault(bridge, cards, { vault_0: { choice: 'none' } });
assert.equal(captured[1].vault_injections[0].inject, false);
publishKnowledgeVault(bridge, cards, {vault_0:{choice:'invalid'}});
assert.deepEqual(captured[2].vault_injections,[],'invalid answers must not disable a vault boundary');
assert.deepEqual(captured[2].knowledge_vault,[]);
publishKnowledgeVault(bridge, cards, {});
assert.deepEqual(captured[3].vault_injections,[]);
assert.deepEqual(prepareKnowledgeVault({questions:{}},null),[]);
const emptyFrame={questions:{ordinary:{type:'choice'}}};
assert.deepEqual(prepareKnowledgeVault(emptyFrame,{version:'0.1.0',getSceneInput:()=>[]}),[]);
assert.deepEqual(Object.keys(emptyFrame.questions),['ordinary'],'disabled/empty vault does not add questions');
assert.deepEqual(prepareKnowledgeVault({questions:{}},{version:'0.1.0',getSceneInput(){throw Error('offline');}}),[]);
assert.equal(knowledgeVaultRevision({version:'0.1.0',getRevision(){throw Error('offline');}},stableFingerprint),'');
let revision='';
const deps={window:{KnowledgeVaultV1:{version:'0.1.0',getRevision:()=>revision}},stableFingerprint,settings:{},characterStore:{enabled:false,characters:[],npcs:[]}};
const {sourceRevisionKey}=createSourceRevision(deps);
const without=sourceRevisionKey({},{});
assert.equal(without,createSourceRevision({...deps,window:{}}).sourceRevisionKey({},{}),'absent/disabled vault preserves existing cache keys');
revision=JSON.stringify([{id:'private-card',text:'synthetic confidential marker',knownBy:['user']}]);
const withCard=sourceRevisionKey({},{});
assert.notEqual(withCard,without);
assert.ok(!withCard.includes('synthetic confidential marker'));
revision=revision.replace('marker','changed');
assert.notEqual(sourceRevisionKey({},{}),withCard,'editing a vault card invalidates previous Hub judgment');
assert.equal(JSON.stringify(cards).includes('vault_injections'),false);
console.log('Optional bridge: independent ownership, cache invalidation, private revisions and invalid-answer fallback passed.');
