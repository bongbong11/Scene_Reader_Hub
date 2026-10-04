import assert from 'node:assert/strict';
import { prepareKnowledgeVault, publishKnowledgeVault, knowledgeVaultRevision, knowledgeVaultDecisionState } from '../src/integration/knowledge-vault.js';
import {createSourceRevision} from '../src/context/source-revision.js';
import {stableFingerprint} from '../src/decision/policy.js';
import {createVaultLauncher} from '../src/ui/vault-launcher.js';
import {vaultAnalysisBridge} from '../src/integration/vault-output.js';

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
const worldFrame={questions:{}};
const worldCards=prepareKnowledgeVault(worldFrame,{version:'0.1.0',getSceneInput:()=>[
    {secret_id:'world-one',text:'A hidden bridge tunnel exists.',knownBy:[],truthScope:'world',public:false},
    {secret_id:'public-one',text:'The public bridge opens at dawn.',knownBy:[],truthScope:'world',public:true},
]});
const worldState=knowledgeVaultDecisionState(worldCards);
assert.equal(worldState.restricted_knowledge[0].public,false);
assert.equal(worldState.restricted_knowledge[1].public,true);
assert.deepEqual(worldState.restricted_knowledge[0].knownBy,[]);
assert.match(worldFrame.questions.vault_0.instructions,/Do not require a holder/);
assert.match(worldFrame.questions.vault_1.instructions,/public background information/);
assert.match(worldState.restricted_knowledge_policy,/event already permitted/);
assert.match(worldState.restricted_knowledge_policy,/cannot speak, think, plan/);
assert.deepEqual(knowledgeVaultDecisionState([]),{});
assert.deepEqual(knowledgeVaultDecisionState(undefined),{});
let unlocked=false,opened=0;
const notices=[],uiHost={};
const launcher=createVaultLauncher({window:uiHost,isUnlocked:()=>unlocked,notify:message=>notices.push(message)});
assert.equal(launcher.open(),false);
unlocked=true;
assert.equal(launcher.open(),false,'unlock alone cannot open a missing extension');
uiHost.KnowledgeVaultV1={version:'0.1.0',open:()=>{opened++;return true;}};
unlocked=false;
assert.equal(launcher.open(),false,'installation alone does not grant access');
assert.equal(opened,0);
unlocked=true;
assert.equal(launcher.open(),true);
assert.equal(opened,1);
assert.deepEqual(notices,['쉿, 업데이트 중','쉿, 업데이트 중','쉿, 업데이트 중']);
const auditBridge={version:'0.1.0',beginAnalysis(){},commitAnalysis(){},analysisCurrent(){},isEnabled:()=>false};
assert.equal(vaultAnalysisBridge({KnowledgeVaultV1:auditBridge}),null,'disabled vault never starts output analysis');
auditBridge.isEnabled=()=>true;
assert.equal(vaultAnalysisBridge({KnowledgeVaultV1:auditBridge}),auditBridge);
console.log('Optional bridge: independent ownership, cache invalidation, private revisions and invalid-answer fallback passed.');
