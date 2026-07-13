# 引継ぎ — ミカエス開発セッション (2026-07-13)

次のClaude Codeセッションが最初に読むためのメモ。**次の機能のPRを出すとき、このファイルは削除してよい**（引継ぎが済んだら用済み）。

## 最初にやること

1. **jornalMCPから「次にmichaesでやるべきこと」を取得する**
   - 前セッションではjornalMCPコネクタがセッション開始時に無効だったため読めなかった（途中でONにしてもホットロードされない）
   - このセッションで使えるなら、まずそれを読んでタスクを決める。使えなければユーザーに中身を貼ってもらう
2. タスクが決まったら、このブランチ（mainと同一の状態から開始済み）で開発する

## 現在の状態（すべてmainにマージ済み）

- **PR #1**: `push-worker/` — Push配信のCloudflare Worker（再浮上 `/resurface` 対応、Web Push暗号化をWebCrypto直書き）
- **PR #2**: SW v31 — ホームのペースト玉の下に直接入力欄（「または、ここに書いて残す」）
- 作業ブランチ `claude/continuation-rpbu85` は main (`9d1b902`) にリセットしてpush済み

### 残っている手作業（ユーザー側・コード完了）

- **push-workerのデプロイ**: `push-worker/README.md` の手順どおり。KV作成 → 既存VAPID鍵をsecret登録（公開鍵は `index.html` の `MICHAES_VAPID_PUBLIC` と同一。鍵を替えると全端末で再購読が必要）→ `wrangler deploy`
- デプロイ後、アプリ設定「再浮上をのぞく」で通知が届けば再浮上エンジンが本稼働

## プロジェクト構成（ビルドなし・依存なしが方針）

| ファイル | 役割 |
|---|---|
| `index.html` | エントリ。CSS全部・環境判定（本番=michae-s.com / それ以外はdev）・CDN読込（unpkgのReact UMD+Babel standalone） |
| `michaes-app.jsx` | メイン画面。paste/直接入力→`classifyText`→仕分け→棚。`openItem()` が共通入口 |
| `michaes-settings.jsx` | 設定。push購読（占い/再浮上/賞味期限）、Drive同期、プレミアム |
| `michaes-store.js` | IndexedDB永続化（db=`michaes`, store=`kv`, キー: `shelves`/`settings`/`tombstones`/`auth`） |
| `sw.js` | Service Worker。**リリースごとに `VERSION` を上げる（現在 v31）**。push受信: `{type:'resurface'}`→IDBから選んで通知、`{title,body}`→そのまま、他→占い |
| `push-worker/` | Cloudflare Worker（push.michae-s.com / push-dev）。エンドポイント契約はREADME参照 |
| `michaes-drive.js` | Google Drive端末間同期 |
| `test-harness.js` | ブラウザ内テストハーネス（`.orb` 等のセレクタに依存） |

## 開発の約束事

- コミットメッセージは日本語、機能名＋`(SW vXX)` 形式
- シェル資産（HTML/JSX/JS）を触ったら `sw.js` の VERSION を上げる
- 日本語入力対応: Enter送信には `isComposing` ガード必須
- ダークテーマ: 色は `var(--card)` 等のCSS変数。金色ボタンのダーク文字色は `.who-go` の規則に合わせて `:root[data-theme=dark]`/`auto` の一覧に追記
- 保存内容をサーバーに出さない設計（pushは「合図」のみ、中身は端末内で選ぶ）

## リモート環境でのテスト方法（前セッションで確立）

- **unpkg.comはネットワークポリシーで遮断される**。npmレジストリは通るので、`npm i react@18.3.1 react-dom@18.3.1 @babel/standalone@7.29.0` してUMDファイルを取り、Playwrightの `page.route('**://unpkg.com/**')` でローカルコピーを返す
- Chromiumは `/opt/pw-browsers/chromium`（`playwright-core` の `executablePath` に渡す）
- workerの単体テストは、`export default` を named export に差し替えて data URL import すればNodeで回せる（暗号化はラウンドトリップ復号で検証済みの実績あり）
