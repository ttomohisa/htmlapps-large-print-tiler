from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from playwright.sync_api import sync_playwright
import re, subprocess

ROOT = Path(__file__).resolve().parents[1]
FIX = ROOT/'tests'/'fixtures'/'ux-mobile.pdf'
FIX.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(FIX), pagesize=A4, pageCompression=0)
c.setFont('Helvetica', 22); c.drawString(72, 760, 'UX MOBILE VECTOR'); c.showPage(); c.save()
html = (ROOT/'dist'/'index.html').read_text(encoding='utf-8')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    context = browser.new_context(viewport={"width": 390, "height": 844}, locale='ja-JP', accept_downloads=True)
    page = context.new_page()
    errors=[]; page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(html, wait_until='load')

    bar = page.locator('#mobileActionBar')
    assert bar.count() == 1, 'mobile action bar must exist'
    assert bar.get_attribute('data-visible') == 'false', 'mobile action bar should start hidden'
    assert page.locator('#mobilePreviewButton').count() == 1
    assert page.locator('#mobileExportButton').count() == 1

    calibration = page.locator('#printerCalibration')
    assert calibration.evaluate('(e)=>e.tagName') == 'DETAILS', 'printer calibration should use a disclosure'
    assert calibration.get_attribute('open') is None, 'printer calibration should start collapsed'

    page.set_input_files('#sourceFile', str(FIX))
    page.wait_for_timeout(350)
    assert bar.get_attribute('data-visible') == 'true', 'mobile action bar should appear after source is ready'
    assert page.locator('#mobileExportButton').is_enabled(), 'mobile save action should mirror export readiness'
    summary = page.locator('#mobileActionSummary').inner_text()
    assert re.search(r'\d+', summary), summary

    page.click('#mobilePreviewButton')
    page.wait_for_timeout(150)
    box = page.locator('.preview-panel').bounding_box()
    assert box and box['y'] < 844 and box['y'] + box['height'] > 0, box

    dims = page.evaluate("""() => ({sw: document.documentElement.scrollWidth, iw: innerWidth, pb: parseFloat(getComputedStyle(document.querySelector('.main')).paddingBottom), bh: document.querySelector('#mobileActionBar').getBoundingClientRect().height})""")
    assert dims['sw'] == dims['iw'] == 390, dims
    assert dims['pb'] > dims['bh'], dims

    white_space = page.locator('#fileName').evaluate('(e)=>getComputedStyle(e).whiteSpace')
    assert white_space in ('normal','break-spaces'), white_space

    page.click('#languageButton')
    assert page.locator('#mobilePreviewButton').inner_text().endswith('View preview')
    assert page.locator('#mobileExportButton').inner_text().strip().endswith('Save PDF')
    assert 'Correction' in page.locator('#calibrationScaleValue').inner_text()
    page.click('#languageButton')

    mobile_out = ROOT/'tests'/'out-v08-mobile.pdf'
    with page.expect_download() as dlinfo:
        page.click('#mobileExportButton')
    dlinfo.value.save_as(str(mobile_out))
    assert dlinfo.value.suggested_filename.endswith('.pdf')
    assert re.search(r'^Pages:\s+[1-9]\d*$', subprocess.check_output(['pdfinfo', str(mobile_out)], text=True), re.M)
    assert page.locator('#mobileExportButton').is_enabled(), 'mobile save must recover after export completion'

    calibration.evaluate('(e)=>e.open=true')
    page.check('#calibrationEnabled')
    assert calibration.get_attribute('open') is not None

    assert not errors, errors
    browser.close()

print('v0.8.0 mobile UX checks passed')

# The mobile action must become a cancellation control during a long export.
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    context = browser.new_context(viewport={"width":390,"height":844}, locale='ja-JP', accept_downloads=True)
    page = context.new_page(); downloads=[]; page.on('download', lambda d: downloads.append(d))
    page.set_content(html, wait_until='load')
    page.set_input_files('#sourceFile', str(FIX)); page.wait_for_timeout(250)
    page.locator('input[name="sizeMode"][value="sheets"]').evaluate("e => { e.checked = true; e.dispatchEvent(new Event('change', { bubbles:true })); }")
    page.fill('#sheetCols','12'); page.locator('#sheetCols').press('Tab')
    page.fill('#sheetRows','12'); page.locator('#sheetRows').press('Tab')
    page.click('#mobileExportButton')
    page.locator('#exportProgress').wait_for(state='visible')
    assert 'キャンセル' in page.locator('#mobileExportButton').inner_text()
    assert '生成中' in page.locator('#mobileActionSummary').inner_text()
    page.click('#mobileExportButton')
    for _ in range(120):
        if 'キャンセル' in page.locator('#exportStatus').inner_text() and page.locator('#mobileExportButton').is_enabled():
            break
        page.wait_for_timeout(25)
    page.wait_for_timeout(100)
    assert not downloads, 'mobile cancellation must not save a partial PDF'
    assert not page.locator('#mobileActionBar').get_attribute('data-busy') == 'true'
    browser.close()
print('v0.8.0 mobile cancellation checks passed')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, locale='ja-JP')
    page = context.new_page()
    errors=[]; page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(html, wait_until='load')
    page.set_input_files('#sourceFile', str(FIX)); page.wait_for_timeout(300)
    assert page.locator('#mobileActionBar').evaluate('(e)=>getComputedStyle(e).display') == 'none', 'mobile bar must not appear on desktop'
    assert page.evaluate('document.documentElement.scrollWidth === innerWidth')
    assert not errors, errors
    browser.close()
print('v0.8.0 desktop UX checks passed')
