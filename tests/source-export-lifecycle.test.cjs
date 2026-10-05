// Source-only regression harness: real parsing, geometry, PDF builders and handlers.
// DOM painting, image decoding and the scheduler are boundary doubles, not browser QA.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const htmlPath = process.env.TILER_HTML || 'src/index.template.html';
const html = fs.readFileSync(path.resolve(__dirname, '..', htmlPath), 'utf8');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function pdfFile(name = 'alpha.pdf', text = 'ALPHA SOURCE', width = 100, height = 150) {
  const content = `BT /F1 12 Tf 10 20 Td (${text}) Tj ET\n`;
  const bodies = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}endstream`
  ];
  let textPdf = '%PDF-1.4\n';
  const offsets = bodies.map((body, i) => { const offset = textPdf.length; textPdf += `${i + 1} 0 obj\n${body}\nendobj\n`; return offset; });
  const xref = textPdf.length;
  textPdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = Buffer.from(textPdf);
  return { name, type: 'application/pdf', size: bytes.length, arrayBuffer: async () => Uint8Array.from(bytes).buffer };
}
function imageFile(name = 'alpha.png') {
  return { name, type: 'image/png', size: 8, arrayBuffer: async () => new Uint8Array(8).buffer };
}
function delayedFile(file) {
  const reads = [];
  return { ...file, reads, arrayBuffer() { const read = deferred(); reads.push(read); return read.promise; }, release(index = 0) { return file.arrayBuffer().then(reads[index].resolve); } };
}
function harness() {
  const nodes = new Map(), listeners = new Map(), downloads = [], toasts = [], errors = [];
  let undo, gate = null, frameGate = null, confirm = null;
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { value: '', max: 1, hidden: true, disabled: false, textContent: '', classList: {add(){},remove(){}}, addEventListener(type, fn) { const key = `${selector}:${type}`; listeners.set(key, [...(listeners.get(key) || []), fn]); } });
    return nodes.get(selector);
  };
  const context = vm.createContext({
    TextEncoder, TextDecoder, Uint8Array, Uint32Array, DataView, Map, Set, Blob, Response, DecompressionStream, CompressionStream,
    console: { error: error => errors.push(error) }, setTimeout,
    URL: { createObjectURL: file => `blob:${file.name}`, revokeObjectURL(){} },
    APP_CONFIG: { slug: 'large-print-tiler' }, PDF_MM_PER_POINT: 25.4/72, PDF_POINTS_PER_MM:72/25.4, CSS_MM_PER_PX:25.4/96,
    $: node, translate: key => key, requestAnimationFrame: fn => frameGate ? frameGate.promise.then(fn) : setImmediate(fn),
    document: { createElement: () => ({ width:0, height:0, getContext: () => ({ clearRect(){}, drawImage(){}, getImageData: (_x,_y,w,h) => ({ data: new Uint8Array(w*h*4).fill(255) }) }) }) },
    AppConfirm: { ask: () => confirm.promise },
    renderDynamic(){}, updateMobileActionBar(){},
    renderSelectedFile: () => vm.runInContext('updateExportState()', context),
    update: () => vm.runInContext('updateExportState()', context),
    clearSourcePreview: () => vm.runInContext('sourcePreviewUrl=null', context),
    showToast(text, options) { toasts.push(text); if (options?.onAction) undo = options.onAction; },
    downloadBytes(bytes, filename) { downloads.push({ bytes: Buffer.from(bytes), filename }); },
    decodeHook: async () => ({ width: 2, height: 3, close(){} }),
    waitHook: () => { if (!gate) return Promise.resolve(); const current = gate; gate = null; current.entered.resolve(); return current.release.promise; }
  });
  const run = code => vm.runInContext(code, context);
  const extract = name => {
    const match = new RegExp('^      (?:async )?function ' + name + '\\(', 'm').exec(html);
    assert(match, `Missing source function ${name}`);
    const tail = html.slice(match.index), next = /\n      (?:async )?function /.exec(tail);
    return next ? tail.slice(0, next.index) : tail;
  };
  run(html.slice(html.indexOf('      const paperPresets'), html.indexOf('      let language')));
  for (const name of ['safeNumber','clamp','getPaperSize','getActivePdfPage','currentSourceDimensions','getCalibrationFactors','calculateLayoutForDimensions','calculateLayout','calculateLayoutForPdfPage','getSelectedPdfPageIndexes','buildPdfExportPlan','pdfPageId','tileId','sanitizeFilenameBase','setDefaultExportFilename','resetExportProgress','setExportProgress','updateExportState','isSupportedFile','applyParsedSourceSize','isSvgFile','parsePngMetadata','parseJpegMetadata','parseCssLengthMm','parseImageSource','tileOverlayCommands','setNumericState','deflateBytes','rasterizeSource','binaryObject','buildTiledImagePdf','assemblyMapPdfCommands','pdfEscapeText','selectFile','removeFile']) run(extract(name));
  // Lifecycle helpers, when present, are exercised through the actual handlers.
  for (const name of ['invalidateExport','ownsExport']) if (html.includes(`function ${name}(`)) run(extract(name));
  run(html.slice(html.indexOf('      function isPdfFile'), html.indexOf('      function buildCalibrationPdf')));
  run('yieldToBrowser=waitHook; decodeImageBitmap=decodeHook;');
  run(html.slice(html.indexOf("      $('#sourceFile').addEventListener"), html.indexOf("      $('#pdfPageList').addEventListener")));
  run(html.slice(html.indexOf("      $('#cancelExportButton').addEventListener('click'"), html.indexOf('\n      applyLanguage();', html.indexOf("      $('#exportPdfButton').addEventListener"))));
  run('state.includeAssemblyMap=false; state.showTrimLines=false; state.showRegistrationMarks=false; state.showTileLabels=false; updateExportState();');
  return {
    run, context, node, downloads, toasts, errors,
    select: file => { context.inputFile = file; return run('selectFile(inputFile)'); },
    emit: async (selector, type, event = {}) => { for (const fn of listeners.get(`${selector}:${type}`) || []) await fn(event); },
    export: () => listeners.get('#exportPdfButton:click')[0](),
    cancel: () => listeners.get('#cancelExportButton:click')[0](),
    remove: () => run('removeFile()'), undo: () => undo(),
    pause: () => { gate = { entered: deferred(), release: deferred() }; return gate; },
    pauseFrames: () => { frameGate = deferred(); return frameGate; },
    confirmReset: () => { confirm = deferred(); const promise = listeners.get('#resetButton:click')[0](); return { ...confirm, promise }; }
  };
}
function assertPdf(download, name, marker = 'ALPHA SOURCE') {
  assert.equal(download.filename, name);
  assert(download.bytes.includes(Buffer.from(marker)));
  assert.match(download.bytes.toString(), /\/MediaBox \[0 0 595\.27559\d* 841\.88976\d*\]/);
  assert.equal((download.bytes.toString().match(/\/Type \/Page\b/g) || []).length, 1);
}

test('normal PDF exports preserve source text, A4 size and editable filename; retry works', async () => {
  const h = harness(); await h.select(pdfFile());
  h.node('#exportFilename').value = 'my/print.pdf';
  await h.export(); assert.equal(h.errors.length, 0, String(h.errors[0])); assertPdf(h.downloads[0], 'my-print.pdf');
  await h.export(); assert.equal(h.downloads.length, 2);
});
test('replacing source during export suppresses obsolete download and status', async () => {
  const h = harness(); await h.select(pdfFile()); const gate = h.pause(); const old = h.export(); await gate.entered.promise;
  await h.select(pdfFile('beta.pdf','BETA SOURCE')); const status = h.node('#exportStatus').textContent;
  gate.release.resolve(); await old;
  assert.equal(h.downloads.length, 0); assert.equal(h.node('#exportStatus').textContent, status);
  await h.export(); assertPdf(h.downloads[0], 'beta-tiled.pdf', 'BETA SOURCE');
});
test('export captures its filename before the first async boundary', async () => {
  const h = harness(); await h.select(pdfFile()); const gate = h.pause(); const old = h.export(); await gate.entered.promise;
  h.node('#exportFilename').value = 'changed'; gate.release.resolve(); await old;
  assertPdf(h.downloads[0], 'alpha-tiled.pdf');
});
test('picker and remove controls are disabled during export; queued picker/drop changes are ignored', async () => {
  const h = harness(); await h.select(pdfFile()); const gate = h.pause(); const old = h.export(); await gate.entered.promise;
  assert.equal(h.node('#sourceFile').disabled, true); assert.equal(h.node('#removeFileButton').disabled, true);
  await h.emit('#sourceFile','change',{target:{files:[pdfFile('beta.pdf')]}});
  await h.emit('#dropZone','drop',{preventDefault(){},dataTransfer:{files:[pdfFile('beta.pdf')]}});
  assert.equal(h.run('selectedFile.name'), 'alpha.pdf');
  gate.release.resolve(); await old; assert.equal(h.node('#sourceFile').disabled, false);
});
test('a duplicate export click cannot start a second job', async () => {
  const h = harness(); await h.select(pdfFile()); const gate = h.pause(); const first = h.export(); await gate.entered.promise;
  await h.export(); gate.release.resolve(); await first; assert.equal(h.downloads.length, 1);
});
test('remove during export invalidates its download; Undo supports a fresh export', async () => {
  const h = harness(); await h.select(pdfFile()); const gate = h.pause(); const old = h.export(); await gate.entered.promise;
  h.remove(); await h.undo(); gate.release.resolve(); await old;
  assert.equal(h.downloads.length, 0); await h.export(); assertPdf(h.downloads[0], 'alpha-tiled.pdf');
});
test('old export finally cannot clear a newer export or its cancellation', async () => {
  const h = harness(); await h.select(pdfFile()); const gate1 = h.pause(); const old = h.export(); await gate1.entered.promise;
  await h.select(pdfFile('beta.pdf','BETA SOURCE')); const gate2 = h.pause(); const current = h.export(); await gate2.entered.promise; h.cancel();
  gate1.release.resolve(); await old;
  assert.equal(h.run('exportInProgress'), true); assert.equal(h.run('exportCancelRequested'), true);
  gate2.release.resolve(); await current; assert.equal(h.downloads.length, 0);
  await h.export(); assertPdf(h.downloads[0], 'beta-tiled.pdf', 'BETA SOURCE');
});
test('cancel at final page yield prevents download and allows retry', async () => {
  const h = harness(); await h.select(pdfFile()); const gate = h.pause(); const pending = h.export(); await gate.entered.promise;
  h.cancel(); gate.release.resolve(); await pending;
  assert.equal(h.downloads.length, 0); assert.equal(h.node('#exportStatus').textContent, 'exportCancelled');
  assert.equal(h.node('#exportPdfButton').disabled, false); await h.export(); assert.equal(h.downloads.length, 1);
});
test('replacement before animation frames settle never builds/downloads the old source', async () => {
  const h = harness(); await h.select(pdfFile()); const frames = h.pauseFrames(); const pending = h.export();
  await h.select(pdfFile('beta.pdf','BETA SOURCE')); frames.resolve(); await pending; assert.equal(h.downloads.length, 0);
});
test('stale export errors do not overwrite new source status', async () => {
  const h = harness(); await h.select(pdfFile()); const gate = h.pause(); const pending = h.export(); await gate.entered.promise;
  await h.select(pdfFile('beta.pdf','BETA SOURCE')); const before = h.node('#exportStatus').textContent;
  gate.release.reject(new Error('synthetic write failure')); await pending;
  assert.equal(h.node('#exportStatus').textContent, before); assert.equal(h.errors.length, 0);
});
test('current export failure restores controls and permits retry', async () => {
  const h = harness(); await h.select(pdfFile()); const gate = h.pause(); const pending = h.export(); await gate.entered.promise;
  gate.release.reject(new Error('synthetic write failure')); await pending;
  assert.equal(h.node('#exportStatus').textContent, 'pdfExportError'); assert.equal(h.node('#sourceFile').disabled, false);
  await h.export(); assert.equal(h.downloads.length, 1);
});
test('Undo during PDF read restarts parsing and preserves the edited filename', async () => {
  const h = harness(), file = delayedFile(pdfFile()); const oldRead = h.select(file);
  h.run("exportFilenameBase='restored-name'"); h.remove(); const restored = h.undo();
  assert.equal(file.reads.length, 2); await file.release(0); await oldRead; assert.equal(h.run('pdfSource'), null);
  await file.release(1); await restored; assert.equal(h.run('pdfSource.pages.length'), 1);
  await h.export(); assertPdf(h.downloads[0], 'restored-name.pdf');
});
test('Undo during image read restarts parsing with fresh ownership', async () => {
  const h = harness(), file = delayedFile(imageFile()); const oldRead = h.select(file); h.remove(); const restored = h.undo();
  assert.equal(file.reads.length, 2); await file.release(1); await restored; await file.release(0); await oldRead;
  assert.equal(h.run('imageSource.pixelWidth'), 2); assert.equal(h.node('#exportPdfButton').disabled, false);
});
test('a newer selection defeats late original and Undo read completions', async () => {
  const h = harness(), file = delayedFile(pdfFile()); const oldRead = h.select(file); h.remove(); const restored = h.undo();
  assert.equal(file.reads.length, 2); await h.select(pdfFile('beta.pdf','BETA SOURCE'));
  await file.release(1); await restored; await file.release(0); await oldRead;
  assert.equal(h.run('selectedFile.name'), 'beta.pdf'); await h.export(); assertPdf(h.downloads[0], 'beta-tiled.pdf','BETA SOURCE');
});
test('late parser errors cannot overwrite a replacement source', async () => {
  const h = harness(), file = delayedFile(pdfFile()); const pending = h.select(file);
  await h.select(pdfFile('beta.pdf','BETA SOURCE')); const status = h.node('#exportStatus').textContent;
  file.reads[0].reject(new Error('synthetic read failure')); await pending;
  assert.equal(h.node('#exportStatus').textContent,status); assert.equal(h.run('selectedFile.name'),'beta.pdf');
});
test('failed read stays unexportable and selecting a valid source recovers', async () => {
  const h = harness(); await h.select({...pdfFile(), arrayBuffer: async () => new ArrayBuffer(0)});
  assert.equal(h.node('#exportPdfButton').disabled, true); assert.equal(h.node('#exportStatus').textContent,'pdfReadError');
  await h.select(pdfFile()); await h.export(); assertPdf(h.downloads[0],'alpha-tiled.pdf');
});
test('loaded Undo preserves PDF page selection and filename; obsolete Undo is ignored', async () => {
  const h = harness(); await h.select(pdfFile()); h.run("selectedPdfPages=new Set(); exportFilenameBase='custom'"); h.remove(); await h.undo();
  assert.equal(h.run('selectedPdfPages.size'),0); assert.equal(h.node('#exportFilename').value,'custom');
  h.remove(); await h.select(pdfFile('beta.pdf','BETA SOURCE')); await h.undo(); assert.equal(h.run('selectedFile.name'),'beta.pdf');
});
test('removal clears reading status and leaves export unavailable', async () => {
  const h = harness(), file = delayedFile(pdfFile()); const pending = h.select(file); h.remove();
  assert.equal(h.node('#sourceNote').textContent,'sourceNote'); assert.equal(h.node('#exportPdfButton').disabled,true);
  await file.release(); await pending; assert.equal(h.run('selectedFile'),null);
});
test('a reset confirmation opened earlier cannot clear a newer source or active export', async () => {
  const h = harness(); await h.select(pdfFile()); const reset = h.confirmReset(); await h.select(pdfFile('beta.pdf','BETA SOURCE'));
  reset.resolve(true); await reset.promise; assert.equal(h.run('selectedFile.name'),'beta.pdf');
  const reset2 = h.confirmReset(), gate = h.pause(), exporting = h.export(); await gate.entered.promise;
  reset2.resolve(true); await reset2.promise; assert.equal(h.run('selectedFile.name'),'beta.pdf');
  gate.release.resolve(); await exporting; assertPdf(h.downloads[0],'beta-tiled.pdf','BETA SOURCE');
});


test('numeric setting changes cannot alter an export after it has started', async () => {
  const h = harness(); await h.select(pdfFile()); const frames = h.pauseFrames(); const pending = h.export();
  const before = h.run('JSON.stringify(state)');
  for (const key of ['margin','overlap','sourceWidth','sourceHeight','sheetCols','sheetRows','calibrationMeasuredX','calibrationMeasuredY']) {
    h.context.numericKey = key; h.run("setNumericState(numericKey, {value:'99'})");
  }
  assert.equal(h.run('JSON.stringify(state)'), before);
  frames.resolve(); await pending; assertPdf(h.downloads[0], 'alpha-tiled.pdf');
});
test('image export keeps its image dimensions and name', async () => {
  const h = harness(); await h.select(imageFile()); h.run('state.finishedWidth=30;state.finishedHeight=45;');
  await h.export(); assert.equal(h.errors.length,0,String(h.errors[0])); assert.equal(h.downloads.length,1);
  assert.equal(h.downloads[0].filename,'alpha-tiled.pdf');
  assert.match(h.downloads[0].bytes.toString(), /\/Subtype \/Image \/Width 2 \/Height 3/);
  assert.equal((h.downloads[0].bytes.toString().match(/\/Type \/Page\b/g)||[]).length,1);
});
test('image export replacement while decode is pending closes the obsolete bitmap', async () => {
  const h = harness(); await h.select(imageFile()); const decode = deferred(); let closed=0;
  h.context.decodeHook=()=>decode.promise; h.run('decodeImageBitmap=decodeHook');
  const frames = h.pauseFrames(), old = h.export(); frames.resolve();
  await new Promise(resolve=>setImmediate(resolve));
  h.run('state.sizeMode="original"'); await h.select(pdfFile('beta.pdf','BETA SOURCE')); decode.resolve({width:2,height:3,close(){closed++;}}); await old;
  assert.equal(h.downloads.length,0); assert.equal(closed,1);
  await h.export(); assertPdf(h.downloads[0],'beta-tiled.pdf','BETA SOURCE');
});
test('multi-sheet output retains calibration, overlap, selected pages and assembly-map count', async () => {
  const h = harness(); await h.select(pdfFile());
  h.run('state.sizeMode="sheets";state.sheetCols=2;state.sheetRows=3;state.calibrationEnabled=true;state.calibrationMeasuredX=98;state.calibrationMeasuredY=101;state.includeAssemblyMap=true;');
  const layout = h.run('calculateLayout()');
  assert.equal(layout.count,6); assert.equal(layout.overlap,10);
  assert.equal(layout.correctionX,100/98); assert.equal(layout.correctionY,100/101);
  await h.export(); assert.equal(h.errors.length,0,String(h.errors[0]));
  assert.equal((h.downloads[0].bytes.toString().match(/\/Type \/Page\b/g)||[]).length,7);
  assert.equal(h.node('#exportProgressBar').max,7); assert.equal(h.node('#exportProgressBar').value,7);
});
test('numeric controls stay consistent with exported settings and retain source locks', async () => {
  const h = harness(); await h.select(pdfFile()); const gate = h.pause(), pending = h.export(); await gate.entered.promise;
  assert.equal(h.node('#margin').disabled,true); assert.equal(h.node('#sourceWidth').disabled,true);
  h.node('#margin').value='25'; h.run("setNumericState('margin', $('#margin'), {min:0,max:100})");
  assert.equal(Number(h.node('#margin').value),6);
  gate.release.resolve(); await pending;
  assert.equal(h.node('#margin').disabled,false); assert.equal(h.node('#sourceWidth').disabled,true);
  await h.select(imageFile()); assert.equal(h.node('#sourceWidth').disabled,false);
});
test('an intervening completed export makes an earlier Reset confirmation obsolete', async () => {
  const h = harness(); await h.select(pdfFile()); const reset=h.confirmReset(); await h.export(); reset.resolve(true); await reset.promise;
  assert.equal(h.run('selectedFile?.name'),'alpha.pdf'); assert.equal(h.downloads.length,1);
});
test('real multi-page selection and loaded Undo preserve source content and geometry', async () => {
  const h = harness();
  const bytes = fs.readFileSync(path.join(__dirname, 'fixtures', 'multipage.pdf'));
  await h.select({ name: 'pages.pdf', type: 'application/pdf', size: bytes.length, arrayBuffer: async () => Uint8Array.from(bytes).buffer });
  assert.equal(h.run('pdfSource.pages.length'), 3);
  h.run('selectedPdfPages=new Set([0,2]);activePdfPageIndex=2;state.includeAssemblyMap=true;');
  await h.export();
  assert.equal(h.errors.length, 0);
  const output = h.downloads[0].bytes.toString();
  assert.equal((output.match(/\/Type \/Page\b/g) || []).length, 7);
  assert(output.includes('PAGE ONE VECTOR'));
  assert(!output.includes('PAGE TWO VECTOR'));
  assert(output.includes('PAGE THREE VECTOR'));
  h.remove();
  await h.undo();
  assert.equal(h.run('activePdfPageIndex'), 2);
  assert.equal(h.run('JSON.stringify([...selectedPdfPages])'), '[0,2]');
  await h.export();
  assert(h.downloads[0].bytes.equals(h.downloads[1].bytes));
});

test('superseded image-read decode closes its bitmap without replacing the PDF', async () => {
  const h = harness(), pendingDecode = deferred();
  let closed = 0;
  h.context.decodeHook = () => pendingDecode.promise;
  h.run('decodeImageBitmap=decodeHook');
  const reading = h.select(imageFile());
  await new Promise(resolve => setImmediate(resolve));
  h.remove();
  await h.select(pdfFile('beta.pdf', 'BETA SOURCE'));
  pendingDecode.resolve({ width: 2, height: 3, close() { closed++; } });
  await reading;
  assert.equal(closed, 1);
  assert.equal(h.run('selectedFile.name'), 'beta.pdf');
  assert.equal(h.run('imageSource'), null);
});

test('late image-read errors cannot publish into a replacement PDF', async () => {
  const h = harness(), decodeFailure = deferred();
  h.context.decodeHook = () => decodeFailure.promise;
  h.run('decodeImageBitmap=decodeHook');
  const badRead = h.select(imageFile());
  await new Promise(resolve => setImmediate(resolve));
  await h.select(pdfFile());
  const before = h.node('#exportStatus').textContent;
  decodeFailure.reject(new Error('late decode failure'));
  await badRead;
  assert.equal(h.errors.length, 0);
  assert.equal(h.node('#exportStatus').textContent, before);
});
