// Model definitions for the 16-table PRMS SQLite schema.
// A "model" = JSDoc typedef + row<->domain mappers (snake_case rows, camelCase
// domain objects, TEXT booleans -> real booleans). Repositories use these.

/** @typedef {"BUSINESS"|"VENDOR"|"COMPLIANCE"|"FACILITIES"} Role */

export { AppUser } from "./app_user.js";
export { Carton } from "./carton.js";
export { FileIndex } from "./file_index.js";
export { Request } from "./request.js";
export { EventLogEntry } from "./event_log.js";
export { LegalHold } from "./legal_hold.js";
export { ReconException } from "./reconciliation.js";

export const toBool = (v) => v === 1 || v === "1" || v === true;
export const fromBool = (v) => (v ? 1 : 0);
export const nowIso = () => new Date().toISOString();
