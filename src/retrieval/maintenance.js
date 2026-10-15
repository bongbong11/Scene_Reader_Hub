import { currentRecords, recordBankIsCurrent } from '../character/records.js';
import {bankIdentity} from './bank-identity.js';
import {bankPages} from '../storage/character-pages.js';

// Maintenance touches derived indexes only. Source records and judgments stay intact.
export function createEmbeddingMaintenance(deps) {
    let active = null;
    function banks() {
        const store = deps.characterStore;
        const entries = [...(store.characters || []), ...(store.npcs || []), ...(store.persona ? [store.persona] : [])];
        const result = entries.filter(recordBankIsCurrent).map(entry => ({
            kind:'character', entryId:entry.id, bankId:entry.recordBank?.pagedRecords?.bankId||bankIdentity('character',`${deps.stateChatKey()}:${entry.id}`,currentRecords(entry),Boolean(deps.shared?.())), items:currentRecords(entry),...(entry.recordBank?.pagedRecords?{pagedBank:entry.recordBank}:{}),
        }));
        const world = deps.selectedWorld();
        if (world?.advanced?.records?.length) result.push({kind:'world',bankId:bankIdentity('world',world.id,world.advanced.records,Boolean(deps.shared?.())),items:world.advanced.records});
        return result.filter(bank => bank.items.length||bank.pagedBank?.pagedRecords?.count);
    }
    const revision = () => JSON.stringify([deps.vectorRetrieval.config(), banks().map(bank=>bank.pagedBank ? {kind:bank.kind,bankId:bank.bankId,paged:bank.pagedBank.pagedRecords,analysisId:bank.pagedBank.analysisId} : bank)]);
    const isBusy = () => Boolean(active?.valid());
    async function rebuild({forceRebuild=false,entryIds=null,background=false} = {}) {
        if (active) throw new Error('임베딩 생성이 진행 중입니다. 완료 후 다시 시도하세요.');
        if (deps.chatReadyKey !== deps.stateChatKey()) throw new Error('현재 채팅의 저장 정보를 먼저 불러와 주세요.');
        const targets = structuredClone(banks().filter(bank=>!entryIds||entryIds.includes(bank.entryId)));
        if (!targets.length) throw new Error('현재 채팅에 임베딩할 인물·세계관 기록이 없습니다.');
        const snapshot = revision();
        if(!background)deps.invalidateReasonerJobs();
        const job = deps.jobs.begin('embedding-rebuild',snapshot);
        active = job;
        const validate = () => { job.assert(); if (revision() !== snapshot) { job.controller.abort(); job.assert(); } };
        let completed = 0, reusedCount = 0, generatedCount = 0;
        deps.noteDiagnostic('embedding_rebuild',{module:'src/retrieval/maintenance.js',status:'started',bankCount:targets.length});
        try {
            if(!background)await deps.clearInjection({chatKey:job.identity,owns:job.owns});
            validate();
            deps.vectorRetrieval.clear();
            for (const bank of targets) {
                validate();
                const result = bank.pagedBank
                    ?await deps.vectorRetrieval.rebuildPaged({kind:bank.kind,bankId:bank.bankId,count:bank.pagedBank.pagedRecords.count,pages:bankPages(bank.pagedBank,{signal:job.controller.signal}),forceRebuild,signal:job.controller.signal,validate})
                    :await deps.vectorRetrieval.rebuild({...bank,forceRebuild,background,signal:job.controller.signal,validate});
                validate();
                if (result.status !== 'rebuilt') throw Object.assign(new Error(result.error || '임베딩을 완료하지 못했습니다.'),{code:result.code || 'EMBEDDING_REBUILD_FAILED'});
                completed++;
                reusedCount+=result.reusedCount || 0;
                generatedCount+=result.generatedCount || 0;
            }
            deps.noteDiagnostic('embedding_rebuild',{module:'src/retrieval/maintenance.js',status:'succeeded',bankCount:completed,reusedCount,generatedCount,forceRebuild});
            return {bankCount:completed,recordCount:targets.reduce((sum,bank)=>sum+(bank.pagedBank?.pagedRecords?.count||bank.items.length),0),reusedCount,generatedCount};
        } catch(error) {
            deps.noteDiagnostic('embedding_rebuild',{module:'src/retrieval/maintenance.js',status:job.valid()?'failed':'cancelled',completedCount:completed,errorKind:error.code || error.name});
            throw error;
        } finally { job.finish(); if (active === job) active = null; }
    }
    async function prepareApplied(entryIds) {
        if(active||!entryIds?.length)return;
        try {
        const targets=banks().filter(bank=>entryIds.includes(bank.entryId));
        if(!targets.length)return;
        // Explicit file application may prepare one small batch in the background.
        // A large library requires the visible retry command, never a startup job.
        if(targets.some(bank=>bank.pagedBank)||targets.reduce((n,bank)=>n+bank.items.length,0)>20||JSON.stringify(targets.map(bank=>bank.items)).length>16000){
            deps.noteDiagnostic('retrieval_request',{module:'src/retrieval/maintenance.js',phase:'index_sync',status:'deferred',code:'EMBEDDING_INDEX_PENDING'});
            return;
        }
        await rebuild({entryIds,background:true});
        } catch(error) {
            // This optional task must never turn a successful file save into a failure.
            deps.noteDiagnostic('retrieval_request',{module:'src/retrieval/maintenance.js',phase:'index_sync',status:error.name==='AbortError'?'cancelled':'failed',code:error.code||'EMBEDDING_REBUILD_FAILED'});
        }
    }
    return {rebuild,prepareApplied,isBusy,cancel:()=>active?.controller.abort(new DOMException("Cancelled", "AbortError"))};
}
