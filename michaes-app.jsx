// michaes-app.jsx — ミカエス「いま貼る(X)」コアループ v3
// 真ん中＝ペースト。実クリップボード対応（リンク／テキスト／Markdown／画像）。
// リンクが X / YouTube / TikTok / Instagram / niconico ならカード左上にアイコン。
// 下の動詞ボタンは待機中＝棚（出口画面）への入口、仕分け中＝動詞5択。
// 依存: React, ios-frame.jsx (IOSDevice), tweaks-panel.jsx, michaes-anims.jsx

const { useState, useRef, useEffect } = React;

const VERBS = [
  { id: 'miru',   label: 'ミル',   dest: 'ミルの棚へ' },
  { id: 'kiku',   label: 'キク',   dest: 'キクの棚へ' },
  { id: 'tsukau', label: 'ツカウ', dest: 'ツカウ箱へ' },
  { id: 'miseru', label: 'ミセル', dest: 'ミセル待ちへ' },
  { id: 'suki',   label: 'スキ',   dest: 'スキに追加' },
];

const SHELF = {
  miru:   { title: 'ミルの棚',   sub: '目が空いたとき、1件ずつ' },
  kiku:   { title: 'キクの棚',   sub: 'イヤホンのお供に' },
  tsukau: { title: 'ツカウ箱',   sub: 'プロジェクトの素材置き場' },
  miseru: { title: 'ミセル待ち', sub: '相手と一緒に並んでる' },
  suki:   { title: 'スキ',       sub: 'ただ好き。それでいい' },
};

const SVC_NAME = { x: 'X', youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', niconico: 'niconico', web: 'リンク' };
const ytTypeLabel = (t) => ({ short: 'ショート', video: '動画' }[t] || null);

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "lightBeam": 0.8,
  "goldAmount": 0.8,
  "cardRadius": 26,
  "animSpeed": "ふつう"
}/*EDITMODE-END*/;

const SPEED = { 'ゆっくり': 1.5, 'ふつう': 1, 'きびきび': 0.65 };

// 親指圏アーク：外側ほど持ち上げる
const ARC_Y = [-22, -8, 0, -8, -22];

// ── 貼り付け内容の解釈 ──────────────────────────────
function detectService(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    if (h === 'x.com' || h === 'twitter.com') return 'x';
    if (h.endsWith('youtube.com') || h === 'youtu.be') return 'youtube';
    if (h.endsWith('tiktok.com')) return 'tiktok';
    if (h.endsWith('instagram.com')) return 'instagram';
    if (h.endsWith('nicovideo.jp') || h === 'nico.ms') return 'niconico';
    return 'web';
  } catch (e) { return 'web'; }
}

function prettyUrl(url) {
  try {
    const u = new URL(url);
    const p = u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : '');
    return p.length > 36 ? p.slice(0, 36) + '…' : p;
  } catch (e) { return url; }
}

function clip(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }

// ── 埋込みプレイヤー判定（URLから埋込みURL＋高さを生成。対応外はnull） ──
function embedFor(it) {
  if (!it || it.kind !== 'link' || !it.url) return null;
  let u;
  try { u = new URL(it.url); } catch (e) { return null; }
  const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
  // YouTube（ミルの動画）
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'music.youtube.com') {
    let id = '';
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (u.pathname.startsWith('/shorts/')) id = u.pathname.split('/')[2] || '';
    else if (u.pathname.startsWith('/embed/')) id = u.pathname.split('/')[2] || '';
    else id = u.searchParams.get('v') || '';
    if (/^[A-Za-z0-9_-]{6,}$/.test(id)) return { kind: 'youtube', src: 'https://www.youtube.com/embed/' + id, ratio: true };
    return null;
  }
  // Spotify
  if (host === 'open.spotify.com') {
    const m = u.pathname.match(/^\/(?:intl-[a-z]+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]+)/);
    if (m) return { kind: 'spotify', src: 'https://open.spotify.com/embed/' + m[1] + '/' + m[2], height: m[1] === 'track' || m[1] === 'episode' ? 152 : 352 };
    return null;
  }
  // Apple Music（ホストをembed.music.apple.comに差替え、path+searchは維持）
  if (host === 'music.apple.com' || host === 'embed.music.apple.com') {
    return { kind: 'applemusic', src: 'https://embed.music.apple.com' + u.pathname + u.search, height: 175 };
  }
  // SoundCloud
  if (host === 'soundcloud.com') {
    const clean = 'https://soundcloud.com' + u.pathname;
    return { kind: 'soundcloud', src: 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(clean) + '&color=%23FF7D5E&auto_play=false&show_user=true', height: 166 };
  }
  return null;
}

// ── エクスポート（JSON書き出し） ─────────────────
function dateStamp() {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
}
function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}
// 棚を再インポート可能な形に整形（画像blobはdataURL化、object URLは落とす）
async function buildExport(shelves) {
  const out = {};
  const keys = Object.keys(shelves || {});
  for (const k of keys) {
    out[k] = [];
    for (const it of (shelves[k] || [])) {
      if (it.kind === 'image' && it.blob) {
        let data = null;
        try { data = await blobToDataURL(it.blob); } catch (e) { data = null; }
        out[k].push({ kind: 'image', who: it.who, at: it.at, data });
      } else {
        const c = {};
        for (const p in it) { if (p !== 'blob' && p !== 'src') c[p] = it[p]; }
        out[k].push(c);
      }
    }
  }
  return { app: 'MichaeS', schema: 1, exportedAt: new Date().toISOString(), shelves: out };
}
function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch (e) {} }, 0);
}

