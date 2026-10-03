export function setCharacterImportMode(document, mode) {
    const root = document.getElementById('sr-character-import-modes');
    if (!root) return;
    root.dataset.mode = mode === 'multi' ? 'multi' : 'single';
    (document.querySelectorAll?.('[data-character-import-mode]') || []).forEach(button => {
        const active = button.dataset.characterImportMode === root.dataset.mode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
    });
    const cast = document.getElementById('sr-character-cast-row');
    if (cast) cast.hidden = root.hidden || root.dataset.mode !== 'multi';
    const copy = document.getElementById('sr-character-copy-prompt');
    if (copy) copy.textContent = root.hidden || root.dataset.mode === 'single' ? '분석 명령문 복사' : '다인 캐릭터 분석 명령문 복사';
}
export function characterImportMode(document) {
    const root = document.getElementById('sr-character-import-modes');
    return root && !root.hidden && root.dataset.mode === 'multi' ? 'multi' : 'single';
}
