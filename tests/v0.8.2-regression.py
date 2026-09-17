from pathlib import Path
import json, re

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / 'src/index.template.html').read_text(encoding='utf-8')
APP = json.loads((ROOT / 'app.config.json').read_text(encoding='utf-8'))

# The generated tile PDF must be rendered into a canvas that follows PDF.js's
# actual page viewport. Do not force the canvas to the configured paper width
# and height independently: that can stretch the preview when page boxes differ.
tile_fn = re.search(r'async function renderGeneratedTilePdfPreview\(.*?\n      \}', SRC, re.S)
assert tile_fn, 'renderGeneratedTilePdfPreview missing'
tile_src = tile_fn.group(0)
assert 'canvasCssWidth' not in tile_src, 'tile preview must not force a separate canvas width'
assert 'canvasCssHeight' not in tile_src, 'tile preview must not force a separate canvas height'

# Zooming the PDF preview may set width, but height must follow the canvas
# intrinsic aspect ratio. The SVG fallback keeps explicit paper dimensions.
zoom_fn = re.search(r'function setTileZoom\(value\)\{.*?\n      \}', SRC, re.S)
assert zoom_fn, 'setTileZoom missing'
zoom_src = zoom_fn.group(0)
assert "pdfCanvas.style.height='auto'" in zoom_src or 'pdfCanvas.style.height = \'auto\'' in zoom_src
assert 'pdfCanvas.style.width' in zoom_src

assert tuple(int(part) for part in APP['version'].split('.')) >= (0, 8, 2), APP['version']

print('v0.8.2 tile preview aspect-ratio source checks passed')
