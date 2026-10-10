import { forbidden } from "../errors.js";

export function assertCanViewCarton(user, carton) {
  if (user.roleCode === "FACILITIES" || user.roleCode === "COMPLIANCE") return;
  if (user.roleCode === "BUSINESS") {
    if (carton.entityId === user.entityId && carton.departmentId === user.departmentId) return;
    throw forbidden("Carton belongs to another department");
  }
  if (user.roleCode === "VENDOR") {
    if (carton.assignedVendorId === user.vendorId) return;
    throw forbidden("Carton is not assigned to your vendor");
  }
  throw forbidden();
}

export function assertCanRaiseForCarton(user, carton) {
  if (user.roleCode !== "BUSINESS") throw forbidden("Only Business users can raise requests");
  if (carton.entityId !== user.entityId || carton.departmentId !== user.departmentId) {
    throw forbidden("Carton belongs to another department");
  }
}

export function assertCanActOnRequest(user, request) {
  if (user.roleCode !== "VENDOR") throw forbidden("Only Vendor users can confirm operational actions");
  if (request.vendorId !== user.vendorId) throw forbidden("Request is not assigned to your vendor");
}
