from pathlib import Path
import base64, gzip, hashlib, json, re

ROOT = Path(__file__).resolve().parents[1]
APP = json.loads((ROOT / 'app.config.json').read_text(encoding='utf-8'))
SRC = (ROOT / 'src/index.template.html').read_text(encoding='utf-8')
README = (ROOT / 'README.md').read_text(encoding='utf-8')
README_JA = (ROOT / 'README.ja.md').read_text(encoding='utf-8')
SPEC = (ROOT / 'APP_SPEC.md').read_text(encoding='utf-8')
DEPS = json.loads((ROOT / 'dependencies.json').read_text(encoding='utf-8'))
LOCK = json.loads((ROOT / 'dependencies.lock.json').read_text(encoding='utf-8'))
HTML = (ROOT / 'dist/index.html').read_bytes()
SELF = (ROOT / 'dist/index.self-extract.html').read_text(encoding='ascii')
MANIFEST = json.loads((ROOT / 'dist/dependency-manifest.json').read_text(encoding='utf-8'))

assert APP['version'] == '1.0.0', APP['version']
assert 'id="versionBadge">v1.0.0<' in SRC
assert 'Current milestone: v1.0.0' in README
assert 'initial stable release' in README.lower()
assert '現在の開発段階: v1.0.0' in README_JA
assert '初回正式版' in README_JA
assert '**Version:** 1.0.0' in SPEC
assert 'v1.0.0 Stable release scope' in SPEC
assert '**Current milestone: v0.9.0 Release Candidate**' not in README
assert 'v0.9.0 Release Candidate scope' not in SPEC

pdfjs = next(d for d in DEPS['dependencies'] if d['id'] == 'pdfjs')
locked = next(d for d in LOCK['dependencies'] if d['id'] == 'pdfjs')
assert pdfjs['version'] == locked['version'] == '6.3.289'
assert locked['tarballSha256'] == '06f25e887adc6489f04c9fcb14198c77e4e5623a59a0bba5c4cea5838a4f1241'
assert MANIFEST['app']['version'] == '1.0.0'
assert MANIFEST['dependencies'][0]['version'] == '6.3.289'

html_text = HTML.decode('utf-8')
assert "connect-src 'none'" in html_text
for pattern in [
    r'<script[^>]+src=["\']https?://',
    r'<(?:iframe|frame)[^>]+src=["\']https?://',
    r'<link[^>]+href=["\']https?://',
]:
    assert not re.search(pattern, html_text, re.I), pattern

# favicon and upper-left app icon must embed exactly the same SVG bytes.
icon_bytes = (ROOT / 'assets/favicon.svg').read_bytes()
icon_b64 = base64.b64encode(icon_bytes).decode('ascii')
assert html_text.count('data:image/svg+xml;base64,' + icon_b64) >= 2

# Self-extract payload must restore readable standalone HTML byte-for-byte.
payload = re.search(r'<script id="self-extract-payload" type="application/octet-stream">(.*?)</script>', SELF, re.S)
assert payload, 'self-extract payload missing'
restored = gzip.decompress(base64.b64decode(payload.group(1)))
assert restored == HTML
source_sha = re.search(r'<meta name="self-extract-source-sha256" content="([0-9a-f]+)">', SELF)
assert source_sha and source_sha.group(1) == hashlib.sha256(HTML).hexdigest()

for name in ['screenshot.png', 'screenshot-en.png', 'screenshot-mobile.png']:
    p = ROOT / 'assets' / name
    assert p.exists() and p.stat().st_size > 10_000, name

print('v1.0.0 stable-release artifact checks passed')
