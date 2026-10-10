# Project Overview — Physical Records Management System (PRMS)

## 1. Executive Summary

The **Physical Records Management System (PRMS)** is an enterprise records governance and audit platform designed to track, control, and reconcile physical document cartons stored across external third-party archival facilities. In large-scale financial and enterprise settings (specifically banking environments), paper-based customer documentation, loan agreements, audit trails, and compliance records are stored off-site by third-party storage vendors. 

Historically, tracking these assets relied on disconnected spreadsheets, vendor-specific extranet portals, and email exchanges. This operational fragmentation created major compliance liabilities:
- **Zero custody visibility**: Uncertainty over whether a physical carton is in transit, held by a business department, or stored in a vendor warehouse.
- **Premature or delayed destruction**: Inability to systematically enforce policy-driven retention periods, leading to illegal disposal of required records or continuous storage fees for obsolete records.
- **Legal hold violations**: Destruction occurring while a carton is subject to litigation or regulatory discovery.
- **Vendor invoice leakage**: Vendor invoices being paid without independent mathematical validation or reconciliation against actual physical handling events and contractual rate cards.

PRMS provides a single, immutable, auditable system of record that unifies carton custody tracking, workflow approvals, legal hold enforcement, retention scheduling, and vendor evidence reconciliation.

---

## 2. Motivation and Problem Definition

### 2.1 The Business Problem
Enterprise organizations, particularly regulated financial entities, manage tens of thousands of physical records cartons. The target estate encompasses:
- Multiple legal entities (e.g., Branch Banking, Mutual Fund, Global Capability Center).
- Multiple regional departments per entity (e.g., Delhi Branch, Mumbai Branch, MF Operations, Compliance, HR).
- Multiple outsourced archiving vendors (e.g., SecureVault Storage, RecordSafe India, ArchivePro Logistics).
- Dispersed vendor warehouse facilities across multiple metropolitan locations (Mumbai, Delhi NCR, Pune, Kolkata, Chennai, Bengaluru).

### 2.2 Operational Vulnerabilities Addressed
1. **Unverifiable Custody Handoffs**: When a carton is collected from an office branch, collection is often conflated with warehouse receipt. In PRMS, **collection** and **warehouse receipt** are distinct events with their own operational timestamps, actors, and custody implications.
2. **Destruction Compliance & Separation of Duties**: Business units cannot unilaterally authorize records destruction. Destruction requires independent Compliance verification, and the requester cannot be the approver.
3. **Legal Hold Overrides**: When regulatory authorities or courts issue holds on specific matters, destruction must be halted immediately—even if destruction was previously approved and scheduled.
4. **Discrepant Vendor Billing**: Off-site storage vendors bill monthly storage charges and per-activity fees (pickup, retrieval, return, destruction). Without cross-referencing invoice lines against event logs and agreed rate cards, organizations systematically overpay for non-existent activities or for cartons that were already destroyed.

---

## 3. Project Objectives

1. **Immutable Event-Driven Auditability**: Record every carton interaction (registration, pickup, transit, warehouse receipt, retrieval, delivery, return, hold, destruction) in an append-only event log protected by database triggers.
2. **Strict Role-Based and Row-Level Scoping**: Enforce four distinct user personas (Business, Vendor, Compliance, Facilities) with strict server-side scoping so departments only access their own cartons, and vendors only access their assigned workflows.
3. **Automated Policy-Driven Retention Calculation**: Compute exact destruction eligibility dates through a dynamic view joining carton document metadata against regulatory retention rules.
4. **Bulletproof Legal Hold Enforcement**: Prevent destruction at both the request stage and the physical execution stage whenever an active legal hold exists.
5. **Multi-Way Vendor Reconciliation**: Provide a structured framework for Facilities to detect inventory mismatches, invoice line calculation errors, and missing destruction certificates.
6. **Zero-Dependency Lightweight Architecture**: Deliver maximum performance, determinism, and portability using Node.js built-in runtime capabilities (`node:sqlite`, `node:http`, `node:crypto`) without third-party framework overhead.

---

## 4. User Roles and Permission Matrix

The application strictly defines and enforces four user roles with distinct scope types:

