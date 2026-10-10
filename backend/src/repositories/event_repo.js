import { randomUUID } from "node:crypto";
import { db } from "../db/connection.js";
import { EventLogEntry } from "../models/index.js";

export function findByIdempotencyKey(key) {
  const row = db.prepare("SELECT * FROM event_log WHERE idempotency_key = ?").get(key);
  return EventLogEntry.fromRow(row);
}

export function insertEvent(e) {
  const eventId = e.eventId ?? `EV-${randomUUID()}`;
  db.prepare(
    `INSERT INTO event_log (event_id, carton_id, event_timestamp, event_type, from_location,
        to_location, actor_id, request_id, resulting_status, remarks, idempotency_key)
     VALUES (@eventId, @cartonId, @eventTimestamp, @eventType, @fromLocation, @toLocation,
        @actorId, @requestId, @resultingStatus, @remarks, @idempotencyKey)`,
  ).run({
    eventId,
    cartonId: e.cartonId,
    eventTimestamp: e.eventTimestamp,
    eventType: e.eventType,
    fromLocation: e.fromLocation ?? null,
    toLocation: e.toLocation ?? null,
    actorId: e.actorId ?? null,
    requestId: e.requestId ?? null,
    resultingStatus: e.resultingStatus ?? null,
    remarks: e.remarks ?? null,
    idempotencyKey: e.idempotencyKey ?? null,
  });
  return eventId;
}

export function history(cartonId) {
  return db
    .prepare("SELECT * FROM event_log WHERE carton_id = ? ORDER BY event_timestamp ASC, event_id ASC")
    .all(cartonId)
    .map((r) => EventLogEntry.toHistory(EventLogEntry.fromRow(r)));
}

/** Look up an event-type's rules from ref_lookup (attrs_json). */
export function eventTypeRules(eventType) {
  const row = db
    .prepare("SELECT attrs_json FROM ref_lookup WHERE lookup_type = 'EVENT_TYPE' AND code = ?")
    .get(eventType);
  if (!row) return null;
  return row.attrs_json ? JSON.parse(row.attrs_json) : {};
}
