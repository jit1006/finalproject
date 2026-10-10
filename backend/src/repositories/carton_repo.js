import { db } from "../db/connection.js";
import { Carton, FileIndex } from "../models/index.js";

export function findById(cartonId) {
  const row = db.prepare("SELECT * FROM carton WHERE carton_id = ?").get(cartonId);
  return Carton.fromRow(row);
}

export function insert(c) {
  const r = Carton.toRow(c);
  db.prepare(
    `INSERT INTO carton (carton_id, entity_id, department_id, owner_user_id, document_type,
        archival_policy, carton_created_date, retention_trigger_date, declared_file_count,
        assigned_vendor_id, current_location_id, current_status, legal_hold_flag, barcode, remarks)
     VALUES (@carton_id, @entity_id, @department_id, @owner_user_id, @document_type, @archival_policy,
        @carton_created_date, @retention_trigger_date, @declared_file_count, @assigned_vendor_id,
        @current_location_id, @current_status, @legal_hold_flag, @barcode, @remarks)`,
  ).run(r);
  return findById(c.cartonId);
}

/** Patch the denormalized carton state (status/location/hold). */
export function updateState(cartonId, fields) {
  const sets = [];
  const params = { cartonId };
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = @${k}`);
    params[k] = v;
  }
  if (!sets.length) return;
  db.prepare(`UPDATE carton SET ${sets.join(", ")} WHERE carton_id = @cartonId`).run(params);
}

export function insertFile(f) {
  db.prepare(
    `INSERT INTO file_index (file_id, carton_id, file_ref, document_type, file_description, document_year, contains_pii)
     VALUES (@fileId, @cartonId, @fileRef, @documentType, @fileDescription, @documentYear, @containsPii)`,
  ).run({
    fileId: f.fileId,
    cartonId: f.cartonId,
    fileRef: f.fileRef,
    documentType: f.documentType,
    fileDescription: f.fileDescription ?? null,
    documentYear: f.documentYear ?? null,
    containsPii: f.containsPii ? 1 : 0,
  });
}

export function listFiles(cartonId) {
  return db
    .prepare("SELECT * FROM file_index WHERE carton_id = ? ORDER BY file_id")
    .all(cartonId)
    .map(FileIndex.fromRow);
}

export function fileExists(fileId) {
  return !!db.prepare("SELECT 1 FROM file_index WHERE file_id = ?").get(fileId);
}

export function retention(cartonId) {
  return (
    db
      .prepare(
        `SELECT carton_id, retention_trigger_date, policy_code, retention_years,
                destruction_due_on, calculation_status
         FROM carton_retention WHERE carton_id = ?`,
      )
      .get(cartonId) ?? null
  );
}

// Dashboard aggregates scoped by role (status now lives on carton).
export function countsByStatus({ role, entityId, departmentId, vendorId }) {
  return db
    .prepare(
      `SELECT current_status AS status_code, count(*) AS n FROM carton c
       WHERE (@role <> 'BUSINESS' OR (c.entity_id = @entityId AND c.department_id = @departmentId))
         AND (@role <> 'VENDOR'   OR c.assigned_vendor_id = @vendorId)
       GROUP BY current_status ORDER BY n DESC`,
    )
    .all({ role, entityId: entityId ?? null, departmentId: departmentId ?? null, vendorId: vendorId ?? null });
}

export function totalCartons({ role, entityId, departmentId, vendorId }) {
  return db
    .prepare(
      `SELECT count(*) AS n FROM carton c
       WHERE (@role <> 'BUSINESS' OR (c.entity_id = @entityId AND c.department_id = @departmentId))
         AND (@role <> 'VENDOR'   OR c.assigned_vendor_id = @vendorId)`,
    )
    .get({ role, entityId: entityId ?? null, departmentId: departmentId ?? null, vendorId: vendorId ?? null }).n;
}
