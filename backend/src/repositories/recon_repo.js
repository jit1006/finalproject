import { db } from "../db/connection.js";
import { ReconException } from "../models/index.js";

// Reconciliation runs are not a table in the 16-table design: run fields are
// inlined onto recon_finding. "List runs" is therefore a DISTINCT over findings.

export function findRunByFingerprint(runId) {
  // run_id doubles as the deterministic fingerprint (kind+scope+inputs hash).
  const row = db.prepare("SELECT DISTINCT run_id, run_kind, run_started_at, run_status FROM recon_finding WHERE run_id = ? LIMIT 1").get(runId);
  return row ?? null;
}

export function insertFinding(f) {
  db.prepare(
    `INSERT INTO recon_finding (finding_id, exception_id, run_id, run_kind, run_started_at, run_status, finding_key, rule_code, evidence_json)
     VALUES (@findingId, @exceptionId, @runId, @runKind, @runStartedAt, @runStatus, @findingKey, @ruleCode, @evidenceJson)`,
  ).run({
    findingId: f.findingId,
    exceptionId: f.exceptionId,
    runId: f.runId,
    runKind: f.runKind,
    runStartedAt: f.runStartedAt,
    runStatus: f.runStatus,
    findingKey: f.findingKey,
    ruleCode: f.ruleCode,
    evidenceJson: JSON.stringify(f.evidence ?? {}),
  });
}

export function listRuns() {
  return db
    .prepare(
      `SELECT run_id, run_kind, run_started_at, run_status, count(*) AS finding_count
       FROM recon_finding GROUP BY run_id, run_kind, run_started_at, run_status
       ORDER BY run_started_at DESC`,
    )
    .all();
}

export function listExceptions({ role, vendorId }) {
  let sql = "SELECT * FROM recon_exception";
  const params = [];
  if (role === "VENDOR") {
    sql += " WHERE owner_vendor_id = ?";
    params.push(vendorId);
  }
  sql += " ORDER BY last_detected_at DESC";
  return db.prepare(sql).all(...params).map(ReconException.fromRow);
}
