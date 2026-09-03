// =============================================================================
//  sqlite.js — thin wrapper over Node's built-in `node:sqlite` (no native build
//  step, works on Windows without Visual Studio). Exposes the small subset of the
//  better-sqlite3 API the app uses: prepare().run/get/all, exec, pragma, transaction.
//  Requires Node.js 22.13+ (or 24+).
// =============================================================================
let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  console.error('\n❌ This app needs Node.js 22.13 or newer (built-in SQLite). You are running ' + process.version + '.\n');
  process.exit(1);
}

// node:sqlite refuses undefined / boolean bindings — normalise them.
function fix(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'bigint') return Number(v);
  return v;
}
function fixArgs(args) {
  return args.map((a) => {
    if (a && typeof a === 'object' && !Buffer.isBuffer(a) && !Array.isArray(a)) {
      const o = {};
      Object.keys(a).forEach((k) => { o[k] = fix(a[k]); });
      return o;
    }
    return fix(a);
  });
}

class Statement {
  constructor(stmt) { this.stmt = stmt; }
  run(...args) {
    const r = this.stmt.run(...fixArgs(args));
    return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
  }
  get(...args) { return this.stmt.get(...fixArgs(args)); }
  all(...args) { return this.stmt.all(...fixArgs(args)); }
}

class Database {
  constructor(file) { this.db = new DatabaseSync(file); this.depth = 0; }
  prepare(sql) { return new Statement(this.db.prepare(sql)); }
  exec(sql) { this.db.exec(sql); return this; }
  pragma(text) { this.db.exec('PRAGMA ' + text); }
  /** Returns a function that runs `fn` inside BEGIN/COMMIT (nested calls join the outer transaction). */
  transaction(fn) {
    return (...args) => {
      if (this.depth > 0) { this.depth++; try { return fn(...args); } finally { this.depth--; } }
      this.db.exec('BEGIN');
      this.depth = 1;
      try {
        const out = fn(...args);
        this.db.exec('COMMIT');
        return out;
      } catch (e) {
        try { this.db.exec('ROLLBACK'); } catch (_) { /* ignore */ }
        throw e;
      } finally {
        this.depth = 0;
      }
    };
  }
  close() { this.db.close(); }
}

module.exports = Database;
