// michaes-settings.jssx → michaes-settings.jsx — ミカエス 設定画面（ミニマル）
// 仕様: uploads/MichaeS_settings_spec.md / 占い: uploads/MichaeS_today_fortune.md
// 核（アカウント・再浮上と通知・入れる・今日の占い）だけ常時表示、他は折りたたみ。
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

function SettingsPage({ onBack, t, setTweak, onWipeAll, onExport, onImport, openPremium }) {
  const { useState, useRef, useEffect } = React;
  // コア
  const [resurface, setResurface] = useState(true);
  const [perDay, setPerDay] = useState('おまかせ');
  const [notifWindow, setNotifWindow] = useState('深夜帯');
  const [remindDays, setRemindDays] = useState('3日前');
  const [pasteOnOpen, setPasteOnOpen] = useState(true);
  const [fortuneOn, setFortuneOn] = useState(true);
  const [fortuneTime, setFortuneTime] = useState('朝 8時ごろ');
  // 折りたたみ内
  const [shareBtn, setShareBtn] = useState(true);
  const [screenshotPull, setScreenshotPull] = useState(false);
  const [fontSize, setFontSize] = useState('標準');
  const [theme, setTheme] = useState('自動');
  const [layoutType, setLayoutType] = useState('標準');
  // UI
  const [premium, setPremium] = useState(!!openPremium);   // アップグレードシート（LP着地時は開いて出る）
  const [authUser, setAuthUser] = useState(null);  // Googleログイン中ユーザー {sub,email,name,picture}
  const [authBusy, setAuthBusy] = useState(false);
  const [wipe, setWipe] = useState(false);         // 全削除ダイアログ
  const [banner, setBanner] = useState(null);      // 占い通知プレビュー
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
        if (typeof s.pasteOnOpen === 'boolean') setPasteOnOpen(s.pasteOnOpen);
        if (typeof s.fortuneOn === 'boolean') setFortuneOn(s.fortuneOn);
        if (s.fortuneTime) setFortuneTime(s.fortuneTime);
        if (typeof s.shareBtn === 'boolean') setShareBtn(s.shareBtn);
        if (typeof s.screenshotPull === 'boolean') setScreenshotPull(s.screenshotPull);
        if (s.fontSize) setFontSize(s.fontSize);
        if (s.theme) setTheme(s.theme);
        if (s.layoutType) setLayoutType(s.layoutType);
      }
    }).catch(() => {}).then(() => setHyd(true));
  }, []);
  useEffect(() => {
    if (!hyd) return;
    const st = window.MichaeSStore;
    if (st && st.saveSettings) {
      st.saveSettings({ resurface, perDay, notifWindow, remindDays, pasteOnOpen, fortuneOn, fortuneTime, shareBtn, screenshotPull, fontSize, theme, layoutType });
    }
  }, [hyd, resurface, perDay, notifWindow, remindDays, pasteOnOpen, fortuneOn, fortuneTime, shareBtn, screenshotPull, fontSize, theme, layoutType]);

  // テーマ適用（自動=OS追従／ライト／ダーク）
  useEffect(() => {
    try { document.documentElement.setAttribute('data-theme', { '自動': 'auto', 'ライト': 'light', 'ダーク': 'dark' }[theme] || 'auto'); } catch (e) {}
  }, [theme]);

  const flash = (m) => {
    setNote(m);
    later(() => setNote(''), 1400);
  };

  // ── Googleログイン（プレミアム導線でのみ使用） ──
  // 起動時に保存済みセッションを復元
  useEffect(() => {
    const st = window.MichaeSStore;
    if (!st || !st.loadAuth) return;
    st.loadAuth().then((a) => { if (a && a.user) setAuthUser(a.user); });
  }, []);

  // IDトークンを受け取り→API検証→保存
  const handleCredential = (credential) => {
    const ep = window.MICHAES_API_ENDPOINT;
    if (!ep) { flash('APIエンドポイント未設定'); return; }
    setAuthBusy(true);
    fetch(ep + '/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d && d.ok && d.user) {
          try { if (gbtnRef.current) gbtnRef.current.innerHTML = ''; } catch (e) {}
          setAuthUser(d.user);
          const st = window.MichaeSStore;
          if (st && st.saveAuth) st.saveAuth({ session: d.session, user: d.user });
          try { if (window.google && window.google.accounts && window.google.accounts.id) window.google.accounts.id.cancel(); } catch (e) {}
          flash('ログインしました');
        } else {
          flash('ログイン失敗');
        }
      })
      .catch(() => flash('通信エラー'))
      .then(() => setAuthBusy(false));
  };

  const signOut = () => {
    setAuthUser(null);
    const st = window.MichaeSStore;
    if (st && st.clearAuth) st.clearAuth();
    try { if (window.google && window.google.accounts && window.google.accounts.id) window.google.accounts.id.disableAutoSelect(); } catch (e) {}
    flash('ログアウトしました');
  };

  // プレミアムシートが開いて未ログインのとき、Googleボタンを描画
  const gbtnRef = useRef(null);
  useEffect(() => {
    if (!premium || authUser) return;
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


  const previewFortune = () => {
    if (!fortuneOn) return;
    const msg = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
    setBanner(msg);
    later(() => setBanner(null), 3400);
    // Pushエンドポイントが設定されていれば、同じ一言を30秒後にバックグラウンド通知
    if (window.MICHAES_PUSH_ENDPOINT && window.MICHAES_VAPID_PUBLIC) {
      scheduleBackgroundPush(msg);
    }
  };

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

  const scheduleBackgroundPush = async (msg) => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
        flash('この端末はPush非対応'); return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { flash('通知が許可されなかった'); return; }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8(window.MICHAES_VAPID_PUBLIC),
        });
      }
      const r = await fetch(window.MICHAES_PUSH_ENDPOINT + '/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub.toJSON ? sub.toJSON() : sub,
          title: 'ミカエス',
          body: msg,
          delay: 30000,
        }),
      });
      if (r.ok) flash('30秒後に届く。ロックして待ってて ✦');
      else flash('予約に失敗（' + r.status + '）');
    } catch (e) {
      flash('Push予約に失敗');
    }
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
          <SetRow label="プラン" sub="無料プラン">
            <button className="up-btn" onClick={() => setPremium(true)}>プレミアムにする</button>
          </SetRow>
        </SetGroup>

        <SetGroup title="再浮上 と 通知">
          <SetRow label="再浮上" sub="温かいうちに、そっと出し直す">
            <Toggle on={resurface} onChange={setResurface} />
          </SetRow>
          <SetRow label="1日に出す件数" onClick={() => setPerDay(cycleNext(['おまかせ', '1件', '3件'], perDay))}>
            <span className="val-chip">{perDay}{perDay === 'おまかせ' ? '（少数）' : ''}</span>
          </SetRow>
          <SetRow label="通知の時間帯" onClick={() => setNotifWindow(cycleNext(['深夜帯', '通勤帯', 'いつでも'], notifWindow))}>
            <span className="val-chip">{notifWindow}</span>
          </SetRow>
          <SetRow label="賞味期限の通知" sub="期限つきリンクの何日前に知らせるか" onClick={() => setRemindDays(cycleNext(['当日', '前日', '3日前', '1週間前'], remindDays))}>
            <span className="val-chip">{remindDays}</span>
          </SetRow>
          <SetRow label="詳細ルール" sub="感覚 × 時間帯 × 場所 × イヤホン" locked onClick={() => setPremium(true)}>
            <span className="val-chip dim">プレミアム</span>
          </SetRow>
        </SetGroup>

        <SetGroup title="入れる">
          <SetRow label="起動時に「コピー中」を出す" sub="開いた瞬間、貼るだけにする">
            <Toggle on={pasteOnOpen} onChange={setPasteOnOpen} />
          </SetRow>
          <Fold title="くわしく">
            <SetRow label="クリップボード読取の許可" sub="OSの設定で管理">
              <span className="val-chip dim">許可済み</span>
            </SetRow>
            <SetRow label="共有ボタン（Android）">
              <Toggle on={shareBtn} onChange={setShareBtn} />
            </SetRow>
            <SetRow label="スクショ吸い上げ">
              <Toggle on={screenshotPull} onChange={setScreenshotPull} />
            </SetRow>
          </Fold>
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
          {fortuneOn ? (
            <SetRow label="通知をのぞいてみる" sub="今日の一枚を引く（プレビュー）" onClick={previewFortune}>
              <span className="val-chip dim">✦</span>
            </SetRow>
          ) : null}
        </SetGroup>

        <Fold title="出口の接続">
          <SetRow label="ツカウ箱の送り先" sub="プロジェクト / 外部連携">
            <span className="val-chip dim">未接続</span>
          </SetRow>
          <SetRow label="ミセルの相手リスト" sub="あゆむ、乃々瀬">
            <span className="val-chip">2人</span>
          </SetRow>
        </Fold>

        <Fold title="データ">
          <SetRow label="横断インポート" sub="既存ブクマ・スクショを一括で" locked onClick={() => setPremium(true)}>
            <span className="val-chip dim">プレミアム</span>
          </SetRow>
          <SetRow label="書き出し" sub="Obsidian など" locked onClick={() => setPremium(true)}>
            <span className="val-chip dim">プレミアム</span>
          </SetRow>
          <SetRow label="同期・容量" locked onClick={() => setPremium(true)}>
            <span className="val-chip dim">プレミアム</span>
          </SetRow>
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
          <SetRow label="文字サイズ" onClick={() => setFontSize(cycleNext(['標準', '大きめ', '小さめ'], fontSize))}>
            <span className="val-chip">{fontSize}</span>
          </SetRow>
          <SetRow label="テーマ" sub="自動はOSの設定に追従" onClick={() => setTheme(cycleNext(['自動', 'ライト', 'ダーク'], theme))}>
            <span className="val-chip">{theme}</span>
          </SetRow>
          <SetRow label="レイアウトタイプ" sub="左利き・大型端末はここから" onClick={() => setLayoutType(cycleNext(['標準', '左利き', '大型端末'], layoutType))}>
            <span className="val-chip">{layoutType}</span>
          </SetRow>
        </Fold>

        <Fold title="その他">
          <SetRow label="プライバシー" sub="ローカル優先 ・ 権限の管理">
            <span className="val-chip dim">ローカル</span>
          </SetRow>
          <SetRow label="ヘルプ / フィードバック" onClick={() => flash('ありがとう。届いた（プロトタイプ）')}>
            <span className="val-chip dim">›</span>
          </SetRow>
          <SetRow label="利用規約・プライバシー" onClick={() => window.open('rule.html', '_blank', 'noopener')}>
            <span className="val-chip dim">›</span>
          </SetRow>
          <SetRow label="バージョン">
            <span className="val-chip dim">0.3.0 試作</span>
          </SetRow>
        </Fold>
      </div>

      {note ? <div className="shelf-note">{note}</div> : null}

      {/* 占い通知プレビュー（iOSバナー風） */}
      {banner ? (
        <div className="notif" role="status">
          <span className="notif-ico">✦</span>
          <span className="notif-body">
            <span className="notif-t">ミカエス ・ 今日の占い</span>
            <span className="notif-x">{banner}</span>
          </span>
        </div>
      ) : null}

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
                <div className="prem-actions">
                  <button className="dlg-yes gold" onClick={() => { setPremium(false); flash('課金は次の工程で接続（Stripe）'); }}>支払いへ進む</button>
                  <button className="dlg-logout" onClick={signOut}>ログアウト</button>
                </div>
              </div>
            ) : (
              <div className="prem-auth" key="signed-out">
                <p className="prem-auth-lead">プレミアムは端末をまたいで使えるよう、Googleでログインします。</p>
                <div className="gbtn-wrap" ref={gbtnRef} />
                {authBusy ? <p className="prem-auth-busy">確認中…</p> : null}
                <div className="dialog-btns">
                  <button className="dlg-no" onClick={() => setPremium(false)}>いまはいい</button>
                </div>
              </div>
            )}
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

Object.assign(window, { SettingsPage, GearIcon, FORTUNES });
