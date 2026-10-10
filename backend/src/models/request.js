/**
 * @typedef {Object} RequestRecord
 * @property {string} requestId
 * @property {"PICKUP"|"RETRIEVAL"|"RETURN"|"DESTRUCTION"} requestType
 * @property {string} cartonId
 * @property {string} raisedBy
 * @property {string} raisedOn
 * @property {string} vendorId
 * @property {string|null} slaDueDate
 * @property {string|null} vendorAckOn
 * @property {string|null} completedOn
 * @property {string|null} approvedBy
 * @property {string|null} approvedOn
 * @property {string} requestStatus
 */

export const Request = {
  table: "request",

  /** @returns {RequestRecord|null} */
  fromRow(row) {
    if (!row) return null;
    return {
      requestId: row.request_id,
      requestType: row.request_type,
      cartonId: row.carton_id,
      raisedBy: row.raised_by,
      raisedOn: row.raised_on,
      vendorId: row.vendor_id,
      slaDueDate: row.sla_due_date,
      vendorAckOn: row.vendor_ack_on,
      completedOn: row.completed_on,
      approvedBy: row.approved_by,
      approvedOn: row.approved_on,
      requestStatus: row.request_status,
    };
  },

  toPublic(r) {
    return {
      request_id: r.requestId,
      request_type: r.requestType,
      carton_id: r.cartonId,
      raised_by: r.raisedBy,
      raised_on: r.raisedOn,
      vendor_id: r.vendorId,
      request_status: r.requestStatus,
      approved_by: r.approvedBy,
      approved_on: r.approvedOn,
      sla_due_date: r.slaDueDate,
    };
  },
};
