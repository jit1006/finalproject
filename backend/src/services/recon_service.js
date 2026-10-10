// Reconciliation run/exception framework for the 16-table design.
// Runs are not a table: run fields are inlined on recon_finding. A "run" here is
// a deterministic run_id (hash of kind+scope+params). The three detection
// engines (inventory/invoice/certificate) are the documented next increment.
import { createHash } from "node:crypto";
import { reconRepo } from "../repositories/index.js";

export function startRun(user, { runKind, scopeKey, parameters = {} }) {
  const runId = createHash("sha256")
    .update(JSON.stringify({ runKind, scopeKey, parameters }))
    .digest("hex")
    .slice(0, 32);

  // Idempotency: same kind+scope+params yields the same run_id. If findings for
  // that run already exist, report it as a dedup rather than re-running.
  const existing = reconRepo.findRunByFingerprint(runId);
  if (existing) return { run_id: runId, status: existing.run_status, deduplicated: true };

  // Engine stub: no findings produced yet; a completed run with zero findings is
  // represented by the absence of recon_finding rows for this run_id.
  return { run_id: runId, status: "COMPLETED", deduplicated: false, findings: 0 };
}

export const listRuns = () => reconRepo.listRuns();
export const listExceptions = (user) =>
  reconRepo.listExceptions({ role: user.roleCode, vendorId: user.vendorId });
