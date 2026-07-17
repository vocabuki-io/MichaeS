// test-harness.js — ミカエス統合テスト（jsdom + fake-indexeddb）
// tap.html と同じ読み込み順で jsx を Babel 変換して実行し、実操作を再現する。
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const { JSDOM } = require('jsdom');

const FILES = ['ios-frame.jsx', 'tweaks-panel.jsx', 'michaes-anims.jsx', 'michaes-settings.jsx', 'michaes-app.jsx'];

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✔ ' + name); }
  else { fail++; console.log('  ✘ ' + name + (extra ? ' — ' + extra : '')); }
}

async function flush(ms) { await new Promise(r => setTimeout(r, ms)); }

async function boot({ clipboardText } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
    url: 'https://example.test/', pretendToBeVisual: true,
  });
  const { window } = dom;
  // ---- polyfills ----
  require('fake-indexeddb/auto'); // sets global.indexedDB
  window.indexedDB = global.indexedDB;
  window.URL.createObjectURL = () => 'blob:fake-' + Math.random().toString(36).slice(2);
  window.URL.revokeObjectURL = () => {};
  // clipboard mock
  window.navigator.clipboard = clipboardText !== undefined ? {
    readText: async () => clipboardText,
    writeText: async () => {},
  } : undefined;
  // globals must exist BEFORE requiring react-dom (canUseDOM is evaluated at module init;
  // without document, React falls into its IE9 attachEvent path and input events break)
  global.window = window; global.document = window.document; global.navigator = window.navigator;
  global.CustomEvent = window.CustomEvent; global.Blob = window.Blob;
  global.URL.createObjectURL = window.URL.createObjectURL;
  for (const k of Object.keys(require.cache)) {
    if (/react|scheduler/.test(k)) delete require.cache[k];
  }
  window.React = require('react');
  const ReactDOMClient = require('react-dom/client');
  window.ReactDOM = Object.assign({}, require('react-dom'), { createRoot: ReactDOMClient.createRoot });

  // load store first (plain js, like patched tap.html)
  const storeSrc = fs.readFileSync(path.join(__dirname, 'michaes-store.js'), 'utf8');
  new Function('window', 'document', 'navigator', 'indexedDB', storeSrc + '\n')(window, window.document, window.navigator, window.indexedDB);

  for (const f of FILES) {
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
    // ブラウザ側は <script type="text/babel">（Babel standalone = classic runtime）で動くので合わせる。
    // automatic runtimeだと jsx-runtime の import が吐かれ、この素の eval では動かない。
    const out = babel.transformSync(src, { presets: [['@babel/preset-react', { runtime: 'classic' }]], filename: f }).code;
    const React = window.React, ReactDOM = window.ReactDOM;
    try {
      new Function('window', 'document', 'navigator', 'React', 'ReactDOM', 'indexedDB', 'CustomEvent',
        'with (window) {\n' + out + '\n}')(
        window, window.document, window.navigator, React, ReactDOM, window.indexedDB, window.CustomEvent);
    } catch (e) {
      throw new Error('script eval failed in ' + f + ': ' + e.message);
    }
  }
  return { dom, window };
}

