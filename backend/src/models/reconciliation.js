/**
 * Single exception register. Reconciliation-run fields are inlined onto each
 * recon_finding row (no separate run table in the 16-table design).
 *
 * @typedef {Object} ReconExceptionRecord
 * @property {string} exceptionId
 * @property {string} stableKey
 * @property {string} exceptionType
 * @property {"LOW"|"MEDIUM"|"HIGH"|"CRITICAL"} severity
 * @property {string} ownerRole
 * @property {string|null} ownerVendorId
 * @property {string|null} cartonId
 * @property {string} status
 */

export const ReconException = {
  table: "recon_exception",

  /** @returns {ReconExceptionRecord|null} */
  fromRow(row) {
    if (!row) return null;
    return {
      exceptionId: row.exception_id,
      stableKey: row.stable_key,
      exceptionType: row.exception_type,
      severity: row.severity,
      ownerRole: row.owner_role,
      ownerVendorId: row.owner_vendor_id,
      cartonId: row.carton_id,
      status: row.status,
    };
  },

  toPublic(e) {
    return {
      exception_id: e.exceptionId,
      exception_type: e.exceptionType,
      severity: e.severity,
      owner_role: e.ownerRole,
      status: e.status,
      carton_id: e.cartonId,
    };
  },
};
