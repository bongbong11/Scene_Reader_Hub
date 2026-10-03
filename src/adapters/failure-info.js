// Describe failures without copying upstream bodies, URLs, keys or model output.
export function requestFailure(error, service, label) {
    const cause = error?.cause?.cause || error?.cause || error;
    const status = Number(error?.httpStatus || error?.status || cause?.status || cause?.response?.status) || 0;
    let kind = /TIMEOUT/.test(error?.code || '') ? 'TIMEOUT'
        : error?.name === 'AbortError' ? 'CANCELLED'
        : status === 401 ? 'AUTH_FAILED'
        : status === 403 ? 'FORBIDDEN'
        : status === 429 ? 'RATE_LIMIT'
        : status === 402 ? 'BILLING'
        : status === 413 ? 'REQUEST_TOO_LARGE'
        : status === 404 ? 'NOT_FOUND'
        : status >= 500 ? 'SERVER_ERROR'
        : status >= 400 ? 'REQUEST_REJECTED'
        : /INVALID|FORMAT/.test(error?.code || '') || cause instanceof SyntaxError ? 'INVALID_RESPONSE'
        : 'NETWORK_ERROR';
    const next = {
        TIMEOUT:'응답 시간이 초과되었습니다. 연결 상태를 확인한 뒤 다시 시도하세요.',
        CANCELLED:'작업이 취소되었습니다.',
        AUTH_FAILED:'키 인증에 실패했습니다. 키 발급처와 저장된 키를 확인하세요.',
        FORBIDDEN:'접근이 거절되었습니다. 키 제한·서비스 권한·서버 접근 설정을 확인하세요.',
        RATE_LIMIT:'요청 한도에 도달했습니다. 잠시 후 다시 시도하세요.',
        BILLING:'결제·사용 한도를 확인하세요.',
        REQUEST_TOO_LARGE:'요청 크기가 서버 한도를 넘었습니다. 전체 진단 로그를 확인해 주세요.',
        NOT_FOUND:'연결 주소 또는 모델을 찾지 못했습니다. 연결 설정을 확인하세요.',
        SERVER_ERROR:'서버에서 오류를 반환했습니다. 잠시 후 다시 시도하세요.',
        REQUEST_REJECTED:'요청이 거절되었습니다. 연결 설정과 전체 진단 로그를 확인하세요.',
        INVALID_RESPONSE:'응답 형식을 확인하지 못했습니다. 저장된 정보는 유지하고 다시 시도하세요.',
        NETWORK_ERROR:'연결하지 못했습니다. 인터넷과 서비스 연결을 확인하세요.',
    };
    return Object.assign(new Error(`${label} · ${next[kind]}${status ? ` (${status})` : ''}`), {code:`${service}_${kind}`,httpStatus:status});
}
