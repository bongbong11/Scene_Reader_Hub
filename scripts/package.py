"""Build a deterministic Hub-only installation archive. Existing server plugin is shared."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import json, hashlib, re, argparse
root = Path(__file__).resolve().parents[1]
version = json.loads((root/'manifest.json').read_text(encoding='utf-8'))['version']
parser = argparse.ArgumentParser()
parser.add_argument('--output-dir', type=Path, default=root/'downloads')
out = parser.parse_args().output_dir
out.mkdir(parents=True, exist_ok=True)
files = sorted(root.glob('*.js')) + sorted((root/'src').rglob('*.js'))
files += sorted((root/'src/vendor').rglob('sync.json')) + sorted((root/'assets').rglob('*.webp'))
files += [root/p for p in ['manifest.json','package.json','style.css','README.md','CHANGELOG.md']]
target = out/f'scene-reader-hub-v{version}.zip'
with ZipFile(target, 'w', ZIP_DEFLATED, compresslevel=9) as archive:
    for file in sorted(set(files)):
        relative = file.relative_to(root)
        info = ZipInfo('Scene_Reader_Hub/'+relative.as_posix(), date_time=(2026,10,2,0,0,0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, file.read_bytes())
with ZipFile(target) as archive:
    assert archive.testzip() is None
    names = set(archive.namelist())
    assert not any('/server-plugin/' in n or '/tests/' in n or '/docs/' in n or '/artifacts/' in n or 'secrets.json' in n for n in names)
    for file in files:
        relative = file.relative_to(root)
        assert archive.read('Scene_Reader_Hub/'+relative.as_posix()) == file.read_bytes()
        if file.suffix == '.js':
            for spec in re.findall(r"(?:from\s+|import\s*)['\"]([^'\"]+)['\"]", file.read_text(encoding='utf-8')):
                if not spec.startswith('.'): continue
                dependency = (file.parent/spec).resolve()
                if dependency.is_relative_to(root):
                    assert 'Scene_Reader_Hub/'+dependency.relative_to(root).as_posix() in names, (relative,spec)
print(f'{target.name}: {len(names)} files, {target.stat().st_size:,} bytes, SHA256 {hashlib.sha256(target.read_bytes()).hexdigest()}')
