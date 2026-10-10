import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
async function files(dir){
    const found=[];
    for(const entry of await readdir(dir,{withFileTypes:true})){
        if(['.git','node_modules','downloads','artifacts'].includes(entry.name))continue;
        const file=path.join(dir,entry.name);
        if(entry.isDirectory())found.push(...await files(file));
        else if(/\.(?:mjs|cjs|js)$/.test(entry.name))found.push(file);
    }
    return found;
}
for(const file of await files(root)){
    const result=spawnSync(process.execPath,['--check',file],{cwd:root,stdio:'inherit'});
    if(result.status!==0)process.exit(result.status||1);
}
for(const test of ['tests/hub-role-refactor.mjs','tests/hub-visibility-transport.mjs','tests/hub-visibility-history.mjs','tests/hub-analysis-manual.mjs','tests/hub-analysis-boundaries.mjs','tests/hub-analysis-features.mjs','tests/hub-analysis-integration.mjs','tests/hub-topic-balance.mjs','tests/hub-character-deletion.mjs','tests/hub-preference-scopes.mjs','tests/hub-room-display-backups.mjs','tests/hub-storage-v2-features.mjs','tests/hub-storage-v2.mjs','tests/hub-shared-storage.mjs','tests/companion-storage.test.js','tests/hub-current-status.mjs','tests/hub-knowledge-vault.mjs','tests/hub-recovery-and-presence.mjs','tests/hub-emotion-context.mjs','tests/hub-record-protection.mjs','tests/hub-preset-slots.mjs','tests/hub-compiler-prompts.mjs','tests/hub-emotion-recovery.mjs','tests/hub-mixed-emotions.mjs','tests/hub-character-bundles.mjs','tests/hub-jev-providers.mjs','tests/hub-runtime.mjs','tests/hub-slash-commands.mjs','tests/hub-draw-opportunities.mjs','tests/hub-request-regression.mjs','tests/hub-diagnostics.mjs','tests/hub-window-size.mjs','tests/hub-parity.mjs','tests/hub-storage-swap.mjs','test.mjs','tests/regression/world-bank.mjs','tests/regression/unified.mjs','tests/regression/storage-lifecycle.mjs','tests/regression/character-phase1.mjs','tests/regression/retrieval-core.mjs','tests/regression/vector-retrieval.mjs','tests/regression/character-volume.mjs','tests/regression/injection-limits.mjs','tests/regression/progress-intensity.mjs','tests/regression/jev-assembly.mjs','tests/regression/character-live-current.mjs','tests/regression/character-transfer.mjs','tests/regression/character-state.mjs','tests/regression/scene-gate.mjs','tests/regression/scene-gate-runtime.mjs','tests/regression/lifecycle-races.mjs','tests/regression/sexual-conduct.mjs','tests/regression/release-integration.mjs','tests/regression/judgment-lifecycle.mjs']){
    const result=spawnSync(process.execPath,[test],{cwd:root,stdio:'inherit'});
    if(result.status!==0)process.exit(result.status||1);
}
const stopChecks=spawnSync(process.execPath,['tests/hub-stop-boundaries.mjs'],{cwd:root,stdio:'inherit'});
if(stopChecks.status!==0)process.exit(stopChecks.status||1);
const opportunityChecks=spawnSync(process.execPath,['tests/hub-opportunity-upgrade.mjs'],{cwd:root,stdio:'inherit'});
if(opportunityChecks.status!==0)process.exit(opportunityChecks.status||1);
console.log('All source syntax and regression checks passed. Browser integration: npm run test:browser.');
