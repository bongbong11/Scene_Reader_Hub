import {hash53,recordText} from './identity.js';

// Keep installed hashes. Recognize the schema and storage-sorted layouts as
// equivalent only when every field and array value is still identical.
export function recordHashes(kind,item,index) {
    const fields=kind==='world'?['id','category','when','rule','keywords']:['type','target','when','rule','modality','basis','source_ids','knowledge_domain','knowledge_state'];
    const keys=Object.keys(item),ordered=[...fields.filter(key=>keys.includes(key)),...keys.filter(key=>!fields.includes(key)).sort()];
    const layouts=[item,Object.fromEntries(ordered.map(key=>[key,item[key]])),Object.fromEntries(keys.sort().map(key=>[key,item[key]]))];
    return [...new Set(layouts.map(value=>hash53(JSON.stringify([kind,item.id||index,value,recordText(kind,item)]))))];
}

export function requirePreparedIndex(result) {
    if(result?.preparationFailed)throw Object.assign(new Error(result.error||'필요한 임베딩을 준비하지 못했습니다. 재시도해 주세요.'),{code:result.code||'EMBEDDING_PREPARATION_FAILED'});
    return result;
}
