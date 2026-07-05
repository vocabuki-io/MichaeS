# ミカエス Push配信 Worker

`push.michae-s.com`（本番）/ `push-dev.michae-s.com`（開発）で動く Cloudflare Worker。
**「いつ・誰に合図を送るか」だけを持ち、保存内容は一切預からない。**

## 何を送るか

| 機能 | 登録API | 配信時刻(JST) | Pushペイロード | 通知の中身を決める場所 |
|---|---|---|---|---|
| 占い | `POST /subscribe` `{subscription, hour}` | 8 / 12 / 21 | `{type:'fortune'}` | SW（`sw.js` の FORTUNES） |
| 再浮上 | `POST /resurface` `{subscription, hour}` | 22 / 8 / 12 | `{type:'resurface'}` | SW（端末のIndexedDBの棚から選ぶ） |
| 賞味期限 | `POST /remind` `{subscription, url, expireAt, daysBefore, title}` | 8 | `{title, body}` | Worker（タイトルのみ預かる） |
| テスト | `POST /test` `{subscription, payload?, title?, body?, delay?}` | 即時〜25秒後 | 指定どおり | 呼び出し側 |

解除は `POST /unsubscribe` / `/unresurface` `{endpoint}`、`POST /unremind` `{endpoint, url}`。
全機能をオフにした端末のレコードは自動削除。Push先が失効(404/410)した端末も自動削除。

## デプロイ手順

```sh
cd push-worker

# 1. KVを作ってwrangler.tomlの★にIDを貼る（本番/開発それぞれ）
wrangler kv namespace create PUSH_KV
wrangler kv namespace create PUSH_KV --env dev

# 2. VAPID鍵をシークレットに（公開鍵は index.html の MICHAES_VAPID_PUBLIC と同じ値）
wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put VAPID_PUBLIC_KEY --env dev
wrangler secret put VAPID_PRIVATE_KEY --env dev

# 3. デプロイ
wrangler deploy --env dev   # push-dev.michae-s.com
wrangler deploy             # push.michae-s.com
```

> VAPID鍵ペアは既存のものを使うこと（クライアントの購読が公開鍵に紐づくため、
> 鍵を替えると全端末で再購読が必要になる）。新規に作る場合は
> `npx web-push generate-vapid-keys`。

## 動作確認

アプリの設定画面から:
- 「今日の一言をのぞく」→ 30秒後に占い通知が届く（`/test` 経由）
- 「再浮上をのぞく」→ 4秒後に、棚の保存物から1件通知される（`/test` に `{type:'resurface'}`）

curlなら（subscription JSONは DevTools で `reg.pushManager.getSubscription().then(s=>s.toJSON())`）:

```sh
curl -X POST https://push-dev.michae-s.com/test \
  -H 'Content-Type: application/json' \
  -d '{"subscription": {...}, "payload": {"type":"resurface"}, "delay": 3000}'
```
