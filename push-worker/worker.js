// push-worker/worker.js — ミカエス Push配信 Worker（Cloudflare Workers / 依存なし）
//
// 役割: 「いつ・誰に合図を送るか」だけを持つ。保存内容は一切預からない。
//   - 占い       … 毎日 JST 8/12/21時に {type:'fortune'} を送る（文面はSWが端末内で選ぶ）
//   - 再浮上     … 毎日 JST 22/8/12時に {type:'resurface'} を送る（中身はSWがIndexedDBの棚から選ぶ）
//   - 賞味期限   … expireAt の daysBefore 日前になったら JST 8時に {title, body} を1回送る
//   - /test      … 動作確認用。delay ミリ秒後に指定ペイロードを送る
//
// ストレージ: KV（binding: PUSH_KV）。端末=push購読エンドポイントごとに1レコード。
//   key  = 'sub:' + base64url(SHA-256(endpoint))
//   value= { subscription, fortuneHour?, resurfaceHour?, reminders?: { [url]: {expireAt, daysBefore, title, sent?} } }
//   全機能がOFFになったらレコードごと削除。404/410（購読失効）でも削除。
//
// シークレット/変数（wrangler.toml と `wrangler secret put` で設定）:
//   VAPID_PUBLIC_KEY  … base64url（65byte非圧縮公開鍵。index.html の MICHAES_VAPID_PUBLIC と同じもの）
//   VAPID_PRIVATE_KEY … base64url（32byte秘密スカラー。web-push generate-vapid-keys の privateKey）
//   VAPID_SUBJECT     … mailto: または https: のURL

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (obj, status) => new Response(JSON.stringify(obj || {}), {
  status: status || 200,
  headers: Object.assign({ 'Content-Type': 'application/json' }, CORS),
});

const DAY = 86400000;
const FORTUNE_HOURS = [8, 12, 21];    // michaes-settings.jsx SLOT_HOUR と一致
const RESURFACE_HOURS = [8, 12, 22];  // michaes-settings.jsx RSF_HOUR と一致
const REMIND_HOUR = 8;                // 期限通知を出すJST時刻

// ── base64url / バイナリ小物 ──────────────────────────────
function b64uToBytes(s) {
  s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64u(bytes) {
  let bin = '';
  const u8 = new Uint8Array(bytes);
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function concatBytes() {
  let len = 0;
  for (const a of arguments) len += a.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arguments) { out.set(a, off); off += a.length; }
  return out;
}
const utf8 = (s) => new TextEncoder().encode(s);

async function subKey(endpoint) {
  const h = await crypto.subtle.digest('SHA-256', utf8(endpoint));
  return 'sub:' + bytesToB64u(h);
}

// ── VAPID: ES256 JWT を組み立てて Authorization ヘッダにする ──
async function vapidAuthHeader(env, endpoint) {
  const aud = new URL(endpoint).origin;
  const pub = b64uToBytes(env.VAPID_PUBLIC_KEY); // 65byte: 0x04 || x(32) || y(32)
  const jwk = {
    kty: 'EC', crv: 'P-256',
    x: bytesToB64u(pub.slice(1, 33)),
    y: bytesToB64u(pub.slice(33, 65)),
    d: env.VAPID_PRIVATE_KEY,
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = bytesToB64u(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = bytesToB64u(utf8(JSON.stringify({
    aud: aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT || 'mailto:admin@michae-s.com',
  })));
  const signing = header + '.' + claims;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(signing));
  return 'vapid t=' + signing + '.' + bytesToB64u(sig) + ', k=' + env.VAPID_PUBLIC_KEY;
}

// ── ペイロード暗号化（RFC 8291 / aes128gcm）──────────────
async function encryptPayload(subscription, plaintext) {
  const uaPub = b64uToBytes(subscription.keys.p256dh); // 65byte
  const authSecret = b64uToBytes(subscription.keys.auth); // 16byte

  // 送信側の使い捨てECDH鍵ペア
  const asKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey)); // 65byte
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));

  // HKDF #1: IKM = HKDF(salt=auth, ikm=ecdh, info="WebPush: info"||0x00||ua_pub||as_pub, 32)
  const hkdf = (ikm) => crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const ikmKey = await hkdf(ecdh);
  const info1 = concatBytes(utf8('WebPush: info\0'), uaPub, asPub);
  const ikm = new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: info1 }, ikmKey, 256));

  // HKDF #2: salt=乱数16byte → CEK(16) と NONCE(12)
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prkKey = await hkdf(ikm);
  const cek = new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt, info: utf8('Content-Encoding: aes128gcm\0') }, prkKey, 128));
  const nonce = new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt, info: utf8('Content-Encoding: nonce\0') }, prkKey, 96));

  // 本文 + レコード終端デリミタ(0x02) を AES-128-GCM で
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const padded = concatBytes(utf8(plaintext), new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded));

  // ボディ: salt(16) || rs(4) || idlen(1) || as_pub(65) || 暗号文
  const headerBlock = new Uint8Array(16 + 4 + 1 + 65);
  headerBlock.set(salt, 0);
  new DataView(headerBlock.buffer).setUint32(16, 4096); // record size
  headerBlock[20] = 65;
  headerBlock.set(asPub, 21);
  return concatBytes(headerBlock, cipher);
}

