import {sha256Fallback} from '../shared/security.js';
export const SHARED_PREFIX='scene-reader:shared:v1|';
export const SHARED_LINK='sharedLinkV1';
export const clone=value=>value==null?value:structuredClone(value);
export const object=value=>Boolean(value && typeof value==='object' && !Array.isArray(value));
export const fail=(code,message)=>Object.assign(new Error(message),{code});
export function canonical(value) {
    if(Array.isArray(value))return '['+Array.from(value,item=>canonical(item ?? null)).join(',')+']';
    if(object(value))return '{'+Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
    return JSON.stringify(value);
}
export const digest=value=>sha256Fallback(canonical(value));
export const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
export const chatRef=key=>sha256Fallback(String(key));
export const ownerRef=key=>chatRef(String(key).split('|chat:')[0]);
export const documentKey=(kind,id)=>SHARED_PREFIX+kind+'|'+id;
export function envelope(kind,id,data,revision=1,operationId='') {
    if(!/^[a-z_]{1,32}$/.test(kind)||!/^[a-zA-Z0-9:_-]{1,180}$/.test(id)||!object(data))throw fail('SHARED_DOCUMENT_INVALID','공유 자료 형식을 확인하지 못했습니다.');
    const document={schemaVersion:1,kind,id,revision,operationId,contentHash:digest(data),data:clone(data)};
    if(bytes(document)>128*1048576)throw fail('SHARED_STORAGE_TOO_LARGE','자료가 현재 등록 한도를 넘습니다. 기존 자료는 유지합니다.');
    return {hubDocument:document};
}
export function decode(value,kind,id) {
    if(value==null)return null;
    const doc=value.hubDocument;
    if(!object(doc)||doc.schemaVersion!==1||doc.kind!==kind||doc.id!==id||!object(doc.data)||doc.contentHash!==digest(doc.data))throw fail('SHARED_DOCUMENT_INVALID','공유 자료의 형식이나 저장 검증 결과가 맞지 않습니다. 원본 복구를 사용해 주세요.');
    return clone(doc);
}
