

export function createBackupForm(deps) {
function downloadJson(filename, value) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = deps.document.createElement('a');
    anchor.href = url; anchor.download = filename; deps.document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
return {downloadJson};
}
