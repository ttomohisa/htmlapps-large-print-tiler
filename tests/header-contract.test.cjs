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

function header({ locale = 'en-US', savedLanguage = null, storageUnavailable = false, commonLanguage=null,url='https://example.test/',languages } = {}) {
  const storage=new Map();if(savedLanguage)storage.set(`${config.slug}:language`,savedLanguage);if(commonLanguage)storage.set('browser-kitty:ui-language:v1',commonLanguage);
  const app=require('./common-ui-harness.cjs').boot(path.resolve(__dirname,'..',process.env.TILER_HTML||'src/index.template.html'),{language:locale,languages,stored:storage,readFailure:storageUnavailable,writeFailure:storageUnavailable,url});
  return{document:app.document,node:selector=>app.document.querySelector(selector),storage,writes:app.writes,click:()=>app.el('languageButton').click()};
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
      assert.equal(h.storage.get('browser-kitty:ui-language:v1'), expected);
    }
    const savedLanguage = h.storage.get('browser-kitty:ui-language:v1');
    assertHeader(header({ locale, commonLanguage:savedLanguage }), savedLanguage);
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

test('language priority is URL, shared, read-only legacy, ordered browser, English',()=>{
 for(const[options,expected]of [[{url:'https://example.test/?lang=ja',commonLanguage:'en',savedLanguage:'en'},'ja'],[{commonLanguage:'ja',savedLanguage:'en'},'ja'],[{savedLanguage:'ja'},'ja'],[{languages:['fr','ja-JP','en-US']},'ja'],[{languages:['fr'],locale:'fr'},'en']]){const h=header(options);assertHeader(h,expected);assert.equal(h.writes.length,0);}
 const h=header({savedLanguage:'ja'});h.click();assert.equal(h.storage.get(`${config.slug}:language`),'ja');assert.equal(h.storage.get('browser-kitty:ui-language:v1'),'en');
});
