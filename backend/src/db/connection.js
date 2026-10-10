// Single SQLite connection, built on Node's built-in node:sqlite (zero deps).
//
// Driver isolation: the rest of the app only uses `db.prepare(...)`, `db.exec(...)`
// and `tx(fn)` from here. To switch to better-sqlite3, reimplement this module
// (its API is nearly identical) — nothing else changes.
import { DatabaseSync } from "node:sqlite";
import { config } from "../config.js";

export const db = new DatabaseSync(config.databaseFile);

// Pragmas: enforce FKs, use WAL for better concurrency, reasonable sync.
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA busy_timeout = 5000;");

/**
 * Run `fn` inside an IMMEDIATE transaction. Commits on success, rolls back on
 * throw, and re-raises. Used by every state-changing command so event append +
 * projection update are atomic (mirrors the Postgres command discipline).
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
export function tx(fn) {
  db.exec("BEGIN IMMEDIATE;");
  try {
    const result = fn();
    db.exec("COMMIT;");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      /* ignore rollback error */
    }
    throw err;
  }
}
