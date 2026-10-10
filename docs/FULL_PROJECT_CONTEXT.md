# MASTER PROJECT CONTEXT: Physical Records Management System (PRMS)

> **Instructions for Gemini / AI Assistant**:
> You are acting as the Lead Architect and Principal Engineer for this codebase. This document contains the **authoritative, 100% complete technical and domain context** for the Physical Records Management System (PRMS). Use this context to implement remaining features, generate algorithms, write ingestion scripts, create tests, or build UI components without guessing or inventing details.

---

## 1. Executive Summary & Problem Domain

### 1.1 The Domain
PRMS is a banking-grade records governance platform for tracking **physical cartons of paper documents** stored across external commercial archive providers (vendors) and geographically dispersed warehouses.
- **Physical Estate**: ~50,000+ cartons across 3 legal banking entities, 13 regional departments, 3 vendors, and 6 warehouse facilities.
- **Physical Reality**: This is records management for paper boxes with barcodes, file folders, destruction certificates, physical couriers, and warehouse shelving—**not** digital document OCR or file cloud storage.

### 1.2 Core Problem Solved
Traditional tracking relies on disconnected Excel sheets, vendor web portals, and email chains. This causes:
1. **Unverifiable Custody**: Conflating branch collection with warehouse receipt. (Collection ≠ Receipt; collection means "in transit", receipt means "in storage").
2. **Premature or Overdue Disposal**: Static retention schedules miss dynamic trigger events (e.g., loan closure date, contract end date).
3. **Legal Hold Violations**: Physical destruction occurring while documents are subject to regulatory discovery or active litigation.
4. **Vendor Billing Discrepancies**: Invoices paid without cross-referencing against internal physical movement event logs, actual warehouse custody intervals, or contractual rate cards.

---

## 2. Architecture & Zero-Dependency Technology Stack

The project is built as a **modular monolith** with a strict layered architecture:

```
React SPA (Vite) ──HTTP (Session Cookie)──▶ node:http Native Server (Port 8000)
                                            ├── http/routes.js (HTTP ↔ Service mapping)
                                            ├── services/ (Business logic, Scope, Event Engine)
                                            ├── repositories/ (All SQL execution)
                                            ├── models/ (Domain mappers & JSDoc types)
                                            └── db/connection.js (node:sqlite + tx() wrapper)
                                                  └── SQLite Database (prms.db)
```

### 2.1 Backend Runtime
- **Node.js**: `>= 22.5.0` (Verified on Node v24 LTS). Run with `--experimental-sqlite`.
- **Zero External Runtime Dependencies**: Uses only Node built-in standard libraries:
  - `node:sqlite`: Native `DatabaseSync` embedded SQLite engine.
  - `node:http`: Core HTTP server with custom path-matching router (`router.js`).
  - `node:crypto`: Native `scrypt` password hashing, `timingSafeEqual`, 32-byte opaque tokens, SHA-256 digests.
  - `node:fs`, `node:path`: File operations for DDL/seed loading.
  - `node:test`: Native zero-dependency test runner with strict assertions (`node:assert/strict`).

### 2.2 Concurrency & Transaction Discipline
- Database runs in **Write-Ahead Logging (WAL)** mode: `PRAGMA journal_mode = WAL;`.
- Foreign keys enforced: `PRAGMA foreign_keys = ON;`.
- Lock timeout: `PRAGMA busy_timeout = 5000;`.
- Atomic writes: All state changes run inside `tx(() => { ... })` wrapping `BEGIN IMMEDIATE` and `COMMIT/ROLLBACK`.

### 2.3 Frontend Stack
- React 18.3.1, React Router 6.28.0, TypeScript 5.6.3, Vite 6.0.3.
- Dark theme responsive UI with vanilla CSS custom properties (`styles.css`).
- Vite dev server proxies `/api` requests to `http://localhost:8000` for seamless same-origin session cookie handling.

---

## 3. Four User Personas & Authorization Model

The system enforces four distinct roles with strict server-side scoping (`services/scope.js`):

