// sw.js — ミカエス Service Worker
// 方針:
//   - アプリシェル（HTML/JSX/JS/manifest/アイコン）は install 時にプリキャッシュ
//   - HTML は network-first（更新がすぐ届く。オフライン時はキャッシュ）
//   - 同一オリジンのシェル資産は cache-first
//   - CDN（unpkg の React/Babel）と Google Fonts は cache-first（バージョン付きURLなので安全）
//   - 更新は VERSION を上げる → 旧キャッシュは activate で掃除
const VERSION = 'michaes-v2';
const SHELL_CACHE = VERSION + '-shell';
const RUNTIME_CACHE = VERSION + '-runtime';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './michaes-store.js',
  './ios-frame.jsx',
  './tweaks-panel.jsx',
  './michaes-anims.jsx',
  './michaes-settings.jsx',
  './michaes-app.jsx',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.indexOf(VERSION) !== 0).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isCDN(url) {
  return url.hostname === 'unpkg.com' ||
         url.hostname === 'fonts.googleapis.com' ||
         url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // HTMLナビゲーション: network-first（オフラインならキャッシュのindex）
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // CDN・フォント: cache-first（落ちてきたらruntimeへ）
  if (isCDN(url)) {
    e.respondWith(
      caches.match(req).then((hit) => hit ||
        fetch(req).then((res) => {
          if (res.ok || res.type === 'opaque') {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
      )
    );
    return;
  }

  // 同一オリジンのシェル資産: cache-first（プリキャッシュ済み前提・無ければ取得して格納）
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((hit) => hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
      )
    );
  }
});
