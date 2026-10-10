/**
 * Flat append-only event. The denormalized carton row holds current state;
 * event_log is the immutable audit history.
 *
 * @typedef {Object} EventLogRecord
 * @property {string} eventId
 * @property {string} cartonId
 * @property {string} eventTimestamp
 * @property {string} eventType
 * @property {string|null} fromLocation
 * @property {string|null} toLocation
 * @property {string|null} actorId
 * @property {string|null} requestId
 * @property {string|null} resultingStatus   null = status unchanged
 * @property {string|null} remarks
 * @property {string|null} idempotencyKey
 */

export const EventLogEntry = {
  table: "event_log",

  /** @returns {EventLogRecord|null} */
  fromRow(row) {
    if (!row) return null;
    return {
      eventId: row.event_id,
      cartonId: row.carton_id,
      eventTimestamp: row.event_timestamp,
      eventType: row.event_type,
      fromLocation: row.from_location,
      toLocation: row.to_location,
      actorId: row.actor_id,
      requestId: row.request_id,
      resultingStatus: row.resulting_status,
      remarks: row.remarks,
      idempotencyKey: row.idempotency_key,
    };
  },

  toHistory(e) {
    return {
      eventId: e.eventId,
      eventType: e.eventType,
      occurredAt: e.eventTimestamp,
      actorId: e.actorId,
      resultingStatus: e.resultingStatus,
      requestId: e.requestId,
      remarks: e.remarks,
    };
  },
};
