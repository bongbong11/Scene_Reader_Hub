"""Verify Hub install files, data identifiers, bundled plugin and unchanged core."""
from pathlib import Path
import hashlib, json, re
root = Path(__file__).resolve().parents[1]
manifest = json.loads((root/'manifest.json').read_text(encoding='utf-8'))
package = json.loads((root/'package.json').read_text(encoding='utf-8'))
provenance = json.loads((root/'scripts/provenance.json').read_text(encoding='utf-8'))
lock = json.loads((root/'src/vendor/character-reasoner/sync.json').read_text(encoding='utf-8'))
assert package['version'] == manifest['version']
assert manifest['generate_interceptor'] == 'SceneReaderHubBeforeGenerate'
assert lock['sourceDirty'] is False
assert lock['sourceCommit'] == provenance['characterCommit']
assert hashlib.sha256((root/'src/vendor/character-reasoner/index.js').read_bytes()).hexdigest() == lock['sha256']
plugin = json.loads((root/'server-plugin/package.json').read_text(encoding='utf-8'))
assert plugin['version'] == provenance['sharedPluginVersion']
for relative, expected in provenance['sharedPluginFiles'].items():
    assert hashlib.sha256((root/relative).read_bytes().replace(b'\r\n', b'\n')).hexdigest() == expected, relative
assert hashlib.sha256((root/'server-plugin/vendor/character-core.mjs').read_bytes()).hexdigest() == lock['sha256']
assert set(provenance['sharedPluginFiles']) == {str(file.relative_to(root)).replace('\\', '/') for file in (root/'server-plugin').rglob('*') if file.is_file()}
contract = (root/'src/storage/contract.js').read_text(encoding='utf-8')
for value in ['sceneReader','scene-reader-router','scene-reader-world','scene-reader-state-capture','sceneReader.jevApiKey','/api/plugins/scene-reader-jev/systemone','/api/plugins/scene-reader-jev/storage','scene-reader-state','chat-snapshots']:
    assert repr(value) in contract, value
for doc in ['README.md','CHANGELOG.md']:
    for target in re.findall(r'\]\(([^)]+)\)', (root/doc).read_text(encoding='utf-8')):
        prefix = 'https://raw.githubusercontent.com/bongbong11/Scene_Reader_Hub/main/'
        if target.startswith(prefix):
            assert (root/target.removeprefix(prefix)).is_file(), target
        elif not target.startswith(('https://','http://','#')):
            assert (root/doc).parent.joinpath(target.split('#')[0]).is_file(), (doc,target)
for relative in [manifest['js'],manifest['css'],'README.md','CHANGELOG.md','src/app/bootstrap.js','src/hub/orchestrator.js','src/hub/pipeline.js','src/hub/state.js','src/lifecycle/generation.js','src/adapters/generation-interceptor.js','src/injection/receipt.js','src/ui/trace.js','src/vendor/character-reasoner/index.js','src/scene/appearance.js','src/continuity/json-parser.js','src/retrieval/vectors.js','src/storage/contract.js','src/character/record-protection.js','src/character/record-questions.js','src/character/record-allocation.js','assets/mascot-face.webp','assets/mascot-face-error.png','src/ui/current-status.js','src/ui/current-status-model.js']:
    assert (root/relative).is_file(), relative
for pose in ['director','reading','success','warning','error','cover','peek','wave']:
    assert (root/f'assets/toasts/{pose}.webp').is_file(), pose
files = sorted(root.glob('*.js')) + sorted((root/'src').rglob('*.js'))
for file in files:
    for spec in re.findall(r"(?:from\s+|import\s*)['\"]([^'\"]+)['\"]", file.read_text(encoding='utf-8')):
        if not spec.startswith('.'): continue
        dependency = (file.parent/spec).resolve()
        if dependency.is_relative_to(root):
            assert dependency.is_file(), (file.relative_to(root),spec)
assert not list((root/'downloads').glob('scene-reader-hub-v*.zip'))
assert not list((root/'downloads').glob('scene-reader-sillytavern-v*.zip'))
print(f"Hub GitHub install passed: {manifest['version']}, plugin {plugin['version']}, original data identifiers, unchanged character core, entry points, assets and complete imports.")