| Role Code | Role Title | Scope Type | Scope Boundary | Access & Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| `BUSINESS` | Business User | `DEPARTMENT` | Single `(entity_id, department_id)` | Registers cartons; indexes individual files; raises pickup, retrieval, return, and destruction requests; views scoped department inventory. **Cannot approve destruction or execute physical operations.** |
| `VENDOR` | Vendor User | `VENDOR` | Assigned `vendor_id` | Monitors assigned operational work queue; acknowledges requests; confirms collections; confirms warehouse receipts; delivers retrievals; executes approved destructions. **Strictly forbidden from viewing carton file contents and PII (403 Forbidden).** |
| `COMPLIANCE` | Compliance Officer | `GLOBAL` | Cross-entity / Enterprise | Applies and releases legal holds; inspects global history; independently approves or rejects destruction requests. **Separation of duties: Requester cannot be the approver.** |
| `FACILITIES` | Facilities Team | `GLOBAL` | Cross-entity / Enterprise | Manages vendor relationships, warehouses, rate cards; triggers and reviews reconciliation runs; monitors billing/inventory exceptions. |

---

## 4. Complete Database Schema (Consolidated 16-Table Model)

Derived from the normalized 37-table PostgreSQL reference model. Consolidated into 16 core business tables + 1 operational session table + 1 dynamic view:

### Table 1: `ref_lookup` (Polymorphic Reference Dictionary)
- `lookup_type` (`TEXT NOT NULL`): Category (`ROLE`, `SCOPE_TYPE`, `DOC_TYPE`, `ARCHIVAL_POLICY`, `RETENTION_POLICY`, `CARTON_STATUS`, `REQUEST_STATUS`, `EVENT_TYPE`, `SLA`, `THRESHOLD`, `TAX`, `HOLIDAY`, `ACTIVITY`).
- `code` (`TEXT NOT NULL`): Unique key within category.
- `name` (`TEXT`), `meaning` (`TEXT`).
- `numeric_value` (`INTEGER`): Retention years, SLA business days, threshold days, tax percentage × 100.
- `attrs_json` (`TEXT CHECK (attrs_json IS NULL OR json_valid(attrs_json))`): Complex rules (event transition maps, triggers).
- **PK**: `(lookup_type, code)`.

### Table 2: `org_unit` (Merged Entity & Department)
- `entity_id` (`TEXT NOT NULL`), `department_id` (`TEXT NOT NULL`).
- `entity_name` (`TEXT NOT NULL`), `department_name` (`TEXT NOT NULL`).
- **PK**: `(entity_id, department_id)`.

### Table 3: `vendor`
- `vendor_id` (`TEXT PRIMARY KEY`), `vendor_name` (`TEXT NOT NULL`), `status` (`TEXT NOT NULL CHECK (status IN ('Active','Terminated'))`).
- `contract_start` (`TEXT`), `contract_ref` (`TEXT`), `ops_contact_email` (`TEXT`), `recertification_frequency` (`TEXT NOT NULL DEFAULT 'Quarterly'`).

### Table 4: `warehouse_location`
- `location_id` (`TEXT PRIMARY KEY`), `vendor_id` (`TEXT NOT NULL REFERENCES vendor(vendor_id)`).
- `location_name` (`TEXT NOT NULL`), `city` (`TEXT NOT NULL`), `capacity_cartons` (`INTEGER CHECK (capacity_cartons >= 0)`).
- **Unique**: `(vendor_id, location_id)`.

### Table 5: `app_user`
- `user_id` (`TEXT PRIMARY KEY`), `full_name` (`TEXT NOT NULL`), `email` (`TEXT NOT NULL`).
- `role_code` (`TEXT NOT NULL`), `scope_type` (`TEXT NOT NULL CHECK (scope_type IN ('DEPARTMENT','VENDOR','GLOBAL'))`).
- `entity_id` (`TEXT`), `department_id` (`TEXT`), `vendor_id` (`TEXT REFERENCES vendor(vendor_id)`).
- `password_hash` (`TEXT`), `status` (`TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE'))`).
- `created_at` (`TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))`).
- `role_lookup_type` (`TEXT GENERATED ALWAYS AS ('ROLE') VIRTUAL`).
- **FKs**: `FOREIGN KEY (role_lookup_type, role_code) REFERENCES ref_lookup(lookup_type, code)`, `FOREIGN KEY (entity_id, department_id) REFERENCES org_unit(entity_id, department_id)`.
- **Unique Index**: `lower(email)`.

