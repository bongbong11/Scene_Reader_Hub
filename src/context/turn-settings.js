export function recentTurnCount(settings = {}) {
    return Math.max(1, Math.min(5, Math.trunc(Number(settings.recentTurns) || 3)));
}

export function renderRecentTurns(document, settings) {
    const select = document.getElementById('sr-recent-turns');
    if (!select) return;
    select.innerHTML = [1, 2, 3, 4, 5]
        .map(count => `<option value="${count}">최근 ${count}턴</option>`).join('');
    select.value = String(recentTurnCount(settings));
}
