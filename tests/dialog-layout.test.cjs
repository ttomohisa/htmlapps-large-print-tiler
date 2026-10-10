const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.resolve(__dirname, '..', process.env.TILER_HTML || 'src/index.template.html'), 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const rule = selector => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(match => match[1].trim() === selector).map(match => match[2]).join(';');

// Contracts complement native viewport/wheel verification; they do not simulate geometry.
test('native dialogs lock the root page scroll', () => {
  assert.match(rule('html:has(dialog[open])'), /overflow\s*:\s*hidden/);
});
test('short reset confirmation keeps its header outside a shrinkable scroll body', () => {
  assert.match(rule('.app-confirm-dialog[open]'), /display\s*:\s*flex/);
  assert.match(rule('.app-confirm-dialog[open]'), /flex-direction\s*:\s*column/);
  assert.match(rule('.app-confirm-header'), /flex\s*:\s*0 0 auto/);
  assert.match(rule('.app-confirm-body'), /min-height\s*:\s*0/);
  assert.match(rule('.app-confirm-body'), /overflow\s*:\s*auto/);
});
test('local-processing badge retains the canonical shield and check paths', () => {
  const badge = html.match(/<div class="local-badge">([\s\S]*?)<\/div>/)[1];
  assert.match(badge, /d="M12 3 5 6v5c0 4\.6 2\.8 8 7 10 4\.2-2 7-5\.4 7-10V6z"/);
  assert.match(badge, /d="m9 12 2 2 4-5"/);
  assert.match(badge, /aria-hidden="true"/);
});

function previewHarness() {
  const elements = new Map();
  function $(selector) {
    if (!elements.has(selector)) elements.set(selector, {
      open: selector === '#tilePreviewDialog',
      listeners: {}, close() { this.open = false; },
      addEventListener(type, handler) { this.listeners[type] = handler; },
      getBoundingClientRect() { return {left: 100, right: 900, top: 30, bottom: 280}; }
    });
    return elements.get(selector);
  }
  const context = {$, tilePreviewRenderGeneration: 0, tileZoom: 1, setTileZoom(value) { context.tileZoom = value; }, fitTileZoom() { context.tileZoom = 0.5; }};
  const begin = html.indexOf("      const tilePreviewDialog = $('#tilePreviewDialog');");
  const end = html.indexOf("      $('#mobilePreviewButton')", begin);
  assert.ok(begin >= 0 && end > begin);
  vm.runInNewContext(html.slice(begin, end), context);
  return {$, context, dialog: $('#tilePreviewDialog')};
}
test('keyboard clicks on sheet zoom controls do not count as backdrop clicks', () => {
  for (const id of ['#tileZoomIn', '#tileZoomOut', '#tileZoomFit', '#tileZoom100']) {
    const h = previewHarness(); const target = h.$(id);
    target.listeners.click();
    h.dialog.listeners.click({target, clientX: 0, clientY: 0, detail: 0});
    assert.equal(h.dialog.open, true, `${id} must remain inside the open preview`);
  }
});
test('actual backdrop clicks still close while dialog-surface clicks remain open', () => {
  const h = previewHarness();
  h.dialog.listeners.click({target: h.dialog, clientX: 110, clientY: 40});
  assert.equal(h.dialog.open, true);
  h.dialog.listeners.click({target: h.dialog, clientX: 10, clientY: 10});
  assert.equal(h.dialog.open, false);
  assert.equal(h.context.tilePreviewRenderGeneration, 1);
});
