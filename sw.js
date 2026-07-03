// sw.js — ミカエス Service Worker
// 方針:
//   - アプリシェル（HTML/JSX/JS/manifest/アイコン）は install 時にプリキャッシュ
//   - HTML は network-first（更新がすぐ届く。オフライン時はキャッシュ）
//   - 同一オリジンのシェル資産は cache-first
//   - CDN（unpkg の React/Babel）と Google Fonts は cache-first（バージョン付きURLなので安全）
//   - 更新は VERSION を上げる → 旧キャッシュは activate で掃除
const VERSION = 'michaes-v29';
const SHELL_CACHE = VERSION + '-shell';
const RUNTIME_CACHE = VERSION + '-runtime';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './michaes-store.js',
  './michaes-drive.js',
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

// ── Web Push（ペイロードレス）: 本文はここで決める ──
const FORTUNES = [
  '今日は、急がなくていい日。',
  'ふと開いた窓に、いい風が通る。',
  '小さな「できた」が、転がってくる。',
  '誰かのひと言が、お守りになる。',
  '寄り道の先に、見つけものがある。',
  '今日のあなたは、聞き上手。',
  '手放すほど、軽くなる日。',
  'やわらかい返事が、流れを変える。',
  '一杯のお茶が、ちょうどいい区切りに。',
  '迷ったら、明るい方でいい。',
  '静かな時間が、味方になる。',
  '昨日の自分に、少し感謝できる日。',
];
function pickFortune() {
  return FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
}

self.addEventListener('push', (e) => {
  let title = 'ミカエス';
  let body = pickFortune();
  if (e.data) {
    try {
      const d = e.data.json();           // 新Worker: { title, body }
      if (d && (d.title || d.body)) { title = d.title || title; body = d.body || body; }
    } catch (x) {
      try { const t = e.data.text(); if (t) body = t; } catch (y) {}  // 旧形式/素テキスト
    }
  }
  e.waitUntil(self.registration.showNotification(title, {
    body: body,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: 'michaes-fortune',
    data: { url: './index.html' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './index.html';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      for (const c of cs) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
