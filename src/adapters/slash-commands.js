// Public Quick Reply commands route through the same Hub services as the UI.
export function registerSlashCommands(deps) {
    const {SlashCommandParser:parser,SlashCommand:Command,SlashCommandArgument:Argument,ARGUMENT_TYPE:types}=deps.getContext();
    if (!parser?.addCommandObject || !Command?.fromProps || !Argument?.fromProps) {
        deps.noteDiagnostic('slash_commands_unavailable');
        return [];
    }
    const json=value=>JSON.stringify(value);
    const toggle=(value,current)=>{
        const mode=String(value||'status').trim().toLowerCase();
        if(mode==='status')return null;
        if(mode==='on')return true;
        if(mode==='off')return false;
        if(mode==='toggle')return !current;
        throw new Error('on, off, toggle, status 중 하나를 입력하세요.');
    };
    const switchSetting=async(key,value)=>{
        const next=toggle(value,deps.settings[key]);
        if(next!==null){
            await deps.saveGlobal(key,next);
            if(key==='enabled'&&!next){deps.invalidateReasonerJobs();await deps.clearInjection();}
            deps.setFormValues();
        }
        return json({[key]:Boolean(deps.settings[key])});
    };
    const definitions=[
        {name:'srh-open',help:'씬판독기 창을 엽니다.',run:()=>{deps.openSceneReader();return '';}},
        {name:'srh-judge',help:'지금 판독 버튼과 동일하게 판독·주입 준비가 끝날 때까지 기다립니다. 채팅 답변을 생성하지 않습니다. 입력창이 슬래시 명령이면 RP 입력으로 읽지 않습니다.',run:async()=>{
            const text=String(deps.document.getElementById('send_textarea')?.value||'').trim();
            const result=await deps.hub.commands.dispatch('judge',{force:true,pendingUserText:text.startsWith('/')?'':text,trigger:'slash'});
            return json({status:result?'prepared':'skipped',scene:result?.sceneIntimacy?.route||null,judgedAt:result?.judgedAt||null});
        }},
        {name:'srh-auto',help:'자동 판독 설정. 예: /srh-auto on 또는 /srh-auto off. 인수를 생략하면 상태만 반환합니다.',mode:true,run:value=>switchSetting('autoJudge',value)},
        {name:'srh-enabled',help:'확장 전체 사용 설정. off는 판독·주입을 중단합니다. 예: /srh-enabled on. 인수 생략 시 상태만 반환합니다.',mode:true,run:value=>switchSetting('enabled',value)},
        {name:'srh-clear',help:'진행 중인 Hub 판독을 취소하고 현재 등록된 주입문을 비웁니다. 저장 데이터는 유지하며 다음 판독·생성 때 주입될 수 있습니다. 지속 중단은 /srh-enabled off를 사용하세요.',run:async()=>{
            deps.hub.invalidate('slash_clear');deps.invalidateReasonerJobs();await deps.clearInjection();deps.updateStatus('현재 주입 해제 · 다음 판독부터 다시 준비');return json({status:'cleared'});
        }},
        {name:'srh-status',help:'설정·실행 단계·주입 길이를 JSON으로 반환합니다. 화면 표시 예: /srh-status | /echo {{pipe}}. 채팅 원문과 키는 포함하지 않습니다.',run:()=>{
            const snapshot=deps.diagnosticSnapshot();
            return json({enabled:snapshot.automatic.enabled,autoJudge:snapshot.automatic.autoJudge,chatReady:snapshot.automatic.chatReady,state:snapshot.hub?.state?.status||'idle',scene:snapshot.scene.route,judgedAt:snapshot.automatic.lastJudgmentAt,injectionChars:snapshot.injection.activeChars,worldChars:snapshot.injection.worldChars});
        }},
    ];
    for(const item of definitions)parser.addCommandObject(Command.fromProps({
        name:item.name,helpString:item.help,returns:item.name==='srh-open'?'빈 문자열':'JSON 상태 (채팅에 자동 전송하지 않음)',
        unnamedArgumentList:item.mode?[Argument.fromProps({description:'on / off / toggle / status',typeList:[types.STRING],isRequired:false,defaultValue:'status',enumList:['on','off','toggle','status']})]:[],
        callback:async(_args,value)=>{
            deps.noteDiagnostic('slash_command_started',{command:item.name});
            try{const result=await item.run(value);deps.noteDiagnostic('slash_command_finished',{command:item.name});return result;}
            catch(error){deps.noteDiagnostic('slash_command_failed',{command:item.name});throw error;}
        },
    }));
    return definitions.map(item=>item.name);
}
