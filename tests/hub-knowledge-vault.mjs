import assert from 'node:assert/strict';
import { prepareKnowledgeVault, publishKnowledgeVault } from '../src/integration/knowledge-vault.js';

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