### Table 6: `rate_card` (Natural Composite Key)
- `vendor_id` (`TEXT NOT NULL REFERENCES vendor(vendor_id)`).
- `activity` (`TEXT NOT NULL CHECK (activity IN ('PICKUP','RETRIEVAL','RETURN','DESTRUCTION','STORAGE'))`).
- `effective_from` (`TEXT NOT NULL`), `effective_to` (`TEXT CHECK (effective_to IS NULL OR effective_to > effective_from)`).
- `rate_inr` (`NUMERIC NOT NULL CHECK (rate_inr >= 0)`), `unit` (`TEXT NOT NULL CHECK (unit IN ('PER_CARTON','PER_CARTON_MONTH'))`).
- **PK**: `(vendor_id, activity, effective_from)`.
- **Constraint**: `CHECK ((activity = 'STORAGE') = (unit = 'PER_CARTON_MONTH'))`.

### Table 7: `carton` (Denormalized Projection)
- `carton_id` (`TEXT PRIMARY KEY`), `entity_id` (`TEXT NOT NULL`), `department_id` (`TEXT NOT NULL`).
- `owner_user_id` (`TEXT NOT NULL REFERENCES app_user(user_id)`).
- `document_type` (`TEXT NOT NULL`), `archival_policy` (`TEXT NOT NULL`), `carton_created_date` (`TEXT NOT NULL`).
- `retention_trigger_date` (`TEXT`), `declared_file_count` (`INTEGER CHECK (declared_file_count >= 0)`).
- `assigned_vendor_id` (`TEXT REFERENCES vendor(vendor_id)`).
- `current_location_id` (`TEXT REFERENCES warehouse_location(location_id)`).
- `current_status` (`TEXT NOT NULL DEFAULT 'Created'`).
- `legal_hold_flag` (`INTEGER NOT NULL DEFAULT 0 CHECK (legal_hold_flag IN (0,1))`).
- `barcode` (`TEXT`), `remarks` (`TEXT`).
- **FK**: `(entity_id, department_id) REFERENCES org_unit(entity_id, department_id)`.

### Table 8: `file_index`
- `file_id` (`TEXT PRIMARY KEY`), `carton_id` (`TEXT NOT NULL REFERENCES carton(carton_id)`).
- `file_ref` (`TEXT NOT NULL`), `document_type` (`TEXT NOT NULL`), `file_description` (`TEXT`).
- `document_year` (`INTEGER CHECK (document_year BETWEEN 1000 AND 9999)`), `contains_pii` (`INTEGER NOT NULL DEFAULT 1 CHECK (contains_pii IN (0,1))`).

### Table 9: `request`
- `request_id` (`TEXT PRIMARY KEY`), `request_type` (`TEXT NOT NULL CHECK (request_type IN ('PICKUP','RETRIEVAL','RETURN','DESTRUCTION'))`).
- `carton_id` (`TEXT NOT NULL REFERENCES carton(carton_id)`), `raised_by` (`TEXT NOT NULL REFERENCES app_user(user_id)`).
- `raised_on` (`TEXT NOT NULL`), `vendor_id` (`TEXT NOT NULL REFERENCES vendor(vendor_id)`).
- `sla_due_date` (`TEXT`), `vendor_ack_on` (`TEXT`), `completed_on` (`TEXT`).
- `approved_by` (`TEXT REFERENCES app_user(user_id)`), `approved_on` (`TEXT`).
- `request_status` (`TEXT NOT NULL CHECK (request_status IN ('Open','In Progress','Completed','Rejected','Cancelled'))`).
- **Separation of Duties Check**: `CHECK (approved_by IS NULL OR approved_by <> raised_by)`.
- **Constraint**: `CHECK (request_type = 'DESTRUCTION' OR approved_by IS NULL)`.

### Table 10: `event_log` (Append-Only Audit Trail)
- `event_id` (`TEXT PRIMARY KEY`), `carton_id` (`TEXT NOT NULL REFERENCES carton(carton_id)`).
- `event_timestamp` (`TEXT NOT NULL`), `event_type` (`TEXT NOT NULL`).
- `from_location` (`TEXT REFERENCES warehouse_location(location_id)`), `to_location` (`TEXT REFERENCES warehouse_location(location_id)`).
- `actor_id` (`TEXT REFERENCES app_user(user_id)`), `request_id` (`TEXT REFERENCES request(request_id)`).
- `resulting_status` (`TEXT`), `remarks` (`TEXT`), `idempotency_key` (`TEXT UNIQUE`).
- **Triggers**: `protect_event_log_upd` & `protect_event_log_del` abort all `UPDATE` and `DELETE` attempts.

