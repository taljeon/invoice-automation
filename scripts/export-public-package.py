#!/usr/bin/env python3
"""Build a reviewed source-only archive without Git, local settings, or build output."""
from pathlib import Path
import hashlib, json, subprocess, sys, zipfile
root=Path(__file__).resolve().parents[1]
subprocess.run([sys.executable,str(root/'scripts/check-public-package.py')],check=True)
skip={'node_modules','dist','coverage','__pycache__','.firebase','.git'}
paths=[]
for path in sorted(root.rglob('*')):
    rel=path.relative_to(root)
    if any(part in skip for part in rel.parts) or rel.parts[:2] == ('functions', 'lib') or not path.is_file():continue
    if path.is_symlink():raise SystemExit('Symbolic links are not exportable')
    if path.name.startswith('.env') and path.name!='.env.example':continue
    if path.name in {'.firebaserc','.runtimeconfig.json'}:continue
    paths.append(path)
archive=root.parent/(root.name+'.zip')
manifest=root.parent/(root.name+'.manifest.json')
rows=[]
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as output:
    for path in paths:
        rel=path.relative_to(root).as_posix();data=path.read_bytes()
        info=zipfile.ZipInfo(root.name+'/'+rel,date_time=(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
        info.external_attr=0o100644<<16
        output.writestr(info,data)
        rows.append({'path':rel,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
manifest.write_text(json.dumps({'package':root.name,'git_history_included':False,'source_file_count':len(rows),'archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'files':rows},ensure_ascii=False,indent=2)+'\n')
with zipfile.ZipFile(archive) as check:
    assert check.testzip() is None
    assert len(check.namelist())==len(rows)
    assert not any('.git' in Path(name).parts for name in check.namelist())
print(json.dumps({'archive':archive.name,'manifest':manifest.name,'files':len(rows),'archive_bytes':archive.stat().st_size},ensure_ascii=False))
