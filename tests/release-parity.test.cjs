const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function appScript(file) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  const app = scripts.find(match => match[1].includes('const paperPresets'));
  assert(app, `Application script missing: ${file}`);
  return app[1].replace(/^      const (APP_CONFIG|BUILD_MANIFEST|assetBundle) = .*;$/gm, '      const $1 = __BUILD_VALUE__;');
}
test('tracked root release contains the exact editable application script', () => {
  const hash = text => require('node:crypto').createHash('sha256').update(text).digest('hex');
  assert.equal(hash(appScript('large-print-tiler.html')), hash(appScript('src/index.template.html')), 'Run the default standalone build to refresh the tracked root release');
});
