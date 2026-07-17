// michaes-settings.jssx → michaes-settings.jsx — ミカエス 設定画面（ミニマル）
// 仕様: uploads/MichaeS_settings_spec.md / 占い: uploads/MichaeS_today_fortune.md
// 核（アカウント・再浮上と通知・今日の占い）だけ常時表示、他は折りたたみ。
// プレミアムはロック行 → アップグレードシート。エクスポートは無料保証(⭐)。

// VAPID公開鍵(base64url) → Uint8Array（applicationServerKey用）
function urlB64ToUint8(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// アプリのバージョン。リリース（ソース変更を配布）ごとに patch を上げる。
const APP_VERSION = '1.0.5';

function GearIcon({ size = 21 }) {
  const st = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
      <circle {...st} cx="12" cy="12" r="3.2"></circle>
      <path {...st} d="M12 2.8 l1.2 2.6 a7 7 0 0 1 2.4 1 l2.8-.8 1.6 2.8 -2 2.1 a7 7 0 0 1 0 2.6 l2 2.1 -1.6 2.8 -2.8-.8 a7 7 0 0 1 -2.4 1 L12 21.2 l-1.2-2.6 a7 7 0 0 1 -2.4-1 l-2.8.8 -1.6-2.8 2-2.1 a7 7 0 0 1 0-2.6 l-2-2.1 1.6-2.8 2.8.8 a7 7 0 0 1 2.4-1 Z"></path>
    </svg>
  );
}

function LockIcon({ size = 13 }) {
  const st = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
      <rect {...st} x="5" y="10.5" width="14" height="9.5" rx="2.5"></rect>
      <path {...st} d="M8 10.5 V8 a4 4 0 0 1 8 0 v2.5"></path>
    </svg>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button className={'tgl' + (on ? ' on' : '')} role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span className="tgl-knob"></span>
    </button>
  );
}

function SetRow({ label, sub, children, onClick, locked, freeBadge }) {
  const inner = (
    <React.Fragment>
      <div className="set-row-main">
        <div className="set-row-label">
          {locked ? <span className="lock-ico"><LockIcon /></span> : null}
          <span>{label}</span>
          {freeBadge ? <span className="free-badge">無料</span> : null}
        </div>
        {sub ? <div className="set-row-sub">{sub}</div> : null}
      </div>
      <div className="set-row-right">{children}</div>
    </React.Fragment>
  );
  if (onClick) {
    return <button className={'set-row tappable' + (locked ? ' locked' : '')} onClick={onClick}>{inner}</button>;
  }
  return <div className="set-row">{inner}</div>;
}

function SetGroup({ title, children }) {
  return (
    <section className="set-group">
      <h3 className="set-group-t">{title}</h3>
      <div className="set-card">{children}</div>
    </section>
  );
}

function Fold({ title, children }) {
  const [open, setOpen] = React.useState(false);
  return (
    <section className="set-group">
      <button className="fold-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <svg className={'fold-arr' + (open ? ' open' : '')} width="12" height="12" viewBox="0 0 24 24">
          <path d="M9 5 L17 12 L9 19" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"></path>
        </svg>
        <span>{title}</span>
      </button>
      {open ? <div className="set-card">{children}</div> : null}
    </section>
  );
}

const cycleNext = (list, v) => list[(list.indexOf(v) + 1) % list.length];

