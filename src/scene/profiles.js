

export const NPC_TABLES = {
    natural: ['practical contact', 'neutral intermediary', 'local participant', 'recurring acquaintance', 'service or institutional contact', 'person affected by the current situation'],
    daily: ['friend or acquaintance', 'coworker or school contact', 'neighbor', 'family-adjacent contact', 'customer or guest', 'local service worker'],
    adventure: ['client or quest giver', 'guide or scout', 'merchant or supplier', 'guard or local authority', 'traveler or specialist', 'person needing rescue or assistance'],
    investigation: ['witness', 'informant', 'suspect', 'victim-adjacent contact', 'investigative or institutional contact', 'scene or evidence custodian'],
    survival: ['survivor', 'person seeking help', 'local resident', 'authority or responder', 'witness to the threat', 'stranger with limited useful access'],
    intrigue: ['aide or subordinate', 'envoy or intermediary', 'official', 'information broker', 'journalist or observer', 'representative of a competing interest'],
    military: ['commander or deputy', 'ordinary service member', 'scout or intelligence contact', 'medic or logistics worker', 'civilian or local liaison', 'prisoner, defector, or member of another unit'],
};

export const NPC_OPTIONS = {
    access: ['chance access to the current location', 'work, service, or institutional access', 'social-circle or family-adjacent access', 'access through an existing participant', 'official or professional access', 'recurring local access'],
    aim: ['obtain practical help', 'protect their own position', 'complete an obligation', 'exchange something useful', 'avoid blame or loss', 'push an immediate personal interest'],
    contribution: ['a limited piece of information', 'a practical opportunity', 'a demand or condition', 'a complication tied to the current situation', 'access to a person, place, or resource', 'a consequence from an earlier event'],
    leverage: ['little leverage beyond persistence', 'temporary situational access', 'roughly equal footing', 'social or reputational influence', 'institutional or material resources', 'narrow expertise relevant to the scene'],
    competence: ['clumsy or inexperienced', 'limited but persistent', 'ordinarily capable', 'practically skilled', 'well prepared in a narrow relevant area', 'highly capable without being all-knowing'],
    demeanor: ['open and direct', 'guarded and cautious', 'nervous or conflicted', 'formal and controlled', 'friendly but self-interested', 'impatient or demanding'],
    reliability: ['mostly reliable but incomplete', 'honest yet mistaken about one point', 'selective and self-protective', 'mixed truth and omission', 'credible only within their direct experience', 'unreliable outside a narrow useful detail'],
    stake: ['personal safety', 'reputation or status', 'an existing loyalty or relationship', 'duty or professional standing', 'money, property, or access', 'avoiding blame, exposure, or punishment'],
    constraint: ['limited time or access', 'fear of a specific consequence', 'an obligation to another person or group', 'incomplete information', 'limited authority or resources', 'a personal boundary they will not casually cross'],
    turningCondition: ['credible proof changes their assessment', 'a concrete cost changes their cooperation', 'someone they value becomes affected', 'their own responsibility is exposed', 'a safer or more profitable option appears', 'an established promise, rule, or loyalty is invoked'],
    entry: ['approaches the current participants', 'is brought in by an existing obligation', 'contacts someone through an available channel', 'is encountered while pursuing their own task', 'arrives because of a concrete consequence', 'reappears after an earlier connection becomes relevant'],
    duration: ['until one exchange is complete', 'until their immediate goal is answered', 'while the current scene remains relevant', 'until a promised follow-up', 'until a practical task ends', 'as a recurring contact when continuity supports it'],
};

export function pick(list, random = Math.random) {
    return list[Math.floor(random() * list.length)];
}

