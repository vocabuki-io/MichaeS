# 統一ログイン — サーバー側（api.michae-s.com）実装手順

プレミアムのログインと端末間同期の認可を**1回の同意**に統一するための、API側の実装手順。
クライアント側（このリポジトリ）は実装済みで、`window.MICHAES_UNIFIED_AUTH` フラグで切り替わる。

## 何を変えるのか（背景）

従来は Google 認証が2系統に分かれていた:

| | 認証（プレミアム） | Drive同期 |
|---|---|---|
| 方式 | GSI Sign-In（**IDトークン**） | GIS OAuth トークン（**アクセストークン**） |
| Drive権限 | 無し | `drive.appdata` を別途同意 |

→ 同じアカウントなのに同期のたびに Drive の同意/ログインが必要だった。

統一後は **認可コードフロー**に一本化する:

1. クライアントが `initCodeClient`（scope に identity ＋ `drive.appdata`）で**認可コード**を取得
2. サーバーが code を **refresh token 込み**で交換して保存
3. 以後の同期は、サーバーが refresh token から **Drive アクセストークンを発行**（`/drive/token`）
4. → Google のポップアップは初回ログインの1回だけ。同期で再ログインは起きない

**設計原則**: サーバーは *トークンだけ* を仲介し、同期の *中身*（棚データ）は今まで通りブラウザ↔Google Drive を直通。サーバーにユーザーデータは保存しない。

---

## Google Cloud Console 側の準備

1. OAuth 2.0 クライアント（Webアプリ）に、承認済みの**JavaScript生成元**として本番/開発のオリジンを登録
   （例: `https://michae-s.com`, `https://*.pages.dev` は不可なのでプレビュー検証用オリジンを個別に）。
   ※ `ux_mode: 'popup'` の code フローは redirect URI を使わず `postmessage` で受けるため、
   リダイレクトURIの登録は不要。**JavaScript生成元の登録は必須**。
2. OAuth 同意画面のスコープに `openid`, `email`, `profile`, `https://www.googleapis.com/auth/drive.appdata` を追加。
3. `drive.appdata` は機微スコープではないため、通常は Google の審査なしで利用可（本番公開ステータスにはしておく）。
4. `client_secret` を発行し、サーバーの秘密に保存（`GOOGLE_CLIENT_SECRET`）。`client_id` はクライアントと同じ値。

必要な環境変数（Worker secret 等）:
```
GOOGLE_CLIENT_ID       … index.html の MICHAES_GOOGLE_CLIENT_ID と同じ
GOOGLE_CLIENT_SECRET   … 上記クライアントのシークレット
SESSION_SIGNING_KEY    … セッショントークン署名用（既存があれば流用）
REFRESH_TOKEN_ENC_KEY  … refresh token を保存時に暗号化する鍵（AES-GCM等）
```

---

## エンドポイント仕様

クライアントは `MICHAES_API_ENDPOINT`（本番 `https://api.michae-s.com` / 開発 `https://api-dev.michae-s.com`）に対して以下を呼ぶ。

### 1. `POST /auth/google` — 認可コード交換（変更）

従来は `{ credential: <IDトークン> }` を受けていた。**統一後は `{ code: <認可コード> }` を受ける**。
移行期は両対応にしておくと安全（`code` があれば新フロー、`credential` があれば従来フロー）。

リクエスト:
```json
{ "code": "4/0Ax...." }
```

処理:
1. `code` を Google のトークンエンドポイントで交換する。
   - `POST https://oauth2.googleapis.com/token`
   - body（form-urlencoded）:
     ```
     code=<code>
     client_id=<GOOGLE_CLIENT_ID>
     client_secret=<GOOGLE_CLIENT_SECRET>
     grant_type=authorization_code
     redirect_uri=postmessage        ← popup ux_mode の code はこれで交換する
     ```
   - レスポンス例: `{ access_token, expires_in, refresh_token, id_token, scope, token_type }`
   - **`refresh_token` は初回同意時のみ返る**。再同意なしの2回目以降は返らないので、
     「refresh_token が来た時だけ保存を更新、来なければ既存を維持」とする。
     （テスト中に再取得したい場合は Google アカウントのアクセス権を一旦解除する）
