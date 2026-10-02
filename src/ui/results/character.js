import { currentRecords, RECORD_LABELS, recordBankIsCurrent } from "../../character/records.js";
import { ITEM_LABELS, currentProfileItems, profileStatus } from "../../character/index.js";
import { renderRecordVersions } from "../character-transfer.js";
import { latestStateForChat, latestStateEventForChat, stateForEntry } from "../../character/state-contract.js";

export function createCharacterView(deps) {
function characterTurnLabel(field, value) { return deps.CHARACTER_TURN_LABELS[field]?.[value] || '적용하지 않음'; }

function renderCharacterTurnResults() {
    const {settings, characterStore} = deps.readState();
    const root = deps.document.getElementById('sr-character-turn-results');
    if (!root) return;
    if (!characterStore.enabled) { root.innerHTML = '<div class="sr-empty-small">인물 판정을 켜면 이번 턴 결과를 표시합니다.</div>'; return; }
    for (const card of root.querySelectorAll?.('[data-character-card-key]') || []) deps.characterCardOpen.set(card.dataset.characterCardKey,card.open);
    const currentRecord=deps.record();
    const judgment = currentRecord?.lastJudgment || {};
    const latestEvent=latestStateEventForChat(currentRecord,deps.getContext().chat || [],deps.stableFingerprint);
    const storedCapture=latestEvent?.capture;
    const capture=storedCapture?.status==='collecting' && !deps.isStateCapturePending(storedCapture.requestId) ? {...storedCapture,status:'cancelled'} : storedCapture;
    const captureFailures={cancelled:'수집 중단 · 다음 응답부터 다시 수집',missing:'응답에 상태 정보 없음',opening:'모델의 감정값 태그를 읽지 못함',closing:'상태 정보가 중간에 끊김',trailing:'모델이 감정값을 중복 출력함',format:'모델의 감정값 형식을 읽지 못함',empty_output:'완성된 답변 없음',timeout:'응답 시간 초과',request:'연결 요청 실패',unavailable:'연결 설정 확인 필요',paused:'수집 쉬는 중'};
    const chat=deps.getContext().chat || [];
    const latestOutputIndex=chat.findLastIndex((message,index)=>!message.is_user&&!message.is_system&&!(currentRecord?.nonRpOutputIndices||[]).includes(index));
    const captureCurrent=capture?.outputIndex===latestOutputIndex ? capture : null;
    const captureReasons={unknown_person:'대상 인물을 식별하지 못함',field_format:'숫자·항목 표기 오류',unknown_field:'알 수 없는 감정 항목',duplicate_field:'같은 수치가 중복됨',out_of_range:'0~100을 벗어난 수치',disabled_field:'수집을 끈 항목이 포함됨',missing_fields:'필수 수치 누락',duplicate_person:'같은 인물이 중복됨',too_many_rows:'인물 행이 지나치게 많음',too_long:'상태 행이 지나치게 김',json_format:'JSON 형식 오류'};
    const captureReasonText=(captureCurrent?.diagnostics?.reasons||[]).map(reason=>captureReasons[reason]).filter(Boolean).join(' · ');
    const latestStates=latestStateForChat(currentRecord,chat,deps.stableFingerprint);
    const stateById=new Map(latestStates.map(state=>[state.id,state]));
    const moodNames={a:'충동',c:'자제',anger:'분노',joy:'기쁨',fear:'두려움',sadness:'슬픔'};
    root.onclick=event=>{
        const button=event.target.closest?.('[data-character-card-view]');
        if(!button||!root.contains(button))return;
        deps.characterCardViews.set(button.dataset.characterId,button.dataset.characterCardView);
        renderCharacterTurnResults();
    };
    const trace = [...(judgment?.characterTrace || [])];
    for(const id of new Set([...latestStates.map(state=>state.id),...(capture?.participantIds||[])])) {
        if(trace.some(person=>person.id===id))continue;
        const entry=[...characterStore.characters,...characterStore.npcs,characterStore.persona].filter(Boolean).find(item=>item.id===id);
        if(entry)trace.push({id:entry.id,name:entry.name,kind:entry.kind,index:trace.length,presence:'active',profileIds:[],emotionOnly:true});
    }
    if (!trace.length) { root.innerHTML = '<div class="sr-empty-small">이번 판독 범위에서 개별 판정할 저장 인물이 없었습니다.</div>'; return; }
    root.innerHTML = `<p class="sr-help">인물 주입 ${Number(judgment.characterInjectionChars)||0} / ${Number(judgment.characterInjectionLimit)||5000}자 · 육체 판정 ${Number(judgment.sexualInjectionChars)||0}자 · 갈등·세계관은 별도</p>` + trace.map((person) => {
        const prefix = 'character_' + person.index + '_';
        const presence = judgment.details?.[prefix + 'presence'];
        const direction = judgment.details?.[prefix + 'response_direction'];
        const status = person.emotionOnly ? '감정값 확인' : person.injected ? '이번 응답에 주입' : person.presence === 'active' ? '장면 판정만 · 별도 주입 없음' : person.presence === 'background' ? '배경 참고' : '미적용';
        const audit = [presence && ['장면 역할',presence],direction && ['반응 방향',direction]].filter(Boolean).map(([label,detail]) =>
            '<div class="sr-decision-row"><span>' + label + '</span><small>Jev ' + deps.escapeHtml(String(detail.selected || '응답 없음')) + ' → 확신 ' + Math.round((Number(detail.certainty)||0)*100) + '% / 기준 ' + Math.round((Number(detail.threshold)||0)*100) + '% → 최종 ' + deps.escapeHtml(String(detail.effective || '없음')) + ' · ' + deps.escapeHtml(detail.rule || (detail.fallbackApplied ? '확신도 부족 · 기본값 적용' : '선택 유지')) + '</small></div>').join('');
        const entry = [...characterStore.characters,...characterStore.npcs,characterStore.persona].filter(Boolean).find((item) => item.id === person.id);
        const profileNames = (person.injectedRuleIds || []).map((id) => (person.recordMode ? person.recordSelections || [] : currentProfileItems(entry)).find((item) => item.id === id)?.rule).filter(Boolean);
        const sexual = person.sexualConduct || judgment.sexualTrace?.find(item => item.id === person.id) || null;
        const rows = [
            ['이번 역할', characterTurnLabel('presence',person.presence)],
            ...(person.recordMode ? [['판독 기록 상태', ({ current:'새 인물 기록 사용', stale:'기록이 오래됨 · 다시 추출 필요', legacy:'이전 방식만 저장됨 · 새 기록 추출 필요', missing:'저장된 인물 기록 없음' })[person.recordStatus] || '기록 상태 확인 필요'], ['검색 상태', ({ready:'임베딩 검색',cached:'검색 결과 재사용',fallback:'글자 검색으로 대체',lexical:'글자 검색',plain:'검색 대상 없음'})[person.prefilterStats?.retrievalStatus] || person.prefilterStats?.retrievalStatus || '확인 필요'], ['저장 → 후보 → Jev 선택 → 실제 주입', `${person.storedRecordCount || 0} → ${person.candidateCount || 0} → ${(person.jevSelectedRuleIds || person.profileIds).length} → ${(person.injectedRuleIds || []).length}개`],['인물별 주입 길이',`${person.blockChars || 0}자`],...(person.zeroReason?[['선택 0개 이유',person.zeroReason]]:[])] : []),
            ...((person.prefilterStats?.excludedByChars || person.prefilterStats?.excludedByLimit) ? [['후보에서 제외',`개수 한도 ${person.prefilterStats.excludedByLimit || 0}개 · 후보 길이 한도 ${person.prefilterStats.excludedByChars || 0}개`]]:[]),
            ['사용한 시트 기준', profileNames.join(' / ') || '특별히 강조한 항목 없음'],
            ...((person.omittedBySlotRuleIds || []).length ? [['선택 개수 한도로 제외', `${person.omittedBySlotRuleIds.length}개 규칙 · 경계와 지식 제한 우선`]] : []),
            ...((person.excludedByPresenceRuleIds || []).length ? [['참여 판정으로 제외', `${person.excludedByPresenceRuleIds.length}개 규칙 · 이번 응답에 참여하지 않아 미적용`]] : []),
            ...((person.omittedRuleIds || []).length ? [['길이 제한으로 제외', `${person.omittedRuleIds.length}개 규칙 · 문장 중간을 자르지 않고 항목 전체 제외`]] : []),
            ['이번 정보 참고', (person.contextIds || []).length ? person.contextIds.length + '개 후보 중 접근이 확인된 항목만 사용' : '별도 정보 선택 없음'],
            ...(person.priorAffect?[['상태 표현 판정',(person.affectSelections||[]).map(item=>`${({a:'충동',anger:'분노',joy:'기쁨',fear:'두려움',sadness:'슬픔'})[item.field]} · ${({inward:'속마음·억제',visible:'대사·작은 행동',active:'인물에 맞는 직접 행동'})[item.expression]}`).join(' / ')||'이번 응답에 별도 반영 없음']]:[]),
            ...(sexual ? [['육체적 진행 단계',deps.SEXUAL_TURN_LABELS.pace[sexual.pace]||sexual.pace],['성적 자제력',deps.SEXUAL_TURN_LABELS.restraint[sexual.restraint]||'응답 확인 필요'],['행동 경로',deps.SEXUAL_TURN_LABELS.route[sexual.route]||'기존 프리셋에 맡김'],['행동 대상',deps.SEXUAL_TURN_LABELS.target[sexual.target]||'판정 없음'],['육체 판정 주입',sexual.valid?'별도 주입 적용':sexual.presence!=='active'?'이번 응답 참여 없음':'응답 누락·형식 오류로 기존 프리셋에 맡김']]:[]),
            ['지식 접근 제외', (person.deniedIds || []).length ? person.deniedIds.length + '개 · 해당 정보만 제외' : '없음'],
            ...(!person.recordMode ? [['반응 방향', characterTurnLabel('direction',person.direction)]] : []),
        ].map(([label,value]) => '<div class="sr-decision-row"><span>' + label + '</span><strong>' + deps.escapeHtml(value) + '</strong></div>').join('');
        const relevance = (person.relevance || []).map(item => `<div class="sr-decision-row"><span>${deps.escapeHtml(item.type || '기록')}</span><small>${deps.escapeHtml(item.id)} · 관련성 ${Math.round((Number(item.score)||0)*100)}% → ${item.selected?'선택':'제외'}${item.valid?'':' · 응답 오류'}</small></div>`).join('');
        const cardKey=String(deps.getContext().chatId || '')+':'+person.id;
        const view=deps.characterCardViews.get(person.id) || (person.emotionOnly?'emotion':'judgment');
        const saved=stateForEntry(stateById.get(person.id),entry)?.values || {};
        const neutral=Object.keys(saved).length>0&&!Object.values(saved).some(value=>value>0);
        const bars=Object.entries(moodNames).filter(([key])=>Number.isInteger(saved[key])&&(neutral||['a','c'].includes(key)||saved[key]>0)).map(([key,name])=>`<div class="sr-emotion-row"><span>${name}</span><div class="sr-emotion-track"><span style="width:${Math.max(0,Math.min(100,saved[key]))}%"></span></div><strong>${saved[key]}%</strong></div>`).join('');
        const emotionMessage=captureReasonText|| (captureCurrent?.status==='collecting'?'수집 중':captureCurrent?.status==='collected'||captureCurrent?.status==='empty'?'수집된 값 없음':captureCurrent?.status?captureFailures[captureCurrent.status]||'수집 실패':'수집된 값 없음');
        const emotion=bars||`<p class="sr-empty-small">${deps.escapeHtml(emotionMessage)}</p>`;
        const tabs=`<div class="sr-character-card-tabs" role="tablist" aria-label="${deps.escapeHtml(person.name)} 결과"><button type="button" role="tab" data-character-id="${deps.escapeHtml(person.id)}" data-character-card-view="judgment" aria-selected="${view==='judgment'}" class="${view==='judgment'?'active':''}">판정</button><button type="button" role="tab" data-character-id="${deps.escapeHtml(person.id)}" data-character-card-view="emotion" aria-selected="${view==='emotion'}" class="${view==='emotion'?'active':''}">감정값</button></div>`;
        return `<details class="sr-character-turn-card" data-character-card-key="${deps.escapeHtml(cardKey)}" ${deps.characterCardOpen.get(cardKey)?'open':''}><summary class="sr-character-card-heading"><span>` + deps.escapeHtml(person.name) + ' <small>' + deps.escapeHtml(person.kind === 'npc' ? 'NPC' : person.kind === 'persona' ? '페르소나' : '캐릭터') + ' · ' + status + '</small></span></summary>' + tabs + `<div class="sr-character-card-body" role="tabpanel" ${view==='emotion'?'hidden':''}>` + (person.emotionOnly?'<p class="sr-empty-small">감정값만 판독했습니다. 인물 기록 선택은 다음 장면 판독에서 확인하세요.</p>':rows) + (person.excludedReason ? '<p class="sr-help">' + deps.escapeHtml(person.excludedReason) + '</p>' : '') + (settings.showConfidence ? '<details class="sr-trace"><summary>판정 경로·확신도</summary>' + audit + relevance + '</details>' : '') + `</div><div class="sr-character-card-body" role="tabpanel" ${view==='judgment'?'hidden':''}>${emotion}</div></details>`;
    }).join('');
}

function renderCharacterStore() {
    const {settings, characterStore, backupList, reasonerProfiles, reasonerProfileError, characterAnalysisSelection, activeInjectionPayload} = deps.readState();
    renderRecordVersions(deps.document,characterStore,deps.escapeHtml);
    const enabled = deps.document.getElementById('sr-character-enabled');
    if (enabled) enabled.checked = characterStore.enabled;
    renderCharacterAnalysisBrowser();
}

function renderCharacterAnalysisBrowser() {
    if (deps.document.getElementById('sr-character-preview')?.hidden === false) return;
    const {settings, characterStore, backupList, reasonerProfiles, reasonerProfileError, characterAnalysisSelection, activeInjectionPayload} = deps.readState();
    const list = deps.document.getElementById('sr-character-analysis-list');
    const result = deps.document.getElementById('sr-character-analysis-result');
    if (!list || !result) return;
    const entries = [
        ...characterStore.characters.map((entry) => ({ ...entry, kind: 'character' })),
        ...(characterStore.persona ? [{ ...characterStore.persona, kind: 'persona' }] : []),
        ...characterStore.npcs.map((entry) => ({ ...entry, kind: 'npc' })),
    ];
    const selected = entries.find((entry) => entry.kind === characterAnalysisSelection.kind && entry.id === characterAnalysisSelection.id) || entries[0];
    deps.selectCharacter(selected ? { kind: selected.kind, id: selected.id } : { kind: '', id: '' });
    if (!list.hidden) list.innerHTML = entries.map((entry) => `<button type="button" class="sr-character-view${selected?.id === entry.id && selected?.kind === entry.kind ? ' active' : ''}" data-character-view-kind="${entry.kind}" data-character-view-id="${deps.escapeHtml(entry.id)}" aria-pressed="${selected?.id === entry.id && selected?.kind === entry.kind}"><span>${deps.escapeHtml(entry.name)}</span><small>${entry.kind === 'npc' ? 'NPC' : entry.kind === 'persona' ? '페르소나' : '캐릭터'}</small></button>`).join('') || '<div class="sr-empty-small">저장된 인물 없음</div>';
    if (!selected) { result.innerHTML = '<div class="sr-empty-small">시트를 저장하면 여기서 판독 기준을 확인할 수 있습니다.</div>'; return; }
    if (selected.recordBank) {
        const records = currentRecords(selected);
        const bank = selected.recordBank;
        const esc = deps.escapeHtml;
        const readable = value => ({fact:'확정 서술',habit:'습관',preference:'선호',tendency:'경향',conditional:'조건부',possibility:'가능성',negation:'부정·금지',explicit:'원문에 명시',direct_inference:'원문에서 직접 도출',knows:'알고 있음',believes:'믿고 있음',suspects:'의심함',doubts:'확신하지 못함',misunderstands:'잘못 이해함',does_not_know:'모름',none:'해당 없음',self:'자기 자신',person:'다른 인물',relationship:'관계',history:'과거',event:'사건',secret:'비밀',professional:'전문 분야',organization:'조직',world:'세계',current:'현재 상황'}[value] || value);
        const groups = Object.entries(RECORD_LABELS).map(([type,label]) => {
            const rows = records.map((record,index)=>({record,index})).filter(({record})=>record.type===type);
            if (!rows.length) return '';
            return '<details class="sr-record-group" open><summary>'+esc(label)+' · '+rows.length+'</summary>'+rows.map(({record,index})=>
                '<article class="sr-record-card"><p>'+esc(record.rule)+'</p><div class="sr-record-meta">'+esc(record.target || '특정 대상 없음')+' · '+esc(record.when.join(' / '))+'</div><details><summary>근거·상태·원문</summary><p class="sr-help">'+esc(readable(record.modality))+' · '+esc(readable(record.basis))+(record.type==='knowledge'?' · '+esc(readable(record.knowledge_domain))+' / '+esc(readable(record.knowledge_state)):'')+'</p>'+record.source_ids.map(id=>{
                    const source=bank.sources.find(item=>item.id===id);
                    return '<div class="sr-record-source"><strong>'+esc(id)+' · '+esc(source?.label || '')+'</strong><p>'+esc(source?.text || '원문 없음')+'</p></div>';
                }).join('')+'</details></article>').join('')+'</details>';
        }).join('');
        const reference=String(bank.intimacy_reference?.text||'').trim();
        result.innerHTML='<div class="sr-character-analysis-head"><strong>'+esc(selected.name)+'</strong></div><p class="sr-help">'+esc(profileStatus(selected))+'</p><p class="sr-help">이번 장면에 필요한 기록을 선택합니다. 필요 없으면 선택하지 않습니다.</p>'+(reference?'<details class="sr-record-group"><summary>추가 인물 참고 정보</summary><p>'+esc(reference)+'</p></details>':'')+ (groups || '<p class="sr-help">'+(recordBankIsCurrent(selected)?'저장된 기록 0개':'원문 변경으로 이전 기록은 적용되지 않습니다. 다시 추출하세요.')+'</p>')+'<details class="sr-trace"><summary>저장·검증 정보</summary><pre>'+esc(JSON.stringify({savedAt:bank.analyzedAt,apiVersion:bank.apiVersion,recordVersion:bank.recordVersion,compilerVersion:bank.compilerVersion,importLog:bank.import_log},null,2))+'</pre></details>';
        return;
    }
    const items = currentProfileItems(selected);
    const rejected = selected.profile?.sourceHash === selected.sourceHash ? selected.profile?.rejected || [] : [];
    const rows = items.map((item) => '<div class="sr-decision-row"><span>' + deps.escapeHtml(ITEM_LABELS[item.kind] || item.kind) + (item.target ? ' · ' + deps.escapeHtml(item.target) : '') + '</span><strong>' + deps.escapeHtml(item.rule) + '</strong></div>').join('');
    const rejectedRows = rejected.map((item) => '<div class="sr-decision-row"><span>제외 · ' + deps.escapeHtml(item.id) + '</span><strong>' + deps.escapeHtml(item.reason) + '</strong></div>').join('');
    result.innerHTML = '<div class="sr-character-analysis-head"><strong>' + deps.escapeHtml(selected.name) + '</strong></div>'
        + '<p class="sr-help">' + deps.escapeHtml(profileStatus(selected)) + ' · 원본 시트는 메인 모델에 ' + (selected.sourceVisibleToMain ? '이미 보입니다.' : '자동으로 보이지 않습니다.') + (selected.kind === 'npc' ? ' · 역할: ' + deps.escapeHtml(({villain:'악역',ally:'선역',mixed:'양면'})[selected.npcRole] || '양면') : '') + '</p>'
        + '<p class="sr-help">아래 규칙은 상시 주입되지 않습니다. Jev가 다음 응답에 필요한 항목을 최대 네 개 고릅니다.</p>'
        + (rows || '<p class="sr-help">이번 시트에서 저장할 만한 개별 규칙이 없습니다.</p>')
        + (rejectedRows ? '<details class="sr-trace"><summary>제외된 후보와 이유</summary>' + rejectedRows + '</details>' : '');

}
return {characterTurnLabel,renderCharacterTurnResults,renderCharacterStore,renderCharacterAnalysisBrowser};
}
