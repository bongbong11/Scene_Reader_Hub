import {visibilitySnapshot,visibilityChanges,visibilityKey} from '../context/visibility.js';
import {refreshSourceEligibility} from '../continuity/source-eligibility.js';
import {createDeltaCommit} from '../continuity/delta-commit.js';
export function createVisibilityLifecycle(deps) {
 const {commitDeltaTransaction}=createDeltaCommit(deps);
 const snapshots=new Map();let pending=Promise.resolve();
 const report=(code,status,details={})=>deps.noteDiagnostic?.('visibility',{module:'src/lifecycle/visibility.js',code,status,...details});
 function check({notify=true}={}){
  const key=deps.stateChatKey(),chat=deps.getContext().chat||[],next=visibilitySnapshot(chat),before=snapshots.get(key);
  snapshots.set(key,next);
  const changes=visibilityChanges(before,next),record=deps.record(),stamp=visibilityKey(chat);
  const restored=!before&&record?.lastJudgment&&(record.lastJudgment.visibilityKeyV1??'visible')!==stamp;
  if(!changes.length&&!restored)return pending;
  // Cancel before any asynchronous save, so late analysis cannot publish.
  const afterSend=Boolean(deps.getInjection?.()?.requestSent);
  deps.invalidateTransport?.(deps.getInjection?.());
  deps.invalidateReasonerJobs({reason:'visibility_changed'});
  const cleanup=Promise.resolve(deps.clearInjection({chatKey:key})).then(()=>null,error=>error);
  report('VISIBILITY_CHANGED','info',{messageCount:changes.length,hiddenCount:changes.filter(c=>c.hidden).length});
  pending=pending.catch(()=>{}).then(async()=>{
   try{
    const cleanupError=await cleanup;if(cleanupError)throw cleanupError;if(key!==deps.stateChatKey())return;
    const current=()=>key===deps.stateChatKey()&&stamp===visibilityKey(deps.getContext().chat||[]);
    const saved=await commitDeltaTransaction(key,({current:rec,history})=>{
     rec.lastJudgment=null;rec.pendingPlan=null;rec.sceneIntimacy=null;rec.lastVerification=null;
     refreshSourceEligibility(rec,{chatRef:key,chat:deps.getContext().chat,fingerprint:deps.fingerprint});
     rec.visibilityStateV1={key:stamp,status:'applied'};
     return {chat:rec,history};
    },current);
    if(!saved||!current())return;
    report(afterSend?'VISIBILITY_AFTER_SEND':'VISIBILITY_APPLIED','info',{messageCount:changes.length});deps.renderAll();
    if(notify&&changes.length)deps.notify?.(afterSend?'숨김 반영 · 이미 전송된 답변에는 다음 실행부터 적용됩니다.':changes.every(c=>!c.hidden)?'숨김 해제 반영 · 다음 판독에서 다시 참고합니다.':'숨김 반영 · 다음 판독부터 보이는 대화만 사용합니다.');
   }catch(error){report('VISIBILITY_FAILED','failed',{errorKind:typeof error?.code==='string'?error.code:'VISIBILITY_FAILED'});if(key===deps.stateChatKey())deps.notify?.('숨김 반영에 실패했습니다. 상태 버튼에서 확인해 주세요.','error');}
  });return pending;
 }
 return {check,reset(){snapshots.delete(deps.stateChatKey());},get completion(){return pending;}};
}
