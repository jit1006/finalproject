import { db } from "../db/connection.js";
import { LegalHold } from "../models/index.js";

export function findById(holdId) {
  const row = db.prepare("SELECT * FROM legal_hold WHERE hold_id = ?").get(holdId);
  return LegalHold.fromRow(row);
}

export function activeForCarton(cartonId) {
  const row = db
    .prepare("SELECT * FROM legal_hold WHERE carton_id = ? AND hold_status = 'ACTIVE' LIMIT 1")
    .get(cartonId);
  return LegalHold.fromRow(row);
}

export function activeCount(cartonId) {
  return db
    .prepare("SELECT count(*) n FROM legal_hold WHERE carton_id = ? AND hold_status = 'ACTIVE'")
    .get(cartonId).n;
}

export function insert(h) {
  db.prepare(
    `INSERT INTO legal_hold (hold_id, carton_id, matter_reference, hold_reason, raised_by, hold_start_date, hold_status)
     VALUES (@holdId, @cartonId, @matterReference, @holdReason, @raisedBy, @holdStartDate, 'ACTIVE')`,
  ).run({
    holdId: h.holdId,
    cartonId: h.cartonId,
    matterReference: h.matterReference,
    holdReason: h.holdReason,
    raisedBy: h.raisedBy ?? null,
    holdStartDate: h.holdStartDate,
  });
  return findById(h.holdId);
}

export function release(holdId, releaseDate) {
  db.prepare(
    "UPDATE legal_hold SET hold_status = 'RELEASED', hold_release_date = ? WHERE hold_id = ?",
  ).run(releaseDate, holdId);
  return findById(holdId);
}

export function list(activeOnly) {
  const sql = activeOnly
    ? "SELECT * FROM legal_hold WHERE hold_status = 'ACTIVE' ORDER BY hold_start_date DESC"
    : "SELECT * FROM legal_hold ORDER BY hold_start_date DESC";
  return db.prepare(sql).all().map(LegalHold.fromRow);
}
