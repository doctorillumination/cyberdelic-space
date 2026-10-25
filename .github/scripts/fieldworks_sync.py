#!/usr/bin/env python3
"""Trusted, bounded installer for artifact releases. Never executes release code."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile
import time

from mirror_archive import build_core_mirror

SCHEMA = 'cyberdelic.space/fieldwork-release-v1'
SUFFIXES = {'.html', '.js', '.css', '.bin', '.svg', '.png', '.jpg', '.woff', '.woff2', '.ttf', '.txt'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def safe(name):
    p = PurePosixPath(name)
    if not name or p.is_absolute() or '..' in p.parts or '\\' in name or str(p) != name:
        raise ValueError('Unsafe release path: ' + name)
    return p


def validate(bundle):
    data = json.loads((bundle / 'manifest.json').read_text())
    if data['schema'] != SCHEMA or data['slug'] not in ('aeria', 'lumen'):
        raise ValueError('Unknown release schema or artwork')
    if len(data['files']) > 102 or len({f['path'] for f in data['files']}) != len(data['files']):
        raise ValueError('Duplicate or excessive files')
    expected = {'manifest.json'}
    for f in data['files']:
        p = safe(f['path'])
        if str(p) not in ('poster.jpg', 'preview.mp4') and (p.parts[0] != 'runtime' or p.suffix not in SUFFIXES):
            raise ValueError('Unexpected release asset')
        target = bundle / str(p)
        if target.is_symlink() or not target.resolve().is_relative_to(bundle.resolve()):
            raise ValueError('Linked release asset')
        content = target.read_bytes()
        if len(content) != f['length'] or sha(content) != f['sha256'] or len(content) > 3*1024*1024:
            raise ValueError('Release asset integrity failed: ' + str(p))
        if p.suffix == '.js':
            subprocess.run(['node', '--check', str(target)], capture_output=True, check=True)
        expected.add(str(p))
    actual = {p.relative_to(bundle).as_posix() for p in bundle.rglob('*') if p.is_file()}
    if actual != expected or 'runtime/index.html' not in expected or not {'poster.jpg', 'preview.mp4'} <= expected:
        raise ValueError('Incomplete or extra release files')
    if sum(f['length'] for f in data['files']) > 12*1024*1024:
        raise ValueError('Release exceeds total budget')
    if sha(json.dumps(data['files'], sort_keys=True).encode()) != data['release_id']:
        raise ValueError('Release identity failed')
    snapshot = data['source_record']
    if snapshot['slug'] != data['slug'] or snapshot['edition'] != data['edition']:
        raise ValueError('Source identity differs')
    held = {f['path']: f['sha256'] for f in snapshot['packaged_files']}
    actual_runtime = {f['path'][8:]: f['sha256'] for f in data['files'] if f['path'].startswith('runtime/')}
    if held != actual_runtime:
        raise ValueError('Runtime does not match source record')
    if data['capture']['source_snapshot_sha256'] != sha(json.dumps(snapshot['packaged_files'], sort_keys=True).encode()):
        raise ValueError('Cover does not belong to this artwork snapshot')
    if not (bundle / 'poster.jpg').read_bytes().startswith(b'\xff\xd8\xff'):
        raise ValueError('Invalid still cover')
    if (bundle / 'preview.mp4').read_bytes()[4:8] != b'ftyp':
        raise ValueError('Invalid moving cover')
    probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(bundle / 'preview.mp4')]))
    streams = probe['streams']
    if len(streams) != 1 or streams[0]['codec_name'] != 'h264' or streams[0]['width'] != 960 or streams[0]['height'] != 720 or not 4 <= float(probe['format']['duration']) <= 12:
        raise ValueError('Expected a bounded silent H.264 moving cover')
    return data


def install(site, bundle):
    data = validate(bundle)
    slug = data['slug']
    catalog_path = site / 'fieldworks.json'
    catalog = json.loads(catalog_path.read_text())
    item = next(i for i in catalog['items'] if i['slug'] == slug)
    if item.get('edition') != data['edition']:
        raise ValueError('This edition needs a reviewed introduction and matching narration before automatic release')
    if item.get('release_id') == data['release_id']:
        return data, []
    if item.get('runtime_published_at', '') > data['published_at']:
        raise ValueError('A newer release is already installed')
    stamp = datetime.fromisoformat(data['published_at'].replace('Z', '+00:00'))
    if (stamp - datetime.now(timezone.utc)).total_seconds() > 300:
        raise ValueError('Release timestamp is in the future')
    sources_path = site / 'fieldworks/sources.json'
    sources = json.loads(sources_path.read_text())
    old = next(i for i in sources['items'] if i['slug'] == slug)
    runtime_root = site / 'fieldwork-runtime' / slug
    old_files = {r['path'] for r in old['packaged_files']}
    new_files = {r['path'] for r in data['source_record']['packaged_files']}
    allowed = {f'fieldwork-runtime/{slug}/{p}' for p in old_files | new_files}
    allowed |= {'fieldworks.json', 'fieldworks/sources.json', 'fieldworks/previews/captures.json',
                f'fieldworks/images/{slug}.jpg', f'fieldworks/previews/{slug}.mp4',
                f'fieldworks/releases/{data["release_id"]}.json', 'cyberdelic-space.zip'}
    protected = {p: sha(p.read_bytes()) for p in site.rglob('*') if p.is_file()
                 and not {'.git', '__pycache__'}.intersection(p.relative_to(site).parts)
                 and p.relative_to(site).as_posix() not in allowed}
    # Only exact prior-manifest files can be removed, and Git retains them.
    for name in old_files - new_files:
        safe(name)
        (runtime_root / name).unlink()
    for f in data['files']:
        if f['path'].startswith('runtime/'):
            dest = runtime_root / f['path'][8:]
        else:
            dest = site / ('fieldworks/images/' + slug + '.jpg' if f['path'] == 'poster.jpg' else 'fieldworks/previews/' + slug + '.mp4')
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes((bundle / f['path']).read_bytes())
    item.update(release_id=data['release_id'], runtime_published_at=data['published_at'])
    for key, name, kind in [('poster', 'poster.jpg', 'actual-browser-capture'), ('preview', 'preview.mp4', 'recorded-artwork-loop')]:
        f = next(f for f in data['files'] if f['path'] == name)
        item[key].update(sha256=f['sha256'], length=f['length'], kind=kind)
    dump(catalog_path, catalog)
    sources['items'] = [{**data['source_record'], 'release_id': data['release_id']} if s['slug'] == slug else s for s in sources['items']]
    dump(sources_path, sources)
    captures_path = site / 'fieldworks/previews/captures.json'
    captures = json.loads(captures_path.read_text())
    movie = next(f for f in data['files'] if f['path'] == 'preview.mp4')
    capture = {**data['capture'], 'slug': slug, 'path': slug + '.mp4', 'sha256': movie['sha256'], 'length': movie['length']}
    captures['items'] = [capture if c['slug'] == slug else c for c in captures['items']]
    dump(captures_path, captures)
    history = site / 'fieldworks/releases' / (data['release_id'] + '.json')
    history.parent.mkdir(exist_ok=True)
    dump(history, data)
    build_core_mirror(site)
    for p, digest in protected.items():
        if not p.is_file() or sha(p.read_bytes()) != digest:
            raise ValueError('Protected site content changed: ' + str(p))
    return data, sorted(allowed)


def fetch_bundle(site, ref):
    if not re.fullmatch(r'fieldworks-release/(aeria|lumen)/[a-f0-9]{20}', ref):
        raise ValueError('Invalid release reference')
    subprocess.run(['git', 'fetch', '--quiet', '--depth=1', 'origin', ref], cwd=site, check=True)
    names = subprocess.check_output(['git', 'ls-tree', '-r', 'FETCH_HEAD', '--', '.fieldwork-release'], cwd=site, text=True).splitlines()
    bundle = Path(tempfile.mkdtemp(prefix='checked-fieldwork-'))
    for entry in names:
        mode, kind, remainder = entry.split(' ', 2)
        _, name = remainder.split('\t', 1)
        if mode != '100644' or kind != 'blob' or not name.startswith('.fieldwork-release/'):
            raise ValueError('Unexpected release tree entry')
        relative = name[len('.fieldwork-release/'):]
        safe(relative)
        p = bundle / relative
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(subprocess.check_output(['git', 'show', 'FETCH_HEAD:' + name], cwd=site))
    data = validate(bundle)
    if ref != 'fieldworks-release/' + data['slug'] + '/' + data['release_id'][:20]:
        raise ValueError('Reference does not identify the release')
    return bundle


def verify_live(site, paths, attempts=72):
    expected = {name: (site / name).read_bytes() for name in paths if (site / name).is_file()}
    def matches(pair):
        name, data = pair
        route = name[:-10] if name.endswith('index.html') else name
        result = subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location', '--compressed', '--max-time', '30', 'https://cyberdelic.space/' + route], capture_output=True)
        return result.returncode == 0 and result.stdout == data
    for _ in range(attempts):
        with ThreadPoolExecutor(max_workers=8) as pool:
            if all(pool.map(matches, expected.items())):
                print(f'Verified {len(expected)} deployed resources against this release.', flush=True)
                return
        time.sleep(10)
    raise ValueError('Production did not match this release within the verification window')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', type=Path, default=Path.cwd())
    parser.add_argument('--ref', required=True)
    args = parser.parse_args()
    site = args.site.resolve()
    bundle = fetch_bundle(site, args.ref)
    data, paths = install(site, bundle)
    if paths:
        subprocess.run(['git', 'add', '--', *paths], cwd=site, check=True)
        subprocess.run(['git', '-c', 'user.name=Fieldworks sync', '-c', 'user.email=fieldworks-sync@users.noreply.github.com',
                        'commit', '-m', 'Sync ' + data['slug'] + ' release ' + data['release_id'][:12]], cwd=site, check=True)
        subprocess.run(['git', 'push', 'origin', 'HEAD:main'], cwd=site, check=True)
    verify_live(site, paths or [f'fieldwork-runtime/{data["slug"]}/index.html', 'fieldworks.json'])
