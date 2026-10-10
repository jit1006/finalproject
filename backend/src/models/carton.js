import { toBool, fromBool } from "./index.js";

/**
 * Denormalized carton: carries current_status, current_location_id and
 * legal_hold_flag directly (the former carton_state projection is folded in).
 *
 * @typedef {Object} CartonRecord
 * @property {string} cartonId
 * @property {string} entityId
 * @property {string} departmentId
 * @property {string} ownerUserId
 * @property {string} documentType
 * @property {string} archivalPolicy
 * @property {string} cartonCreatedDate
 * @property {string|null} retentionTriggerDate
 * @property {number|null} declaredFileCount
 * @property {string|null} assignedVendorId
 * @property {string|null} currentLocationId
 * @property {string} currentStatus
 * @property {boolean} legalHoldFlag
 * @property {string|null} barcode
 * @property {string|null} remarks
 */

export const Carton = {
  table: "carton",

  /** @returns {CartonRecord|null} */
  fromRow(row) {
    if (!row) return null;
    return {
      cartonId: row.carton_id,
      entityId: row.entity_id,
      departmentId: row.department_id,
      ownerUserId: row.owner_user_id,
      documentType: row.document_type,
      archivalPolicy: row.archival_policy,
      cartonCreatedDate: row.carton_created_date,
      retentionTriggerDate: row.retention_trigger_date,
      declaredFileCount: row.declared_file_count,
      assignedVendorId: row.assigned_vendor_id,
      currentLocationId: row.current_location_id,
      currentStatus: row.current_status,
      legalHoldFlag: toBool(row.legal_hold_flag),
      barcode: row.barcode,
      remarks: row.remarks,
    };
  },

  toRow(c) {
    return {
      carton_id: c.cartonId,
      entity_id: c.entityId,
      department_id: c.departmentId,
      owner_user_id: c.ownerUserId,
      document_type: c.documentType,
      archival_policy: c.archivalPolicy,
      carton_created_date: c.cartonCreatedDate,
      retention_trigger_date: c.retentionTriggerDate ?? null,
      declared_file_count: c.declaredFileCount ?? null,
      assigned_vendor_id: c.assignedVendorId ?? null,
      current_location_id: c.currentLocationId ?? null,
      current_status: c.currentStatus ?? "Created",
      legal_hold_flag: fromBool(c.legalHoldFlag ?? false),
      barcode: c.barcode ?? null,
      remarks: c.remarks ?? null,
    };
  },

  toPublic(c) {
    return {
      carton_id: c.cartonId,
      entity_id: c.entityId,
      department_id: c.departmentId,
      document_type: c.documentType,
      archival_policy: c.archivalPolicy,
      assigned_vendor_id: c.assignedVendorId,
      current_location_id: c.currentLocationId,
      current_status: c.currentStatus,
      legal_hold_flag: c.legalHoldFlag,
      retention_trigger_date: c.retentionTriggerDate,
      declared_file_count: c.declaredFileCount,
      barcode: c.barcode,
    };
  },
};
