// Event engine for the 16-table (denormalized) design.
// Appends a flat event_log row AND patches the carton's current_status /
// current_location_id directly (there is no separate projection table).
// Must run inside tx() so append + carton update are atomic. Idempotent by key.
import { conflict, unprocessable } from "../errors.js";
import { db } from "../db/connection.js";
import { eventRepo, cartonRepo } from "../repositories/index.js";
import { nowIso } from "../models/index.js";

// Resulting-status -> warehouse location requirement. For WAREHOUSE statuses we
// place the carton at its assigned vendor's first warehouse (deterministic).
const WAREHOUSE_STATUSES = new Set([
  "In Storage",
  "Retrieval Requested",
  "Destruction Requested",
  "Approved for Destruction",
]);

function isTerminal(status) {
  const row = db
    .prepare("SELECT attrs_json FROM ref_lookup WHERE lookup_type='CARTON_STATUS' AND code=?")
    .get(status);
  if (!row?.attrs_json) return false;
  try {
    return JSON.parse(row.attrs_json).is_terminal === true;
  } catch {
    return false;
  }
}

function firstWarehouse(vendorId) {
  if (!vendorId) return null;
  const row = db
    .prepare("SELECT location_id FROM warehouse_location WHERE vendor_id = ? ORDER BY location_id LIMIT 1")
    .get(vendorId);
  return row?.location_id ?? null;
}

/**
 * Append one carton event and update the carton's denormalized state. Idempotent.
 * @returns {{eventId:string, resultingStatus:string|null, deduplicated:boolean}}
 */
export function appendCartonEvent({
  cartonId,
  eventType,
  actorUserId,
  occurredAt = null,
  idempotencyKey,
  requestId = null,
  remarks = null,
}) {
  if (idempotencyKey) {
    const existing = eventRepo.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return { eventId: existing.eventId, resultingStatus: existing.resultingStatus, deduplicated: true };
    }
  }

  const rules = eventRepo.eventTypeRules(eventType);
  if (rules === null) throw unprocessable(`Unknown event_type '${eventType}'`);

  const carton = cartonRepo.findById(cartonId);
  if (!carton) throw unprocessable(`Unknown carton '${cartonId}'`);

  const current = carton.currentStatus;
  let resultingStatus = rules.resulting_status ?? null;

  // Validate the transition when the event changes status.
  if (resultingStatus != null) {
    const allowedFrom = rules.from ?? null; // array of valid prior statuses (may contain null)
    const isGenesis = Array.isArray(allowedFrom) && allowedFrom.includes(null);
    const priorEvents = db
      .prepare("SELECT count(*) n FROM event_log WHERE carton_id = ?")
      .get(cartonId).n;

    if (isGenesis) {
      // Genesis event (e.g. CARTON_CREATED): valid only as the carton's first event.
      if (priorEvents > 0) throw conflict(`${eventType} is only valid as the first event`);
    } else {
      if (isTerminal(current)) throw conflict("Carton is in a terminal state and cannot change");
      if (allowedFrom && !allowedFrom.includes(current)) {
        throw conflict(`Illegal transition: ${eventType} not allowed from status '${current}'`);
      }
    }
    resultingStatus = rules.to ?? resultingStatus;
  }

  const occurred = occurredAt ?? nowIso();
  const fromLocation = carton.currentLocationId;
  const toLocation =
    resultingStatus && WAREHOUSE_STATUSES.has(resultingStatus)
      ? firstWarehouse(carton.assignedVendorId)
      : resultingStatus === "Destroyed" || resultingStatus === "With Business"
        ? null
        : carton.currentLocationId;

  const eventId = eventRepo.insertEvent({
    cartonId,
    eventTimestamp: occurred,
    eventType,
    fromLocation,
    toLocation,
    actorId: actorUserId,
    requestId,
    resultingStatus,
    remarks,
    idempotencyKey,
  });

  if (resultingStatus != null) {
    cartonRepo.updateState(cartonId, {
      current_status: resultingStatus,
      current_location_id: toLocation,
    });
  }

  return { eventId, resultingStatus, deduplicated: false };
}