### Table 11: `legal_hold`
- `hold_id` (`TEXT PRIMARY KEY`), `carton_id` (`TEXT NOT NULL REFERENCES carton(carton_id)`).
- `matter_reference` (`TEXT NOT NULL`), `hold_reason` (`TEXT NOT NULL`), `raised_by` (`TEXT REFERENCES app_user(user_id)`).
- `hold_start_date` (`TEXT NOT NULL`), `hold_release_date` (`TEXT`).
- `hold_status` (`TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (hold_status IN ('ACTIVE','RELEASED'))`).
- **Constraint**: `CHECK ((hold_status = 'RELEASED') = (hold_release_date IS NOT NULL))`.

### Table 12: `vendor_declaration` (Merged Recertification & Destruction Evidence)
- `declaration_id` (`TEXT PRIMARY KEY`), `kind` (`TEXT NOT NULL CHECK (kind IN ('RECERT','DESTRUCTION_CERT'))`).
- `recert_cycle` (`TEXT`), `certificate_id` (`TEXT`), `carton_id` (`TEXT` — NO FK by design to capture raw vendor evidence).
- `vendor_id` (`TEXT NOT NULL REFERENCES vendor(vendor_id)`), `location_id` (`TEXT REFERENCES warehouse_location(location_id)`).
- `declared_status` (`TEXT`), `destroyed_on` (`TEXT`), `destruction_method` (`TEXT`).
- `witnessed_by` (`TEXT REFERENCES app_user(user_id)`), `declared_on` (`TEXT NOT NULL`), `notes` (`TEXT`).

### Table 13: `invoice_line` (Inlined Invoice Header per Line)
- `invoice_id` (`TEXT NOT NULL`), `line_no` (`INTEGER NOT NULL`), `vendor_id` (`TEXT NOT NULL REFERENCES vendor(vendor_id)`).
- `billing_month` (`TEXT`), `invoice_date` (`TEXT`), `invoice_status` (`TEXT`), `tax_rate_pct` (`NUMERIC`), `invoice_total` (`NUMERIC`).
- `line_type` (`TEXT`), `activity` (`TEXT`), `carton_id` (`TEXT REFERENCES carton(carton_id)`), `request_id` (`TEXT REFERENCES request(request_id)`).
- `quantity` (`NUMERIC`), `unit_rate` (`NUMERIC`), `line_amount` (`NUMERIC`).
- **PK**: `(invoice_id, line_no)`.

### Table 14: `recon_exception` (Unified Exception Register)
- `exception_id` (`TEXT PRIMARY KEY`), `stable_key` (`TEXT NOT NULL UNIQUE`).
- `exception_type` (`TEXT NOT NULL`), `severity` (`TEXT NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL'))`).
- `owner_role` (`TEXT NOT NULL`), `owner_user_id` (`TEXT REFERENCES app_user(user_id)`), `owner_vendor_id` (`TEXT REFERENCES vendor(vendor_id)`).
- `carton_id` (`TEXT REFERENCES carton(carton_id)`), `status` (`TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','INVESTIGATING','RESOLVED','ACCEPTED_RISK'))`).
- `first_detected_at` (`TEXT NOT NULL`), `last_detected_at` (`TEXT NOT NULL`), `resolution_reason` (`TEXT`).
- **Constraint**: `CHECK (status NOT IN ('RESOLVED','ACCEPTED_RISK') OR (resolution_reason IS NOT NULL AND trim(resolution_reason) <> ''))`.

### Table 15: `recon_finding` (Inlined Run Evidence, Append-Only)
- `finding_id` (`TEXT PRIMARY KEY`), `exception_id` (`TEXT NOT NULL REFERENCES recon_exception(exception_id)`).
- `run_id` (`TEXT NOT NULL`), `run_kind` (`TEXT NOT NULL CHECK (run_kind IN ('INVENTORY','INVOICE','CERTIFICATE','DATA_QUALITY'))`).
- `run_started_at` (`TEXT NOT NULL`), `run_status` (`TEXT NOT NULL CHECK (run_status IN ('RUNNING','COMPLETED','FAILED'))`).
- `finding_key` (`TEXT NOT NULL`), `rule_code` (`TEXT NOT NULL`), `evidence_json` (`TEXT NOT NULL CHECK (json_valid(evidence_json))`).
- **Unique**: `(run_id, finding_key)`.
- **Triggers**: `protect_finding_upd` & `protect_finding_del` enforce append-only immutability.