| Role Code | Role Name | Scope Type | Scope Boundary | Primary Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| `BUSINESS` | Business User | `DEPARTMENT` | Single `(entity_id, department_id)` | Registers cartons; indexes individual files; submits operational requests (pickup, retrieval, return, destruction); monitors department inventory. |
| `VENDOR` | Vendor User | `VENDOR` | Assigned `vendor_id` | Monitors assigned operational request queue; confirms pickup collections, warehouse receipts, and retrieval deliveries; executes approved destructions; lodges certificates. Forbidden from viewing carton file contents. |
| `COMPLIANCE` | Compliance Officer | `GLOBAL` | Cross-entity / Enterprise | Places and releases legal holds; reviews and independently approves or rejects destruction requests; inspects audit history across all entities. |
| `FACILITIES` | Facilities Team | `GLOBAL` | Cross-entity / Enterprise | Manages vendor relationships, rate cards, and warehouses; initiates and reviews reconciliation runs; monitors billing and inventory exceptions. |

### Role Capabilities Matrix

| Capability | BUSINESS | VENDOR | COMPLIANCE | FACILITIES |
| :--- | :---: | :---: | :---: | :---: |
| Authenticate / Manage Session | Yes | Yes | Yes | Yes |
| View Carton Metadata | Yes (Own Dept) | Yes (Own Vendor) | Yes (All) | Yes (All) |
| View File Index / PII Details | Yes (Own Dept) | **No (Forbidden 403)** | Yes (All) | Yes (All) |
| Register Carton | Yes | No | No | No |
| Index Files into Carton | Yes (Own Dept) | No | No | No |
| Raise Pickup / Retrieval / Return | Yes (Own Dept) | No | No | No |
| Raise Destruction Request | Yes (Own Dept) | No | No | No |
| Acknowledge / Collect Request | No | Yes (Own Vendor) | No | No |
| Confirm Warehouse Receipt | No | Yes (Own Vendor) | No | No |
| Deliver Retrieval to Business | No | Yes (Own Vendor) | No | No |
| Approve Destruction | No | No | **Yes (Requester != Approver)** | No |
| Execute Destruction | No | Yes (Own Vendor) | No | No |
| Apply / Release Legal Hold | No | No | Yes | No |
| View Legal Holds | No | No | Yes | Yes |
| Trigger Reconciliation Run | No | No | No | Yes |
| View Exceptions & Findings | Scoped (Dept) | Scoped (Vendor, Redacted) | Yes (All) | Yes (All) |
| View Scoped Dashboard Metrics | Scoped (Dept) | Scoped (Vendor) | Global | Global |

---

## 5. Functional Requirements

### 5.1 Authentication & Session Management
- Authenticate users via email and password using standard JSON POST.
- Hash and verify passwords using Node.js native `crypto.scrypt` with random cryptographic salts.
- Issue opaque, cryptographically random session tokens (32 bytes base64url) transmitted via secure `HttpOnly` cookies.
- Store session state hashed with SHA-256 in an operational `app_session` table with automatic TTL expiration.

### 5.2 Carton Registration & File Indexing
- Register cartons with required metadata: `carton_id`, `entity_id`, `department_id`, `document_type`, `archival_policy`, `carton_created_date`, and optional `retention_trigger_date`, `barcode`, and `declared_file_count`.
- Automatically generate the initial `CARTON_CREATED` audit event.
- Allow Business users to index physical file records (`file_ref`, `document_type`, `document_year`, `contains_pii`, `file_description`) attached to a carton.
- Guard file contents from Vendor users to prevent PII/confidential data leaks.

### 5.3 Physical Lifecycle Management
- Support four request types: `PICKUP`, `RETRIEVAL`, `RETURN`, and `DESTRUCTION`.
- Transition cartons through strict lifecycle states:
  - `Created` -> `Pickup Requested` -> `In Transit to Vendor` -> `In Storage`
  - `In Storage` -> `Retrieval Requested` -> `With Business` -> `Return Requested` -> `In Storage`
  - `In Storage` -> `Destruction Requested` -> `Approved for Destruction` -> `Destroyed`
