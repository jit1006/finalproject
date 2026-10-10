import { db } from "../db/connection.js";
import { Request } from "../models/index.js";

export function findById(requestId) {
  const row = db.prepare("SELECT * FROM request WHERE request_id = ?").get(requestId);
  return Request.fromRow(row);
}

export function insert(r) {
  db.prepare(
    `INSERT INTO request (request_id, request_type, carton_id, raised_by, raised_on, vendor_id, request_status)
     VALUES (@requestId, @requestType, @cartonId, @raisedBy, @raisedOn, @vendorId, @requestStatus)`,
  ).run({
    requestId: r.requestId,
    requestType: r.requestType,
    cartonId: r.cartonId,
    raisedBy: r.raisedBy,
    raisedOn: r.raisedOn,
    vendorId: r.vendorId,
    requestStatus: r.requestStatus,
  });
  return findById(r.requestId);
}

export function setFields(requestId, fields) {
  const sets = [];
  const params = { requestId };
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = @${k}`);
    params[k] = v;
  }
  db.prepare(`UPDATE request SET ${sets.join(", ")} WHERE request_id = @requestId`).run(params);
  return findById(requestId);
}

export function listForVendor(vendorId) {
  return db
    .prepare("SELECT * FROM request WHERE vendor_id = ? ORDER BY raised_on DESC")
    .all(vendorId)
    .map(Request.fromRow);
}

export function countForUser({ role, userId, vendorId }) {
  if (role === "BUSINESS") return db.prepare("SELECT count(*) n FROM request WHERE raised_by = ?").get(userId).n;
  if (role === "VENDOR") return db.prepare("SELECT count(*) n FROM request WHERE vendor_id = ?").get(vendorId).n;
  return db.prepare("SELECT count(*) n FROM request").get().n;
}

export function listPendingApproval() {
  return db
    .prepare(
      `SELECT * FROM request 
       WHERE request_type = 'DESTRUCTION' 
         AND approved_by IS NULL 
         AND request_status NOT IN ('Completed', 'Rejected', 'Cancelled')
       ORDER BY raised_on DESC`,
    )
    .all()
    .map(Request.fromRow);
}

export function listForCarton(cartonId) {
  return db
    .prepare("SELECT * FROM request WHERE carton_id = ? ORDER BY raised_on DESC")
    .all(cartonId)
    .map(Request.fromRow);
}
