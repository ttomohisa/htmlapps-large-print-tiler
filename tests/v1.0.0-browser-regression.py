from pathlib import Path
import shutil, time
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PDF_FIXTURE = ROOT / 'tests/fixtures/ux-mobile.pdf'
BUILDS = [ROOT / 'dist/index.html', ROOT / 'dist/index.self-extract.html']
LONG_NAME = ('very-long-project-name-' * 12) + 'final-print-source.pdf'


def wait_attr(page, selector, name, expected, timeout=20.0):
    deadline = time.monotonic() + timeout
    locator = page.locator(selector)
    while time.monotonic() < deadline:
        if locator.count() and locator.get_attribute(name) == expected:
            return
        page.wait_for_timeout(50)
    value = locator.get_attribute(name) if locator.count() else None
    raise AssertionError(f'{selector} {name} did not become {expected!r}; got {value!r}')


def attach_long_pdf(page):
    page.set_input_files('#sourceFile', {
        'name': LONG_NAME,
        'mimeType': 'application/pdf',
        'buffer': PDF_FIXTURE.read_bytes(),
    })
    wait_attr(page, '#pdfPreviewCanvas', 'data-render-state', 'ready')


def run_desktop(browser, html_path):
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors, external = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: external.append(request.url) if request.url.startswith(('http://','https://')) else None)
    page.set_content(html_path.read_text(encoding='utf-8'), wait_until='load')

    assert page.locator('#exportPdfButton').is_disabled(), 'export must be disabled in empty state'
    assert page.locator('#versionBadge').inner_text() == 'v1.0.0'
    attach_long_pdf(page)
    assert page.locator('#fileName').inner_text() == LONG_NAME
    assert page.evaluate('document.documentElement.scrollWidth === innerWidth')

    # Both UI languages remain available in the stable release.
    initial = page.locator('html').get_attribute('lang')
    page.locator('#languageButton').click()
    toggled = page.locator('html').get_attribute('lang')
    assert toggled != initial and {initial, toggled} == {'ja', 'en'}
    page.locator('#languageButton').click()

    # Individual sheet preview: inside click stays open, backdrop click closes.
    page.locator('#tilingPreview .tile-hit').first.click()
    wait_attr(page, '#tilePdfCanvas', 'data-render-state', 'ready')
    dialog = page.locator('#tilePreviewDialog')
    assert dialog.evaluate('(el)=>el.open') is True
    page.locator('#tileZoomIn').click()
    assert dialog.evaluate('(el)=>el.open') is True
    rect = dialog.bounding_box(); assert rect
    page.mouse.click(max(2, rect['x'] - 10), max(2, rect['y'] - 10))
    page.wait_for_timeout(80)
    assert dialog.evaluate('(el)=>el.open') is False

    assert not errors, errors
    assert not external, external
    page.close()


def run_mobile(browser, html_path):
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors, external = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: external.append(request.url) if request.url.startswith(('http://','https://')) else None)
    page.set_content(html_path.read_text(encoding='utf-8'), wait_until='load')
    attach_long_pdf(page)
    dims = page.evaluate('''() => ({
      iw: innerWidth,
      sw: document.documentElement.scrollWidth,
      fileWidth: document.querySelector('#fileName').getBoundingClientRect().width,
      bodyWidth: document.body.getBoundingClientRect().width,
      mobileBar: getComputedStyle(document.querySelector('#mobileActionBar')).display,
    })''')
    assert dims['iw'] == dims['sw'] == 390, dims
    assert dims['fileWidth'] <= dims['bodyWidth'], dims
    assert dims['mobileBar'] != 'none', dims
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
                run_desktop(browser, build)
                run_mobile(browser, build)
                print(f'{build.name}: desktop/mobile stable-release browser checks passed')
        finally:
            browser.close()
    print('v1.0.0 stable-release browser checks passed')