- Disallow invalid state transitions (e.g., collecting a carton that was never requested for pickup).
- Disallow any transition out of the terminal `Destroyed` state.

### 5.4 Retention Scheduling
- Calculate destruction eligibility dates (`destruction_due_on`) via the `carton_retention` database view.
- Resolve retention periods dynamically based on `document_type` and `archival_policy` combinations stored in `ref_lookup`.
- Flag records missing a retention trigger as `MISSING_TRIGGER` or missing policies as `MISSING_POLICY` without fabricating false dates.
- Automatically recompute retention dates across the entire dataset when policy parameters are modified in `ref_lookup`.

### 5.5 Legal Hold Management
- Allow Compliance officers to place legal holds against specific cartons by providing a `matter_reference` and `reason`.
- Set `legal_hold_flag = 1` on the carton record.
- Block destruction requests on cartons with an active hold (HTTP 409 Conflict).
- Re-check legal holds upon physical destruction execution to prevent disposal even if a hold was applied after approval.
- Allow Compliance officers to release holds with a mandatory audit reason. Automatically clear `legal_hold_flag = 0` only when zero active holds remain on that carton.

### 5.6 Reconciliation & Exception Management
- Provide Facilities with the ability to initiate reconciliation runs (`INVENTORY`, `INVOICE`, `CERTIFICATE`, `DATA_QUALITY`).
- Enforce run idempotency using deterministic SHA-256 fingerprinting based on run kind, scope, and parameters.
- Provide a unified `recon_exception` register with severity ratings (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), ownership attribution, and resolution tracking.
- Protect reconciliation findings using database triggers to ensure audit integrity.

---

## 6. Non-Functional Requirements

| Requirement | Implementation Detail |
| :--- | :--- |
| **Zero Runtime Dependencies** | The backend relies solely on Node.js core modules (`node:sqlite`, `node:http`, `node:crypto`, `node:fs`, `node:path`). No external npm runtime packages are required for the server. |
| **Data Integrity & Consistency** | All state-modifying actions execute within `tx()` wrapping `BEGIN IMMEDIATE` transactions, ensuring atomic updates across both event logs and carton projections. |
| **Audit Immutability** | Database triggers prevent `UPDATE` and `DELETE` queries on `event_log`, `import_row`, and `recon_finding` tables. |
| **Idempotency** | Every state-changing command accepts or generates a deterministic `idempotency_key`. Retrying identical commands returns the original event without duplicating operations. |
| **Security & Privacy** | Passwords stored with scrypt; session tokens hashed with SHA-256; PII hidden from vendors; database queries parameterized to prevent SQL injection. |
| **Performance & Concurrency** | SQLite configured in Write-Ahead Logging (`WAL`) mode with `busy_timeout = 5000` to support concurrent readers and serialized writers. |

---

## 7. Scope & Current Implementation Boundaries

### 7.1 What is Implemented and Verified
- Complete consolidated 16-table schema with triggers, constraints, and views.
- Reference seed data covering roles, scope types, document types, archival policies, retention rules, carton statuses, event types, SLAs, thresholds, GST tax rules, holidays, organizational units, vendors, warehouses, and rate cards.
- Complete backend REST API (21 endpoints across auth, cartons, files, requests, vendor queues, holds, reconciliation, dashboards, and reference data).
- Full role-based authentication and row-level authorization middleware.
- Full event engine with atomic transitions, idempotency, and terminal state protection.
- React + Vite + TypeScript frontend with role-specific navigation, interactive workflows, and API proxying.
- Automated test suite covering password security, reference lookups, hold-blocking behavior, and dynamic retention calculation.

### 7.2 What is Planned / Documented Future Increment
- **Automated Detection Engines**: The reconciliation framework and exception tables are implemented, but automated scanning algorithms comparing vendor inventory feeds, calculating invoice arithmetic discrepancies, and cross-referencing destruction certificates against event timestamps are stubs.
- **Direct Excel Importer**: The `import_row` schema exists, but an automated XLSX parser reading `prms_hackathon_dataset_v2.xlsx` is not yet wired up.
- **Rate Window Overlap Validator**: Non-overlapping rate card date checks are designed for the application layer but not yet implemented in a reference management route.

