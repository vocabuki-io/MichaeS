// michaes-drive.js — ミカエス 端末間同期（Google Drive appDataFolder / 依存: GIS）
// 各ユーザー自身のDriveの隠しフォルダ(appDataFolder)に michaes-sync.json を1枚置き、
// リンク/テキストの棚データ＋墓標(tombstones)を保存する。サーバーには一切保存しない。
//
// 公開API: window.MichaeSDrive = { available, read, write, revoke }
//   available()             -> bool（GISとクライアントIDが揃っているか）
//   read(interactive)       -> Promise<remotePayload | null>
//   write(payload, interactive) -> Promise<void>
//   revoke()                -> メモリ上のアクセストークンを破棄（ログアウト時など）
//
// interactive=true: 必要なら同意ポップアップを出す（ユーザー操作起点で呼ぶこと）。
// interactive=false: 既に許諾済みなら無音、要同意ならポップアップがブロックされ失敗（=自動同期はスキップ）。
(function () {
  var SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  var FILE_NAME = 'michaes-sync.json';
  var BOUNDARY = 'michaes_sync_boundary_x7yQ';

  var tokenClient = null;
  var token = null, tokenExp = 0;
  var pending = null; // { resolve, reject }
  var getSession = null; // 統一フロー用：現在のセッショントークンを返す関数（App側から注入）

  function clientId() { return window.MICHAES_GOOGLE_CLIENT_ID || ''; }
  function gisOAuth() { return window.google && window.google.accounts && window.google.accounts.oauth2; }
  function unified() { return !!window.MICHAES_UNIFIED_AUTH; }
  function apiEndpoint() { return window.MICHAES_API_ENDPOINT || ''; }
  function sessionToken() { try { return getSession && getSession(); } catch (e) { return null; } }
  function setAuthProvider(fn) { getSession = fn; }

  // 統一フロー: サーバーが保持する refresh token から Drive アクセストークンを発行してもらう。
  // Googleのポップアップは一切出ない（=起動時でも無音で取得できる）。プレミアムのログインで
  // 認証とDrive権限を同時に取得済みなので、同期のたびに再ログインを求められない。
  function fetchServerToken() {
    var ep = apiEndpoint(), s = sessionToken();
    if (!ep || !s) return Promise.reject(new Error('no_session'));
    return fetch(ep + '/drive/token', { headers: { Authorization: 'Bearer ' + s } })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) throw new Error('reauth'); // refresh失効等 → 要再ログイン
        if (!r.ok) throw new Error('drive_token ' + r.status);
        return r.json();
      })
      .then(function (d) {
        if (!d || !d.access_token) throw new Error('no_token');
        token = d.access_token;
        tokenExp = Date.now() + (((d.expires_in || 3600) - 60) * 1000);
        return token;
      });
  }

  function available() {
    if (unified()) return !!(apiEndpoint() && sessionToken());
    return !!(gisOAuth() && clientId());
  }

  function initClient() {
    if (tokenClient) return tokenClient;
    if (!available()) return null;
    tokenClient = gisOAuth().initTokenClient({
      client_id: clientId(),
      scope: SCOPE,
      callback: function (resp) {
        var p = pending; pending = null;
        if (!p) return;
        if (resp && resp.access_token) {
          token = resp.access_token;
          tokenExp = Date.now() + (((resp.expires_in || 3600) - 60) * 1000);
          p.resolve(token);
        } else {
          p.reject(new Error((resp && resp.error) || 'token_error'));
        }
      },
      error_callback: function (err) {
        var p = pending; pending = null;
        if (p) p.reject(new Error((err && err.type) || 'token_failed'));
      },
    });
    return tokenClient;
  }

  function ensureToken(interactive) {
    if (token && Date.now() < tokenExp) return Promise.resolve(token);
    // 統一フロー: サーバー発行トークンを使う（ポップアップ皆無・起動時も無音でOK）。
    if (unified()) return fetchServerToken();
    // 従来フロー（GISトークンクライアント直）: 非対話では絶対に同意ポップアップを出さない。
    // GISのアクセストークンはページ再読込で消えるため、メモリにトークンが無ければ静かにスキップし、
    // ユーザーが「今すぐ同期」等を操作した時（interactive=true＝ユーザー操作起点）だけポップアップを出す。
    // こうしないと、起動のたびにブラウザのポップアップ許可プロンプトが出てしまう。
    if (!interactive) return Promise.reject(new Error('needs_interactive'));
    var tc = initClient();
    if (!tc) return Promise.reject(new Error('gis_unavailable'));
    if (pending) return Promise.reject(new Error('token_in_progress'));
    return new Promise(function (resolve, reject) {
      pending = { resolve: resolve, reject: reject };
      try { tc.requestAccessToken({ prompt: '' }); }
      catch (e) { pending = null; reject(e); }
    });
  }

  function api(path, opts, tok) {
    var o = opts || {};
    var headers = Object.assign({ Authorization: 'Bearer ' + tok }, o.headers || {});
    return fetch('https://www.googleapis.com' + path, Object.assign({}, o, { headers: headers }));
  }

  function findFileId(tok) {
    var q = encodeURIComponent("name='" + FILE_NAME + "'");
    return api('/drive/v3/files?spaces=appDataFolder&q=' + q + '&fields=files(id,modifiedTime)&pageSize=10', { method: 'GET' }, tok)
      .then(function (r) {
        if (r.status === 401) { token = null; tokenExp = 0; throw Object.assign(new Error('unauth'), { code: 401 }); }
        if (!r.ok) throw new Error('find ' + r.status);
        return r.json();
      })
      .then(function (d) { return (d.files && d.files[0] && d.files[0].id) || null; });
  }

  // 一度だけ 401 でトークン取り直してリトライする実行ラッパ
  function withAuth(interactive, fn) {
    return ensureToken(interactive).then(fn).catch(function (e) {
      if (e && e.code === 401) { token = null; tokenExp = 0; return ensureToken(interactive).then(fn); }
      throw e;
    });
  }

  function read(interactive) {
    return withAuth(interactive, function (tok) {
      return findFileId(tok).then(function (fileId) {
        if (!fileId) return null;
        return api('/drive/v3/files/' + fileId + '?alt=media', { method: 'GET' }, tok).then(function (r) {
          if (r.status === 401) { token = null; tokenExp = 0; throw Object.assign(new Error('unauth'), { code: 401 }); }
          if (!r.ok) throw new Error('read ' + r.status);
          return r.json();
        });
      });
    });
  }

  function write(payload, interactive) {
    var body = JSON.stringify(payload);
    return withAuth(interactive, function (tok) {
      return findFileId(tok).then(function (fileId) {
        if (fileId) {
          return api('/upload/drive/v3/files/' + fileId + '?uploadType=media', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: body,
          }, tok).then(chkWrite);
        }
        var meta = { name: FILE_NAME, parents: ['appDataFolder'] };
        var multipart =
          '--' + BOUNDARY + '\r\n' +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(meta) + '\r\n' +
          '--' + BOUNDARY + '\r\n' +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          body + '\r\n' +
          '--' + BOUNDARY + '--';
        return api('/upload/drive/v3/files?uploadType=multipart&fields=id', {
          method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + BOUNDARY }, body: multipart,
        }, tok).then(chkWrite);
      });
    });
  }

  function chkWrite(r) {
    if (r.status === 401) { token = null; tokenExp = 0; throw Object.assign(new Error('unauth'), { code: 401 }); }
    if (!r.ok) throw new Error('write ' + r.status);
    return undefined;
  }

  function revoke() { token = null; tokenExp = 0; }

  window.MichaeSDrive = { available: available, read: read, write: write, revoke: revoke, setAuthProvider: setAuthProvider };
})();
