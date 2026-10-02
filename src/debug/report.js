// Debug export is deliberately user-reviewed and never persisted with chat state.
export function debugReportText(report, privatePrompt = '') {
    const safe = { ...report };
    if (privatePrompt && typeof safe.finalInjection === 'string') safe.finalInjection = safe.finalInjection.replaceAll(privatePrompt, '[private prompt omitted]');
    return JSON.stringify(safe, null, 2)
        .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,})\b/g, '[key redacted]')
        .replace(/Bearer\s+[A-Za-z0-9._~-]{8,}/gi, 'Bearer [key redacted]')
        .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email redacted]')
        .replace(/\b(?:\+?82[- ]?)?0?1[016789][- ]?\d{3,4}[- ]?\d{4}\b/g, '[phone redacted]');
}
