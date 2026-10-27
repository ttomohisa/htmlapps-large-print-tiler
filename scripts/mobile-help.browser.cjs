'use strict';
// Run against the official generated files in the unprivileged PR build job.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const buildSelector = '.build-section details';


async function prepareApp(page,width,label){
 assert.equal(await page.locator('#mobileActionBar').isVisible(),false,label+': empty bar hidden');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="40mm" height="30mm" viewBox="0 0 40 30"><rect width="40" height="30" fill="#16624f"/><path d="M5 5L35 25" stroke="white" stroke-width="2"/></svg>';
 await page.locator('#sourceFile').setInputFiles({name:'synthetic.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});
 await page.waitForFunction(()=>!document.querySelector('#exportPdfButton').disabled);
 assert.equal(await page.locator('#mobileActionBar').isVisible(),width<=930,label+': ready Preview/Save bar preserved');
 if(width<=930) assert.ok(await page.locator('#mobileActionBar').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;}),label+': functional bar fits viewport');
}
async function smoke(page,results,file){
 await page.locator('#exportFilename').fill('mobile-help-tiler');
 const pending=page.waitForEvent('download',{timeout:40000});await page.locator('#mobileExportButton').click();const download=await pending;
 assert.equal(download.suggestedFilename(),'mobile-help-tiler.pdf');const target=path.join(results,file.includes('self-extract')?'synthetic-loader.pdf':'synthetic-readable.pdf');await download.saveAs(target);
 const bytes=fs.readFileSync(target);assert.ok(bytes.length>500);assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.match(bytes.toString('latin1'),/\/Type\s*\/Page\b/);
 console.log('PASS synthetic physical-size SVG to edited-name tiled PDF '+file);
}

// Check rendered geometry, including clipping by an ancestor (isVisible alone misses it).
async function auditHeader(page, label) {
  const badge = page.locator('header #versionBadge');
  assert.equal(await badge.textContent(), 'v' + require('../app.config.json').version, label + ': current header version');
  assert.equal(await badge.isVisible(), true, label + ': version visible');
  const clipped = await badge.evaluate(el => {
    const r = el.getBoundingClientRect(), problems = [];
    if (r.width <= 0 || r.height <= 0 || r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) problems.push('outside viewport');
    if (el.scrollWidth > el.clientWidth + 1) problems.push('version text clipped');
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p), b = p.getBoundingClientRect();
      if (/hidden|clip|auto|scroll/.test(s.overflowX) && (r.left < b.left - 1 || r.right > b.right + 1)) problems.push('ancestor clips x: ' + p.className);
      if (/hidden|clip|auto|scroll/.test(s.overflowY) && (r.top < b.top - 1 || r.bottom > b.bottom + 1)) problems.push('ancestor clips y: ' + p.className);
    }
    return problems;
  });
  assert.deepEqual(clipped, [], label + ': complete header version remains readable');
  const help = page.locator('#helpButton svg');
  assert.equal(await help.isVisible(), true, label + ': Help icon visible');
  assert.ok(await help.evaluate(svg => {
    const paths = [...svg.querySelectorAll('path')], shape = paths.map(p => p.getAttribute('d')).join(' ');
    return /[aAcC]/.test(shape) && paths.some(p => /[hH]\.01/.test(p.getAttribute('d')) && getComputedStyle(p).strokeLinecap === 'round') && svg.getBBox().width > 0;
  }), label + ': question-mark curve and painted dot, not information icon');
  const shield = page.locator('.local-badge svg');
  if (await shield.count()) {
    assert.ok(await shield.evaluate(svg => [...svg.querySelectorAll('path')].some(p => /^M12 3 5 6/.test(p.getAttribute('d')))), label + ': local-processing shield');
  }
}

