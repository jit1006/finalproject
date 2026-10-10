import { fromBool } from "./index.js";

/**
 * @typedef {Object} AppUserRecord
 * @property {string} userId
 * @property {string} fullName
 * @property {string} email
 * @property {"BUSINESS"|"VENDOR"|"COMPLIANCE"|"FACILITIES"} roleCode
 * @property {"DEPARTMENT"|"VENDOR"|"GLOBAL"} scopeType
 * @property {string|null} entityId
 * @property {string|null} departmentId
 * @property {string|null} vendorId
 * @property {string|null} passwordHash
 * @property {"ACTIVE"|"INACTIVE"} status
 */

const SCOPE_FOR_ROLE = {
  BUSINESS: "DEPARTMENT",
  VENDOR: "VENDOR",
  COMPLIANCE: "GLOBAL",
  FACILITIES: "GLOBAL",
};

export const AppUser = {
  table: "app_user",

  /** @returns {AppUserRecord|null} */
  fromRow(row) {
    if (!row) return null;
    return {
      userId: row.user_id,
      fullName: row.full_name,
      email: row.email,
      roleCode: row.role_code,
      scopeType: row.scope_type,
      entityId: row.entity_id,
      departmentId: row.department_id,
      vendorId: row.vendor_id,
      passwordHash: row.password_hash,
      status: row.status,
    };
  },

  /** Domain object -> row. Derives scope_type from the role if not supplied. */
  toRow(u) {
    return {
      user_id: u.userId,
      full_name: u.fullName,
      email: u.email,
      role_code: u.roleCode,
      scope_type: u.scopeType ?? SCOPE_FOR_ROLE[u.roleCode] ?? "GLOBAL",
      entity_id: u.entityId ?? null,
      department_id: u.departmentId ?? null,
      vendor_id: u.vendorId ?? null,
      password_hash: u.passwordHash ?? null,
      status: u.status ?? "ACTIVE",
    };
  },

  /** Public projection: never leak the password hash. */
  toPublic(u) {
    return {
      user_id: u.userId,
      full_name: u.fullName,
      email: u.email,
      role_code: u.roleCode,
      scope_type: u.scopeType,
      entity_id: u.entityId,
      department_id: u.departmentId,
      vendor_id: u.vendorId,
    };
  },

  isActive: (u) => u.status === "ACTIVE",
  scopeForRole: (role) => SCOPE_FOR_ROLE[role] ?? "GLOBAL",
};
