import { conflict, forbidden } from "../errors.js";
import { tx } from "../db/connection.js";
import { cartonRepo } from "../repositories/index.js";
import { appendCartonEvent } from "./event_engine.js";
import { nowIso } from "../models/index.js";

export function registerCarton(user, input) {
  if (user.roleCode !== "BUSINESS") throw forbidden("Only Business users register cartons");
  if (cartonRepo.findById(input.cartonId)) throw conflict(`Carton ${input.cartonId} already exists`);

  return tx(() => {
    const carton = cartonRepo.insert({
      cartonId: input.cartonId,
      entityId: user.entityId,
      departmentId: user.departmentId,
      ownerUserId: user.userId,
      documentType: input.documentType,
      archivalPolicy: input.archivalPolicy,
      cartonCreatedDate: input.cartonCreatedDate,
      retentionTriggerDate: input.retentionTriggerDate ?? null,
      declaredFileCount: input.declaredFileCount ?? null,
      assignedVendorId: input.assignedVendorId ?? null,
      currentStatus: "Created",
      legalHoldFlag: false,
      barcode: input.barcode ?? null,
      remarks: input.remarks ?? null,
    });
    appendCartonEvent({
      cartonId: carton.cartonId,
      eventType: "CARTON_CREATED",
      actorUserId: user.userId,
      occurredAt: nowIso(),
      idempotencyKey: `create:${carton.cartonId}`,
      remarks: `document_type=${input.documentType}`,
    });
    return carton;
  });
}

export function indexFile(user, carton, input) {
  if (cartonRepo.fileExists(input.fileId)) throw conflict(`File ${input.fileId} already exists`);
  return tx(() => {
    cartonRepo.insertFile({
      fileId: input.fileId,
      cartonId: carton.cartonId,
      fileRef: input.fileRef,
      documentType: input.documentType,
      fileDescription: input.fileDescription ?? null,
      documentYear: input.documentYear ?? null,
      containsPii: input.containsPii ?? true,
    });
    appendCartonEvent({
      cartonId: carton.cartonId,
      eventType: "FILE_INDEXED",
      actorUserId: user.userId,
      occurredAt: nowIso(),
      idempotencyKey: `file:${input.fileId}`,
      remarks: `file_id=${input.fileId}`,
    });
    return { fileId: input.fileId };
  });
}

export const listFiles = (cartonId) => cartonRepo.listFiles(cartonId);
export const retention = (cartonId) => cartonRepo.retention(cartonId);
