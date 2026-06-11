// michaes-anims.jsx — 動詞ごとの中央アニメーション + 動詞アイコン
// Exports to window: VerbIcon, VerbAnim

// ── 小さな線画アイコン（ボタン用） ──────────────────────────
function VerbIcon({ id, size = 22 }) {
  const s = { width: size, height: size, display: 'block' };
  const st = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (id) {
    case 'miru':
      return (
        <svg style={s} viewBox="0 0 24 24">
          <path {...st} d="M2.5 12 Q12 3.5 21.5 12 Q12 20.5 2.5 12 Z"></path>
          <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"></circle>
        </svg>
      );
    case 'kiku':
      return (
        <svg style={s} viewBox="0 0 24 24">
          <path {...st} d="M4 14 v-2 a8 8 0 0 1 16 0 v2"></path>
          <rect {...st} x="3" y="13.5" width="4.5" height="7" rx="2.2"></rect>
          <rect {...st} x="16.5" y="13.5" width="4.5" height="7" rx="2.2"></rect>
        </svg>
      );
    case 'tsukau':
      return (
        <svg style={s} viewBox="0 0 24 24">
          <rect {...st} x="3.5" y="8.5" width="17" height="12" rx="2.5"></rect>
          <path {...st} d="M3.5 12.5 h17"></path>
          <path {...st} d="M12 3 v5.5 M9.5 6 L12 8.5 L14.5 6"></path>
        </svg>
      );
    case 'miseru':
      return (
        <svg style={s} viewBox="0 0 24 24">
          <rect {...st} x="3" y="6" width="11" height="14" rx="2.5" transform="rotate(-6 8.5 13)"></rect>
          <path {...st} d="M17 5 l2.2-2.2 M19 10 h3 M17.5 14.5 l2 2"></path>
        </svg>
      );
    case 'suki':
      return (
        <svg style={s} viewBox="0 0 24 24">
          <path {...st} d="M12 20.5 C5 15.5 2.5 11.5 2.5 8.2 C2.5 5.2 5 3.5 7.4 3.5 C9.4 3.5 11 4.7 12 6.6 C13 4.7 14.6 3.5 16.6 3.5 C19 3.5 21.5 5.2 21.5 8.2 C21.5 11.5 19 15.5 12 20.5 Z"></path>
        </svg>
      );
    default:
      return null;
  }
}

// ── 中央ステージのアニメーション ──────────────────────────
function AnimMiru() {
  return (
    <div className="anim anim-miru" aria-label="ミル：目がひらく">
      <svg viewBox="0 0 140 90" width="180" height="116">
        <g className="blink-g">
          <path className="eye-draw" d="M14,45 Q70,2 126,45 Q70,88 14,45 Z"></path>
          <circle className="iris-in" cx="70" cy="45" r="17"></circle>
          <circle className="glint" cx="76.5" cy="38.5" r="4.5"></circle>
        </g>
      </svg>
    </div>
  );
}

function AnimKiku() {
  return (
    <div className="anim anim-kiku" aria-label="キク：音の波紋">
      <div className="ripple r1"></div>
      <div className="ripple r2"></div>
      <div className="ripple r3"></div>
      <div className="eq">
        <span></span><span></span><span></span><span></span><span></span>
      </div>
    </div>
  );
}

function AnimTsukau() {
  return (
    <div className="anim anim-tsukau" aria-label="ツカウ：箱にしまう">
      <div className="chip"></div>
      <div className="toolbox">
        <div className="lid"></div>
        <div className="bod"></div>
      </div>
      <div className="spark">✦</div>
    </div>
  );
}

function AnimMiseru() {
  return (
    <div className="anim anim-miseru" aria-label="ミセル：だれかに見せる">
      <div className="rays"><i></i><i></i><i></i></div>
      <div className="mini-card"></div>
      <div className="peer p1"></div>
      <div className="peer p2"></div>
    </div>
  );
}

function AnimSuki() {
  return (
    <div className="anim anim-suki" aria-label="スキ：ハートがはねる">
      <svg className="heart-pop" viewBox="0 0 100 92" width="112" height="103">
        <path d="M50 84 C18 61 7 43 7 28 C7 13.5 18 6 29.5 6 C38.5 6 46 11 50 19.5 C54 11 61.5 6 70.5 6 C82 6 93 13.5 93 28 C93 43 82 61 50 84 Z"></path>
      </svg>
      <span className="sp s1">✦</span>
      <span className="sp s2">✦</span>
      <span className="sp s3">✦</span>
      <span className="sp s4">✦</span>
    </div>
  );
}

// ── サービスアイコン（貼ったリンクの左上バッジ用） ──────
function SvcIcon({ id, size = 16 }) {
  const s = { width: size, height: size, display: 'block' };
  const st = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (id) {
    case 'x':
      return (
        <svg style={s} viewBox="0 0 24 24">
          <path {...st} strokeWidth="2.4" d="M5 4 L19 20 M19 4 L5 20"></path>
        </svg>
      );
    case 'youtube':
      return (
        <svg style={s} viewBox="0 0 24 24">
          <rect {...st} x="2.5" y="5.5" width="19" height="13" rx="4"></rect>
          <path d="M10 9.2 L15.4 12 L10 14.8 Z" fill="currentColor" stroke="none"></path>
        </svg>
      );
    case 'tiktok':
      return (
        <svg style={s} viewBox="0 0 24 24">
          <path {...st} d="M13.5 4.5 v11 a3.7 3.7 0 1 1 -3.7 -3.7"></path>
          <path {...st} d="M13.5 6.5 a6 6 0 0 0 5.5 4"></path>
        </svg>
      );
    case 'instagram':
      return (
        <svg style={s} viewBox="0 0 24 24">
          <rect {...st} x="3.5" y="3.5" width="17" height="17" rx="5"></rect>
          <circle {...st} cx="12" cy="12" r="4"></circle>
          <circle cx="17.2" cy="6.8" r="1.3" fill="currentColor" stroke="none"></circle>
        </svg>
      );
    case 'niconico':
      return (
        <svg style={s} viewBox="0 0 24 24">
          <rect {...st} x="3" y="7.5" width="18" height="12" rx="3"></rect>
          <path {...st} d="M8.5 7 L12 3.8 L15.5 7"></path>
          <circle cx="9" cy="13.5" r="1.2" fill="currentColor" stroke="none"></circle>
          <circle cx="15" cy="13.5" r="1.2" fill="currentColor" stroke="none"></circle>
        </svg>
      );
    default: // web / その他のリンク
      return (
        <svg style={s} viewBox="0 0 24 24">
          <circle {...st} cx="12" cy="12" r="8.5"></circle>
          <path {...st} d="M3.5 12 h17 M12 3.5 c3.2 2.6 3.2 14.4 0 17 c-3.2 -2.6 -3.2 -14.4 0 -17"></path>
        </svg>
      );
  }
}

function VerbAnim({ verb }) {
  switch (verb) {
    case 'miru': return <AnimMiru />;
    case 'kiku': return <AnimKiku />;
    case 'tsukau': return <AnimTsukau />;
    case 'miseru': return <AnimMiseru />;
    case 'suki': return <AnimSuki />;
    default: return null;
  }
}

Object.assign(window, { VerbIcon, SvcIcon, VerbAnim });
