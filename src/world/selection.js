// Extracted from Scene Reader 0.26.2; behavior preserved.
export function createWorldSelection(deps) {
function availableWorlds() {
    return deps.allWorlds(deps.BUILTIN_WORLDS, deps.loadCustomWorlds());
}

function selectedWorld(rec = deps.record()) {
    const worlds = availableWorlds();
    return worlds.find((world) => world.id === rec?.preferences?.selectedWorldId) || worlds[0];
}
return {availableWorlds, selectedWorld};
}
