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

// 実クリップボードが空・読めない時のデモ（貼るたびに次が入っている想定）
const DEMO_CLIPBOARD = [
  { kind: 'link', url: 'https://youtu.be/4xRz9aP6vGk', label: '5分でできる肩こりストレッチ' },
  { kind: 'link', url: 'https://x.com/hikari_room/status/1829', label: '部屋の照明、この組み合わせ真似したい' },
  { kind: 'text', text: '無水トマトカレー：トマト4個・玉ねぎ2個・にんにく。水なし弱火40分、仕上げにバター。圧力鍋いらず。' },
  { kind: 'md', text: '# 積立はじめるメモ\n- まず月3万から\n- インデックス一本でいい\n- ボーナス月だけ +2万' },
  { kind: 'link', url: 'https://www.instagram.com/p/kanazawa_trip/', label: '金沢ひとり旅のプラン、これ保存' },
];

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

const kindLabel = (it) =>
  it.kind === 'link' ? SVC_NAME[it.service || 'web']
  : it.kind === 'image' ? '画像'
  : it.kind === 'md' ? 'メモ（Markdown）'
  : 'テキスト';

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
      {it.label ? <h2 className="item-title">{it.label}</h2> : null}
      <div className="item-url">{clip(it.url, 64)}</div>
    </div>
  );
}

function ShelfPage({ verbId, items, onBack, onDelete }) {
  const meta = SHELF[verbId];
  const [selMode, setSelMode] = useState(false);
  const [sel, setSel] = useState([]);          // 選択中のindex
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState('');
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

  const tapItem = (i) => {
    if (lp.current.fired) { lp.current.fired = false; return; } // 長押し直後のclickを無効化
    if (selMode) toggle(i);
    else copyItem(items[i]);
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
        {!selMode && items.length > 0 ? <p className="shelf-hint">タップでコピー ・ 長押しで選択</p> : null}
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
            return (
              <button
                className={'shelf-item' + (selMode ? ' sel-mode' : '') + (isSel ? ' selected' : '')}
                key={i}
                onClick={() => tapItem(i)}
                onPointerDown={() => pressStart(i)}
                onPointerUp={pressEnd}
                onPointerLeave={pressEnd}
                onPointerCancel={pressEnd}
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
                  <span className="dot">·</span>
                  <span>{ageText(it.at)}</span>
                  {it.who && it.who !== 'あとで決める' ? <span className="who-tag">{it.who}</span> : null}
                </div>
                {it.kind === 'image'
                  ? <img className="shelf-thumb" src={it.src} alt="" />
                  : <div className="shelf-item-title">{shelfTitle(it)}</div>}
              </button>
            );
          })
        )}
      </div>

      {note ? <div className="shelf-note">{note}</div> : null}

      {selMode ? (
        /* 選択モード：親指圏のアクションバー */
        <div className="sel-bar">
          <button className="sel-all" onClick={toggleAll} disabled={items.length === 0}>
            {allSelected ? 'ぜんぶ解除' : 'ぜんぶ選ぶ'}
          </button>
          <button className="sel-del" onClick={() => setConfirm(true)} disabled={sel.length === 0}>
            手放す{sel.length ? '（' + sel.length + '）' : ''}
          </button>
          <button className="sel-cancel" onClick={cancelSel}>やめる</button>
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

  const [demoIdx, setDemoIdx] = useState(0);
  const [current, setCurrent] = useState(null); // いま貼られているもの
  const [phase, setPhase] = useState('idle');   // idle | open | who | anim | toast | empty
  const [animVerb, setAnimVerb] = useState(null);
  const [toast, setToast] = useState('');
  const [shelves, setShelves] = useState({});   // verbId -> items[]
  const [pulseVerb, setPulseVerb] = useState(null);
  const [view, setView] = useState(null);       // 棚ページ（verbId）
  const [whoText, setWhoText] = useState('');
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  // ── 永続化（IndexedDB）: リロードしても棚が消えない ──
  // michaes-store.js 未読込でも落ちないようにガード（その場合はメモリのみで動く）
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const store = window.MichaeSStore;
    if (!store) { setHydrated(true); return; }
    store.load()
      .then((s) => { if (s && Object.keys(s).length) setShelves(s); })
      .catch(() => {})
      .then(() => setHydrated(true));
  }, []);
  useEffect(() => {
    if (hydrated && window.MichaeSStore) window.MichaeSStore.save(shelves);
  }, [shelves, hydrated]);

  const paste = async () => {
    if (phase !== 'idle') return;
    let it = await readClipboard();
    if (it) {
      it = enrich(it);
    } else if (demoIdx < DEMO_CLIPBOARD.length) {
      it = enrich(DEMO_CLIPBOARD[demoIdx]);
      setDemoIdx(demoIdx + 1);
    } else {
      setPhase('empty');
      return;
    }
    setCurrent(it);
    setPhase('open');
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
    setShelves((p) => ({ ...p, [v.id]: [...(p[v.id] || []), { ...current, who, at: Date.now() }] }));
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

  const reset = () => { setDemoIdx(0); setPhase('idle'); };

  const deleteFromShelf = (verbId, idxs) => {
    const set = new Set(idxs);
    setShelves((p) => ({ ...p, [verbId]: (p[verbId] || []).filter((_, i) => !set.has(i)) }));
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
          </header>

          {/* 中央ステージ */}
          <main className="stage">
            {phase === 'idle' && (
              <button className="orb" onClick={paste} data-comment-anchor="center-tap">
                <span className="orb-halo" aria-hidden="true"></span>
                <span className="orb-star">✦</span>
                <span className="orb-label">ペースト</span>
                <span className="orb-hint">コピーしたものを、ここに貼る</span>
              </button>
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
            <ShelfPage verbId={view} items={shelves[view] || []} onBack={() => setView(null)} onDelete={deleteFromShelf} />
          )}

          {/* 設定画面 */}
          {view === 'settings' && (
            <SettingsPage onBack={() => setView(null)} t={t} setTweak={setTweak} onWipeAll={() => setShelves({})} />
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
