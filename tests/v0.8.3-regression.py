from pathlib import Path
import json, re

ROOT = Path(__file__).resolve().parents[1]
SRC = (ROOT / 'src/index.template.html').read_text(encoding='utf-8')
APP = json.loads((ROOT / 'app.config.json').read_text(encoding='utf-8'))

# SVG elements do not implement HTMLElement.hidden in the same way as HTML elements.
# The PDF sheet preview must toggle the actual hidden attribute so CSS [hidden]
# really removes the SVG fallback from layout.
render_fn = re.search(r'function renderTileDetail\(row,col,layout\)\{.*?\n      \}', SRC, re.S)
assert render_fn, 'renderTileDetail missing'
render_src = render_fn.group(0)
assert "svg.setAttribute('hidden','')" in render_src or 'svg.setAttribute("hidden","")' in render_src, 'PDF mode must set the SVG hidden attribute'
assert "svg.removeAttribute('hidden')" in render_src or 'svg.removeAttribute("hidden")' in render_src, 'SVG mode must remove the SVG hidden attribute'
assert 'svg.hidden = true' not in render_src and 'svg.hidden=true' not in render_src, 'Do not rely on SVGElement.hidden expando state'

parts = tuple(int(x) for x in APP['version'].split('.'))
assert parts >= (0, 8, 3), APP['version']
print('v0.8.3 SVG/canvas sheet preview source checks passed')
