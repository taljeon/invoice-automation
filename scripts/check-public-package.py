#!/usr/bin/env python3
"""Scan only exportable package files; findings contain locations, never matched values."""
from pathlib import Path
import re, sys, json
ROOT = Path(__file__).resolve().parents[1]
SKIP = {'.git', 'node_modules', 'dist', 'coverage', '__pycache__', '.firebase'}
PATTERNS = {
    'private-key': r'-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----',
    'github-token': r'\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}',
    'api-secret': r'\bsk-[A-Za-z0-9_-]{20,}|\bAIza[0-9A-Za-z_-]{20,}',
    'aws-secret': r'\b(?:AKIA|ASIA)[0-9A-Z]{16}\b',
    'local-home-path': r'(?:/Users/|/home/)[A-Za-z0-9._-]+|[A-Za-z]:\\Users\\',
    'personal-email': r'\b[A-Z0-9._%+-]+@(?!example\.(?:com|org|net)\b)[A-Z0-9.-]+\.[A-Z]{2,}\b',
    'client-ai-secret-setting': r'VITE_(?:OPENAI|GOOGLE_CLOUD|VISION)_API_KEY',
}
findings=[];files=[]
for p in sorted(ROOT.rglob('*')):
    rel=p.relative_to(ROOT)
    if any(part in SKIP for part in rel.parts) or rel.parts[:2] == ('functions', 'lib'): continue
    if not p.is_file(): continue
    files.append(p)
    if p.name.startswith('.env') and p.name!='.env.example':
        findings.append({'path':str(rel),'check':'environment file'});continue
    if p.name in {'.firebaserc','.runtimeconfig.json'} or p.suffix.lower() in {'.db','.sqlite','.sqlite3','.pem','.key','.xlsx','.docx','.log'}:
        findings.append({'path':str(rel),'check':'private artifact path'});continue
    if p.is_symlink():
        findings.append({'path':str(rel),'check':'symbolic link'});continue
    if p.suffix.lower() in {'.png','.jpg','.jpeg','.pdf','.zip'}:
        findings.append({'path':str(rel),'check':'unreviewed binary artifact'});continue
    try: text=p.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        findings.append({'path':str(rel),'check':'unknown binary'});continue
    for num,line in enumerate(text.splitlines(),1):
        for label,pattern in PATTERNS.items():
            if re.search(pattern,line,re.I if label=='personal-email' else 0):
                findings.append({'path':str(rel),'line':num,'check':label})
    if p.name=='.env.example':
        for num,line in enumerate(text.splitlines(),1):
            if '=' not in line or line.lstrip().startswith('#'):continue
            key,value=line.split('=',1)
            if re.search(r'(?:SECRET|PASSWORD|PRIVATE_KEY|OPENAI_API_KEY)',key) and value.strip():
                findings.append({'path':str(rel),'line':num,'check':'example credential value'})
print(json.dumps({'files_checked':len(files),'findings':findings},ensure_ascii=False,indent=2))
sys.exit(bool(findings))
