// michaes-settings.jssx → michaes-settings.jsx — ミカエス 設定画面（ミニマル）
// 仕様: uploads/MichaeS_settings_spec.md / 占い: uploads/MichaeS_today_fortune.md
// 核（アカウント・再浮上と通知・入れる・今日の占い）だけ常時表示、他は折りたたみ。
// プレミアムはロック行 → アップグレードシート。エクスポートは無料保証(⭐)。

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

function SettingsPage({ onBack, t, setTweak, onWipeAll }) {
  const { useState, useRef, useEffect } = React;
  // コア
  const [resurface, setResurface] = useState(true);
  const [perDay, setPerDay] = useState('おまかせ');
  const [notifWindow, setNotifWindow] = useState('深夜帯');
  const [pasteOnOpen, setPasteOnOpen] = useState(true);
  const [fortuneOn, setFortuneOn] = useState(true);
  const [fortuneTime, setFortuneTime] = useState('朝 8時ごろ');
  // 折りたたみ内
  const [shareBtn, setShareBtn] = useState(true);
  const [screenshotPull, setScreenshotPull] = useState(false);
  const [fontSize, setFontSize] = useState('標準');
  const [layoutType, setLayoutType] = useState('標準');
  // UI
  const [premium, setPremium] = useState(false);   // アップグレードシート
  const [wipe, setWipe] = useState(false);         // 全削除ダイアログ
  const [banner, setBanner] = useState(null);      // 占い通知プレビュー
  const [note, setNote] = useState('');
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  const flash = (m) => {
    setNote(m);
    later(() => setNote(''), 1400);
  };

  const previewFortune = () => {
    if (!fortuneOn) return;
    setBanner(FORTUNES[Math.floor(Math.random() * FORTUNES.length)]);
    later(() => setBanner(null), 3400);
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
          <SetRow label="Google" sub="hikari@gmail.com ・ 接続中">
            <span className="val-chip dim">切替</span>
          </SetRow>
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
            <Toggle on={fortuneOn} onChange={setFortuneOn} />
          </SetRow>
          {fortuneOn ? (
            <SetRow label="配信時間帯" onClick={() => setFortuneTime(cycleNext(['朝 8時ごろ', '昼 12時ごろ', '夜 21時ごろ'], fortuneTime))}>
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
          <SetRow label="エクスポート" sub="自分のデータは、いつでも持ち出せる" freeBadge onClick={() => flash('書き出しを準備した（プロトタイプ）')}>
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
          <SetRow label="ライト / ダーク" onClick={() => flash('ダークは準備中')}>
            <span className="val-chip">ライト</span>
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
            <div className="dialog-btns">
              <button className="dlg-no" onClick={() => setPremium(false)}>いまはいい</button>
              <button className="dlg-yes gold" onClick={() => { setPremium(false); flash('課金導線は未接続（KOMOJU予定）'); }}>すすむ</button>
            </div>
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
