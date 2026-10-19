"""Build the plugin ZIP and verified one-command updater manifest."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
plugin = root / 'server-plugin'
package = json.loads((plugin / 'package.json').read_text(encoding='utf-8'))
files = sorted(p for p in plugin.rglob('*') if p.is_file())
contents = {p: p.read_bytes().replace(b'\r\n', b'\n') for p in files}
provenance_path = root / 'scripts/provenance.json'
provenance = json.loads(provenance_path.read_text(encoding='utf-8'))
provenance['sharedPluginVersion'] = package['version']
provenance['sharedPluginFiles'] = {
    p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes().replace(b'\r\n', b'\n')).hexdigest()
    for p in files
}
provenance_path.write_text(json.dumps(provenance, indent=2) + '\n', encoding='utf-8')
manifest = {'name': package['name'], 'version': package['version'], 'files': [
    {'path': p.relative_to(plugin).as_posix(), 'bytes': len(contents[p]),
     'sha256': hashlib.sha256(contents[p]).hexdigest()} for p in files
]}
(root / 'downloads/plugin-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
with zipfile.ZipFile(root / f"downloads/scene-reader-jev-plugin-v{package['version']}.zip", 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in files:
        info = zipfile.ZipInfo('scene-reader-jev/' + file.relative_to(plugin).as_posix(), (2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, contents[file])
print(f"Packaged plugin {package['version']}: {len(files)} files")
