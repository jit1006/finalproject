import { conflict, forbidden, notFound, unprocessable } from "../errors.js";
import { tx } from "../db/connection.js";
import { requestRepo, holdRepo, cartonRepo } from "../repositories/index.js";
import { appendCartonEvent } from "./event_engine.js";
import * as scope from "./scope.js";
import { nowIso } from "../models/index.js";

const REQUEST_EVENT = {
  PICKUP: "PICKUP_REQUESTED",
  RETRIEVAL: "RETRIEVAL_REQUESTED",
  RETURN: "RETURN_REQUESTED",
  DESTRUCTION: "DESTRUCTION_REQUESTED",
};

export function raiseRequest(user, carton, { requestId, requestType }) {
  scope.assertCanRaiseForCarton(user, carton);
  if (!REQUEST_EVENT[requestType]) throw unprocessable(`Unknown request_type '${requestType}'`);
  if (requestType === "DESTRUCTION" && holdRepo.activeForCarton(carton.cartonId)) {
    throw conflict("Carton is under an active legal hold; destruction is blocked");
  }

  const now = nowIso();
  return tx(() => {
    const req = requestRepo.insert({
      requestId,
      requestType,
      cartonId: carton.cartonId,
      raisedBy: user.userId,
      raisedOn: now,
      vendorId: carton.assignedVendorId,
      requestStatus: "Open",
    });
    appendCartonEvent({
      cartonId: carton.cartonId,
      eventType: REQUEST_EVENT[requestType],
      actorUserId: user.userId,
      occurredAt: now,
      idempotencyKey: `request:${requestId}`,
      requestId,
    });
    return req;
  });
}

function loadRequest(requestId) {
  const req = requestRepo.findById(requestId);
  if (!req) throw notFound(`Request ${requestId} not found`);
  return req;
}

export function vendorAction(user, { requestId, eventType, markCompleted }) {
  const req = loadRequest(requestId);
  scope.assertCanActOnRequest(user, req);
  const now = nowIso();
  return tx(() => {
    appendCartonEvent({
      cartonId: req.cartonId,
      eventType,
      actorUserId: user.userId,
      occurredAt: now,
      idempotencyKey: `${eventType}:${requestId}`,
      requestId,
    });
    const fields = { request_status: markCompleted ? "Completed" : "In Progress" };
    if (!req.vendorAckOn) fields.vendor_ack_on = now;
    if (markCompleted) fields.completed_on = now;
    return requestRepo.setFields(requestId, fields);
  });
}

export function approveDestruction(user, requestId) {
  if (user.roleCode !== "COMPLIANCE") throw forbidden("Only Compliance can approve destruction");
  const req = loadRequest(requestId);
  if (req.requestType !== "DESTRUCTION") throw unprocessable("Only destruction requests can be approved");
  if (req.approvedBy) throw conflict("Request already approved");
  if (req.raisedBy === user.userId) throw forbidden("Approver must differ from the requester (separation of duties)");
  if (holdRepo.activeForCarton(req.cartonId)) throw conflict("Carton is under an active legal hold");

  const now = nowIso();
  return tx(() => {
    appendCartonEvent({
      cartonId: req.cartonId,
      eventType: "DESTRUCTION_APPROVED",
      actorUserId: user.userId,
      occurredAt: now,
      idempotencyKey: `approve:${requestId}`,
      requestId,
    });
    return requestRepo.setFields(requestId, {
      approved_by: user.userId,
      approved_on: now,
      request_status: "In Progress",
    });
  });
}

export function executeDestruction(user, requestId) {
  const req = loadRequest(requestId);
  scope.assertCanActOnRequest(user, req);
  if (!req.approvedBy) throw conflict("Destruction has not been approved");
  if (holdRepo.activeForCarton(req.cartonId)) {
    throw conflict("Carton is under an active legal hold; destruction blocked at execution");
  }
  const carton = cartonRepo.findById(req.cartonId);
  if (carton && carton.currentStatus !== "Approved for Destruction") {
    throw conflict("Carton must be approved for destruction before execution");
  }

  const now = nowIso();
  return tx(() => {
    appendCartonEvent({
      cartonId: req.cartonId,
      eventType: "DESTROYED",
      actorUserId: user.userId,
      occurredAt: now,
      idempotencyKey: `destroy:${requestId}`,
      requestId,
    });
    return requestRepo.setFields(requestId, { request_status: "Completed", completed_on: now });
  });
}

export const listVendorQueue = (vendorId) => requestRepo.listForVendor(vendorId);
export const listPendingApproval = () => requestRepo.listPendingApproval();
export const listForCarton = (cartonId) => requestRepo.listForCarton(cartonId);
