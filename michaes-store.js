// michaes-store.js — ミカエス 永続化レイヤー（IndexedDB / 依存なし）
// shelves（verbId -> items[]）を丸ごと1レコードで保存する。
// 画像アイテムは Blob を保存し、読み込み時に object URL を貼り直す
//   （object URL はリロードで失効するため、URL文字列は保存しない）。
// 公開API: window.MichaeSStore = { load, save, wipe }
//   load(): Promise<shelves>   … 無ければ {}
//   save(shelves): Promise<void>
//   wipe(): Promise<void>
(function () {
  var DB = 'michaes', STORE = 'kv', KEY = 'shelves', VER = 1;

  function open() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DB, VER);
      r.onupgradeneeded = function () {
        var db = r.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }

  // 1トランザクションで fn(store) を実行。fn が返した IDBRequest の result を解決値にする。
  function withStore(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(STORE, mode);
        var req = fn(t.objectStore(STORE));
        t.oncomplete = function () { res(req ? req.result : undefined); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error); };
      });
    });
  }

  // 保存前: 画像の src（再生成可能な object URL）を落とす。Blob は残す。
  function sanitize(shelves) {
    var out = {};
    Object.keys(shelves || {}).forEach(function (k) {
      out[k] = (shelves[k] || []).map(function (it) {
        if (it && it.kind === 'image') {
          var c = {};
          for (var p in it) { if (p !== 'src') c[p] = it[p]; }
          return c;
        }
        return it;
      });
    });
    return out;
  }

  // 読込後: Blob から object URL を貼り直す。
  function rehydrate(shelves) {
    if (!shelves) return {};
    Object.keys(shelves).forEach(function (k) {
      (shelves[k] || []).forEach(function (it) {
        if (it && it.kind === 'image' && it.blob && !it.src) {
          it.src = URL.createObjectURL(it.blob);
        }
      });
    });
    return shelves;
  }

  window.MichaeSStore = {
    load: function () {
      return withStore('readonly', function (s) { return s.get(KEY); })
        .then(rehydrate)
        .catch(function () { return {}; });
    },
    save: function (shelves) {
      return withStore('readwrite', function (s) { return s.put(sanitize(shelves), KEY); })
        .then(function () {})
        .catch(function () {});
    },
    wipe: function () {
      return withStore('readwrite', function (s) { return s.delete(KEY); })
        .then(function () {})
        .catch(function () {});
    },
    // ── 設定（プレーンなオブジェクトをそのまま1レコードで） ──
    loadSettings: function () {
      return withStore('readonly', function (s) { return s.get('settings'); })
        .then(function (v) { return v || null; })
        .catch(function () { return null; });
    },
    saveSettings: function (obj) {
      return withStore('readwrite', function (s) { return s.put(obj, 'settings'); })
        .then(function () {})
        .catch(function () {});
    },
    // ── 認証（プレミアム時のGoogleログイン。{session, user} を1レコードで） ──
    // iOSではIndexedDBがタスクキル/ITPで揮発しうるため localStorage を優先ミラーに。
    loadAuth: function () {
      try {
        var ls = window.localStorage && window.localStorage.getItem('michaes-auth');
        if (ls) return Promise.resolve(JSON.parse(ls));
      } catch (e) {}
      return withStore('readonly', function (s) { return s.get('auth'); })
        .then(function (v) { return v || null; })
        .catch(function () { return null; });
    },
    saveAuth: function (obj) {
      try { if (window.localStorage) window.localStorage.setItem('michaes-auth', JSON.stringify(obj)); } catch (e) {}
      return withStore('readwrite', function (s) { return s.put(obj, 'auth'); })
        .then(function () {})
        .catch(function () {});
    },
    clearAuth: function () {
      try { if (window.localStorage) window.localStorage.removeItem('michaes-auth'); } catch (e) {}
      return withStore('readwrite', function (s) { return s.delete('auth'); })
        .then(function () {})
        .catch(function () {});
    }
  };
})();
