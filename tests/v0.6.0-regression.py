from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4, landscape
from playwright.sync_api import sync_playwright
import re, subprocess, sys, time

ROOT = Path(__file__).resolve().parents[1]
FIX = ROOT/'tests'/'fixtures'/'multipage.pdf'
OUT = ROOT/'tests'/'out'
OUT.mkdir(parents=True, exist_ok=True)

# Three pages with distinct text and dimensions/orientation.
c = canvas.Canvas(str(FIX), pagesize=A4, pageCompression=0)
c.setFont('Helvetica', 24); c.drawString(72, 760, 'PAGE ONE VECTOR'); c.showPage()
c.setPageSize(landscape(A4)); c.setFont('Helvetica', 24); c.drawString(72, 520, 'PAGE TWO VECTOR'); c.showPage()
c.setPageSize((400, 400)); c.setFont('Helvetica', 24); c.drawString(72, 330, 'PAGE THREE VECTOR'); c.showPage(); c.save()

html = (ROOT/'dist'/'index.html').read_text(encoding='utf-8')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    page.set_content(html, wait_until='load')
    page.set_input_files('#sourceFile', str(FIX))
    page.wait_for_timeout(500)
    assert page.locator('#pdfPageSelection').count() == 1, 'multi-page selector must exist'
    assert page.locator('#pdfPageSelection').is_visible(), 'multi-page selector must be visible for a 3-page PDF'
    assert page.locator('[data-pdf-page-index]').count() == 3, 'all PDF pages must be selectable'
    assert page.locator('#pdfSelectedPagesValue').inner_text().strip() == '3 / 3', 'all pages selected by default'
    assert page.locator('#exportFilename').count() == 1, 'editable export filename must exist'
    assert page.locator('#exportProgress').count() == 1, 'export progress UI must exist'
    assert page.locator('#cancelExportButton').count() == 1, 'cancel export control must exist'
    # Switch preview to the landscape second page without changing selection.
    page.locator('[data-preview-pdf-page="1"]').evaluate('(e)=>e.click()')
    page.wait_for_timeout(50)
    assert 'P02' in page.locator('#previewStatus').inner_text()
    assert '297' in page.locator('#pdfBoxValue').inner_text() and '210' in page.locator('#pdfBoxValue').inner_text()
    assert page.locator('#pdfSelectedPagesValue').inner_text().strip() == '3 / 3'
    # Return to P01, exclude the middle page, and verify selected total.
    page.locator('[data-preview-pdf-page="0"]').evaluate('(e)=>e.click()')
    page.locator('[data-pdf-page-index="1"] input[type=checkbox]').uncheck()
    page.wait_for_timeout(50)
    assert page.locator('#pdfSelectedPagesValue').inner_text().strip() == '2 / 3'
    page.locator('#clearPdfPages').evaluate('(e)=>e.click()')
    assert page.locator('#pdfSelectedPagesValue').inner_text().strip() == '0 / 3'
    assert page.locator('#exportPdfButton').is_disabled()
    page.locator('#selectAllPdfPages').evaluate('(e)=>e.click()')
    assert page.locator('#pdfSelectedPagesValue').inner_text().strip() == '3 / 3'
    page.locator('[data-pdf-page-index="1"] input[type=checkbox]').uncheck()
    # first-page tile id should be page-qualified for multi-page PDFs
    first_label = page.locator('#tilingPreview text').filter(has_text=re.compile(r'^P01-R01-C01$'))
    assert first_label.count() >= 1, 'tile ids must include source page number for multi-page PDFs'
    browser.close()
print('v0.6.0 regression checks passed')

# End-to-end export: pages 1 and 3 only. Page 1 is 4 tiles, page 3 is 1 tile,
# plus one assembly map per selected source page = 7 output pages.
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    context = browser.new_context(accept_downloads=True, viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    page.set_content(html, wait_until='load')
    page.set_input_files('#sourceFile', str(FIX))
    page.wait_for_function("document.querySelector('#pdfSelectedPagesValue')?.textContent.trim() === '3 / 3'")
    page.locator('[data-pdf-page-index="1"] input[type=checkbox]').uncheck()
    page.fill('#exportFilename', 'selected-pages-test')
    with page.expect_download() as download_info:
        page.click('#exportPdfButton')
    download = download_info.value
    export_path = OUT/'selected-pages-test.pdf'
    download.save_as(str(export_path))
    for _ in range(100):
        if '7' in page.locator('#exportStatus').inner_text(): break
        page.wait_for_timeout(50)
    else: raise AssertionError('export completion status did not appear')
    assert download.suggested_filename == 'selected-pages-test.pdf'
    assert page.locator('#cancelExportButton').is_hidden(), 'cancel button should hide after completion'
    assert '7' in page.locator('#exportStatus').inner_text(), 'completion status should report final page count'
    browser.close()

info = subprocess.check_output(['pdfinfo', str(export_path)], text=True)
assert re.search(r'^Pages:\s+7$', info, re.M), info
text = subprocess.check_output(['pdftotext', str(export_path), '-'], text=True)
assert 'PAGE ONE VECTOR' in text
assert 'PAGE THREE VECTOR' in text
assert 'PAGE TWO VECTOR' not in text
assert b'PAGE TWO VECTOR' not in export_path.read_bytes(), 'excluded source-page bytes must not remain hidden in output'
assert 'P01-R01-C01' in text
assert 'P03-R01-C01' in text

# Cancellation must stop a long export and leave no completed download.
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    context = browser.new_context(accept_downloads=True, viewport={"width": 1200, "height": 900})
    page = context.new_page()
    downloads = []
    page.on('download', lambda d: downloads.append(d))
    page.set_content(html, wait_until='load')
    page.set_input_files('#sourceFile', str(FIX))
    page.wait_for_function("document.querySelector('#pdfSelectedPagesValue')?.textContent.trim() === '3 / 3'")
    page.locator('input[name="sizeMode"][value="sheets"]').evaluate('(e)=>{e.checked=true;e.dispatchEvent(new Event("change",{bubbles:true}))}')
    page.locator('#sheetCols').evaluate('(e)=>{e.value="12";e.dispatchEvent(new Event("change",{bubbles:true}))}')
    page.locator('#sheetRows').evaluate('(e)=>{e.value="12";e.dispatchEvent(new Event("change",{bubbles:true}))}')
    page.locator('#exportPdfButton').evaluate('(e)=>e.click()')
    page.locator('#exportProgress').wait_for(state='visible')
    page.locator('#cancelExportButton').evaluate('(e)=>e.click()')
    for _ in range(100):
        status = page.locator('#exportStatus').inner_text().lower()
        if 'キャンセル' in status or 'cancel' in status: break
        page.wait_for_timeout(50)
    else: raise AssertionError('cancel status did not appear')
    for _ in range(100):
        if page.locator('#exportPdfButton').is_enabled(): break
        page.wait_for_timeout(20)
    else: raise AssertionError('export should be available again after cancellation')
    page.wait_for_timeout(150)
    assert not downloads, 'cancelled export must not download a partial PDF'
    browser.close()

print('v0.6.0 export and cancellation checks passed')
