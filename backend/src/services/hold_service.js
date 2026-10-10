import { randomUUID } from "node:crypto";
import { conflict, forbidden, notFound } from "../errors.js";
import { tx } from "../db/connection.js";
import { holdRepo, cartonRepo } from "../repositories/index.js";
import { appendCartonEvent } from "./event_engine.js";
import { nowIso } from "../models/index.js";

export function applyHold(user, { cartonId, holdId, matterReference, reason }) {
  if (user.roleCode !== "COMPLIANCE") throw forbidden("Only Compliance can apply legal holds");
  if (holdRepo.findById(holdId)) throw conflict(`Hold ${holdId} already exists`);
  if (!cartonRepo.findById(cartonId)) throw notFound(`Carton ${cartonId} not found`);

  const now = nowIso();
  return tx(() => {
    appendCartonEvent({
      cartonId,
      eventType: "LEGAL_HOLD_APPLIED",
      actorUserId: user.userId,
      occurredAt: now,
      idempotencyKey: `hold-apply:${holdId}`,
      remarks: `matter=${matterReference}`,
    });
    const hold = holdRepo.insert({
      holdId,
      cartonId,
      matterReference,
      holdReason: reason,
      raisedBy: user.userId,
      holdStartDate: now,
    });
    // Keep the denormalized flag in step with active holds.
    cartonRepo.updateState(cartonId, { legal_hold_flag: 1 });
    return hold;
  });
}

export function releaseHold(user, holdId, reason) {
  if (user.roleCode !== "COMPLIANCE") throw forbidden("Only Compliance can release legal holds");
  const hold = holdRepo.findById(holdId);
  if (!hold) throw notFound(`Hold ${holdId} not found`);
  if (hold.holdStatus === "RELEASED") throw conflict("Hold already released");

  const now = nowIso();
  return tx(() => {
    appendCartonEvent({
      cartonId: hold.cartonId,
      eventType: "LEGAL_HOLD_RELEASED",
      actorUserId: user.userId,
      occurredAt: now,
      idempotencyKey: `hold-release:${holdId}`,
      remarks: reason,
    });
    const released = holdRepo.release(holdId, now);
    // Clear the flag only when no other active hold remains on the carton.
    if (holdRepo.activeCount(hold.cartonId) === 0) {
      cartonRepo.updateState(hold.cartonId, { legal_hold_flag: 0 });
    }
    return released;
  });
}

export const listHolds = (activeOnly) => holdRepo.list(activeOnly);
export const newHoldId = () => `H-${randomUUID().slice(0, 8)}`;
