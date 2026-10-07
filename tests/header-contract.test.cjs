// Execute the real language initialization, translations, renderer and click handler.
// Non-header layout routines and DOM/storage boundaries are doubles, not browser QA.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const config = require('../app.config.json');
const html = fs.readFileSync(path.resolve(__dirname, '..', process.env.TILER_HTML || 'src/index.template.html'), 'utf8');
const embeddedConfig = html.match(/^      const APP_CONFIG = (.*);$/m)?.[1];
assert.ok(embeddedConfig, 'Missing production app config');
const runtimeConfig = embeddedConfig === '__APP_CONFIG_JSON__' ? config : JSON.parse(embeddedConfig);

function header({ locale = 'en-US', savedLanguage = null, storageUnavailable = false } = {}) {
  const nodes = new Map(), listeners = new Map();
  const storage = new Map(savedLanguage ? [[`${config.slug}:language`, savedLanguage]] : []);
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      textContent: '', title: '', dataset: selector === '[data-i18n="localBadge"]' ? { i18n: 'localBadge' } : {},
      setAttribute(name, value) { this[name] = value; },
      getAttribute(name) { return this[name] ?? null; },
      addEventListener(type, handler) { listeners.set(`${selector}:${type}`, handler); }
    });
    return nodes.get(selector);
  };
  const document = {
    documentElement: { lang: 'ja' },
    querySelector: node,
    querySelectorAll: selector => selector === '[data-i18n]' ? [node('[data-i18n="localBadge"]')] : []
  };
  const context = vm.createContext({
    document, APP_CONFIG: runtimeConfig, navigator: { language: locale },
    localStorage: {
      getItem(key) { if (storageUnavailable) throw new Error('Storage unavailable'); return storage.get(key) ?? null; },
      setItem(key, value) { if (storageUnavailable) throw new Error('Storage unavailable'); storage.set(key, value); }
    },
    syncControlsFromState() {}, renderSelectedFile() {}, renderDynamic() {}, updatePdfMeta() {}, updateExportState() {}
  });
  const run = code => vm.runInContext(code, context);
  function section(start, end) {
    const offset = html.indexOf(start);
    assert.ok(offset >= 0, `Missing production section: ${start}`);
    const endOffset = html.indexOf(end, offset + start.length);
    assert.ok(endOffset >= 0, `Missing production boundary: ${end}`);
    return html.slice(offset, endOffset);
  }
  run(section('      const translations =', '      const SVG_NS'));
  run(html.match(/^      const storageKeys = .*$/m)[0]);
  run(section('      function readStorage(', '      function safeNumber('));
  run(html.match(/^      let language = .*$/m)[0]);
  run(section('      function applyLanguage()', '      window.__largePrintTilerTest'));
  run(html.match(/^      \$\('#languageButton'\)\.addEventListener\('click'.*$/m)[0]);
  run('applyLanguage()');
  return { document, node, storage, click: () => listeners.get('#languageButton:click')() };
}

function assertHeader(h, language) {
  const button = h.node('#languageButton');
  const label = language === 'ja' ? '英語に切り替え' : 'Switch to Japanese';
  assert.equal(h.document.documentElement.lang, language);
  assert.equal(button.textContent, language === 'ja' ? 'EN' : 'JA');
  assert.equal(button.getAttribute('aria-label'), label);
  assert.equal(button.title, label);
  assert.equal(h.node('#versionBadge').textContent, `v${config.version}`);
  assert.match(h.node('#versionBadge').textContent, /^v\d+\.\d+\.\d+$/);
  assert.equal(h.node('[data-i18n="localBadge"]').textContent, language === 'ja' ? '完全ローカル処理' : 'Fully local processing');
}

for (const [locale, language] of [['ja-JP', 'ja'], ['en-US', 'en']]) {
  test(`fresh ${locale} header has target language, localized tooltip, local badge and canonical version`, () => {
    const h = header({ locale });
    assertHeader(h, language);
    for (const expected of [language === 'ja' ? 'en' : 'ja', language, language === 'ja' ? 'en' : 'ja']) {
      h.click(); assertHeader(h, expected);
      assert.equal(h.storage.get(`${config.slug}:language`), expected);
    }
    const savedLanguage = h.storage.get(`${config.slug}:language`);
    assertHeader(header({ locale, savedLanguage }), savedLanguage);
  });
  test(`header switches normally when storage is unavailable for ${locale}`, () => {
    const h = header({ locale, storageUnavailable: true });
    assertHeader(h, language); h.click(); assertHeader(h, language === 'ja' ? 'en' : 'ja');
  });
}

test('Japanese static header matches its action and configured release before startup', () => {
  const button = html.match(/<button\b[^>]*id="languageButton"[^>]*>EN<\/button>/)?.[0];
  assert.ok(button);
  assert.match(button, /aria-label="英語に切り替え"/);
  assert.match(button, /title="英語に切り替え"/);
  assert.ok(html.includes(`id="versionBadge">v${config.version}<`));
});
