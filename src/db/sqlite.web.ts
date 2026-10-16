// @ts-nocheck
// ---------------------------------------------------------------------------
// WEB SQLITE ADAPTER  (used only in the browser build — Metro picks *.web.* files)
// ---------------------------------------------------------------------------
// On phones the app uses expo-sqlite. In the browser this file provides the
// same API (openDatabaseSync / openDatabaseAsync and the *Sync / *Async
// methods the app calls), backed by sql.js — real SQLite compiled to
// WebAssembly, loaded from /public. Data is saved in the visitor's browser
// (localStorage), so every visitor gets their own private copy of the demo.
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = 'demo-sqlite:';
let SQL = null;
let loading = null;
const open = {}; // name -> sql.js Database

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (typeof window.initSqlJs === 'function') return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}

/** Loads SQLite (WebAssembly). Must be awaited once before the database is used. */
export function prepareDatabase() {
  if (SQL) return Promise.resolve();
  if (!loading) {
    loading = loadScript('/sql-wasm.js')
      .then(() => window.initSqlJs({ locateFile: (file) => '/' + file }))
      .then((lib) => { SQL = lib; });
  }
  return loading;
}

function toBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function rawDb(name) {
  if (open[name]) return open[name];
  if (!SQL) throw new Error('Database is still loading. Call prepareDatabase() first.');
  let saved = null;
  try { saved = window.localStorage.getItem(STORAGE_PREFIX + name); } catch (e) { saved = null; }
  let db;
  try { db = saved ? new SQL.Database(fromBase64(saved)) : new SQL.Database(); } catch (e) { db = new SQL.Database(); }
  db.exec('PRAGMA foreign_keys = ON;');
  open[name] = db;
  return db;
}

const timers = {};
function scheduleSave(name) {
  clearTimeout(timers[name]);
  timers[name] = setTimeout(() => saveNow(name), 250);
}

function saveNow(name) {
  const db = open[name];
  if (!db) return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + name, toBase64(db.export()));
  } catch (e) {
    console.warn('[demo] could not save data in this browser:', e && e.message);
  }
  try { db.exec('PRAGMA foreign_keys = ON;'); } catch (e) { /* export() resets pragmas */ }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => Object.keys(open).forEach(saveNow));
}

/** expo-sqlite accepts run(sql, a, b) / run(sql, [a, b]) / run(sql, { $x: 1 }). */
function normParams(params) {
  if (params.length === 0) return undefined;
  if (params.length === 1 && (Array.isArray(params[0]) || (params[0] && typeof params[0] === 'object'))) return params[0];
  return params;
}

function clean(v) {
  return v === undefined ? null : (typeof v === 'boolean' ? (v ? 1 : 0) : v);
}

function cleanParams(p) {
  if (p === undefined) return undefined;
  if (Array.isArray(p)) return p.map(clean);
  const out = {};
  Object.keys(p).forEach((k) => { out[/^[:$@]/.test(k) ? k : '$' + k] = clean(p[k]); });
  return out;
}

const WRITE_RE = /^\s*(insert|update|delete|replace|create|drop|alter|pragma\s+user_version\s*=|begin|commit|end|rollback)/i;

function makeDatabase(name) {
  let txDepth = 0;
  const db = () => rawDb(name);

  const all = (sql, params) => {
    const stmt = db().prepare(sql);
    try {
      const p = cleanParams(normParams(params));
      if (p !== undefined) stmt.bind(p);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  };

  const api = {
    databaseName: name,

    execSync(sql) {
      db().exec(sql);
      if (WRITE_RE.test(sql) || /;\s*\w/.test(sql)) scheduleSave(name);
    },
    runSync(sql, ...params) {
      const d = db();
      const p = cleanParams(normParams(params));
      d.run(sql, p);
      const changes = d.getRowsModified();
      const idRow = d.exec('SELECT last_insert_rowid() AS id');
      const lastInsertRowId = idRow.length ? Number(idRow[0].values[0][0]) : 0;
      if (txDepth === 0) scheduleSave(name);
      return { lastInsertRowId, changes };
    },
    getAllSync(sql, ...params) {
      const rows = all(sql, params);
      if (WRITE_RE.test(sql) && txDepth === 0) scheduleSave(name);
      return rows;
    },
    getFirstSync(sql, ...params) {
      const rows = all(sql, params);
      if (WRITE_RE.test(sql) && txDepth === 0) scheduleSave(name);
      return rows.length ? rows[0] : null;
    },
    withTransactionSync(task) {
      db().exec('BEGIN');
      txDepth++;
      try {
        task();
        txDepth--;
        db().exec('COMMIT');
      } catch (e) {
        txDepth--;
        try { db().exec('ROLLBACK'); } catch (e2) { /* already rolled back */ }
        throw e;
      }
      scheduleSave(name);
    },

    async execAsync(sql) { return api.execSync(sql); },
    async runAsync(sql, ...params) { return api.runSync(sql, ...params); },
    async getAllAsync(sql, ...params) { return api.getAllSync(sql, ...params); },
    async getFirstAsync(sql, ...params) { return api.getFirstSync(sql, ...params); },
    async withTransactionAsync(task) {
      db().exec('BEGIN');
      txDepth++;
      try {
        await task();
        txDepth--;
        db().exec('COMMIT');
      } catch (e) {
        txDepth--;
        try { db().exec('ROLLBACK'); } catch (e2) { /* already rolled back */ }
        throw e;
      }
      scheduleSave(name);
    },
    async withExclusiveTransactionAsync(task) { return api.withTransactionAsync(() => task(api)); },
    closeSync() { saveNow(name); },
    async closeAsync() { saveNow(name); }
  };
  return api;
}

export function openDatabaseSync(name) {
  return makeDatabase(name);
}

export async function openDatabaseAsync(name) {
  await prepareDatabase();
  return makeDatabase(name);
}

/** Wipes the saved demo data in this browser (used by the "Reset demo" button). */
export function resetDatabase(name) {
  try { window.localStorage.removeItem(STORAGE_PREFIX + name); } catch (e) { /* ignore */ }
  if (open[name]) { try { open[name].close(); } catch (e) { /* ignore */ } delete open[name]; }
}

export function saveDatabaseNow(name) {
  saveNow(name);
}
