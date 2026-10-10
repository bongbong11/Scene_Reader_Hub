import {splitOocText,isVisibleRoleplayMessage} from '../context/messages.js';
import {selectedStateSwipe} from '../character/state-contract.js';
export function sourceRp(message){if(!isVisibleRoleplayMessage(message)||message.extra?.ooc_chat)return '';const value=splitOocText(message.mes);return value.malformed?'':value.rpText.trim();}
export function messageRef(chatRef,chat,index,fingerprint){const m=chat[index];return {originChatRef:chatRef,messageIndex:index,role:m?.is_user?'user':'assistant',swipeId:selectedStateSwipe(m),contentHash:fingerprint(String(m?.mes||''))};}
export function validateSourceRefs(refs,{chatRef,chat,fingerprint}){return refs.every(ref=>{const m=chat[ref.messageIndex];return ref.originChatRef===chatRef&&m&&Boolean(sourceRp(m))&&ref.role===(m.is_user?'user':'assistant')&&ref.swipeId===selectedStateSwipe(m)&&ref.contentHash===fingerprint(String(m.mes||''));});}