### Table 16: `import_row` (Inlined Batch Staging, Append-Only)
- `row_id` (`INTEGER PRIMARY KEY AUTOINCREMENT`), `batch_id` (`TEXT NOT NULL`), `source_name` (`TEXT NOT NULL`).
- `source_kind` (`TEXT NOT NULL CHECK (source_kind IN ('WORKBOOK','INVENTORY','INVOICE','CERTIFICATE'))`).
- `vendor_id` (`TEXT REFERENCES vendor(vendor_id)`), `uploaded_by` (`TEXT REFERENCES app_user(user_id)`).
- `sheet_name` (`TEXT NOT NULL`), `row_number` (`INTEGER NOT NULL CHECK (row_number > 0)`).
- `raw_values_json` (`TEXT NOT NULL CHECK (json_valid(raw_values_json))`).
- `issue_code` (`TEXT`), `issue_message` (`TEXT`), `disposition` (`TEXT CHECK (disposition IS NULL OR disposition IN ('ACCEPTED','REJECTED','WARNING','DUPLICATE'))`).
- `uploaded_at` (`TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))`).
- **Unique**: `(batch_id, sheet_name, row_number)`.
- **Triggers**: `protect_import_row_upd` & `protect_import_row_del` enforce append-only immutability.

### Operational Table: `app_session`
Created dynamically by `user_repo.js` to store web sessions:
- `token_hash` (`TEXT PRIMARY KEY`), `user_id` (`TEXT NOT NULL REFERENCES app_user(user_id)`).
- `created_at` (`TEXT NOT NULL`), `expires_at` (`TEXT NOT NULL`), `revoked_at` (`TEXT`).

### View: `carton_retention`
Calculates due dates dynamically from `ref_lookup`:
```sql
CREATE VIEW carton_retention AS
SELECT c.carton_id, c.entity_id, c.department_id, c.retention_trigger_date,
       rl.code AS policy_code, rl.numeric_value AS retention_years,
       CASE WHEN c.retention_trigger_date IS NOT NULL AND rl.code IS NOT NULL
            THEN date(c.retention_trigger_date, '+' || rl.numeric_value || ' years')
       END AS destruction_due_on,
       CASE WHEN c.retention_trigger_date IS NULL THEN 'MISSING_TRIGGER'
            WHEN rl.code IS NULL THEN 'MISSING_POLICY'
            ELSE 'CALCULATED' END AS calculation_status
FROM carton c
LEFT JOIN ref_lookup rl
  ON rl.lookup_type = 'RETENTION_POLICY'
 AND rl.code = c.document_type || '|' || c.archival_policy;
```

---

## 5. Lifecycle State Machine & Event Engine

### 5.1 Status Progression
```text
Created
  └── Pickup Requested (Business raises PICKUP)
        └── In Transit to Vendor (Vendor confirms collection at office branch)
              └── In Storage (Vendor confirms intake at warehouse facility)
                    ├── Retrieval Requested (Business raises RETRIEVAL)
                    │     └── With Business (Vendor confirms delivery)
                    │           └── Return Requested (Business raises RETURN)
                    │                 └── In Storage (Vendor confirms warehouse receipt)
                    └── Destruction Requested (Business raises DESTRUCTION)
                          └── Approved for Destruction (Compliance verifies & approves)
                                └── Destroyed [TERMINAL] (Vendor executes destruction)
```

### 5.2 Transition Invariants
- **Collection ≠ Warehouse Receipt**: Collection sets status to `In Transit to Vendor` and clears `current_location_id`. Warehouse receipt sets status to `In Storage` and assigns `current_location_id`.
- **Terminal Lock**: Once a carton reaches `Destroyed`, it can never transition to any other status.
- **Genesis Constraint**: `CARTON_CREATED` is only valid when no prior events exist for that carton.
- **Pre-Execution Hold Lock**: If a legal hold is applied *after* destruction approval, `POST /destroy` is blocked with `409 CONFLICT` upon physical execution.
- **Storage Billing Continuity**: Storage billing does not stop when destruction or retrieval is requested; it only terminates upon physical delivery or destruction.

---

## 6. Complete Implemented REST API (21 Endpoints)

All routes mounted under `/api/v1` except `/health`:

| Method | Path | Required Role | Description & Side Effect |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/login` | Public | Validates email & scrypt password. Issues HttpOnly session cookie. |
| `POST` | `/auth/logout` | Authenticated | Revokes session token in `app_session`. Clears cookie. |
| `GET` | `/auth/me` | Authenticated | Returns logged-in user profile, role, and scoping entity/dept/vendor. |
| `POST` | `/cartons` | `BUSINESS` | Registers new carton; generates `CARTON_CREATED` genesis event. |
| `GET` | `/cartons/:id` | Scoped | Retrieves carton metadata. Checked via `scope.assertCanViewCarton`. |
| `POST` | `/cartons/:id/files` | `BUSINESS` | Indexes physical file record; appends `FILE_INDEXED` event. |
| `GET` | `/cartons/:id/files` | Non-Vendor | Lists files in carton. **Throws 403 Forbidden for `VENDOR` role.** |
| `GET` | `/cartons/:id/history` | Scoped | Returns carton current state projection and full `event_log` array. |
| `GET` | `/cartons/:id/retention`| Scoped | Returns calculated due date and status from `carton_retention` view. |
| `POST` | `/requests` | `BUSINESS` | Raises `PICKUP`, `RETRIEVAL`, `RETURN`, or `DESTRUCTION`. Blocks on hold. |
| `GET` | `/requests/queue` | `VENDOR` | Lists pending requests assigned to logged-in vendor (`vendor_id`). |
| `POST` | `/requests/:id/acknowledge`| `VENDOR` | Acknowledges instruction (`REQUEST_ACKNOWLEDGED`). |
| `POST` | `/requests/:id/collect`| `VENDOR` | Confirms physical collection (`PICKED_UP_BY_VENDOR` -> `In Transit`). |
| `POST` | `/requests/:id/receive`| `VENDOR` | Confirms warehouse intake (`RECEIVED_AT_WAREHOUSE` -> `In Storage`). |
| `POST` | `/requests/:id/deliver`| `VENDOR` | Delivers retrieval (`DELIVERED_TO_BUSINESS` -> `With Business`). |
| `POST` | `/requests/:id/approve`| `COMPLIANCE`| Approves destruction. Enforces `approved_by != raised_by`. |
| `POST` | `/requests/:id/destroy`| `VENDOR` | Re-checks active holds. Executes destruction (`DESTROYED`). |
| `GET` | `/holds` | `COMPLIANCE` / `FACILITIES` | Lists legal holds. Supports `?active_only=true`. |
| `POST` | `/holds` | `COMPLIANCE`| Applies hold; sets `carton.legal_hold_flag = 1`. |
| `POST` | `/holds/:id/release` | `COMPLIANCE`| Releases hold with mandatory reason; clears flag if 0 active holds. |
| `POST` | `/reconciliations` | `FACILITIES`| Starts reconciliation run. SHA-256 fingerprinting guarantees dedup. |
| `GET` | `/reconciliations` | `FACILITIES`| Lists historical reconciliation runs with finding counts. |
| `GET` | `/exceptions` | Scoped | Lists exception cases. Vendors only see exceptions for their `vendor_id`. |
| `GET` | `/dashboard` | Authenticated | Returns role-scoped total cartons, open requests, and status counts. |
| `GET` | `/reference-data/vendors` | Authenticated | Lists all active storage vendors for dropdown forms. |
| `GET` | `/health` | Public | Liveness probe returning `{ status: "ok", database: "up" }`. |

---

## 7. What Is Currently Built vs. What Remains to Be Built

### 7.1 What Is Complete & Verified
- Complete 16-table SQLite DDL, seed data, and append-only triggers.
- Full zero-dependency Node.js backend (`server.js`, `router.js`, `routes.js`).
- Complete RBAC & row-level scope assertions (`scope.js`).
- Complete event engine with atomic state projection updates (`event_engine.js`).
- Full React 18 + Vite frontend with role-specific views and API proxying.
- Working automated test suite (`lifecycle.test.js`) passing 4/4 tests.

---

### 7.2 What Remains to Be Built (The Implementation Backlog)

#### Remaining Feature A: The Three Reconciliation Detection Engines
The run framework and exception tables exist, but the detection algorithms in `backend/src/services/recon_service.js` currently return stubbed results (`findings: 0`). The full engines to implement are:

1. **Inventory Reconciliation Engine (`run_kind = 'INVENTORY'`)**:
   - Compare `vendor_declaration` (where `kind = 'RECERT'`) against internal `carton` / `event_log` warehouse custody as of the declared timestamp.
   - Detect:
     - `MISSING_AT_VENDOR`: Carton is `In Storage` with that vendor in internal records, but absent from vendor declaration (Severity: HIGH, Owner: FACILITIES).
     - `UNKNOWN_TO_BANK`: Carton listed in vendor declaration does not exist in `carton` table (Severity: HIGH, Owner: FACILITIES).
     - `WRONG_WAREHOUSE`: Carton present in declaration but listed at a different warehouse `location_id` than internal records (Severity: MEDIUM, Owner: FACILITIES).

2. **Invoice Reconciliation Engine (`run_kind = 'INVOICE'`)**:
   - Pass 1 (Arithmetic): Verify line amount calculations (`quantity * unit_rate == line_amount`) and invoice total (`sum(line_amount) * 1.18 == invoice_total`). Detect `ARITHMETIC_MISMATCH` (Severity: HIGH, Owner: VENDOR).
   - Pass 2 (Contractual Rates): Cross-reference `unit_rate` against `rate_card` for that vendor and billing month. Detect `RATE_OVERCHARGE` (Severity: MEDIUM, Owner: VENDOR).
   - Pass 3 (Physical Events): Cross-reference storage charges against active warehouse custody intervals and handling fees against completed `request` records. Detect `STORAGE_AFTER_DESTRUCTION` (Severity: HIGH, Owner: VENDOR) and `UNAUTHORIZED_ACTIVITY_FEE` (Severity: MEDIUM, Owner: VENDOR).

3. **Certificate Reconciliation Engine (`run_kind = 'CERTIFICATE'`)**:
   - Cross-reference `vendor_declaration` (where `kind = 'DESTRUCTION_CERT'`) against `event_log` destruction events and historical `legal_hold` intervals.
   - Detect:
     - `DESTRUCTION_UNDER_LEGAL_HOLD`: Carton destroyed while an active legal hold was in effect (Severity: CRITICAL, Owner: COMPLIANCE).
     - `CERTIFICATE_REUSED`: Certificate number reused across different vendors or non-contiguous dates (Severity: HIGH, Owner: VENDOR).
     - `DESTROYED_WITHOUT_CERTIFICATE`: Carton status is `Destroyed` in `carton`, but no corresponding certificate is lodged in `vendor_declaration` (Severity: HIGH, Owner: VENDOR).
     - `CERTIFICATE_FOR_ACTIVE_CARTON`: Certificate lodged for a carton that is still active in storage (Severity: HIGH, Owner: FACILITIES).

#### Remaining Feature B: Lossless Excel Workbook Ingestion Pipeline
In `docs/2. prms_hackathon_dataset_v2.xlsx`, there are 8 sheets (1,600 cartons, 9,453 files, 3,876 requests, 11,068 events, 4,827 declarations, 21 invoices, 10,293 invoice lines, 215 certificates, 30 holds).
- **Task**: Implement a standalone ingestion script (`scripts/import_workbook.js`) that:
  1. Reads the workbook using an XLSX parser.
  2. Ingests raw rows into `import_row` with SHA-256 batch fingerprints.
  3. Validates and loads records into `carton`, `file_index`, `request`, `event_log`, `legal_hold`, `vendor_declaration`, and `invoice_line`.
  4. Records rejected or malformed rows in `import_row` (`issue_code`, `issue_message`, `disposition = 'REJECTED'`) without aborting the entire batch.

#### Remaining Feature C: Facilities User & Rate Card Management UI
- **User Management**: Backend repository `user_repo.upsert` exists, but there is no frontend screen for Facilities to create users, deactivate accounts, or change role assignments.
- **Rate Card Editor**: Add a screen to view and add contracted vendor rates with insert-time validation preventing overlapping `(effective_from, effective_to)` ranges for the same `(vendor_id, activity)`.

#### Remaining Feature D: Production Security Hardening
- **Anti-CSRF Header**: Implement an `X-PRMS-CSRF` custom header check on all mutating `POST` requests.
- **Login Rate Limiter**: Add in-memory or SQLite-backed throttling limiting failed attempts to 5 per 5 minutes per IP.
- **Enforced Session Secret**: Throw an error on process start in production if `PRMS_SESSION_SECRET` is unset.

