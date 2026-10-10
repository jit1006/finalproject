import { db } from "../db/connection.js";
import { AppUser } from "../models/index.js";

export function findByEmail(email) {
  const row = db.prepare("SELECT * FROM app_user WHERE lower(email) = lower(?)").get(email);
  return AppUser.fromRow(row);
}

export function findById(userId) {
  const row = db.prepare("SELECT * FROM app_user WHERE user_id = ?").get(userId);
  return AppUser.fromRow(row);
}

export function upsert(user) {
  const r = AppUser.toRow(user);
  db.prepare(
    `INSERT INTO app_user (user_id, full_name, email, role_code, scope_type, entity_id, department_id, vendor_id, password_hash, status)
     VALUES (@user_id, @full_name, @email, @role_code, @scope_type, @entity_id, @department_id, @vendor_id, @password_hash, @status)
     ON CONFLICT(user_id) DO UPDATE SET
       full_name=@full_name, email=@email, role_code=@role_code, scope_type=@scope_type,
       entity_id=@entity_id, department_id=@department_id, vendor_id=@vendor_id,
       password_hash=@password_hash, status=@status`,
  ).run(r);
  return findById(user.userId);
}

// --- sessions (session store table added by schema patch; see note) ---
// The 16-table ERD has no session table, so sessions are stored in a small
// side table created on demand here (not part of the 16 business tables).
let sessionsReady = false;
function ensureSessions() {
  if (sessionsReady) return;
  db.exec(
    `CREATE TABLE IF NOT EXISTS app_session (
       token_hash TEXT PRIMARY KEY,
       user_id    TEXT NOT NULL REFERENCES app_user(user_id),
       created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
       expires_at TEXT NOT NULL,
       revoked_at TEXT
     )`,
  );
  sessionsReady = true;
}

export function createSession(tokenHash, userId, expiresAt) {
  ensureSessions();
  db.prepare("INSERT INTO app_session (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
    tokenHash,
    userId,
    expiresAt,
  );
}

export function findSession(tokenHash) {
  ensureSessions();
  return db.prepare("SELECT * FROM app_session WHERE token_hash = ?").get(tokenHash);
}

export function revokeSession(tokenHash, revokedAt) {
  ensureSessions();
  db.prepare("UPDATE app_session SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL").run(
    revokedAt,
    tokenHash,
  );
}
