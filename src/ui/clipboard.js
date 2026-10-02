// Extracted from Scene Reader 0.26.2; behavior preserved.
export function createClipboard(deps) {
async function copyText(value) {
    const textarea = deps.document.createElement('textarea');
    textarea.value = value;
    textarea.readOnly = true;
    textarea.style.position = 'fixed';
    textarea.style.left = '-10000px';
    textarea.style.top = '0';
    textarea.style.opacity = '0';
    const host = deps.dialog?.open ? deps.dialog : deps.document.body;
    host.append(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = deps.document.execCommand('copy');
    textarea.remove();
    if (copied) return;
    if (deps.navigator.clipboard?.writeText) {
        await deps.navigator.clipboard.writeText(value);
        return;
    }
    throw new Error('copy failed');
}
return {copyText};
}
