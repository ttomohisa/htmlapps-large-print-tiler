from pathlib import Path
import shutil
import time

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PDF_FIXTURE = ROOT / 'tests/fixtures/ux-mobile.pdf'
BUILDS = [ROOT / 'dist/index.html', ROOT / 'dist/index.self-extract.html']


def wait_attr(page, selector, name, expected, timeout=20.0):
    deadline = time.monotonic() + timeout
    locator = page.locator(selector)
    while time.monotonic() < deadline:
        if locator.count() and locator.get_attribute(name) == expected:
            return
        page.wait_for_timeout(50)
    value = locator.get_attribute(name) if locator.count() else None
    raise AssertionError(f'{selector} {name} did not become {expected!r}; got {value!r}')


def run_build(browser, html_path):
    page = browser.new_page(viewport={'width': 1200, 'height': 900})
    errors = []
    external = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: external.append(request.url) if request.url.startswith(('http://', 'https://')) else None)
    page.set_content(html_path.read_text(encoding='utf-8'), wait_until='load')
    page.set_input_files('#sourceFile', str(PDF_FIXTURE))
    wait_attr(page, '#pdfPreviewCanvas', 'data-render-state', 'ready')

    # A normal generated sheet must preserve its intrinsic PDF page aspect ratio.
    page.locator('#tilingPreview .tile-hit').first.click()
    wait_attr(page, '#tilePdfCanvas', 'data-render-state', 'ready')
    normal = page.evaluate("""() => {
      const c = document.querySelector('#tilePdfCanvas');
      const r = c.getBoundingClientRect();
      return { intrinsic: c.width / c.height, displayed: r.width / r.height, styleHeight: c.style.height };
    }""")
    assert abs(normal['intrinsic'] - normal['displayed']) < 0.005, normal
    assert normal['styleHeight'] == 'auto', normal

    # Reproduce the v0.8.1 failure mode: if the rendered PDF viewport ratio differs
    # from the configured paper ratio, zooming must not stretch it back to paper size.
    stress = page.evaluate("""() => {
      const c = document.querySelector('#tilePdfCanvas');
      c.width = 400;
      c.height = 1200;
      window.__largePrintTilerTest.setTileZoom(0.5);
      const r = c.getBoundingClientRect();
      return { intrinsic: c.width / c.height, displayed: r.width / r.height, width: r.width, height: r.height, styleHeight: c.style.height };
    }""")
    assert abs(stress['intrinsic'] - stress['displayed']) < 0.005, stress
    assert stress['styleHeight'] == 'auto', stress

    assert not errors, errors
    assert not external, external
    page.close()
    return normal, stress


if __name__ == '__main__':
    assert PDF_FIXTURE.exists(), PDF_FIXTURE
    for build in BUILDS:
        assert build.exists(), build
    chromium = shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')
    with sync_playwright() as playwright:
        launch = {'headless': True}
        if chromium:
            launch['executable_path'] = chromium
        browser = playwright.chromium.launch(**launch)
        try:
            for build in BUILDS:
                normal, stress = run_build(browser, build)
                print(f'{build.name}: normal={normal}, stress={stress}')
        finally:
            browser.close()
    print('v0.8.2 tile preview aspect-ratio browser checks passed')
