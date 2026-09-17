from pathlib import Path
from reportlab.pdfgen import canvas
from playwright.sync_api import sync_playwright
import subprocess, re

ROOT = Path(__file__).resolve().parents[1]
FIX_DIR = ROOT/'tests'/'fixtures'
OUT = ROOT/'tests'/'out-v07'
FIX_DIR.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
FIX = FIX_DIR/'calibration-source.pdf'
PT_PER_MM = 72/25.4

# Exactly the default A4 printable area when margin is 6 mm: 198 x 285 mm.
c = canvas.Canvas(str(FIX), pagesize=(198*PT_PER_MM, 285*PT_PER_MM), pageCompression=0)
c.setFont('Helvetica', 18)
c.drawString(30, 780, 'CALIBRATION SOURCE VECTOR')
c.line(0, 0, 198*PT_PER_MM, 285*PT_PER_MM)
c.showPage(); c.save()

html = (ROOT/'dist'/'index.html').read_text(encoding='utf-8')

# Calibration UI and layout correction.
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    context = browser.new_context(accept_downloads=True, viewport={"width": 1440, "height": 1000})
    page = context.new_page()
    errors=[]; page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(html, wait_until='load')
    assert page.locator('#printerCalibration').count() == 1, 'printer calibration card must exist'
    assert page.locator('#calibrationEnabled').count() == 1
    assert page.locator('#calibrationMeasuredX').count() == 1
    assert page.locator('#calibrationMeasuredY').count() == 1
    assert page.locator('#downloadCalibrationPdf').count() == 1
    assert not page.locator('#calibrationEnabled').is_checked(), 'calibration must default off'
    assert page.locator('#calibrationMeasuredX').input_value() == '100'
    assert page.locator('#calibrationMeasuredY').input_value() == '100'
    assert '100.00%' in page.locator('#calibrationScaleValue').inner_text()

    page.set_input_files('#sourceFile', str(FIX))
    page.wait_for_timeout(300)
    grid=page.locator('#summaryGrid').inner_text(); assert re.search(r'1\D+×\D+1',grid), grid
    assert '198' in page.locator('#summaryFinished').inner_text() and '285' in page.locator('#summaryFinished').inner_text()

    page.locator('#printerCalibration').evaluate('(e)=>e.open=true')
    page.fill('#calibrationMeasuredX','98')
    page.locator('#calibrationMeasuredX').press('Tab')
    page.fill('#calibrationMeasuredY','98')
    page.locator('#calibrationMeasuredY').press('Tab')
    page.check('#calibrationEnabled')
    page.wait_for_timeout(50)
    assert '102.04%' in page.locator('#calibrationScaleValue').inner_text(), page.locator('#calibrationScaleValue').inner_text()
    grid=page.locator('#summaryGrid').inner_text(); assert re.search(r'2\D+×\D+2',grid), grid
    # Desired finished size stays unchanged; only per-sheet coverage changes.
    assert '198' in page.locator('#summaryFinished').inner_text() and '285' in page.locator('#summaryFinished').inner_text()
    assert '194' in page.locator('#summaryPrintable').inner_text() and '279' in page.locator('#summaryPrintable').inner_text(), page.locator('#summaryPrintable').inner_text()
    assert not errors, errors
    browser.close()
print('v0.7.0 calibration UI/layout checks passed')

# The calibration PDF must be uncorrected, one page, and contain exact 100 mm X/Y references.
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    context = browser.new_context(accept_downloads=True)
    page = context.new_page(); page.set_content(html, wait_until='load')
    page.locator('#printerCalibration').evaluate('(e)=>e.open=true')
    with page.expect_download() as dlinfo:
        page.click('#downloadCalibrationPdf')
    dl=dlinfo.value; cal=OUT/'calibration-100mm.pdf'; dl.save_as(str(cal))
    assert dl.suggested_filename == 'large-print-tiler-calibration-100mm.pdf'
    browser.close()
info=subprocess.check_output(['pdfinfo',str(cal)],text=True)
assert re.search(r'^Pages:\s+1$',info,re.M), info
assert re.search(r'^Page size:\s+595\.276 x 841\.89 pts',info,re.M), info
raw=cal.read_text('latin1')
assert 'PRINTER CALIBRATION' in raw and '100 mm X' in raw and '100 mm Y' in raw
m=re.search(r'([0-9.]+) ([0-9.]+) m ([0-9.]+) \2 l S',raw)
assert m, 'horizontal calibration line not found'
assert abs((float(m.group(3))-float(m.group(1))) - 100*PT_PER_MM) < 0.001
print('v0.7.0 calibration PDF checks passed')

