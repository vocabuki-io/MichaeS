// sw.js — ミカエス Service Worker
// 方針:
//   - アプリシェル（HTML/JSX/JS/manifest/アイコン）は install 時にプリキャッシュ
//   - HTML は network-first（更新がすぐ届く。オフライン時はキャッシュ）
//   - 同一オリジンのシェル資産は cache-first
//   - CDN（unpkg の React/Babel）と Google Fonts は cache-first（バージョン付きURLなので安全）
//   - 更新は VERSION を上げる → 旧キャッシュは activate で掃除
const VERSION = 'michaes-v33';
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
  '今日は、寄り道した先にいいことがある。',
  '迷ったら、軽い方を選ぶと流れに乗れる日。',
  '小さく動くほど、運が味方する。',
  '昨日の自分に、少し優しくしていい一日。',
  '今日拾う偶然は、あとで効いてくる。',
  '急がない人に、いい知らせが届く日。',
  'ひと息つくと、答えが向こうから来る。',
  '今日は「やめておく」も正解になる。',
  '誰かのひと言が、背中をそっと押す日。',
  '好きな色を身につけると、調子が出る。',
  '遠回りが、いちばんの近道になる一日。',
  '今日は受け取り上手でいるといい。',
  '小さな「ありがとう」が運を連れてくる。',
  '気になったものは、見に行っていい日。',
  '今日は早めに休むと、明日が軽い。',
  '手放したぶんだけ、いいものが入る。',
  '笑った回数が、そのまま運になる日。',
  '今日のひらめきは、メモしておくと吉。',
  'ゆっくり歩くと、いい景色に気づく。',
  '今日は自分を甘やかしていい日。',
  '迷子の時間も、ちゃんと意味になる。',
  '今日は初めての道を選ぶと楽しい。',
  '温かい飲み物が、いい流れを呼ぶ。',
  '言いそびれた言葉を、今日は言える。',
  '小さな整理が、大きな安心になる日。',
  '今日は人に頼ると、うまく回る。',
  '期待しすぎないほうが、うれしい日。',
  '目についた本に、ヒントが隠れてる。',
  '今日は深呼吸ひとつで流れが変わる。',
  'やりたいことを、ひとつだけ叶える日。',
  '今日は静かな時間が味方になる。',
  'ふと思い出した人に、いい縁がある。',
  '今日は「まあいっか」がお守りになる。',
  '散歩の途中に、小さな発見がある日。',
  '今日は丁寧にいれたお茶がよく合う。',
  '焦らず待つと、ちょうどよく届く。',
  '今日のあなたの選択は、たぶん正しい。',
  '窓を開けると、いい風が入ってくる日。',
  '今日は誰かを褒めると、自分も上がる。',
  '眠る前のひと言「おつかれ」が効く。',
];
function pickFortune() {
  return FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
}

// ── 再浮上: IndexedDB(michaes/kv)から棚と設定を読み、SW側で「見返す1件」を選ぶ ──
// （保存内容はサーバーに出さず、この端末のIDBだけで完結）
function idbGet(key) {
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open('michaes', 1); } catch (e) { resolve(null); return; }
    req.onupgradeneeded = () => { try { const db = req.result; if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); } catch (e) {} };
    req.onsuccess = () => {
      try {
        const db = req.result;
        const tx = db.transaction('kv', 'readonly');
        const rq = tx.objectStore('kv').get(key);
        rq.onsuccess = () => resolve(rq.result);
        rq.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    };
    req.onerror = () => resolve(null);
  });
}
function rsfTitle(it) {
  if (!it) return '';
  if (it.kind === 'image') return '画像';
  if (it.kind === 'link') return (it.label || it.url || 'リンク');
  return ((it.text || '').split('\n')[0] || 'メモ').slice(0, 40);
}
async function showResurface() {
  const shelves = (await idbGet('shelves')) || {};
  const settings = (await idbGet('settings')) || {};
  if (settings.resurface === false) return; // OFF中の誤爆防止（二重ガード）
  const perDayMap = { 'おまかせ': 1, '1件': 1, '3件': 3 };
  const n = perDayMap[settings.perDay] || 1;
  const all = [];
  Object.keys(shelves).forEach((k) => (shelves[k] || []).forEach((it) => all.push(it)));
  const DAY = 86400000, now = Date.now();
  let title = 'ミカエス ・ 再浮上', body;
  if (!all.length) {
    body = '何か貼って、あとで見返そう ✦';
  } else {
    // 「冷めかけ（1日以上前）」を優先プールにしてランダム（毎回同じにならない）
    let pool = all.filter((it) => now - (it.at || 0) > DAY);
    if (!pool.length) pool = all.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    const pick = pool.slice(0, n);
    const first = rsfTitle(pick[0]);
    body = pick.length <= 1
      ? '「' + first + '」、そろそろ見返す？'
      : '「' + first + '」ほか' + (pick.length - 1) + '件、温かいうちに';
  }
  await self.registration.showNotification(title, {
    body: body, icon: 'icon-192.png', badge: 'icon-192.png',
    tag: 'michaes-resurface', data: { url: './index.html' },
  });
}

self.addEventListener('push', (e) => {
  let data = null;
  if (e.data) { try { data = e.data.json(); } catch (x) { data = null; } }
  // 再浮上の合図 → 中身はSWがIDBから選ぶ
  if (data && data.type === 'resurface') { e.waitUntil(showResurface()); return; }
  // それ以外は占い（{title,body} or ペイロードレス）
  let title = 'ミカエス';
  let body = pickFortune();
  if (data && (data.title || data.body)) { title = data.title || title; body = data.body || body; }
  else if (e.data && !data) { try { const t = e.data.text(); if (t) body = t; } catch (y) {} }
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