export function rollNpcProfile(mode, random = Math.random) {
    const roles = NPC_TABLES[mode] || NPC_TABLES.natural;
    return {
        id: `npc-${Date.now()}-${Math.floor(random() * 10000)}`,
        mode,
        status: 'pending',
        role: pick(roles, random),
        access: pick(NPC_OPTIONS.access, random),
        aim: pick(NPC_OPTIONS.aim, random),
        contribution: pick(NPC_OPTIONS.contribution, random),
        leverage: pick(NPC_OPTIONS.leverage, random),
        competence: pick(NPC_OPTIONS.competence, random),
        demeanor: pick(NPC_OPTIONS.demeanor, random),
        reliability: pick(NPC_OPTIONS.reliability, random),
        stake: pick(NPC_OPTIONS.stake, random),
        constraint: pick(NPC_OPTIONS.constraint, random),
        turningCondition: pick(NPC_OPTIONS.turningCondition, random),
        entry: pick(NPC_OPTIONS.entry, random),
        duration: pick(NPC_OPTIONS.duration, random),
        createdAt: new Date().toISOString(),
    };
}

export const EVENT_TABLES = {
    natural: [
        { title: '남겨진 약속의 결과', trigger: '이전에 한 약속이나 미룬 일이 다시 영향을 미침', goal: '약속의 이행·변경·거절을 선택', pressure: '미룰수록 관계나 선택지가 달라짐', resolution: '당사자가 실제 선택을 하고 결과를 감당함', prompt: 'Bring one earlier promise, delay, or unfinished obligation back through a concrete consequence. Require a real choice; do not add an unrelated crisis.' },
        { title: '뜻밖의 실용적 기회', trigger: '현재 목표와 연결되는 연락·제안·빈자리가 생김', goal: '기회를 받을지 조건을 조정할지 결정', pressure: '기회에는 시간·책임·대가가 붙음', resolution: '조건을 확인하고 실제로 수락하거나 포기함', prompt: 'Introduce one practical opportunity tied to an established aim. Give it a specific condition or cost and leave acceptance to the participants.' },
        { title: '이전 선택의 후속 반응', trigger: '앞선 행동을 알게 된 인물이나 조직이 반응함', goal: '생긴 평판·접근·관계 변화를 처리', pressure: '반응을 무시해도 결과가 남음', resolution: '원인이 된 행동과 현재 결과가 연결됨', prompt: 'Make one earlier choice produce a proportionate social, practical, or relational response now. Preserve the causal link and its remaining consequences.' },
        { title: '현재 계획의 작은 균열', trigger: '정보 누락·시간 차질·상충하는 요구가 드러남', goal: '계획을 수정하거나 우선순위를 선택', pressure: '모든 요구를 동시에 만족시킬 수 없음', resolution: '한 가지 우선순위를 실제 행동으로 정함', prompt: 'Expose one concrete flaw, missing fact, delay, or competing demand in the current plan. Force one priority decision without turning it into a new large plot.' },
    ],
    daily: [
        { title: '겹친 일정과 의무', trigger: '두 생활 일정이나 약속이 충돌함', goal: '무엇을 우선할지 결정', pressure: '선택하지 않은 쪽에도 현실적인 반응이 생김', resolution: '일정 선택과 후속 연락을 실제로 실행', prompt: 'Create one grounded conflict between two existing appointments, duties, or expectations. Make the choice and its ordinary consequence concrete.' },
        { title: '생활권의 반복 문제', trigger: '집·학교·직장·이웃의 문제가 다시 발생함', goal: '당장의 불편과 원인을 처리', pressure: '방치하면 비용이나 관계 마찰이 커짐', resolution: '실제 조치와 남은 책임이 정해짐', prompt: 'Bring one recurring home, school, work, or neighborhood problem into the current routine. Advance it through a practical action rather than summary.' },
        { title: '엇갈린 연락', trigger: '연락 누락·잘못 전달된 말·답장 지연이 드러남', goal: '누가 무엇을 알고 있는지 확인', pressure: '추측대로 행동하면 오해가 커질 수 있음', resolution: '연락 경로와 실제 사실을 확인', prompt: 'Introduce one plausible missed message, delayed reply, or miscommunication. Let characters discover and respond to it without inventing a larger conspiracy.' },
        { title: '작은 성취의 기회', trigger: '준비해 온 일에 현실적인 기회가 생김', goal: '성과를 얻기 위한 마지막 행동 실행', pressure: '시간·노력·다른 의무 중 하나를 지불', resolution: '행동 결과와 주변 반응이 나타남', prompt: 'Offer one earned everyday success or welcome opportunity. Require one concrete final effort or tradeoff and show its immediate result.' },
    ],
    adventure: [
        { title: '막힌 경로와 우회로', trigger: '기존 이동 경로가 위험·봉쇄·붕괴로 막힘', goal: '우회·돌파·후퇴 중 선택', pressure: '시간·자원·위험이 서로 다름', resolution: '경로를 선택하고 첫 결과를 감당', prompt: 'Block the established route with one relevant hazard. Present distinct costs for detour, breakthrough, or retreat and execute only the chosen approach.' },
        { title: '대가가 붙은 협력', trigger: '목표에 접근할 수 있는 인물이 조건을 제시함', goal: '조건을 수락·협상·거절', pressure: '도움 없이 진행하면 다른 비용이 커짐', resolution: '거래 여부와 실제 접근 변화가 확정됨', prompt: 'Offer useful access or aid through a person with a concrete price or condition. Do not make cooperation free, automatic, or fully trustworthy.' },
        { title: '목표와 연결된 발견', trigger: '장소·물건·흔적이 기존 목표와 연결됨', goal: '조사하거나 회수하거나 지나칠지 선택', pressure: '머무르면 위험이나 시간이 증가', resolution: '발견의 일부 기능이 확인됨', prompt: 'Reveal one actionable discovery tied to the current objective. Give enough information for a choice while preserving its larger origin or consequence.' },
        { title: '이전 행동의 추격', trigger: '앞선 침입·탈출·전투의 상대가 따라붙음', goal: '숨기·협상·대치·도주 중 선택', pressure: '과거 흔적이나 손실이 현재 선택을 제한', resolution: '한 단계의 추격 결과가 발생', prompt: 'Let an earlier intrusion, escape, theft, or confrontation produce a concrete pursuit or interception. Preserve prior losses and available means.' },
    ],
    investigation: [
        { title: '진술의 핵심 모순', trigger: '기존 진술 두 개가 한 사실에서 충돌함', goal: '어느 부분이 틀렸는지 확인', pressure: '관련자가 설명을 바꾸거나 접근을 차단할 수 있음', resolution: '모순의 원인은 좁혀지지만 최종 답은 남음', prompt: 'Expose one precise contradiction between established statements or facts. Make it actionable while withholding the final explanation.' },
        { title: '사라질 수 있는 증거', trigger: '현재 접근 가능한 증거가 곧 훼손·이동될 상황', goal: '확보·기록·추적 중 하나를 실행', pressure: '시간이 지나면 일부 정보가 영구히 사라짐', resolution: '무엇을 보존했고 무엇을 놓쳤는지 확정', prompt: 'Put one relevant piece of evidence at credible risk of loss, alteration, or removal. Require an immediate investigative choice and preserve what is missed.' },
        { title: '증인의 조건부 협조', trigger: '아는 것이 있는 인물이 조건이나 두려움을 밝힘', goal: '협조 조건을 해결하거나 다른 경로 탐색', pressure: '강압·설득·보호마다 다른 후속 결과', resolution: '제한된 정보 하나가 검증 가능한 형태로 나옴', prompt: 'Present a witness or informant with a concrete reason to withhold information. Allow one limited, verifiable disclosure if their condition is addressed.' },
        { title: '용의자의 선제 행동', trigger: '조사가 자신에게 향하는 것을 눈치챈 인물이 움직임', goal: '행동의 목적과 대상을 파악', pressure: '지연하면 정보·사람·장소에 접근하기 어려워짐', resolution: '선제 행동의 직접 결과가 발생', prompt: 'Let a relevant suspect or interested party take one plausible preemptive action. Show its trace or consequence without confirming guilt.' },
    ],
    survival: [
        { title: '필수 자원의 급감', trigger: '물·식량·약품·연료 중 하나의 실제 부족이 확인됨', goal: '배분·탐색·대체 수단 선택', pressure: '모든 사람이나 목표를 동시에 충족할 수 없음', resolution: '자원 선택과 즉각적 손실이 확정됨', prompt: 'Make one essential resource concretely insufficient. Require allocation, search, or substitution and preserve the cost of what is not supplied.' },
        { title: '안전 구역의 결함', trigger: '피난처나 방어선의 약점이 드러남', goal: '보수·이동·유인책 중 선택', pressure: '준비 시간과 노출 위험이 충돌', resolution: '선택한 방어 방식의 첫 효과가 나타남', prompt: 'Reveal one specific weakness in the current shelter, route, or defense. Force one practical response without adding an unrelated threat.' },
        { title: '부상과 이동의 충돌', trigger: '부상자의 상태가 현재 이동 계획과 맞지 않음', goal: '속도·치료·분리 여부 결정', pressure: '어느 선택에도 생존 비용이 있음', resolution: '결정한 방식으로 이동이나 치료가 실제 진행', prompt: 'Make an established injury materially conflict with movement or safety. Require a choice among speed, treatment, assistance, or separation and carry its cost.' },
        { title: '제한된 구조 기회', trigger: '구조 신호·통로·지원이 불완전하게 열림', goal: '접근 조건을 충족하거나 포기', pressure: '기회는 짧고 위험이나 대가가 동반됨', resolution: '구조 가능성이 실제로 커지거나 사라짐', prompt: 'Offer one limited rescue or escape opening with a concrete risk, requirement, or deadline. Do not guarantee success before the attempt.' },
    ],
    intrigue: [
        { title: '조건부 비밀 거래', trigger: '정보나 지위를 가진 인물이 은밀한 조건을 제시함', goal: '수락·역제안·폭로·거절', pressure: '선택이 다른 세력과의 관계를 바꿈', resolution: '거래 여부와 첫 정치적 결과가 확정됨', prompt: 'Introduce one secret offer with a specific price and factional consequence. Let acceptance, counteroffer, exposure, or refusal materially change leverage.' },
        { title: '통제되지 않은 소문', trigger: '기존 행동을 왜곡한 소문이 퍼지기 시작함', goal: '부인·이용·출처 추적 중 선택', pressure: '침묵과 대응 모두 평판 비용이 있음', resolution: '한 집단의 태도나 접근이 실제로 달라짐', prompt: 'Let one plausible rumor distort an established action or relationship. Make one audience react and require a strategic response.' },
        { title: '동맹 내부의 이탈 신호', trigger: '협력자가 명령·약속·정보 공유에서 벗어남', goal: '이유 확인·압박·교체·양보', pressure: '성급한 대응은 공개 분열을 만들 수 있음', resolution: '충성·이익·두려움 중 핵심 동기가 일부 드러남', prompt: 'Show one concrete sign that an ally or subordinate is deviating from the arrangement. Reveal a limited motive through their action, not an omniscient explanation.' },
        { title: '권한을 이용한 압박', trigger: '기관·직책·규칙이 현재 목표를 제한함', goal: '복종·우회·협상·공개 충돌 선택', pressure: '각 방식이 접근·평판·법적 위험을 바꿈', resolution: '권한 관계가 실제 선택지 하나를 열거나 닫음', prompt: 'Use one established office, rule, or authority to impose a concrete restriction or demand. Let the response change access, standing, or exposure.' },
    ],
    military: [
        { title: '불완전한 작전 정보', trigger: '명령의 전제가 되는 정보가 오래됐거나 상충함', goal: '확인·수정·위험 감수 중 선택', pressure: '확인에는 시간이, 강행에는 피해 위험이 듦', resolution: '명령이나 이동 계획이 실제로 조정됨', prompt: 'Expose one operational assumption as outdated, incomplete, or conflicting. Require verification, revision, or a deliberate risk before proceeding.' },
        { title: '병참선의 단절', trigger: '탄약·연료·의료·수송 중 하나가 예정대로 도착하지 않음', goal: '재배분·회수·대체·임무 축소', pressure: '모든 부대와 목표를 유지할 수 없음', resolution: '자원 배치와 포기한 능력이 확정됨', prompt: 'Interrupt one relevant supply, transport, medical, or fuel line. Force a concrete reallocation or reduction and carry the operational cost.' },
        { title: '명령과 현장 판단의 충돌', trigger: '상급 명령이 현재 확인된 현장 상황과 맞지 않음', goal: '복종·수정 요청·독자 행동 결정', pressure: '작전 위험과 지휘 책임이 동시에 발생', resolution: '명령 선택과 즉각적 지휘 결과가 드러남', prompt: 'Create one specific conflict between standing orders and verified field conditions. Require a command decision and preserve both tactical and disciplinary consequences.' },
        { title: '예상 밖의 접촉', trigger: '민간인·아군·적군·미확인 세력과 접촉함', goal: '식별·교전·협상·우회', pressure: '오판하면 임무·인명·정보에 손실이 생김', resolution: '접촉 대상의 일부 의도와 첫 결과가 확인됨', prompt: 'Introduce one plausible unexpected contact relevant to the operation. Require identification and a response before revealing full intent or affiliation.' },
    ],
};