async function main() {
  const results = path.resolve(__dirname, '..', 'test-results', 'mobile-help');
  fs.mkdirSync(results, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const file of ['dist/index.html', 'dist/index.self-extract.html', 'large-print-tiler.html']) {
      for (const language of ['ja', 'en']) {
        for (const [width, height] of [[1360, 900], [931, 568], [930, 568], [360, 640], [390,844], [320, 568], [393, 252]]) {
          const context = await browser.newContext({ viewport: { width, height }, locale: language, reducedMotion: 'reduce' });
          const page = await context.newPage();
          const errors = [], requests = [];
          page.on('pageerror', error => errors.push(error.message));
          page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
          page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
          const label = `${file} ${language} ${width}x${height}`;
          try {
            await page.goto(pathToFileURL(path.resolve(__dirname, '..', file)).href);
            await page.locator('#helpButton').waitFor();
            if (await page.locator('html').getAttribute('lang') !== language) await page.locator('#languageButton').click();
            await page.locator('#languageButton').click();await page.locator('#languageButton').click();
            assert.equal(await page.locator('html').getAttribute('lang'),language,label+': repeated language toggles');
            for(const id of ['buildVersion','builtAt','dependencyCount']){assert.equal(await page.locator('#'+id).count(),1,label+': unique metadata after toggles');assert.ok(!['','—','-'].includes((await page.locator('#'+id).textContent()).trim()),label+': populated metadata after toggles');}
            assert.equal(await page.locator('[data-i18n="localBadge"]').textContent(), language === 'en' ? 'Fully local processing' : '完全ローカル処理', label);
            assert.ok(await page.locator('.local-badge').evaluate(el => {
              const box = el.getBoundingClientRect();
              const range = document.createRange();
              range.selectNodeContents(el.querySelector('[data-i18n="localBadge"]'));
              return box.left >= 0 && box.right <= innerWidth && el.scrollWidth <= el.clientWidth + 1
                && [...range.getClientRects()].every(rect => rect.left >= box.left - 1 && rect.right <= box.right + 1 && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1);
            }), label + ': badge text fits');
            assert.equal(await page.locator('main #buildVersion').count(), 0, label);
            assert.equal(await page.locator('footer').isVisible(), width > 930, label);
            await prepareApp(page, width, label);

            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), label + ': page width');

            await auditHeader(page, label);
        if (file === 'dist/index.html' && [320,360,390,1360].includes(width)) await page.screenshot({path:path.join(results, `${language}-${width}-main.png`)});
        await page.locator('#helpButton').click();
        const visibleHelpText = await page.locator('#helpDialog').innerText();
        assert.doesNotMatch(visibleHelpText, /(?:EN\s*\/\s*JA|JA\s*[\/／]\s*EN|ヘッダーのEN|Use EN in the header)/, label + ': redundant language instructions removed');

            const body = page.locator('#helpDialog .dialog-body');
            assert.ok(await body.evaluate(el => el.lastElementChild.contains(document.querySelector('#buildVersion'))), label + ': build is final body child');
            assert.equal(await page.locator(buildSelector).count(), 1, label);
            assert.equal(await page.locator(buildSelector).isVisible(), true, label);
            for (const id of ['buildVersion', 'builtAt', 'dependencyCount']) assert.equal(await page.locator('#' + id).count(), 1, label);

            if (await page.locator(buildSelector).getAttribute('open') === null) {
              const summary = page.locator(buildSelector).locator('summary');
              await summary.focus();
              await page.keyboard.press('Enter');
              assert.equal(await page.locator(buildSelector).getAttribute('open'), '', label);
              assert.notEqual(await page.locator('#buildVersion').innerText(), '—', label);
              assert.match(await page.locator('#builtAt').innerText(), /\d{4}/, label + ': populated build timestamp');
            }
            await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
            const finalItem = page.locator('#dependencyCount');
            const finalBox = await finalItem.boundingBox(), bodyBox = await body.boundingBox();
            console.log('GEOMETRY ' + label + ' ' + JSON.stringify({ finalBox, bodyBox, viewportHeight: height }));
            assert.ok(finalBox && bodyBox && finalBox.y >= 0 && finalBox.y + finalBox.height <= height && finalBox.y >= bodyBox.y - 1 && finalBox.y + finalBox.height <= bodyBox.y + bodyBox.height + 1, label + ': final Help item reachable');
            assert.ok(await body.evaluate(el => el.scrollWidth <= el.clientWidth + 1), label + ': Help width');
            const headerBox = await page.locator('#helpDialog .dialog-header').boundingBox();
            assert.ok(headerBox && headerBox.x >= 0 && headerBox.x + headerBox.width <= width && headerBox.y >= 0 && headerBox.y + headerBox.height <= height, label + ': header visible');
            const closeBox=await page.locator('#closeHelpButton').boundingBox();
            assert.ok(closeBox && closeBox.x>=0 && closeBox.x+closeBox.width<=width && closeBox.y>=headerBox.y && closeBox.y+closeBox.height<=headerBox.y+headerBox.height+1,label+': Close fits header');
            if (file === 'dist/index.html' && [1360, 320].includes(width)) {
              await page.screenshot({ path: path.join(results, `help-${language}-${width}.png`) });
            }
            const dialogBox = await page.locator('#helpDialog').boundingBox();
            assert.ok(finalBox.y >= dialogBox.y - 1 && finalBox.y + finalBox.height <= dialogBox.y + dialogBox.height + 1, label + ': final item inside dialog');
            assert.ok(dialogBox.y > 1, label + ': top coordinate is genuine backdrop');
            const beforeScroll = await page.evaluate(() => scrollY);
            await page.mouse.move(2, 1);
            await page.mouse.wheel(0, 400);
            await page.waitForTimeout(100);
            assert.equal(await page.evaluate(() => scrollY), beforeScroll, label + ': background locked');
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('#helpDialog').isVisible(), false, label + ': Escape');
            await page.locator('#helpButton').click();
            await page.locator('#closeHelpButton').click();
            assert.equal(await page.locator('#helpDialog').isVisible(), false, label + ': reopen and Close');
            await page.locator('#helpButton').click();
            await page.mouse.click(2, 1);
            assert.equal(await page.locator('#helpDialog').isVisible(), false, label + ': backdrop');
            if(file!=='large-print-tiler.html' && language==='ja' && width===360) await smoke(page,results,file);
            assert.deepEqual(errors, [], label + ': console errors');
            assert.deepEqual(requests, [], label + ': external runtime requests');
            console.log('PASS ' + label);
          } catch (error) {
            await page.screenshot({ path: path.join(results, `failure-${file.replace(/[^a-z0-9]/gi, '-')}-${language}-${width}x${height}.png`) }).catch(() => {});
            throw error;
          } finally {
            await context.close();
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
