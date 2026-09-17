from pathlib import Path
import json, re

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / 'src/index.template.html').read_text(encoding='utf-8')
APP = json.loads((ROOT / 'app.config.json').read_text(encoding='utf-8'))
DEPS = json.loads((ROOT / 'dependencies.json').read_text(encoding='utf-8'))

# v0.8.1 must render PDF previews itself rather than handing blob: URLs to the browser PDF viewer.
assert tuple(map(int, APP['version'].split('.'))) >= (0, 8, 1), APP['version']
assert 'id="pdfPreviewCanvas"' in SRC
assert 'id="tilePdfCanvas"' in SRC
assert 'window.open(`${url}#page=' not in SRC
assert 'PDF VECTOR' not in SRC
assert 'else if(!pdfSource){' in SRC  # keep a neutral empty-state tile preview without faking PDF content

# The embedded PDF.js runtime is loaded from StandaloneAssets and its worker is also local.
assert "StandaloneAssets.importModule('pdfjs', 'main')" in SRC
assert "StandaloneAssets.blobUrlAsync('pdfjs', 'worker')" in SRC
assert 'pdfjsLib.GlobalWorkerOptions.workerSrc' in SRC

pdfjs = next((d for d in DEPS['dependencies'] if d.get('id') == 'pdfjs'), None)
assert pdfjs, 'pdfjs dependency missing'
assert pdfjs['package'] == 'pdfjs-dist'
assert pdfjs['version'] == '6.3.289'
assert {a['key'] for a in pdfjs['assets']} >= {'main', 'worker'}
paths = {a['key']: a['path'] for a in pdfjs['assets']}
assert paths['main'] == 'legacy/build/pdf.min.mjs'
assert paths['worker'] == 'legacy/build/pdf.worker.min.mjs'

# Rendering is async and stale renders are discarded when files/pages/settings change.
assert 'pdfPreviewRenderGeneration' in SRC
assert 'tilePreviewRenderGeneration' in SRC
assert re.search(r'async function renderPdfPageToCanvas\(', SRC)
assert re.search(r'async function renderMainPdfPreview\(', SRC)
assert re.search(r'async function renderGeneratedTilePdfPreview\(', SRC)
assert 'const sourceToken = sourceGeneration;' in SRC
assert 'const pageToken = activePdfPageIndex;' in SRC
assert 'sourceToken !== sourceGeneration' in SRC
assert 'pageToken !== activePdfPageIndex' in SRC
assert 'pdfSource !== source' in SRC

# Pixel-level regression helper is exposed only for tests, allowing Playwright to verify nonblank canvases.
assert 'window.__largePrintTilerTest' in SRC
assert 'canvasHasInk' in SRC
assert 'return { width: viewport.width, height: viewport.height };' in SRC
assert 'return { width: viewport.width, height: viewport.height, hasInk: canvasHasInk(canvas) };' not in SRC

print('v0.8.1 PDF.js Canvas preview source checks passed')
