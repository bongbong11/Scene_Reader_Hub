import {clone,digest} from '../storage/shared-document.js';
export function assetIdentity(assets){const copy=clone(assets),bank=value=>{if(!value?.records)return;const identity=value.pagedRecords?.bankId||'shared-character-'+digest(value.records);for(const key of ['records','recordIds','recordIndices','pagedRecords','storageRefs','seedRecords','seedIndices'])delete value[key];value.recordContentIdentity=identity;};for(const entry of [...(copy.characters?.characters||[]),...(copy.characters?.npcs||[]),...[copy.characters?.persona].filter(Boolean)])bank(entry.recordBank);for(const group of copy.characters?.recordGroups||[])for(const version of group.versions||[])bank(version.bank);return digest(copy);}
export function projectBaseline({characters,preferences,world}) {
    const assets={characters:clone(characters || {enabled:false,characters:[],npcs:[],persona:null}),worldId:world?.id || preferences?.selectedWorldId || null};
    // Saving an unchanged store must not create another immutable asset merely
    // because the ordinary repository updated its save timestamp.
    delete assets.characters.updatedAt;
    const stable=bank=>{if(bank?.pagedRecords&&bank.seedRecords){bank.records=clone(bank.seedRecords);bank.recordIndices=clone(bank.seedIndices);}};
    for(const entry of [...(assets.characters.characters||[]),...(assets.characters.npcs||[]),...[assets.characters.persona].filter(Boolean)])stable(entry.recordBank);
    for(const group of assets.characters.recordGroups||[])for(const version of group.versions||[])stable(version.bank);
    return {assetId:assetIdentity(assets),assets,defaultPreferences:clone(preferences || {})};
}
export function hasLegacyMaterial(chat,characters) {
    return Boolean(characters?.characters?.length||characters?.npcs?.length||characters?.persona||chat?.preferences||chat?.continuity?.items?.length||chat?.eventProfile||chat?.companionStores);
}