// ── インポート（書き出したJSONから戻す） ──
function dataURLtoBlob(dataURL) {
  const comma = dataURL.indexOf(',');
  const head = dataURL.slice(0, comma);
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/png';
  const bin = atob(dataURL.slice(comma + 1));
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
// 重複判定の署名（同じものを二重に取り込まない）
function itemSig(it) {
  if (it.kind === 'link') return 'L:' + it.url;
  if (it.kind === 'image') return 'I:' + (it.at || '');
  return (it.kind || 'T') + ':' + (it.text || '');
}

// ── もやっと検索：保存アイテムを軽い検索用一覧に ──
function searchTitleOf(it) {
  if (it.kind === 'image') return '画像';
  if (it.label) return it.label;
  if (it.meta && it.meta.title) return it.meta.title;
  if (it.text) return it.text.split('\n')[0].slice(0, 60);
  if (it.url) return it.url;
  return '(無題)';
}
function collectSearchItems(shelves) {
  const out = [];
  Object.keys(shelves || {}).forEach((shelf) => {
    (shelves[shelf] || []).forEach((it) => {
      if (it.kind === 'image') return; // MVPは画像を対象外
      // タイトル＋チャンネル＋種別＋本文/URL をAIへの手がかりに（YouTube情報も活用）
      const parts = [];
      if (it.label) parts.push(it.label);
      if (it.channel) parts.push(it.channel);
      if (it.ytType && ytTypeLabel(it.ytType)) parts.push(ytTypeLabel(it.ytType));
      if (it.text) parts.push(it.text.split('\n')[0]);
      if (it.url) parts.push(it.url);
      const snippet = (parts.join(' ｜ ') || '').slice(0, 180);
      out.push({ id: itemSig(it), shelf, title: searchTitleOf(it), snippet, url: it.url || null });
    });
  });
  return out;
}

function MoyaSearch({ shelves, session, onClose }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null); // null=未実行, []=該当なし
  const [err, setErr] = useState('');
  const run = () => {
    const ep = window.MICHAES_API_ENDPOINT;
    const query = q.trim();
    if (!ep || !session) { setErr('ログインが必要です'); return; }
    if (!query) return;
    const items = collectSearchItems(shelves);
    if (items.length === 0) { setResults([]); return; }
    // id→実アイテム（在処付き）
    const flat = [];
    Object.keys(shelves || {}).forEach((shelf) => (shelves[shelf] || []).forEach((it) => flat.push({ id: itemSig(it), it, shelf })));
    setBusy(true); setErr(''); setResults(null);
    fetch(ep + '/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session },
      body: JSON.stringify({ query, items }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d && d.ok) {
          const matched = (d.matches || []).map((m) => {
            const f = flat.find((x) => x.id === m.id);
            return f ? { it: f.it, shelf: f.shelf, reason: m.reason } : null;
          }).filter(Boolean);
          setResults(matched);
        } else { setErr(d && d.error ? d.error : '検索に失敗'); }
      })
      .catch(() => setErr('通信エラー'))
      .then(() => setBusy(false));
  };
  const openItem = (it) => {
    if (it.url) { try { const w = window.open(it.url, '_blank', 'noopener'); if (!w) window.location.href = it.url; } catch (e) { window.location.href = it.url; } }
  };
  return (
    <div className="moya-dim" onClick={onClose}>
      <div className="moya" onClick={(e) => e.stopPropagation()}>
        <div className="moya-head">
          <span className="moya-star">✦</span>
          <p className="moya-title">もやっと検索</p>
          <button className="moya-x" onClick={onClose} aria-label="閉じる">×</button>
        </div>
        <p className="moya-lead">ぼんやりした記憶でいい。「あの料理の動画」みたいに。</p>
        <div className="moya-inputrow">
          <input className="moya-input" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') run(); }} placeholder="探したいものを、ぼんやりと" />
          <button className="moya-go" disabled={busy} onClick={run}>{busy ? '…' : '探す'}</button>
        </div>
        {err ? <p className="moya-err">{err}</p> : null}
        <div className="moya-results">
          {busy ? <p className="moya-note">記憶をたどっています…</p> : null}
          {!busy && results && results.length === 0 ? <p className="moya-note">近いものは見つかりませんでした。</p> : null}
          {!busy && results && results.map((r, i) => (
            <button className="moya-hit" key={i} onClick={() => openItem(r.it)}>
              <span className="moya-hit-title">{searchTitleOf(r.it)}</span>
              <span className="moya-hit-meta">{(SHELF[r.shelf] && SHELF[r.shelf].title) || r.shelf}{r.reason ? ' ・ ' + r.reason : ''}</span>
            </button>
          ))}
        </div>
        <p className="moya-priv">検索時、保存内容の一部がAIに送られます（プレミアム機能）。</p>
      </div>
    </div>
  );
}
// エクスポートJSON → 棚オブジェクト（画像はBlob＋object URLに復元）
function parseImport(payload) {
  if (!payload || payload.app !== 'MichaeS' || !payload.shelves || typeof payload.shelves !== 'object') return null;
  const out = {};
  Object.keys(payload.shelves).forEach((k) => {
    if (!Array.isArray(payload.shelves[k])) return;
    out[k] = payload.shelves[k].map((it) => {
      if (it && it.kind === 'image' && it.data) {
        try {
          const blob = dataURLtoBlob(it.data);
          return { kind: 'image', who: it.who, at: it.at, blob, src: URL.createObjectURL(blob) };
        } catch (e) { return { kind: 'image', who: it.who, at: it.at }; }
      }
      const c = {}; for (const p in it) { if (p !== 'data') c[p] = it[p]; }
      return c;
    });
  });
  return out;
}

// ── 端末間同期（Google Drive）用のシリアライズ＆マージ ──
// 同期ペイロード（MVP: 画像は送らない＝リンク/テキスト/mdのみ）。itemSig/at はそのまま持つ。
function buildSyncPayload(shelves, tombstones) {
  const out = {};
  Object.keys(shelves || {}).forEach((k) => {
    out[k] = (shelves[k] || []).filter((it) => it.kind !== 'image').map((it) => {
      const c = {}; for (const p in it) { if (p !== 'blob' && p !== 'src') c[p] = it[p]; }
      return c;
    });
  });
  return { app: 'MichaeS', schema: 2, syncedAt: new Date().toISOString(), shelves: out, tombstones: tombstones || {} };
}

// per-item マージ＋墓標。ローカルの画像は常に保持（同期対象外）。
function mergeSync(localShelves, localTomb, remote) {
  const remoteShelves = (remote && remote.shelves) || {};
  const remoteTomb = (remote && remote.tombstones) || {};
  // 墓標を統合（同sigは新しいdeletedAt優先）＋90日より古いものはprune
  const tomb = Object.assign({}, remoteTomb);
  Object.keys(localTomb || {}).forEach((sig) => { if (!tomb[sig] || localTomb[sig] > tomb[sig]) tomb[sig] = localTomb[sig]; });
  const PRUNE = Date.now() - 90 * 24 * 60 * 60 * 1000;
  Object.keys(tomb).forEach((sig) => { if (tomb[sig] < PRUNE) delete tomb[sig]; });

  const keys = {};
  Object.keys(localShelves || {}).forEach((k) => { keys[k] = 1; });
  Object.keys(remoteShelves).forEach((k) => { keys[k] = 1; });
  const shelves = {};
  Object.keys(keys).forEach((k) => {
    const bySig = {};
    const add = (it) => {
      const sig = itemSig(it);
      const prev = bySig[sig];
      if (!prev || (it.at || 0) > (prev.at || 0)) bySig[sig] = it;
    };
    (localShelves[k] || []).forEach(add);
    (remoteShelves[k] || []).forEach(add);
    const arr = [];
    Object.keys(bySig).forEach((sig) => {
      const it = bySig[sig];
      if (it.kind === 'image') { arr.push(it); return; } // 画像はローカル専用で常に残す
      const del = tomb[k + '|' + sig];                    // 墓標は棚単位（他棚の同URLは消さない）
      if (del != null && (it.at || 0) <= del) return;     // 削除済み（再追加はatが新しいので残る）
      arr.push(it);
    });
    arr.sort((a, b) => (a.at || 0) - (b.at || 0));
    shelves[k] = arr;
  });
  return { shelves: shelves, tombstones: tomb };
}