function q(window, sel) { return window.document.querySelector(sel); }
function qa(window, sel) { return Array.from(window.document.querySelectorAll(sel)); }
function click(window, el) {
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

(async () => {
  console.log('== 1. 起動・初期描画 ==');
  let { window } = await boot({ clipboardText: 'https://youtu.be/abc123XYZ' });
  await flush(80);
  ok('Appがマウントされる', !!q(window, '.screen'));
  ok('ペーストの玉が出る', !!q(window, '.orb'));
  ok('動詞5ボタンが出る', qa(window, '.verb').length === 5);
  ok('設定の歯車が出る', !!q(window, '.gear-btn'));

  console.log('== 2. 貼る → リンク判定 ==');
  click(window, q(window, '.orb'));
  await flush(120);
  ok('仕分けフェーズに入る', !!q(window, '.item-card'));
  ok('YouTubeリンクとして判定', (q(window, '.item-url') || { textContent: '' }).textContent.includes('youtu.be/abc123XYZ') && !!q(window, '.svc-badge'),
    (q(window, '.item-url') || {}).textContent);

  console.log('== 3. ミルへ仕分け → アニメ → 棚に入る ==');
  const verbs = qa(window, '.verb');
  click(window, verbs[0]); // ミル
  await flush(80);
  ok('中央アニメが走る', !!q(window, '.anim-miru'));
  await flush(1700);  // anim 1500ms + toast開始
  ok('トーストが出る', !!q(window, '.toast'));
  await flush(1300);  // toast 1100ms
  ok('待機に戻る', !!q(window, '.orb'));
  ok('ミルにバッジ1', (q(window, '.badge') || {}).textContent === '1');

  console.log('== 4. 永続化（IndexedDBに書けている） ==');
  await flush(150);
  const saved = await window.MichaeSStore.load();
  ok('miru棚に1件保存', saved && saved.miru && saved.miru.length === 1, JSON.stringify(saved));
  ok('atタイムスタンプ付き', !!(saved.miru && saved.miru[0] && saved.miru[0].at));

  console.log('== 5. 棚ページを開く（コピー/相対時刻） ==');
  click(window, qa(window, '.verb')[0]);
  await flush(80);
  ok('ミルの棚が開く', !!q(window, '.shelf'));
  ok('アイテムが並ぶ', qa(window, '.shelf-item').length === 1);
  ok('相対時刻表示（たった今）', q(window, '.shelf-item-meta').textContent.includes('たった今'));
  // 戻る
  click(window, q(window, '.home-orb'));
  await flush(50);

  console.log('== 6. リロード再現（別インスタンスで復元） ==');
  ;({ window } = await boot({ clipboardText: 'メモ：豆乳を買う' }));
  await flush(150);
  ok('リロード後もミルにバッジ1（復元）', (q(window, '.badge') || {}).textContent === '1');

  console.log('== 7. テキスト貼り → スキへ ==');
  click(window, q(window, '.orb'));
  await flush(120);
  ok('テキストとして表示', !!q(window, '.item-text'));
  click(window, qa(window, '.verb')[4]); // スキ
  await flush(3100);
  const saved2 = await window.MichaeSStore.load();
  ok('スキ棚に1件・ミル棚も維持', saved2.suki && saved2.suki.length === 1 && saved2.miru.length === 1);

  console.log('== 8. ミセル → 誰メモ ==');
  // クリップボードを差し替えてもう1回貼る
  window.navigator.clipboard.readText = async () => 'https://x.com/foo/status/1';
  click(window, q(window, '.orb'));
  await flush(120);
  click(window, qa(window, '.verb')[3]); // ミセル
  await flush(80);
  ok('誰に見せる？が出る', !!q(window, '.who-card'));
  // 入力して決める
  const inp = q(window, '.who-input');
  const setVal = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setVal.call(inp, 'あゆむ');
  inp.dispatchEvent(new window.Event('input', { bubbles: true }));
  await flush(30);
  const goBtn = q(window, '.who-go');
  ok('決めるボタンが有効化', !goBtn.disabled);
  click(window, goBtn);
  await flush(3100);
  const saved3 = await window.MichaeSStore.load();
  ok('ミセル待ちに相手付きで保存', saved3.miseru && saved3.miseru[0] && saved3.miseru[0].who === 'あゆむ', JSON.stringify(saved3.miseru));

  console.log('== 9. 設定画面 ==');
  click(window, q(window, '.gear-btn'));
  await flush(80);
  ok('設定が開く', !!q(window, '.settings'));
  ok('占いの配信行がある', qa(window, '.set-row').some(b => b.textContent.includes('配信')));
  // 全削除フロー
  const folds = qa(window, '.fold-head');
  const dataFold = folds.find(b => b.textContent.includes('データ'));
  click(window, dataFold);
  await flush(40);
  const wipeRow = qa(window, '.set-row.tappable').find(b => b.textContent.includes('全削除'));
  click(window, wipeRow);
  await flush(40);
  ok('全削除ダイアログ', !!q(window, '.dialog'));
  const yes = qa(window, '.dlg-yes').find(b => b.textContent.includes('手放す'));
  click(window, yes);
  await flush(200);
  const saved4 = await window.MichaeSStore.load();
  const total = Object.values(saved4 || {}).reduce((n, a) => n + (a ? a.length : 0), 0);
  ok('全削除がIndexedDBにも反映', total === 0, JSON.stringify(saved4));

  console.log('== 10. クリップボード不可 → 空っぽ画面（クラッシュしない） ==');
  ;({ window } = await boot({}));  // clipboard undefined → 空っぽ画面へ
  await flush(120);
  click(window, q(window, '.orb'));
  await flush(120);
  ok('クリップボード不可なら空っぽ画面', !!q(window, '.empty') && !q(window, '.item-card'),
    (q(window, '.top-sub') || {}).textContent);
  // 「もう一度」で待機に戻れる
  const again = q(window, '.again');
  ok('やり直しボタンがある', !!again);
  if (again) { click(window, again); await flush(60); ok('待機に戻る', !!q(window, '.orb')); }

  console.log('\n結果: pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