2. `id_token`（JWT）を検証してユーザーを確定（`sub`, `email`, `name`）。
   - 署名は Google の JWKS（`https://www.googleapis.com/oauth2/v3/certs`）で検証、`aud == GOOGLE_CLIENT_ID`、`iss` が accounts.google.com、`exp` 未過ぎを確認。
3. ユーザーを upsert し、**refresh_token を暗号化して保存**（キー: user の `sub`）。
4. 自前の**セッショントークン**を発行（従来同様）。
5. 返す:
   ```json
   { "ok": true, "session": "<セッショントークン>", "user": { "email": "...", "name": "...", "sub": "..." } }
   ```

セキュリティ: `code` はワンタイム。交換失敗時は `{ ok:false, error:"..." }` を返す。

### 2. `GET /drive/token` — Drive アクセストークン発行（新規）

クライアントの同期処理が、Drive API を叩く直前に呼ぶ。ヘッダ `Authorization: Bearer <session>`。

処理:
1. セッションを検証し user を特定。
2. 保存済み refresh_token を復号。無ければ `401`（クライアントは「要再ログイン」に倒す）。
3. refresh_token でアクセストークンを更新:
   - `POST https://oauth2.googleapis.com/token`
   - body: `client_id`, `client_secret`, `refresh_token=<復号値>`, `grant_type=refresh_token`
   - レスポンス: `{ access_token, expires_in, scope, token_type }`
   - `invalid_grant`（refresh失効/取消）なら保存を消して `401` を返す。
4. 返す（**access_token をそのままクライアントへ。サーバーには保存しない**）:
   ```json
   { "access_token": "ya29....", "expires_in": 3599 }
   ```

> 補足: よりデータを触らせたくない場合は、Drive操作自体をサーバーが代行する設計（`/sync` GET/PUT）も可能。
> ただし本プロジェクトの「サーバーに中身を出さない」原則を優先し、ここでは**トークンのみ発行**＝
> 同期の中身はブラウザ↔Google直通、を採用している。

### 3. `POST /auth/logout` — refresh token 破棄（新規・任意だが推奨）

ヘッダ `Authorization: Bearer <session>`。処理:
1. セッション検証 → user 特定。
2. 保存 refresh_token を Google に revoke（`POST https://oauth2.googleapis.com/revoke?token=<refresh_token>`）してから削除。
3. セッションも無効化。
4. `{ ok: true }` を返す（クライアントはローカルも消す）。

### 4. 既存の `/checkout` `/subscribe(status)` 等

変更不要。セッション Bearer の扱いは従来どおり。

---

## 段階移行の手順（推奨順）

1. **dev API（api-dev.michae-s.com）** に上記 1〜3 を実装・デプロイ。
2. このリポジトリの `index.html` の該当行を
   `window.MICHAES_UNIFIED_AUTH = PROD ? false : true;` にして push
   （= 本番は従来のまま、pages.dev プレビューだけ統一フローで検証）。
3. プレビューで確認:
   - プレミアム導線の「Googleでログイン」→ 同意（identity＋Drive）が**1回**で済む
   - ログイン後、設定の「今すぐ同期」や起動時同期で**再ログインが出ない**
   - 別端末で同じアカウントにログイン→棚が同期される
   - ログアウト→再ログインで復帰
4. 問題なければ **本番 API** に実装・デプロイ。
5. `index.html` を `PROD ? true : true`（両方 true）にして push → main にマージ。
6. 本番で最終確認。

## ロールバック

`window.MICHAES_UNIFIED_AUTH` を `false` に戻すだけで、クライアントは従来フロー
（IDトークン・ログイン＋GISのDrive同意）に戻る。サーバーの旧 `{credential}` 対応を
残しておけば無停止で切り戻せる。

## クライアント側の対応状況（このリポジトリ）

- `index.html` … `MICHAES_UNIFIED_AUTH` フラグ
- `michaes-settings.jsx` … `startCodeLogin()`（initCodeClient→`{code}`をPOST）、統一時はカスタムボタン、`signOut` が `/auth/logout` を呼ぶ
- `michaes-drive.js` … 統一時は `/drive/token` からサーバー発行トークンを取得（GISポップアップ不使用）、`setAuthProvider` で session を受け取る
- `michaes-app.jsx` … 現在の session を Drive モジュールへ注入