function SettingsPage({ onBack, t, setTweak, onWipeAll, onExport, onImport, openPremium, auth, setAuth, isPremium, refreshSub, onSyncToggle, onSyncNow, lastSync, verbs, parseBookmarks, onImportBookmarks }) {
  const authUser = auth && auth.user;
  const { useState, useRef, useEffect } = React;
  // コア
  const [resurface, setResurface] = useState(true);
  const [perDay, setPerDay] = useState('おまかせ');
  const [notifWindow, setNotifWindow] = useState('深夜帯');
  const [remindDays, setRemindDays] = useState('3日前');
  const [fortuneOn, setFortuneOn] = useState(true);
  const [fortuneTime, setFortuneTime] = useState('朝 8時ごろ');
  const [syncEnabled, setSyncEnabled] = useState(false);   // 端末間同期（Drive）
  const [syncBusy, setSyncBusy] = useState(false);
  const [bmLinks, setBmLinks] = useState(null);            // 横断インポート：解析済みリンク（棚選択待ち）
  const bmInputRef = useRef(null);
  // UI
  const [premium, setPremium] = useState(!!openPremium);   // アップグレードシート（LP着地時は開いて出る）
  const [authBusy, setAuthBusy] = useState(false);
  const [wipe, setWipe] = useState(false);         // 全削除ダイアログ
  const [note, setNote] = useState('');
  const timers = useRef([]);
  const importRef = useRef(null);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  // ── 設定の永続化：開いた時に復元、変えたら保存 ──
  const [hyd, setHyd] = useState(false);
  useEffect(() => {
    const st = window.MichaeSStore;
    if (!st || !st.loadSettings) { setHyd(true); return; }
    st.loadSettings().then((s) => {
      if (s) {
        if (typeof s.resurface === 'boolean') setResurface(s.resurface);
        if (s.perDay) setPerDay(s.perDay);
        if (s.notifWindow) setNotifWindow(s.notifWindow);
        if (s.remindDays) setRemindDays(s.remindDays);
        if (typeof s.fortuneOn === 'boolean') setFortuneOn(s.fortuneOn);
        if (s.fortuneTime) setFortuneTime(s.fortuneTime);
        if (typeof s.syncOn === 'boolean') setSyncEnabled(s.syncOn);
      }
    }).catch(() => {}).then(() => setHyd(true));
  }, []);
  useEffect(() => {
    if (!hyd) return;
    const st = window.MichaeSStore;
    if (st && st.saveSettings) {
      st.saveSettings({ resurface, perDay, notifWindow, remindDays, fortuneOn, fortuneTime, syncOn: syncEnabled });
    }
  }, [hyd, resurface, perDay, notifWindow, remindDays, fortuneOn, fortuneTime, syncEnabled]);

  // ── 端末間同期（Google Drive）操作 ──
  const handleSyncToggle = async (next) => {
    if (next) {
      if (!isPremium) { setPremium(true); return; }
      if (!(window.MichaeSDrive && window.MichaeSDrive.available())) { flash('この端末では同期を使えません'); return; }
      setSyncBusy(true);
      try {
        if (onSyncNow) await onSyncNow(true);   // 同意ポップアップ→初回プル/マージ/push
        setSyncEnabled(true);
        if (onSyncToggle) onSyncToggle(true);
        flash('端末間同期をオンにした ✦');
      } catch (e) { flash('連携に失敗しました'); }
      setSyncBusy(false);
    } else {
      setSyncEnabled(false);
      if (onSyncToggle) onSyncToggle(false);
      if (window.MichaeSDrive && window.MichaeSDrive.revoke) window.MichaeSDrive.revoke();
      flash('同期をオフにした');
    }
  };
  const doSyncNow = async () => {
    if (!isPremium) { setPremium(true); return; }
    if (!syncEnabled) { flash('先に端末間同期をオンに'); return; }
    setSyncBusy(true);
    try { if (onSyncNow) await onSyncNow(true); flash('同期しました ✦'); }
    catch (e) { flash('同期に失敗しました'); }
    setSyncBusy(false);
  };

  const flash = (m) => {
    setNote(m);
    later(() => setNote(''), 1400);
  };

  // ── Googleログイン（プレミアム導線でのみ使用） ──
  // 復元はApp側で起動時に実施（authUserはpropsで受け取る）

  // ── 統一ログイン（認可コードフロー）: 認証(identity)とDrive権限(drive.appdata)を
  //    一度の同意で取得。サーバーがcodeをrefresh token込みで交換し、以後の同期は
  //    サーバー発行のDriveトークンで動くため「同期のたびに再ログイン」が起きない。──
  const startCodeLogin = () => {
    const cid = window.MICHAES_GOOGLE_CLIENT_ID;
    const oauth2 = window.google && window.google.accounts && window.google.accounts.oauth2;
    if (!cid || !oauth2) { flash('Googleが読み込めていない'); return; }
    try {
      const codeClient = oauth2.initCodeClient({
        client_id: cid,
        scope: 'openid email profile https://www.googleapis.com/auth/drive.appdata',
        ux_mode: 'popup',
        callback: (resp) => {
          if (resp && resp.code) handleAuthResponse({ code: resp.code });
          else flash('ログインをキャンセルしました');
        },
      });
      codeClient.requestCode();
    } catch (e) { flash('ログインを開始できませんでした'); }
  };

  // IDトークン（従来）または認可コード（統一）を受け取り→API検証→保存
  const handleCredential = (credential) => handleAuthResponse({ credential });
  const handleAuthResponse = (payload) => {
    const ep = window.MICHAES_API_ENDPOINT;
    if (!ep) { flash('APIエンドポイント未設定'); return; }
    setAuthBusy(true);
    fetch(ep + '/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d && d.ok && d.user) {
          try { if (gbtnRef.current) gbtnRef.current.innerHTML = ''; } catch (e) {}
          setAuth({ session: d.session, user: d.user });
          const st = window.MichaeSStore;
          if (st && st.saveAuth) st.saveAuth({ session: d.session, user: d.user });
          try { if (window.google && window.google.accounts && window.google.accounts.id) window.google.accounts.id.cancel(); } catch (e) {}
          if (refreshSub) refreshSub(d.session);
          flash('ログインしました');
        } else {
          flash('ログイン失敗');
        }
      })
      .catch(() => flash('通信エラー'))
      .then(() => setAuthBusy(false));
  };

  const signOut = () => {
    const ep = window.MICHAES_API_ENDPOINT;
    const session = auth && auth.session;
    // 統一フロー: サーバー保持のrefresh tokenも破棄してもらう（ベストエフォート）
    if (window.MICHAES_UNIFIED_AUTH && ep && session) {
      try { fetch(ep + '/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + session } }).catch(() => {}); } catch (e) {}
    }
    try { if (window.MichaeSDrive && window.MichaeSDrive.revoke) window.MichaeSDrive.revoke(); } catch (e) {}
    setAuth(null);
    const st = window.MichaeSStore;
    if (st && st.clearAuth) st.clearAuth();
    try { if (window.google && window.google.accounts && window.google.accounts.id) window.google.accounts.id.disableAutoSelect(); } catch (e) {}
    flash('ログアウトしました');
  };

  // ② Stripe決済へ（要ログイン）
  const [planSel, setPlanSel] = useState('month');
  const [payBusy, setPayBusy] = useState(false);
  const goCheckout = () => {
    const ep = window.MICHAES_API_ENDPOINT;
    if (!ep || !auth || !auth.session) { flash('ログインが必要です'); return; }
    setPayBusy(true);
    fetch(ep + '/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + auth.session },
      body: JSON.stringify({ plan: planSel }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d && d.ok && d.url) { window.location.href = d.url; }
        else { flash(d && d.error ? '決済失敗: ' + d.error : '決済の開始に失敗'); setPayBusy(false); }
      })
      .catch(() => { flash('通信エラー'); setPayBusy(false); });
  };

  // プレミアムシートが開いて未ログインのとき、Googleボタンを描画
  const gbtnRef = useRef(null);
  useEffect(() => {
    if (!premium || authUser || window.MICHAES_UNIFIED_AUTH) return; // 統一時はGISボタンを使わない
    const cid = window.MICHAES_GOOGLE_CLIENT_ID;
    if (!cid) return;
    let tries = 0;
    const render = () => {
      const g = window.google && window.google.accounts && window.google.accounts.id;
      if (!g) { if (tries++ < 40) later(render, 150); return; }
      try {
        g.initialize({ client_id: cid, callback: (resp) => handleCredential(resp.credential) });
        if (gbtnRef.current) {
          gbtnRef.current.innerHTML = '';
          g.renderButton(gbtnRef.current, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', logo_alignment: 'center' });
        }
      } catch (e) {}
    };
    render();
  }, [premium, authUser]);


  // ── Push購読の共通取得（許可→購読） ──
  const ensureSubscription = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
      flash('この端末はPush非対応'); return null;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { flash('通知が許可されなかった'); return null; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8(window.MICHAES_VAPID_PUBLIC),
      });
    }
    return sub;
  };

  // 配信時間帯 → JST時（Workerの許可値と一致）
  const SLOT_HOUR = { '朝 8時ごろ': 8, '昼 12時ごろ': 12, '夜 21時ごろ': 21 };

  // 毎日配信の登録（ON時・時間帯変更時）
  const registerDaily = async (timeLabel) => {
    if (!window.MICHAES_PUSH_ENDPOINT || !window.MICHAES_VAPID_PUBLIC) { flash('配信先が未設定'); return false; }
    try {
      const sub = await ensureSubscription();
      if (!sub) return false;
      const r = await fetch(window.MICHAES_PUSH_ENDPOINT + '/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON ? sub.toJSON() : sub, hour: SLOT_HOUR[timeLabel] || 8 }),
      });
      return r.ok;
    } catch (e) { return false; }
  };

  // 毎日配信の解除（OFF時）
  const unregisterDaily = async () => {
    if (!window.MICHAES_PUSH_ENDPOINT) return;
    try {
      if (!('serviceWorker' in navigator)) return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(window.MICHAES_PUSH_ENDPOINT + '/unsubscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      }
    } catch (e) {}
  };

  // 配信トグル
  const onFortuneToggle = async (next) => {
    if (next) {
      const okReg = await registerDaily(fortuneTime);
      if (okReg) { setFortuneOn(true); flash('毎朝の配信をオンにした ✦'); }
      else { setFortuneOn(false); /* ensureSubscription側でflash済み */ }
    } else {
      setFortuneOn(false);
      unregisterDaily();
      flash('配信をオフにした');
    }
  };

  // 配信時間帯の変更（ON中なら再登録）
  const onFortuneTimeChange = () => {
    const nextTime = cycleNext(['朝 8時ごろ', '昼 12時ごろ', '夜 21時ごろ'], fortuneTime);
    setFortuneTime(nextTime);
    if (fortuneOn) registerDaily(nextTime);
  };

  // ── 再浮上（コア機能）: pushを登録/解除。通知の中身はSWがIndexedDBから選ぶ（サーバーに保存内容を出さない） ──
  const RSF_HOUR = { '深夜帯': 22, '通勤帯': 8, 'いつでも': 12 };
  const registerResurface = async (windowLabel) => {
    if (!window.MICHAES_PUSH_ENDPOINT || !window.MICHAES_VAPID_PUBLIC) { flash('配信先が未設定'); return false; }
    const sub = await ensureSubscription();
    if (!sub) return false;
    try {
      const r = await fetch(window.MICHAES_PUSH_ENDPOINT + '/resurface', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON ? sub.toJSON() : sub, hour: RSF_HOUR[windowLabel] != null ? RSF_HOUR[windowLabel] : 12 }),
      });
      return r.ok;
    } catch (e) { return false; }
  };
  const unregisterResurface = async () => {
    if (!window.MICHAES_PUSH_ENDPOINT) return;
    try {
      if (!('serviceWorker' in navigator)) return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await fetch(window.MICHAES_PUSH_ENDPOINT + '/unresurface', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
    } catch (e) {}
  };
  const onResurfaceToggle = async (next) => {
    if (next) {
      const ok = await registerResurface(notifWindow);
      if (ok) { setResurface(true); flash('再浮上をオンにした ✦'); }
      else { setResurface(false); /* ensureSubscription側でflash済み */ }
    } else {
      setResurface(false);
      unregisterResurface();
      flash('再浮上をオフにした');
    }
  };
  const onNotifWindowChange = () => {
    const nx = cycleNext(['深夜帯', '通勤帯', 'いつでも'], notifWindow);
    setNotifWindow(nx);
    if (resurface) registerResurface(nx);
  };
  const tone = Math.round(((t.lightBeam + t.goldAmount) / 2) * 100) / 100;
  const setTone = (v) => setTweak({ lightBeam: v, goldAmount: v });

  return (
    <div className="shelf settings" data-screen-label="設定">
      <header className="shelf-head">
        <div className="shelf-title-wrap">
          <span className="shelf-icon"><GearIcon size={17} /></span>
          <h2 className="shelf-title">設定</h2>
        </div>
        <p className="shelf-sub">少なく、静かに</p>
      </header>

      <div className="shelf-list set-list">
        <SetGroup title="アカウント / プラン">
          <SetRow label="Google" sub={authUser ? ((authUser.email || authUser.name || 'ログイン中') + ' ・ 接続中') : '未接続'} />
          <SetRow label="プラン" sub={isPremium ? 'プレミアム' : '無料プラン'}>
            {isPremium ? <span className="val-chip gold-chip">✦ 有効</span> : <button className="up-btn" onClick={() => setPremium(true)}>プレミアムにする</button>}
          </SetRow>
        </SetGroup>

        <SetGroup title="再浮上 と 通知">
          <SetRow label="再浮上" sub="温かいうちに、そっと出し直す">
            <Toggle on={resurface} onChange={onResurfaceToggle} />
          </SetRow>
          <SetRow label="1日に出す件数" onClick={() => setPerDay(cycleNext(['おまかせ', '1件', '3件'], perDay))}>
            <span className="val-chip">{perDay}{perDay === 'おまかせ' ? '（少数）' : ''}</span>
          </SetRow>
          <SetRow label="通知の時間帯" onClick={onNotifWindowChange}>
            <span className="val-chip">{notifWindow}</span>
          </SetRow>
          <SetRow label="賞味期限の通知" sub="期限つきリンクの何日前に知らせるか" onClick={() => setRemindDays(cycleNext(['当日', '前日', '3日前', '1週間前'], remindDays))}>
            <span className="val-chip">{remindDays}</span>
          </SetRow>
          <SetRow label="詳細ルール" sub="感覚 × 時間帯 × 場所 × イヤホン" locked={!isPremium} onClick={isPremium ? undefined : () => setPremium(true)}>
            <span className="val-chip dim">{isPremium ? '✦' : 'プレミアム'}</span>
          </SetRow>
        </SetGroup>

        <SetGroup title="今日の占い">
          <SetRow label="配信" sub="1日1回、通知だけ。アプリの中には出ない">
            <Toggle on={fortuneOn} onChange={onFortuneToggle} />
          </SetRow>
          {fortuneOn ? (
            <SetRow label="配信時間帯" onClick={onFortuneTimeChange}>
              <span className="val-chip">{fortuneTime}</span>
            </SetRow>
          ) : null}
        </SetGroup>

        <Fold title="出口の接続">
          <SetRow label="ツカウ箱の送り先" sub="プロジェクト / 外部連携">
            <span className="val-chip dim">未接続</span>
          </SetRow>
        </Fold>

        <Fold title="データ">
          {isPremium ? (
            <SetRow label="横断インポート" sub="ブラウザのブックマーク(HTML)を一括で取り込む" onClick={() => bmInputRef.current && bmInputRef.current.click()}>
              <span className="val-chip">HTML</span>
            </SetRow>
          ) : (
            <SetRow label="横断インポート" sub="既存ブクマを一括で取り込む" locked onClick={() => setPremium(true)}>
              <span className="val-chip dim">プレミアム</span>
            </SetRow>
          )}
          <input ref={bmInputRef} type="file" accept=".html,.htm,text/html" style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files && e.target.files[0];
              e.target.value = '';
              if (!file) return;
              try {
                const html = await file.text();
                const links = parseBookmarks ? parseBookmarks(html) : [];
                if (!links.length) { flash('ブックマークが見つからなかった'); return; }
                setBmLinks(links);
              } catch (err) { flash('読み込めなかった（HTML形式？）'); }
            }} />
          <SetRow label="書き出し" sub="Obsidian など" locked={!isPremium} onClick={isPremium ? undefined : () => setPremium(true)}>
            <span className="val-chip dim">{isPremium ? '✦' : 'プレミアム'}</span>
          </SetRow>
          {isPremium ? (
            <SetRow label="端末間同期（Google Drive）" sub="あなた自身のDriveのアプリ専用フォルダに保存。リンク/テキストを端末間で横断">
              <Toggle on={syncEnabled} onChange={handleSyncToggle} />
            </SetRow>
          ) : (
            <SetRow label="端末間同期（Google Drive）" sub="ログインした端末で棚を横断。データはあなたのDriveに" locked onClick={() => setPremium(true)}>
              <span className="val-chip dim">プレミアム</span>
            </SetRow>
          )}
          {isPremium && syncEnabled ? (
            <SetRow label="今すぐ同期" sub={lastSync ? '最終同期 ' + new Date(lastSync).toLocaleString() : 'まだ同期していない'} onClick={syncBusy ? undefined : doSyncNow}>
              <span className="val-chip dim">{syncBusy ? '同期中…' : '✦'}</span>
            </SetRow>
          ) : null}
          <SetRow label="エクスポート" sub="自分のデータは、いつでも持ち出せる" freeBadge onClick={async () => {
            try {
              const n = onExport ? await onExport() : 0;
              flash(n > 0 ? n + '件をJSONで書き出した' : '棚が空です');
            } catch (e) { flash('書き出せなかった'); }
          }}>
            <span className="val-chip">JSON</span>
          </SetRow>
          <input ref={importRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files && e.target.files[0];
              e.target.value = '';
              if (!file) return;
              try {
                const payload = JSON.parse(await file.text());
                const n = onImport ? await onImport(payload) : 0;
                flash(n > 0 ? n + '件を取り込んだ' : '新しい項目はなかった');
              } catch (err) {
                flash('読み込めなかった（JSON形式？）');
              }
            }} />
          <SetRow label="インポート" sub="書き出したJSONから戻す（マージ）" freeBadge onClick={() => importRef.current && importRef.current.click()}>
            <span className="val-chip">JSON</span>
          </SetRow>
          <SetRow label="全削除" sub="棚をぜんぶ空にする" onClick={() => setWipe(true)}>
            <span className="val-chip warn">…</span>
          </SetRow>
        </Fold>

        <Fold title="表示">
          <div className="set-row tone-row">
            <div className="set-row-main">
              <div className="set-row-label"><span>神聖トーンの強さ</span></div>
              <div className="tone-slider">
                <span className="tone-end">淡</span>
                <input type="range" min="0" max="1" step="0.05" value={tone}
                       onChange={(e) => setTone(parseFloat(e.target.value))} />
                <span className="tone-end">濃</span>
              </div>
            </div>
          </div>
        </Fold>

        <Fold title="その他">
          <SetRow label="プライバシー" sub="ローカル優先 ・ 権限の管理">
            <span className="val-chip dim">ローカル</span>
          </SetRow>
          <SetRow label="利用規約・プライバシー" onClick={() => window.open('rule.html', '_blank', 'noopener')}>
            <span className="val-chip dim">›</span>
          </SetRow>
          <SetRow label="バージョン">
            <span className="val-chip dim">{APP_VERSION}</span>
          </SetRow>
        </Fold>
      </div>

      {note ? <div className="shelf-note">{note}</div> : null}

      {/* ホームへ戻る */}
      <div className="shelf-foot">
        <button className="home-orb" onClick={onBack} aria-label="ホームへもどる">
          <span className="home-halo" aria-hidden="true"></span>
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path d="M5 10 L12 16.5 L19 10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"></path>
          </svg>
        </button>
        <span className="home-label">ホームへ</span>
      </div>

      {/* プレミアムシート */}
      {premium ? (
        <div className="dialog-dim" onClick={() => setPremium(false)}>
          <div className="dialog prem" onClick={(e) => e.stopPropagation()}>
            <span className="prem-star">✦</span>
            <p className="dialog-t">プレミアム</p>
            <p className="dialog-s">再浮上の詳細ルール、横断インポート、<br />書き出し、同期がひらく</p>
            <p className="prem-price">月額 ¥480 ・ 年額 ¥4,800<span className="prem-price-sub">いつでも解約できます</span></p>

            {authUser ? (
              <div className="prem-auth" key="signed-in">
                <p className="prem-auth-ok">✓ {authUser.email || authUser.name || 'ログイン済み'}</p>
                {isPremium ? (
                  <div className="prem-actions">
                    <p className="prem-active-note">プレミアム有効 ・ ご利用ありがとうございます</p>
                    <button className="dlg-logout" onClick={signOut}>ログアウト</button>
                  </div>
                ) : (
                  <div className="prem-actions">
                    <div className="plan-toggle">
                      <button className={'pt-btn' + (planSel === 'month' ? ' on' : '')} onClick={() => setPlanSel('month')}>月額 ¥480</button>
                      <button className={'pt-btn' + (planSel === 'year' ? ' on' : '')} onClick={() => setPlanSel('year')}>年額 ¥4,800</button>
                    </div>
                    <button className="dlg-yes gold" disabled={payBusy} onClick={goCheckout}>{payBusy ? '決済へ移動中…' : '支払いへ進む'}</button>
                    <button className="dlg-logout" onClick={signOut}>ログアウト</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="prem-auth" key="signed-out">
                <p className="prem-auth-lead">プレミアムは端末をまたいで使えるよう、Googleでログインします。</p>
                {window.MICHAES_UNIFIED_AUTH
                  ? <button className="dlg-yes gold" onClick={startCodeLogin}>Googleでログイン</button>
                  : <div className="gbtn-wrap" ref={gbtnRef} />}
                {authBusy ? <p className="prem-auth-busy">確認中…</p> : null}
                <div className="dialog-btns">
                  <button className="dlg-no" onClick={() => setPremium(false)}>いまはいい</button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* 横断インポート：棚選択ダイアログ */}
      {bmLinks ? (
        <div className="dialog-dim" onClick={() => setBmLinks(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <p className="dialog-t">{bmLinks.length}件のブックマーク</p>
            <p className="dialog-s">どの棚に取り込む？</p>
            <div className="bm-choices">
              {(verbs || []).map((v) => (
                <button key={v.id} className="bm-choice" onClick={() => {
                  const n = onImportBookmarks ? onImportBookmarks(v.id, bmLinks) : 0;
                  setBmLinks(null);
                  flash(n > 0 ? n + '件を「' + v.label + '」に取り込んだ' : '新しい項目はなかった');
                }}>{v.label}</button>
              ))}
            </div>
            <button className="dlg-no" style={{ width: '100%', marginTop: 10 }} onClick={() => setBmLinks(null)}>やめる</button>
          </div>
        </div>
      ) : null}

      {/* 全削除ダイアログ */}
      {wipe ? (
        <div className="dialog-dim" onClick={() => setWipe(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <p className="dialog-t">ぜんぶ手放す？</p>
            <p className="dialog-s">すべての棚が空になる。もどせない</p>
            <div className="dialog-btns">
              <button className="dlg-no" onClick={() => setWipe(false)}>やめる</button>
              <button className="dlg-yes" onClick={() => { onWipeAll(); setWipe(false); flash('棚を空にした'); }}>手放す</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

Object.assign(window, { SettingsPage, GearIcon });
