from pathlib import Path
import shutil, time
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
    page.locator('#tilingPreview .tile-hit').first.click()
    wait_attr(page, '#tilePdfCanvas', 'data-render-state', 'ready')
    dialog = page.locator('#tilePreviewDialog')
    assert dialog.evaluate('(el) => el.open') is True

    # Interacting inside the sheet preview must keep the modal open.
    page.locator('#tileZoomIn').click()
    assert dialog.evaluate('(el) => el.open') is True

    # Clicking the backdrop should close it.
    rect = dialog.bounding_box()
    assert rect, 'tile preview dialog has no bounding box'
    outside_x = max(2, rect['x'] - 12)
    outside_y = max(2, rect['y'] - 12)
    page.mouse.click(outside_x, outside_y)
    page.wait_for_timeout(100)
    assert dialog.evaluate('(el) => el.open') is False, {
        'rect': rect, 'outside': [outside_x, outside_y]
    }

    assert not errors, errors
    assert not external, external
    page.close()


if __name__ == '__main__':
    assert PDF_FIXTURE.exists(), PDF_FIXTURE
    chromium = shutil.which('chromium') or shutil.which('chromium-browser') or shutil.which('google-chrome')
    with sync_playwright() as playwright:
        launch = {'headless': True}
        if chromium:
            launch['executable_path'] = chromium
        browser = playwright.chromium.launch(**launch)
        try:
            for build in BUILDS:
                run_build(browser, build)
                print(f'{build.name}: backdrop-close behavior passed')
        finally:
            browser.close()
    print('v0.8.4 sheet preview backdrop-close browser checks passed')
