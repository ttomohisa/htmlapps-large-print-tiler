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


def wait_present(page, selector, timeout=20.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if page.locator(selector).count():
            return
        page.wait_for_timeout(50)
    raise AssertionError(f'{selector} did not appear')


def run_build(browser, html_path):
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    external = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: external.append(request.url) if request.url.startswith(('http://', 'https://')) else None)

    # The release is tested as a self-contained document. This also keeps the test usable in
    # restricted CI environments where direct file:// navigation is blocked by browser policy.
    page.set_content(html_path.read_text(encoding='utf-8'), wait_until='load')
    wait_present(page, '#sourceFile')
    page.set_input_files('#sourceFile', str(PDF_FIXTURE))

    wait_attr(page, '#pdfPreviewCanvas', 'data-render-state', 'ready')
    main = page.evaluate("""() => {
      const canvas = document.querySelector('#pdfPreviewCanvas');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let ink = false;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] && (pixels[i] < 248 || pixels[i + 1] < 248 || pixels[i + 2] < 248)) { ink = true; break; }
      }
      return { width: canvas.width, height: canvas.height, hidden: canvas.hidden, page: canvas.dataset.renderedPage, ink };
    }""")
    assert main['width'] > 0 and main['height'] > 0, main
    assert main['hidden'] is False and main['ink'] is True, main
    assert main['page'] == '1', main

    page.locator('#tilingPreview .tile-hit').first.click()
    wait_attr(page, '#tilePdfCanvas', 'data-render-state', 'ready')
    tile = page.evaluate("""() => {
      const canvas = document.querySelector('#tilePdfCanvas');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let ink = false;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] && (pixels[i] < 248 || pixels[i + 1] < 248 || pixels[i + 2] < 248)) { ink = true; break; }
      }
      return {
        width: canvas.width, height: canvas.height, hidden: canvas.hidden, page: canvas.dataset.renderedPage, ink,
        svgHidden: document.querySelector('#tileDetailSvg').hasAttribute('hidden'), svgDisplay: getComputedStyle(document.querySelector('#tileDetailSvg')).display
      };
    }""")
    assert tile['width'] > 0 and tile['height'] > 0, tile
    assert tile['hidden'] is False and tile['ink'] is True and tile['svgHidden'] is True and tile['svgDisplay'] == 'none', tile
    assert tile['page'] == '1', tile

    page.set_viewport_size({'width': 390, 'height': 844})
    page.wait_for_timeout(150)
    mobile = page.evaluate("""() => {
      const dialog = document.querySelector('#tilePreviewDialog').getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        dialogLeft: dialog.left,
        dialogRight: dialog.right,
        dialogBottom: dialog.bottom
      };
    }""")
    assert mobile['scrollWidth'] <= mobile['innerWidth'] + 1, mobile
    assert mobile['dialogLeft'] >= -1 and mobile['dialogRight'] <= mobile['innerWidth'] + 1, mobile
    assert mobile['dialogBottom'] <= mobile['innerHeight'] + 1, mobile
    assert not errors, errors
    assert not external, external
    page.close()
    return main, tile, mobile


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
                main, tile, mobile = run_build(browser, build)
                print(f'{build.name}: main={main}, tile={tile}, mobile={mobile}')
        finally:
            browser.close()
    print('v0.8.1 PDF.js Canvas browser regression checks passed')