# Corrected PDF output must use four tiles instead of one, preserve vector text,
# and include the inverse measured scale in the PDF transform.
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    context = browser.new_context(accept_downloads=True, viewport={"width": 1200, "height": 900})
    page = context.new_page(); page.set_content(html, wait_until='load')
    page.set_input_files('#sourceFile',str(FIX)); page.wait_for_timeout(250)
    page.uncheck('#includeAssemblyMap')
    page.locator('#printerCalibration').evaluate('(e)=>e.open=true')
    page.fill('#calibrationMeasuredX','98'); page.locator('#calibrationMeasuredX').press('Tab')
    page.fill('#calibrationMeasuredY','98'); page.locator('#calibrationMeasuredY').press('Tab')
    page.check('#calibrationEnabled'); page.fill('#exportFilename','calibrated-output')
    with page.expect_download() as dlinfo:
        page.click('#exportPdfButton')
    dl=dlinfo.value; out=OUT/'calibrated-output.pdf'; dl.save_as(str(out))
    browser.close()
info=subprocess.check_output(['pdfinfo',str(out)],text=True)
assert re.search(r'^Pages:\s+4$',info,re.M), info
text=subprocess.check_output(['pdftotext',str(out),'-'],text=True)
assert 'CALIBRATION SOURCE VECTOR' in text
raw=out.read_text('latin1')
assert re.search(r'1\.020408\s+0\s+0\s+1\.020408',raw), 'calibration scale matrix missing'
print('v0.7.0 calibrated export checks passed')

# Raster and SVG exports use the same calibrated physical geometry.
from PIL import Image, ImageDraw
PNG = FIX_DIR/'calibration-image.png'
img=Image.new('RGB',(800,800),'white'); d=ImageDraw.Draw(img); d.rectangle((40,40,760,760),outline='black',width=4); d.text((60,60),'RASTER CALIBRATION',fill='black'); img.save(PNG)
SVG = FIX_DIR/'calibration-vector.svg'
SVG.write_text('<svg xmlns="http://www.w3.org/2000/svg" width="198mm" height="285mm" viewBox="0 0 198 285"><rect width="198" height="285" fill="white"/><path d="M0 0L198 285" stroke="#16624f"/><text x="10" y="30">SVG CALIBRATION</text></svg>',encoding='utf-8')

for source_path, output_name, needs_finished in [(PNG,'calibrated-image.pdf',True),(SVG,'calibrated-svg.pdf',False)]:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        context=browser.new_context(accept_downloads=True,viewport={"width":1200,"height":900})
        page=context.new_page(); page.set_content(html,wait_until='load')
        page.set_input_files('#sourceFile',str(source_path)); page.wait_for_timeout(300)
        if needs_finished:
            page.locator('input[name="sizeMode"][value="finished"]').check()
            if page.locator('#lockAspect').is_checked(): page.uncheck('#lockAspect')
            page.fill('#finishedWidth','198'); page.locator('#finishedWidth').press('Tab')
            page.fill('#finishedHeight','285'); page.locator('#finishedHeight').press('Tab')
        page.uncheck('#includeAssemblyMap')
        page.locator('#printerCalibration').evaluate('(e)=>e.open=true')
        page.fill('#calibrationMeasuredX','98'); page.locator('#calibrationMeasuredX').press('Tab')
        page.fill('#calibrationMeasuredY','98'); page.locator('#calibrationMeasuredY').press('Tab')
        page.check('#calibrationEnabled')
        grid=page.locator('#summaryGrid').inner_text(); assert re.search(r'2\D+×\D+2',grid), (source_path,grid)
        page.fill('#exportFilename',Path(output_name).stem)
        with page.expect_download() as dlinfo: page.click('#exportPdfButton')
        dl=dlinfo.value; out_file=OUT/output_name; dl.save_as(str(out_file))
        browser.close()
    info=subprocess.check_output(['pdfinfo',str(out_file)],text=True)
    assert re.search(r'^Pages:\s+4$',info,re.M), (source_path,info)
print('v0.7.0 raster/SVG calibrated export checks passed')
