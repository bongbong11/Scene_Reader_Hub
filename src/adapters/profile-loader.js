

export function createProfileLoader(deps) {
async function loadReasonerProfiles() {
    try {
        deps.connectionRequestService ||= (await import('/scripts/extensions/shared.js')).ConnectionManagerRequestService;
        deps.reasonerProfiles = deps.listConnectionProfiles(deps.connectionRequestService);
        deps.reasonerProfileError = '';
    } catch (error) {
        deps.reasonerProfiles = [];
        deps.reasonerProfileError = error?.message || 'SillyTavern 연결 프로필을 읽을 수 없습니다.';
    }
    deps.renderReasonerProfiles();
}
return {loadReasonerProfiles};
}
