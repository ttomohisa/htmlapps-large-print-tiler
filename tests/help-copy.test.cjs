const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { gunzipSync } = require('node:zlib');

const rejected = [
  "ダイアログを開いている間は背景をスクロールしません。高さが足りない場合は内容をスクロールでき、個別プレビューのズームはキーボードでも操作できます。",
  "Dialogs keep the background still. Scroll their content when space is short, and use the keyboard to operate sheet-preview zoom without closing the preview.",
  "v1.0.0は初回正式版です。PDF・画像・SVGの分割、プリンター校正、個別プレビュー、スマホ操作、保存・キャンセル、完全ローカル処理をまとめて回帰確認しています。個別プレビューは背景クリックでも閉じられます。",
  "v1.0.0 is the initial stable release. PDF/image/SVG tiling, printer calibration, individual previews, mobile controls, save/cancel flows, and fully local processing are covered by the release regression. Sheet Preview can also be closed by clicking its backdrop.",
  "このバージョンの範囲",
  "Scope of this version"
];

test('help contains user guidance rather than implementation or layout audit prose', () => {
  const root = path.join(__dirname, '..');
  const files = ['src/index.template.html', 'dist/index.html', 'dist/index.self-extract.html',
    ...fs.readdirSync(root).filter(name => name.endsWith('.html'))];
  for (const file of files) {
    const filename = path.join(root, file);
    if (!fs.existsSync(filename)) continue;
    let html = fs.readFileSync(filename, 'utf8');
    const payload = html.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
    if (payload) html = gunzipSync(Buffer.from(payload[1].replace(/\s/g, ''), 'base64')).toString('utf8');
    for (const copy of rejected) assert.ok(!html.includes(copy), `${file}: remove internal-facing help copy: ${copy}`);
  }
});
