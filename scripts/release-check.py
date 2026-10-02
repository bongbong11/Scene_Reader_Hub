"""Verify Hub install bytes, imports, data identifiers and unchanged shared plugin/core."""
from pathlib import Path
from zipfile import ZipFile
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
for relative, expected in provenance['sharedPluginFiles'].items():
    assert hashlib.sha256((root/relative).read_bytes()).hexdigest() == expected, relative
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
archive_path = root/'downloads'/f"scene-reader-hub-v{manifest['version']}.zip"
with ZipFile(archive_path) as archive:
    assert archive.testzip() is None
    names = archive.namelist()
    assert len(names) == len(set(names))
    for name in names:
        relative = Path(name).relative_to('Scene_Reader_Hub')
        assert '..' not in relative.parts
        assert not any(part in ['.git','.github','tests','artifacts','node_modules','docs','server-plugin'] for part in relative.parts), name
        assert archive.read(name) == (root/relative).read_bytes(), name
    for relative in ['index.js','manifest.json','style.css','README.md','CHANGELOG.md','src/app/bootstrap.js','src/hub/orchestrator.js','src/hub/pipeline.js','src/hub/state.js','src/lifecycle/generation.js','src/adapters/generation-interceptor.js','src/injection/receipt.js','src/ui/trace.js','src/vendor/character-reasoner/index.js','src/scene/appearance.js','src/continuity/json-parser.js','src/retrieval/vectors.js','src/storage/contract.js','assets/mascot-face.webp']:
        assert 'Scene_Reader_Hub/'+relative in names, relative
    for pose in ['director','reading','success','warning','error','cover','peek','wave']:
        assert f'Scene_Reader_Hub/assets/toasts/{pose}.webp' in names
    for name in names:
        if not name.endswith('.js'): continue
        file = root/Path(name).relative_to('Scene_Reader_Hub')
        for spec in re.findall(r"(?:from\s+|import\s*)['\"]([^'\"]+)['\"]", file.read_text(encoding='utf-8')):
            if not spec.startswith('.'): continue
            dependency = (file.parent/spec).resolve()
            if dependency.is_relative_to(root):
                assert 'Scene_Reader_Hub/'+dependency.relative_to(root).as_posix() in names, (name,spec)
assert len(list((root/'downloads').glob('scene-reader-hub-v*.zip'))) == 1
assert not list((root/'downloads').glob('scene-reader-sillytavern-v*.zip'))
print(f"Hub release passed: {manifest['version']}, original data identifiers, unchanged core/shared plugin, current bytes and complete imports.")