// ── 1件送信。購読失効(404/410)なら false を返す ──────────
async function sendPush(env, subscription, payloadObj, ttl) {
  try {
    const body = await encryptPayload(subscription, JSON.stringify(payloadObj || {}));
    const r = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': await vapidAuthHeader(env, subscription.endpoint),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        'TTL': String(ttl || 86400),
        'Urgency': 'normal',
      },
      body: body,
    });
    if (r.status === 404 || r.status === 410) return false; // 失効 → 呼び出し側で掃除
    return true;
  } catch (e) {
    return true; // 一時的な失敗では消さない
  }
}

// ── KVレコードの読み書き ──────────────────────────────
async function loadRec(env, endpoint) {
  const key = await subKey(endpoint);
  const rec = await env.PUSH_KV.get(key, 'json');
  return { key: key, rec: rec || null };
}
async function saveOrClean(env, key, rec) {
  const empty = !rec || (rec.fortuneHour == null && rec.resurfaceHour == null &&
    (!rec.reminders || !Object.keys(rec.reminders).length));
  if (empty) await env.PUSH_KV.delete(key);
  else await env.PUSH_KV.put(key, JSON.stringify(rec));
}

// ── HTTP ハンドラ ────────────────────────────────────
async function handleFetch(req, env, ctx) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const path = new URL(req.url).pathname;
  let b;
  try { b = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); }

  // 登録系は subscription 必須、解除系は endpoint だけでよい
  const sub = b.subscription;
  const endpoint = (sub && sub.endpoint) || b.endpoint;
  if (!endpoint) return json({ error: 'no endpoint' }, 400);

  if (path === '/test') {
    if (!sub) return json({ error: 'no subscription' }, 400);
    const payload = b.payload || { title: b.title, body: b.body };
    const delay = Math.min(Number(b.delay) || 0, 25000);
    const task = (async () => {
      if (delay) await new Promise((res) => setTimeout(res, delay));
      await sendPush(env, sub, payload, 120);
    })();
    ctx.waitUntil(task);
    return json({ ok: true });
  }

  const { key, rec: prev } = await loadRec(env, endpoint);
  const rec = prev || { subscription: sub, reminders: {} };
  if (sub) rec.subscription = sub; // 最新の購読情報で上書き

  if (path === '/subscribe') {
    if (!sub) return json({ error: 'no subscription' }, 400);
    rec.fortuneHour = FORTUNE_HOURS.indexOf(Number(b.hour)) >= 0 ? Number(b.hour) : 8;
  } else if (path === '/unsubscribe') {
    if (!prev) return json({ ok: true });
    delete rec.fortuneHour;
  } else if (path === '/resurface') {
    if (!sub) return json({ error: 'no subscription' }, 400);
    rec.resurfaceHour = RESURFACE_HOURS.indexOf(Number(b.hour)) >= 0 ? Number(b.hour) : 12;
  } else if (path === '/unresurface') {
    if (!prev) return json({ ok: true });
    delete rec.resurfaceHour;
  } else if (path === '/remind') {
    if (!sub || !b.url || !b.expireAt) return json({ error: 'bad remind' }, 400);
    rec.reminders = rec.reminders || {};
    rec.reminders[b.url] = {
      expireAt: Number(b.expireAt),
      daysBefore: Number(b.daysBefore) || 0,
      title: String(b.title || b.url).slice(0, 120),
    };
  } else if (path === '/unremind') {
    if (!prev) return json({ ok: true });
    if (rec.reminders && b.url) delete rec.reminders[b.url];
  } else {
    return json({ error: 'not found' }, 404);
  }

  await saveOrClean(env, key, rec);
  return json({ ok: true });
}

// ── 定時配信（cron: 毎時0分）──────────────────────────
async function handleScheduled(env) {
  const now = Date.now();
  const jstHour = (new Date(now).getUTCHours() + 9) % 24;

  let cursor;
  do {
    const page = await env.PUSH_KV.list({ prefix: 'sub:', cursor: cursor });
    cursor = page.list_complete ? null : page.cursor;
    for (const k of page.keys) {
      const rec = await env.PUSH_KV.get(k.name, 'json');
      if (!rec || !rec.subscription) { await env.PUSH_KV.delete(k.name); continue; }
      let dirty = false;
      let alive = true;

      if (alive && rec.fortuneHour === jstHour) {
        alive = await sendPush(env, rec.subscription, { type: 'fortune' });
      }
      if (alive && rec.resurfaceHour === jstHour) {
        // 合図だけ送る。どの保存物を出すかはSWが端末内のIndexedDBから選ぶ
        alive = await sendPush(env, rec.subscription, { type: 'resurface' });
      }
      if (alive && jstHour === REMIND_HOUR && rec.reminders) {
        for (const url of Object.keys(rec.reminders)) {
          const rm = rec.reminders[url];
          if (rm.expireAt + DAY < now) { delete rec.reminders[url]; dirty = true; continue; } // 期限切れは掃除
          if (rm.sent || now < rm.expireAt - rm.daysBefore * DAY) continue;
          alive = await sendPush(env, rec.subscription, {
            title: 'ミカエス ・ 賞味期限',
            body: '「' + rm.title + '」、' + (rm.daysBefore === 0 ? '今日まで' : 'そろそろ期限') + ' ✦',
          });
          if (!alive) break;
          rm.sent = true;
          dirty = true;
        }
      }

      if (!alive) { await env.PUSH_KV.delete(k.name); continue; } // 購読失効
      if (dirty) await saveOrClean(env, k.name, rec);
    }
  } while (cursor);
}

export default {
  fetch: handleFetch,
  scheduled: (event, env, ctx) => ctx.waitUntil(handleScheduled(env)),
};