// 実機判定：実機/PWAでは試作用iPhoneフレーム(IOSDevice)を外して全画面で描く。
// PCの広い画面ではフレームを残してプレビューとして見せる。
function isRealPhone() {
  if (typeof window === 'undefined') return false;
  const mq = (q) => window.matchMedia && window.matchMedia(q).matches;
  const standalone = mq('(display-mode: standalone)') || window.navigator.standalone === true;
  const touchNarrow = mq('(pointer: coarse)') && window.innerWidth <= 560;
  return standalone || touchNarrow;
}
function useBareMode() {
  const [bare, setBare] = useState(isRealPhone);
  useEffect(() => {
    const onR = () => setBare(isRealPhone());
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  return bare;
}

// 保存時刻 → 相対表示（永続化後、リロードしても「たった今」のままにならないように）
function ageText(at) {
  if (!at) return 'たった今';
  const m = Math.floor((Date.now() - at) / 60000);
  if (m < 1) return 'たった今';
  if (m < 60) return m + '分前';
  const h = Math.floor(m / 60);
  if (h < 24) return h + '時間前';
  return Math.floor(h / 24) + '日前';
}

function classifyText(t) {
  const s = t.trim();
  if (/^https?:\/\/\S+$/.test(s)) return { kind: 'link', url: s };
  if (/(^|\n)\s*(#{1,3}\s|[-*]\s|\d+\.\s|```|\*\*)/.test(s)) return { kind: 'md', text: s };
  return { kind: 'text', text: s };
}

function enrich(it) {
  if (it.kind === 'link') return { ...it, service: detectService(it.url) };
  return it;
}

// ── 横断インポート：ブラウザのブックマークHTML（Netscape形式）→ {url,title}[] ──
function decodeHtmlEntities(s) {
  try { const ta = document.createElement('textarea'); ta.innerHTML = s; return ta.value; }
  catch (e) { return s; }
}
function parseBookmarksHtml(html) {
  const out = [];
  const seen = {};
  const re = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const url = (m[1] || '').trim();
    if (!/^https?:\/\//i.test(url)) continue; // http(s)以外（javascript:/place:/chrome:等）は除外
    if (seen[url]) continue;
    seen[url] = 1;
    let title = (m[2] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    title = decodeHtmlEntities(title);
    out.push({ url: url, title: title || url });
  }
  return out;
}

// ── リンクメタ取得（タイトル＋サムネ） ─────────────────
// Cloudflare Workerプロキシ経由。エンドポイント未設定/失敗時は何もしない（今まで通りURL表示）。
const META_ENDPOINT = (typeof window !== 'undefined' && window.MICHAES_META_ENDPOINT) || '';
async function fetchMeta(url) {
  if (!META_ENDPOINT) return null;
  try {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tm = ctl ? setTimeout(() => ctl.abort(), 7000) : null;
    const r = await fetch(META_ENDPOINT + '?url=' + encodeURIComponent(url), ctl ? { signal: ctl.signal } : undefined);
    if (tm) clearTimeout(tm);
    if (!r.ok) return null;
    const d = await r.json();
    return d && d.ok ? d : null;
  } catch (e) {
    return null;
  }
}

async function readClipboard() {
  try {
    if (navigator.clipboard && navigator.clipboard.read) {
      const data = await navigator.clipboard.read();
      for (const ci of data) {
        const imgT = ci.types.find((t) => t.indexOf('image/') === 0);
        if (imgT) {
          const blob = await ci.getType(imgT);
          return { kind: 'image', blob, src: URL.createObjectURL(blob) };
        }
      }
      for (const ci of data) {
        if (ci.types.indexOf('text/plain') >= 0) {
          const blob = await ci.getType('text/plain');
          const t = (await blob.text()).trim();
          if (t) return classifyText(t);
        }
      }
    } else if (navigator.clipboard && navigator.clipboard.readText) {
      const t = (await navigator.clipboard.readText()).trim();
      if (t) return classifyText(t);
    }
  } catch (e) { /* 権限なし・空 → デモへフォールバック */ }
  return null;
}

const kindLabel = (it) => {
  if (it.kind === 'link') {
    const base = SVC_NAME[it.service || 'web'];
    if (it.service === 'youtube' && it.ytType && it.ytType !== 'video') return base + '・' + ytTypeLabel(it.ytType);
    return base;
  }
  return it.kind === 'image' ? '画像' : it.kind === 'md' ? 'メモ（Markdown）' : 'テキスト';
};

const shelfTitle = (it) => {
  if (it.kind === 'link') return it.label || prettyUrl(it.url);
  const first = (it.text || '').replace(/^#+\s*/, '').split('\n')[0];
  return clip(first, 44);
};

// ── 表示部品 ──────────────────────────────────────
function Steam() {
  return (
    <div className="steam steam-hot" aria-hidden="true">
      <i></i><i></i><i></i>
    </div>
  );
}

function MdPreview({ text }) {
  const lines = text.split('\n').filter((l) => l.trim()).slice(0, 6);
  const strip = (l) => l.replace(/\*\*(.+?)\*\*/g, '$1');
  return (
    <div className="md-prev">
      {lines.map((l, i) => {
        if (/^#{1,3}\s/.test(l)) return <div key={i} className="md-h">{strip(l.replace(/^#+\s/, ''))}</div>;
        if (/^[-*]\s/.test(l)) return <div key={i} className="md-li"><span className="md-dot"></span><span>{strip(l.replace(/^[-*]\s/, ''))}</span></div>;
        if (/^\d+\.\s/.test(l)) return <div key={i} className="md-li"><span className="md-num">{l.match(/^\d+/)[0]}.</span><span>{strip(l.replace(/^\d+\.\s/, ''))}</span></div>;
        return <div key={i} className="md-p">{strip(l)}</div>;
      })}
    </div>
  );
}

function ItemBody({ it }) {
  if (it.kind === 'image') return <img className="item-img" src={it.src} alt="貼り付けた画像" />;
  if (it.kind === 'md') return <MdPreview text={it.text} />;
  if (it.kind === 'text') return <p className="item-text">{clip(it.text, 110)}</p>;
  return (
    <div className="item-link">
      {it.thumb ? <img className="item-thumb" src={it.thumb} alt="" loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} /> : null}
      {it.label ? <h2 className="item-title">{it.label}</h2> : null}
      <div className="item-url">{clip(it.url, 64)}</div>
    </div>
  );
}

function ShelfPage({ verbId, items, onBack, onDelete, onMove }) {
  const meta = SHELF[verbId];
  const [selMode, setSelMode] = useState(false);
  const [sel, setSel] = useState([]);          // 選択中のindex
  const [confirm, setConfirm] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false); // 移動先の棚選択
  const [note, setNote] = useState('');
  const [viewer, setViewer] = useState(null);  // 画像の全画面ビューア
  const lp = useRef({ timer: null, fired: false });
  const noteTimer = useRef(null);
  useEffect(() => () => { clearTimeout(lp.current.timer); clearTimeout(noteTimer.current); }, []);

  const flash = (m) => {
    clearTimeout(noteTimer.current);
    setNote(m);
    noteTimer.current = setTimeout(() => setNote(''), 1300);
  };

  const copyItem = async (it) => {
    try {
      if (it.kind === 'image') {
        const blob = await (await fetch(it.src)).blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      } else {
        await navigator.clipboard.writeText(it.kind === 'link' ? it.url : it.text);
      }
      flash('コピーした');
    } catch (e) {
      flash('コピーできなかった');
    }
  };

  const toggle = (i) => setSel((s) => (s.indexOf(i) >= 0 ? s.filter((x) => x !== i) : [...s, i]));

  // 長押し → 選択モード
  const pressStart = (i) => {
    lp.current.fired = false;
    clearTimeout(lp.current.timer);
    lp.current.timer = setTimeout(() => {
      lp.current.fired = true;
      setSelMode(true);
      setSel((s) => (s.indexOf(i) >= 0 ? s : [...s, i]));
    }, 480);
  };
  const pressEnd = () => clearTimeout(lp.current.timer);

  // タップ共通：長押し直後は無効、選択モードなら選択トグル、それ以外はfnを実行
  const actTap = (i, fn) => {
    if (lp.current.fired) { lp.current.fired = false; return; }
    if (selMode) { toggle(i); return; }
    fn();
  };
  const openURL = (it) => {
    try { const w = window.open(it.url, '_blank', 'noopener'); if (!w) window.location.href = it.url; }
    catch (e) { window.location.href = it.url; }
    flash('開いた');
  };

  const allSelected = items.length > 0 && sel.length === items.length;
  const toggleAll = () => setSel(allSelected ? [] : items.map((_, i) => i));
  const cancelSel = () => { setSelMode(false); setSel([]); };
  const doDelete = () => {
    onDelete(verbId, sel);
    setConfirm(false);
    setSelMode(false);
    setSel([]);
    flash('手放した');
  };

  return (
    <div className="shelf" data-screen-label={meta.title}>
      <header className="shelf-head">
        <div className="shelf-title-wrap">
          <span className="shelf-icon"><VerbIcon id={verbId} size={18} /></span>
          <h2 className="shelf-title">{meta.title}</h2>
          <span className="shelf-count">{selMode ? sel.length + ' / ' + items.length : items.length}</span>
        </div>
        <p className="shelf-sub">{selMode ? '選んで、まとめて手放せる' : meta.sub}</p>
        {!selMode && items.length > 0 ? <p className="shelf-hint">タイトルで開く ・ 長押しで選択</p> : null}
      </header>
      <div className="shelf-list">
        {items.length === 0 ? (
          <div className="shelf-empty">
            <span className="shelf-empty-star">✦</span>
            <p>まだ空っぽ。<br />「{VERBS.find(v => v.id === verbId).label}」と決めたものが、ここに並ぶ</p>
          </div>
        ) : (
          items.map((it, i) => {
            const isSel = sel.indexOf(i) >= 0;
            const emb = !selMode ? embedFor(it) : null;
            return (
              <div
                className={'shelf-item' + (selMode ? ' sel-mode' : '') + (isSel ? ' selected' : '') + (emb ? ' has-embed' : '')}
                key={i}
                onContextMenu={(e) => e.preventDefault()}
              >
                {selMode ? (
                  <span className={'sel-dot' + (isSel ? ' on' : '')} aria-hidden="true">
                    <svg width="11" height="11" viewBox="0 0 24 24"><path d="M4.5 12.5 L10 18 L19.5 7" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                  </span>
                ) : null}
                <div className="shelf-item-meta">
                  {it.kind === 'link'
                    ? <span className="svc-inline"><SvcIcon id={it.service} size={13} /></span>
                    : <span className="src-dot" aria-hidden="true"></span>}
                  <span>{kindLabel(it)}</span>
                  {it.kind === 'link' && it.channel ? (<React.Fragment><span className="dot">·</span><span>{clip(it.channel, 18)}</span></React.Fragment>) : null}
                  <span className="dot">·</span>
                  <span>{ageText(it.at)}</span>
                  {it.who && it.who !== 'あとで決める' ? <span className="who-tag">{it.who}</span> : null}
                </div>

                {/* メディア部 */}
                {emb ? (
                  <div className={'embed-wrap embed-' + emb.kind} style={emb.ratio ? null : { height: emb.height + 'px' }}>
                    <iframe
                      src={emb.src} title={shelfTitle(it)} loading="lazy" frameBorder="0"
                      allow="autoplay; encrypted-media; clipboard-write; picture-in-picture; fullscreen"
                      allowFullScreen
                    ></iframe>
                  </div>
                ) : it.kind === 'image' ? (
                  <img className="shelf-thumb" src={it.src} alt=""
                    onClick={() => actTap(i, () => setViewer(it))}
                    onPointerDown={() => pressStart(i)} onPointerUp={pressEnd} onPointerLeave={pressEnd} onPointerCancel={pressEnd} />
                ) : (it.kind === 'link' && it.thumb) ? (
                  <img className="shelf-thumb" src={it.thumb} alt="" loading="lazy"
                    onError={(e) => { e.target.style.display = 'none'; }}
                    onClick={() => actTap(i, () => openURL(it))}
                    onPointerDown={() => pressStart(i)} onPointerUp={pressEnd} onPointerLeave={pressEnd} onPointerCancel={pressEnd} />
                ) : null}

                {/* タイトル部（画像以外）：タップで外部/コピー、長押しで選択 */}
                {it.kind !== 'image' ? (
                  <button
                    className="shelf-item-title-btn"
                    onClick={() => actTap(i, () => (it.kind === 'link' ? openURL(it) : copyItem(it)))}
                    onPointerDown={() => pressStart(i)} onPointerUp={pressEnd} onPointerLeave={pressEnd} onPointerCancel={pressEnd}
                  >
                    <span className="shelf-item-title">{shelfTitle(it)}</span>
                    {it.kind === 'link' ? <span className="open-ext" aria-hidden="true">↗</span> : null}
                  </button>
                ) : null}

                {/* 選択モード：全体オーバーレイでタップ＝選択（埋込みの操作を遮る） */}
                {selMode ? <button className="sel-overlay" onClick={() => toggle(i)} aria-label="選ぶ"></button> : null}
              </div>
            );
          })
        )}
      </div>

      {note ? <div className="shelf-note">{note}</div> : null}

      {selMode ? (
        /* 選択モード：親指圏のアクションバー（上=補助 / 下=主操作 の2段で崩れ防止） */
        <div className="sel-bar sel-bar-2">
          <div className="sel-bar-top">
            <button className="sel-all" onClick={toggleAll} disabled={items.length === 0}>
              {allSelected ? 'ぜんぶ解除' : 'ぜんぶ選ぶ'}
            </button>
            <button className="sel-cancel" onClick={cancelSel}>やめる</button>
          </div>
          <div className="sel-bar-main">
            <button className="sel-move" onClick={() => setMoveOpen(true)} disabled={sel.length === 0}>
              移動{sel.length ? '（' + sel.length + '）' : ''}
            </button>
            <button className="sel-del" onClick={() => setConfirm(true)} disabled={sel.length === 0}>
              手放す{sel.length ? '（' + sel.length + '）' : ''}
            </button>
          </div>
        </div>
      ) : (
        /* ホームへ戻る：親指圏の円ボタン */
        <div className="shelf-foot">
          <button className="home-orb" onClick={onBack} aria-label="ホームへもどる">
            <span className="home-halo" aria-hidden="true"></span>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M5 10 L12 16.5 L19 10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"></path>
            </svg>
          </button>
          <span className="home-label">ホームへ</span>
        </div>
      )}

      {/* 画像の全画面ビューア（タップで閉じる） */}
      {viewer ? (
        <div className="viewer" onClick={() => setViewer(null)}>
          <img className="viewer-img" src={viewer.src} alt="" />
          <button className="viewer-close" onClick={() => setViewer(null)} aria-label="閉じる">×</button>
        </div>
      ) : null}

      {/* 移動先の棚を選ぶ */}
      {moveOpen ? (
        <div className="dialog-dim" onClick={() => setMoveOpen(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <p className="dialog-t">{sel.length}件を移動</p>
            <p className="dialog-s">どの棚へ？</p>
            <div className="bm-choices">
              {VERBS.filter((v) => v.id !== verbId).map((v) => (
                <button key={v.id} className="bm-choice" onClick={() => {
                  const n = onMove ? onMove(verbId, sel, v.id) : 0;
                  setMoveOpen(false); setSelMode(false); setSel([]);
                  flash(n > 0 ? '「' + v.label + '」へ移した' : '移せなかった');
                }}>{v.label}</button>
              ))}
            </div>
            <button className="dlg-no" style={{ width: '100%', marginTop: 10 }} onClick={() => setMoveOpen(false)}>やめる</button>
          </div>
        </div>
      ) : null}

      {/* 削除確認ダイアログ（必須） */}
      {confirm ? (
        <div className="dialog-dim" onClick={() => setConfirm(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <p className="dialog-t">{sel.length}件を手放す？</p>
            <p className="dialog-s">棚からなくなる。もどせない</p>
            <div className="dialog-btns">
              <button className="dlg-no" onClick={() => setConfirm(false)}>やめる</button>
              <button className="dlg-yes" onClick={doDelete}>手放す</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── 本体 ──────────────────────────────────────────
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const spd = SPEED[t.animSpeed] || 1;

  const [current, setCurrent] = useState(null); // いま貼られているもの
  const [phase, setPhase] = useState('idle');   // idle | open | who | anim | toast | empty
  const [animVerb, setAnimVerb] = useState(null);
  const [toast, setToast] = useState('');
  const [shelves, setShelves] = useState({});   // verbId -> items[]
  const [pulseVerb, setPulseVerb] = useState(null);
  const [view, setView] = useState(null);       // 棚ページ（verbId）
  const [whoText, setWhoText] = useState('');
  const [writeText, setWriteText] = useState(''); // ペースト玉の下の直接入力
  const [bootUpgrade, setBootUpgrade] = useState(false); // LPの「プレミアムにする」からの着地
  const [auth, setAuth] = useState(null);                // {session, user}（App保持＝設定の開閉で消えない）
  const [isPremium, setIsPremium] = useState(false);     // Stripe購読が有効か
  const [searchOpen, setSearchOpen] = useState(false);   // もやっと検索オーバーレイ
  const [tombstones, setTombstones] = useState({});      // 同期用：削除itemSig -> deletedAt
  const [syncOn, setSyncOn] = useState(false);           // 端末間同期（Drive）ON/OFF（設定のミラー）
  const [lastSync, setLastSync] = useState(null);        // 最終同期時刻
  const subPolled = useRef(false);
  // 起動時に1回だけ保存済みセッションを復元
  useEffect(() => {
    const st = window.MichaeSStore;
    if (!st || !st.loadAuth) return;
    st.loadAuth().then((a) => { if (a && a.user) setAuth(a); });
  }, []);
  // 購読状態の取得
  const refreshSub = (session) => {
    const ep = window.MICHAES_API_ENDPOINT;
    const s = session || (auth && auth.session);
    if (!ep || !s) { setIsPremium(false); return; }
    fetch(ep + '/subscription', { headers: { Authorization: 'Bearer ' + s } })
      .then((r) => r.json()).then((d) => { if (d && d.ok) setIsPremium(!!d.premium); }).catch(() => {});
  };
  useEffect(() => {
    if (auth && auth.session) {
      refreshSub(auth.session);
      // Stripe決済から戻ってきた直後はWebhook反映待ちで数回ポーリング
      try {
        const p = new URLSearchParams(location.search);
        if (p.get('sub') === 'success' && !subPolled.current) {
          subPolled.current = true;
          let n = 0;
          const poll = () => { refreshSub(auth.session); if (++n < 5) setTimeout(poll, 2000); };
          setTimeout(poll, 1500);
          try { history.replaceState(null, document.title, location.pathname); } catch (e) {}
        }
      } catch (e) {}
    } else { setIsPremium(false); }
  }, [auth]);
  const timers = useRef([]);

  // LP → index.html?upgrade=1 で着地したら、設定のプレミアム導線を開く（課金導線の接続）
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get('upgrade') === '1') {
        setView('settings');
        setBootUpgrade(true);
        window.history.replaceState(null, '', window.location.pathname); // URLからparamを掃除
      }
    } catch (e) {}
  }, []);
  // 一度プレミアムを開いたら、以降の設定再訪では自動で開かない（ワンショット）
  useEffect(() => { if (bootUpgrade) setBootUpgrade(false); }, [bootUpgrade]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  // ── 永続化（IndexedDB）: リロードしても棚が消えない ──
  // michaes-store.js 未読込でも落ちないようにガード（その場合はメモリのみで動く）
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const store = window.MichaeSStore;
    // テーマ適用（設定を一度も開いていなくても効くよう、起動時に反映。既定=自動でOS追従）
    const applyTheme = (t) => { try { document.documentElement.setAttribute('data-theme', { '自動': 'auto', 'ライト': 'light', 'ダーク': 'dark' }[t] || 'auto'); } catch (e) {} };
    if (store && store.loadSettings) store.loadSettings().then((s) => { applyTheme(s && s.theme); if (s && typeof s.syncOn === 'boolean') setSyncOn(s.syncOn); }).catch(() => applyTheme('自動'));
    else applyTheme('自動');
    if (store && store.loadTombstones) store.loadTombstones().then((t) => { if (t && Object.keys(t).length) setTombstones(t); }).catch(() => {});
    if (!store) { setHydrated(true); return; }
    store.load()
      .then((s) => { if (s && Object.keys(s).length) setShelves(s); })
      .catch(() => {})
      .then(() => setHydrated(true));
  }, []);
  useEffect(() => {
    if (hydrated && window.MichaeSStore) window.MichaeSStore.save(shelves);
  }, [shelves, hydrated]);
  useEffect(() => {
    if (hydrated && window.MichaeSStore && window.MichaeSStore.saveTombstones) window.MichaeSStore.saveTombstones(tombstones);
  }, [tombstones, hydrated]);

  // ── 端末間同期（Google Drive appDataFolder。プレミアム＆同期ON時のみ） ──
  const syncing = useRef(false);
  const didStartupSync = useRef(false);
  const pushTimer = useRef(null);
  const syncNow = (interactive) => {
    const D = window.MichaeSDrive;
    if (!D || !D.available()) return Promise.reject(new Error('unavailable'));
    if (!isPremium) return Promise.reject(new Error('premium'));
    if (syncing.current) return Promise.reject(new Error('busy'));
    syncing.current = true;
    return D.read(interactive)
      .then((remote) => {
        const merged = mergeSync(shelves, tombstones, remote);
        setShelves(merged.shelves);
        setTombstones(merged.tombstones);
        return D.write(buildSyncPayload(merged.shelves, merged.tombstones), interactive);
      })
      .then(() => { setLastSync(Date.now()); syncing.current = false; })
      .catch((e) => { syncing.current = false; throw e; });
  };
  // 起動時プル（無音）
  useEffect(() => {
    if (hydrated && isPremium && syncOn && !didStartupSync.current) {
      didStartupSync.current = true;
      syncNow(false).catch(() => {});
    }
  }, [hydrated, isPremium, syncOn]);
  // 変更後デバウンスpush
  useEffect(() => {
    if (!hydrated || !isPremium || !syncOn) return;
    const D = window.MichaeSDrive;
    if (!D || !D.available()) return;
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => { D.write(buildSyncPayload(shelves, tombstones), false).catch(() => {}); }, 2500);
    return () => clearTimeout(pushTimer.current);
  }, [shelves, tombstones, hydrated, isPremium, syncOn]);

  // 賞味期限リマインドの登録/解除（既に通知許可済みの時だけ。プロンプトは出さない）
  const getExistingSub = async () => {
    try {
      if (!('serviceWorker' in navigator) || typeof Notification === 'undefined' || Notification.permission !== 'granted') return null;
      const reg = await navigator.serviceWorker.ready;
      return await reg.pushManager.getSubscription();
    } catch (e) { return null; }
  };
  const registerReminder = async (item) => {
    if (!window.MICHAES_PUSH_ENDPOINT || !item || item.kind !== 'link' || !item.expireAt) return;
    const sub = await getExistingSub();
    if (!sub) return;
    // 「○日前」設定を読む（既定3日前）
    let daysBefore = 3;
    try {
      const st = window.MichaeSStore;
      const s = st && st.loadSettings ? await st.loadSettings() : null;
      const map = { '当日': 0, '前日': 1, '3日前': 3, '1週間前': 7 };
      if (s && s.remindDays && map[s.remindDays] !== undefined) daysBefore = map[s.remindDays];
    } catch (e) {}
    try {
      await fetch(window.MICHAES_PUSH_ENDPOINT + '/remind', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON ? sub.toJSON() : sub, url: item.url, expireAt: item.expireAt, daysBefore: daysBefore, title: item.label || item.url }),
      });
    } catch (e) {}
  };
  const unregisterReminder = async (item) => {
    if (!window.MICHAES_PUSH_ENDPOINT || !item || item.kind !== 'link' || !item.expireAt) return;
    const sub = await getExistingSub();
    if (!sub) return;
    try {
      await fetch(window.MICHAES_PUSH_ENDPOINT + '/unremind', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint, url: item.url }),
      });
    } catch (e) {}
  };

  // メタが届いたら：表示中カードと、もう棚に入った同URLアイテムの両方を更新
  // （棚の更新はsave効果で自動的にIndexedDBへも反映される）
  const applyMeta = (url, meta) => {
    if (!meta || (!meta.title && !meta.image && !meta.expireAt && !meta.channel && !meta.ytType)) return;
    // 既存値は優先、足りないものだけメタで埋める（YouTubeのチャンネル/種別も保存）
    const merge = (it) => ({
      ...it,
      label: it.label || meta.title || undefined,
      thumb: it.thumb || meta.image || undefined,
      expireAt: it.expireAt || meta.expireAt || undefined,
      channel: it.channel || meta.channel || undefined,
      channelUrl: it.channelUrl || meta.channelUrl || undefined,
      ytType: it.ytType || meta.ytType || undefined,
    });
    const lacks = (it) => !it.label || !it.thumb || (meta.expireAt && !it.expireAt) ||
      (meta.channel && !it.channel) || (meta.ytType && !it.ytType);
    setCurrent((c) => (c && c.kind === 'link' && c.url === url ? merge(c) : c));
    let needReminder = false;
    setShelves((p) => {
      let changed = false;
      const next = {};
      Object.keys(p).forEach((k) => {
        next[k] = p[k].map((it) => {
          if (it.kind === 'link' && it.url === url && lacks(it)) {
            changed = true;
            if (meta.expireAt && !it.expireAt) needReminder = true;
            return merge(it);
          }
          return it;
        });
      });
      return changed ? next : p;
    });
    // 棚にある同URLが期限を得たら、X日前リマインドを登録（未ソートのカードには付けない）
    if (needReminder) registerReminder({ kind: 'link', url, expireAt: meta.expireAt, label: meta.title || url });
  };

  // 貼った/書いたものを開く共通処理
  const openItem = (it) => {
    setCurrent(it);
    setPhase('open');
    // 裏でタイトル＋サムネを取りに行く（貼った瞬間の体験は止めない）
    if (it.kind === 'link' && (!it.label || !it.thumb)) {
      const url = it.url;
      fetchMeta(url).then((meta) => applyMeta(url, meta));
    }
  };

  const paste = async () => {
    if (phase !== 'idle') return;
    const it = await readClipboard();
    if (!it) { setPhase('empty'); return; }
    openItem(enrich(it));
  };

  // 直接入力：ペーストと同じ道へ（URLならリンク、Markdownらしければメモ扱い）
  const writeIn = () => {
    if (phase !== 'idle') return;
    const s = writeText.trim();
    if (!s) return;
    setWriteText('');
    openItem(enrich(classifyText(s)));
  };

  const finish = (msg, verbId) => {
    setToast(msg);
    setPhase('toast');
    if (verbId) {
      setPulseVerb(verbId);
      later(() => setPulseVerb(null), 700 * spd);
    }
    later(() => {
      setToast('');
      setCurrent(null);
      setPhase('idle');
    }, 1100 * spd);
  };

  const sortTo = (v, who) => {
    const item = { ...current, who, at: Date.now() };
    setShelves((p) => ({ ...p, [v.id]: [...(p[v.id] || []), item] }));
    if (item.kind === 'link' && item.expireAt) registerReminder(item);
    setAnimVerb(v.id);
    setPhase('anim');
    const suffix = who && who !== 'あとで決める' ? ' — ' + who + 'に' : '';
    later(() => { setAnimVerb(null); finish(v.dest + suffix, v.id); }, 1500 * spd);
  };

  const pickVerb = (v) => {
    if (phase !== 'open') return;
    if (v.id === 'miseru') { setPhase('who'); return; }
    sortTo(v);
  };

  const pickWho = (who) => {
    setWhoText('');
    sortTo(VERBS.find((v) => v.id === 'miseru'), who);
  };

  const discard = () => { if (phase === 'open') finish('手放した', null); };

  const reset = () => { setPhase('idle'); };

  const deleteFromShelf = (verbId, idxs) => {
    const set = new Set(idxs);
    const removed = (shelves[verbId] || []).filter((_, i) => set.has(i));
    setShelves((p) => ({ ...p, [verbId]: (p[verbId] || []).filter((_, i) => !set.has(i)) }));
    removed.forEach((it) => { if (it.kind === 'link' && it.expireAt) unregisterReminder(it); });
    // 同期用：削除を墓標に記録（棚単位 verbId|itemSig。画像は同期対象外なので除く）→ 他端末にも伝播
    const now = Date.now();
    setTombstones((tomb) => {
      const next = { ...tomb };
      removed.forEach((it) => { if (it.kind !== 'image') next[verbId + '|' + itemSig(it)] = now; });
      return next;
    });
  };

  // 移動：選択を別の棚へ（元棚から除去＋先棚へ重複排除で追加、元棚に墓標）。移動件数を返す
  const moveToShelf = (fromVerbId, idxs, toVerbId) => {
    if (!toVerbId || fromVerbId === toVerbId) return 0;
    const set = new Set(idxs);
    const moving = (shelves[fromVerbId] || []).filter((_, i) => set.has(i));
    if (!moving.length) return 0;
    const now = Date.now();
    const next = { ...shelves };
    next[fromVerbId] = (next[fromVerbId] || []).filter((_, i) => !set.has(i));
    const dest = (next[toVerbId] || []).slice();
    const seen = new Set(dest.map(itemSig));
    let moved = 0;
    moving.forEach((it) => { const sig = itemSig(it); if (!seen.has(sig)) { dest.push(it); seen.add(sig); moved++; } });
    next[toVerbId] = dest;
    setShelves(next);
    // 元棚からの削除だけ墓標に（先棚には墓標を付けない＝移動先で消えない）
    setTombstones((tomb) => {
      const t = { ...tomb };
      moving.forEach((it) => { if (it.kind !== 'image') t[fromVerbId + '|' + itemSig(it)] = now; });
      return t;
    });
    return moved;
  };

  // 横断インポート：選んだ棚へリンクを一括追加（itemSigで重複排除）。追加件数を返す
  const importBookmarks = (verbId, links) => {
    const next = { ...shelves };
    const cur = next[verbId] ? next[verbId].slice() : [];
    const seen = new Set(cur.map(itemSig));
    const now = Date.now();
    let added = 0;
    (links || []).forEach((lk, i) => {
      const it = enrich({ kind: 'link', url: lk.url, label: lk.title, at: now + i });
      const sig = itemSig(it);
      if (!seen.has(sig)) { cur.push(it); seen.add(sig); added++; }
    });
    next[verbId] = cur;
    setShelves(next);
    return added;
  };

  const screenStyle = {
    '--r': t.cardRadius + 'px',
    '--beam': t.lightBeam,
    '--goldA': t.goldAmount,
    '--spd': spd,
  };

  const sorting = phase === 'open';                  // 動詞＝仕分けモード
  const nav = phase === 'idle' || phase === 'empty'; // 動詞＝棚への入口

  const onVerbTap = (v) => {
    if (sorting) pickVerb(v);
    else if (nav) setView(v.id);
  };

  const bare = useBareMode();

  const screenEl = (
        <div className="screen" style={screenStyle} data-screen-label="ミカエス いま貼る">
          <div className="beam" aria-hidden="true"></div>

          {/* 上部 = 情報のみ＋設定入口 */}
          <header className="top">
            <div className="brand"><span className="brand-star">✦</span>ミカエス</div>
            <div className="top-sub">
              {phase === 'empty'
                ? 'クリップボードは空っぽ'
                : '開いた今が、いちばん温かい'}
            </div>
            <button className="gear-btn" onClick={() => setView('settings')} aria-label="設定">
              <GearIcon />
            </button>
            <button className="search-btn" aria-label="もやっと検索"
              onClick={() => { if (isPremium) setSearchOpen(true); else { setBootUpgrade(true); setView('settings'); } }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.5" y2="16.5"></line></svg>
            </button>
          </header>

          {/* 中央ステージ */}
          <main className="stage">
            {phase === 'idle' && (
              <div className="idle-wrap">
                <button className="orb" onClick={paste} data-comment-anchor="center-tap">
                  <span className="orb-halo" aria-hidden="true"></span>
                  <span className="orb-star">✦</span>
                  <span className="orb-label">ペースト</span>
                  <span className="orb-hint">コピーしたものを、ここに貼る</span>
                </button>
                <form className="write-form" onSubmit={(e) => { e.preventDefault(); writeIn(); }}>
                  <textarea
                    className="write-input"
                    rows={1}
                    placeholder="または、ここに書いて残す"
                    value={writeText}
                    onChange={(e) => {
                      setWriteText(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px';
                    }}
                    onKeyDown={(e) => {
                      // 変換確定のEnterでは送らない。Shift+Enterは改行
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); writeIn(); }
                    }}
                  />
                  <button type="submit" className="write-go" aria-label="残す" disabled={!writeText.trim()}>✦</button>
                </form>
              </div>
            )}

            {phase === 'open' && current && (
              <div className="open-wrap">
                <p className="question">貼った。何のために残す？</p>
                <div className="item-card">
                  <Steam />
                  {current.kind === 'link'
                    ? <span className="svc-badge"><SvcIcon id={current.service} size={17} /></span>
                    : null}
                  <div className="item-meta">
                    <span className="src-dot" aria-hidden="true"></span>
                    <span className="src">{kindLabel(current)}</span>
                    <span className="dot">·</span>
                    <span className="time">たった今</span>
                  </div>
                  <ItemBody it={current} />
                </div>
                <p className="must-one">必ずひとつ。それか、いらない</p>
              </div>
            )}

            {phase === 'who' && current && (
              <div className="open-wrap">
                <div className="who-card">
                  <p className="who-q">誰に見せる？</p>
                  <p className="who-item">{shelfTitle(current) || '貼り付けた画像'}</p>
                  <form
                    className="who-form"
                    onSubmit={(e) => { e.preventDefault(); if (whoText.trim()) pickWho(whoText.trim()); }}
                  >
                    <input
                      className="who-input"
                      type="text"
                      maxLength={20}
                      placeholder="なまえをひとこと"
                      value={whoText}
                      onChange={(e) => setWhoText(e.target.value)}
                      autoFocus
                    />
                    <button type="submit" className="who-go" disabled={!whoText.trim()}>決める</button>
                  </form>
                  <div className="who-foot">
                    <span className="who-count">{whoText.length}/20</span>
                    <button type="button" className="who-skip" onClick={() => pickWho('あとで決める')}>あとで決める</button>
                  </div>
                </div>
              </div>
            )}

            {phase === 'anim' && <VerbAnim verb={animVerb} />}

            {phase === 'toast' && (
              <div className="toast"><span className="toast-check">✓</span>{toast}</div>
            )}

            {phase === 'empty' && (
              <div className="empty">
                <div className="empty-halo" aria-hidden="true"></div>
                <div className="empty-star">✦</div>
                <p className="empty-line">クリップボードは空っぽ</p>
                <button className="again" onClick={reset}>コピーして、また来た（もう一度）</button>
              </div>
            )}
          </main>

          {/* 下部 = 親指圏に全操作 */}
          <footer className="verbs-zone">
            <div className={'verbs' + (sorting ? ' on' : '') + (nav ? ' nav' : '')}>
              {VERBS.map((v, i) => (
                <button
                  key={v.id}
                  className={'verb' + (pulseVerb === v.id ? ' pulse' : '')}
                  style={{ transform: 'translateY(' + ARC_Y[i] + 'px)' }}
                  onClick={() => onVerbTap(v)}
                  disabled={!sorting && !nav}
                  data-comment-anchor={'verb-' + v.id}
                >
                  <span className="verb-circle">
                    <VerbIcon id={v.id} />
                    {(shelves[v.id] || []).length ? <span className="badge">{shelves[v.id].length}</span> : null}
                  </span>
                  <span className="verb-label">{v.label}</span>
                </button>
              ))}
            </div>
            {sorting ? (
              <button className="discard on" onClick={discard}>いらない（手放す）</button>
            ) : (
              <p className={'zone-hint' + (nav ? ' on' : '')}>ボタンで棚をのぞける</p>
            )}
          </footer>

          {/* 棚ページ（出口画面） */}
          {view && view !== 'settings' && (
            <ShelfPage verbId={view} items={shelves[view] || []} onBack={() => setView(null)} onDelete={deleteFromShelf} onMove={moveToShelf} />
          )}

          {/* 設定画面 */}
          {view === 'settings' && (
            <SettingsPage onBack={() => setView(null)} t={t} setTweak={setTweak} onWipeAll={() => setShelves({})} openPremium={bootUpgrade}
              auth={auth} setAuth={setAuth} isPremium={isPremium} refreshSub={refreshSub}
              syncOn={syncOn} onSyncToggle={setSyncOn} onSyncNow={syncNow} lastSync={lastSync}
              verbs={VERBS} parseBookmarks={parseBookmarksHtml} onImportBookmarks={importBookmarks}
              onExport={async () => {
                const payload = await buildExport(shelves);
                const n = Object.values(payload.shelves).reduce((a, arr) => a + arr.length, 0);
                downloadBlob('michaes-export-' + dateStamp() + '.json', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
                return n;
              }}
              onImport={async (payload) => {
                const incoming = parseImport(payload);
                if (!incoming) throw new Error('format');
                const next = { ...shelves };
                let added = 0;
                Object.keys(incoming).forEach((k) => {
                  const cur = next[k] ? next[k].slice() : [];
                  const seen = new Set(cur.map(itemSig));
                  incoming[k].forEach((it) => { const s = itemSig(it); if (!seen.has(s)) { cur.push(it); seen.add(s); added++; } });
                  next[k] = cur;
                });
                setShelves(next);
                return added;
              }} />
          )}

          {/* もやっと検索（プレミアム） */}
          {searchOpen && (
            <MoyaSearch shelves={shelves} session={auth && auth.session} onClose={() => setSearchOpen(false)} />
          )}
        </div>
  );

  return (
    <div className={'page' + (bare ? ' bare' : '')}>
      {bare ? screenEl : <IOSDevice>{screenEl}</IOSDevice>}

      <TweaksPanel>
        <TweakSection label="神聖トーン"></TweakSection>
        <TweakSlider label="光の強さ" value={t.lightBeam} min={0} max={1} step={0.05}
                     onChange={(v) => setTweak('lightBeam', v)} />
        <TweakSlider label="ゴールド量" value={t.goldAmount} min={0} max={1} step={0.05}
                     onChange={(v) => setTweak('goldAmount', v)} />
        <TweakSection label="かたち・動き"></TweakSection>
        <TweakSlider label="カード角丸" value={t.cardRadius} min={12} max={34} step={1} unit="px"
                     onChange={(v) => setTweak('cardRadius', v)} />
        <TweakRadio label="アニメ速度" value={t.animSpeed}
                    options={['ゆっくり', 'ふつう', 'きびきび']}
                    onChange={(v) => setTweak('animSpeed', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
