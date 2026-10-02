const fs = require('node:fs/promises');
const path = require('node:path');
const { readJson, writeJsonAtomic } = require('./storage.cjs');

const OWNED = /^scene-reader-(?:(?:character|world)-\d+|connection-test|test-\d+)$/;
function collectionId(kind, bankId) {
    let hash = 2166136261;
    for (const char of String(bankId)) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
    return `scene-reader-${kind}-${hash >>> 0}`;
}
const entries = store => [...(store?.characters || []), ...(store?.npcs || []), ...[store?.persona].filter(Boolean)];
function changedCharacterCollections(chatKey, previous, next) {
    const current = new Map(entries(next).map(entry => [entry.id, entry]));
    return entries(previous).filter(entry => entry.recordBank &&
        JSON.stringify(entry.recordBank.records) !== JSON.stringify(current.get(entry.id)?.recordBank?.records))
        .map(entry => collectionId('character', `${chatKey}:${entry.id}`));
}
function changedWorldCollections(previous, next) {
    const current = new Map((next?.worlds || []).map(world => [world.id, world]));
    return (previous?.worlds || []).filter(world => JSON.stringify(world) !== JSON.stringify(current.get(world.id)))
        .map(world => collectionId('world', world.id));
}
function retrievalConfigChanged(previous, next) {
    const keys = ['retrievalProvider', 'retrievalModel', 'retrievalVertexAuth', 'retrievalVertexRegion', 'retrievalVertexProject'];
    return keys.some(key => previous?.global?.[key] !== next?.global?.[key]);
}
async function purgeOwned(directories, plan) {
    if (!directories?.vectors) return;
    const base = path.resolve(directories.vectors);
    const sources = await fs.readdir(base, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    const wanted = new Set(plan.collections || []);
    for (const source of sources) {
        if (!source.isDirectory() || source.isSymbolicLink()) continue;
        const parent = path.join(base, source.name);
        for (const entry of await fs.readdir(parent, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.isSymbolicLink() || !OWNED.test(entry.name) || (!plan.all && !wanted.has(entry.name))) continue;
            const target = path.resolve(parent, entry.name);
            if (path.dirname(target) !== parent || !target.startsWith(base + path.sep)) throw new Error('Unsafe retrieval cache path.');
            await fs.rm(target, { recursive: true, force: true });
        }
    }
}
async function retryCleanup(root, directories) {
    const file = path.join(root, 'retrieval-cleanup.json');
    const plan = await readJson(file, null);
    if (!plan) return false;
    await purgeOwned(directories, plan);
    await fs.rm(file, { force: true });
    return true;
}
async function scheduleCleanup(root, directories, { all = false, collections = [] } = {}) {
    if (!all && !collections.length) return;
    const file = path.join(root, 'retrieval-cleanup.json');
    try {
        const previous = await readJson(file, {});
        const merged = [...new Set([...(previous.collections || []), ...collections])].filter(id => OWNED.test(id));
        const purgeAll = all || previous.all || merged.length > 200;
        await writeJsonAtomic(file, { all: Boolean(purgeAll), collections: purgeAll ? [] : merged });
        await retryCleanup(root, directories);
    } catch (error) {
        // The source save already succeeded. Keep its cleanup request for retry,
        // and never misreport that the user's source file failed to save.
        console.warn('[Scene Reader] Search cache cleanup pending:', error.code || error.name);
    }
}
module.exports = { collectionId, changedCharacterCollections, changedWorldCollections, retrievalConfigChanged, purgeOwned, retryCleanup, scheduleCleanup };