export function rollEventProfile(mode, random = Math.random) {
    const entries = EVENT_TABLES[mode] || EVENT_TABLES.natural;
    const selected = entries[Math.floor(random() * entries.length)];
    return { id: `event-${Date.now()}-${Math.floor(random() * 10000)}`, mode, status: 'active', phase: 'introduced', progress: 0, createdAt: new Date().toISOString(), ...selected };
}

export const VILLAIN_OPTIONS = {
    access: ['chance stranger or one-off contact', 'service, transaction, venue, or public-setting contact', 'work, school, institutional, or professional contact', 'social-circle, family-adjacent, neighbor, or acquaintance access', 'established familiarity or recurring access, only where continuity supports it', 'intermediary, representative, associate, or third-party access'],
    leverage: ['little real leverage; mostly nerve, persistence, or nuisance value', 'temporary situational advantage', 'roughly equal footing', 'social or reputational advantage', 'institutional, financial, or network leverage', "strong authority or resources, within the scene's plausible ceiling"],
    motive: ['entitlement or self-interest', 'money, material gain, or access to something useful', 'attention, desire, attraction, or possessiveness', 'jealousy, insecurity, or status competition', 'resentment, grievance, or wounded pride', 'control, dominance, or the need to make someone comply', 'opportunism, convenience, or taking advantage of an opening', 'sincere but intrusive concern, ideology, righteousness, or certainty that they know best'],
    method: ['verbal provocation, insult, humiliation, or deliberate needling', 'obstruction, refusal, gatekeeping, or making ordinary access difficult', 'intrusive demands, harassment, boundary-pushing, or refusing to leave something alone', 'deception, scam, manipulation, concealment, or a misleading offer', 'social or reputational pressure, rumor, public embarrassment, or status play', 'threat, coercive leverage, blackmail, or an ultimatum', 'unwanted pursuit, flirting, fixation, possessiveness, or personal intrusion', 'exploitation or abuse of a role, system, money, authority, or dependence', 'physical intimidation or direct aggression when access and the scene support it', 'proxy pressure, sabotage, complaints, intermediaries, or third-party interference'],
    competence: ['clumsy, transparent, or easy to read', 'limited skill but persistent enough to cause trouble', 'ordinary competence', 'socially or practically capable', 'shrewd, prepared, and good at the chosen tactic', 'highly capable in a narrow relevant way, not automatically a mastermind'],
    composure: ['openly volatile or quick to flare', 'irritable, defensive, or easily provoked', 'pushy, brazen, shameless, or socially invasive', 'controlled and socially presentable', 'cold, patient, calculating, or quietly persistent', 'mixed or unstable presentation that may shift under pressure'],
};

export function rollVillainProfile(random = Math.random) {
    return Object.fromEntries(Object.entries(VILLAIN_OPTIONS).map(([key, values]) => [key, pick(values, random)]));
}
