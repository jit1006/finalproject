/**
 * @typedef {Object} LegalHoldRecord
 * @property {string} holdId
 * @property {string} cartonId
 * @property {string} matterReference
 * @property {string} holdReason
 * @property {string|null} raisedBy
 * @property {string} holdStartDate
 * @property {string|null} holdReleaseDate
 * @property {"ACTIVE"|"RELEASED"} holdStatus
 */

export const LegalHold = {
  table: "legal_hold",

  /** @returns {LegalHoldRecord|null} */
  fromRow(row) {
    if (!row) return null;
    return {
      holdId: row.hold_id,
      cartonId: row.carton_id,
      matterReference: row.matter_reference,
      holdReason: row.hold_reason,
      raisedBy: row.raised_by,
      holdStartDate: row.hold_start_date,
      holdReleaseDate: row.hold_release_date,
      holdStatus: row.hold_status,
    };
  },

  toPublic(h) {
    return {
      hold_id: h.holdId,
      carton_id: h.cartonId,
      matter_reference: h.matterReference,
      hold_reason: h.holdReason,
      hold_start_date: h.holdStartDate,
      hold_release_date: h.holdReleaseDate,
      hold_status: h.holdStatus,
    };
  },
};
