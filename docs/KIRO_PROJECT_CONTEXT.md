# PRMS — complete project context and implementation instructions for Kiro

Use this file as the project's working brief. Read it together with the original source materials and the supplied database package before designing or coding.

## 1. Your role and working method

Act as our technical lead, project mentor and implementation partner. Help our student team build a working **Physical Records Management System (PRMS)** incrementally.

Do not generate a large, disconnected codebase in one pass. Work in phases, keep the application runnable, connect the frontend to real backend services early, and verify each phase before moving on.

Start by inspecting the repository and source documents. Preserve existing working code and user changes. Do not assume a feature exists just because it appears in this brief or a diagram. Distinguish planned, implemented and verified behavior.

Ask up to five essential questions only if their answers materially change scope, stack, access or delivery. Continue useful nonblocked work with explicitly labelled defaults. Do not repeatedly ask permission for ordinary reversible development work. Do not deploy publicly, modify production data, send external messages, purchase services or expose credentials without authorization.

At each phase:
1. State the goal, dependencies and acceptance criteria.
2. Identify the files and interfaces affected.
3. Implement the smallest complete increment.
4. Run relevant tests against the real database where database behavior matters.
5. Show a short working demonstration or exact verification commands.
6. Record what passed, what failed and what remains unimplemented.
7. Update the task checklist and decision log, then continue to the next unblocked phase.

## 2. Project purpose

The bank's physical records are packed into cartons and stored by external vendors. Current management relies on spreadsheets, emails and separate vendor portals, leading to poor traceability, missed retention actions, legal-hold risks and billing discrepancies.

PRMS must provide a single, auditable record of:
- Which department owns a carton and its indexed files.
- Where the carton physically is and who moved it.
- Requests, vendor confirmations, approvals and legal holds.
- When records become eligible for destruction.
- Whether vendor inventory, invoices and destruction certificates agree with internal evidence.

The wider estate described in the brief contains approximately 50,000+ cartons across 3 entities, 13 departments, 3 vendors and 6 warehouse locations. The supplied sample is smaller. Do not claim large-scale performance without measurement.

This is management of **physical records**, not a digital document management or OCR project. The policy and dataset are synthetic hackathon materials, not real legal guidance or real customer data.

## 3. Files to inspect first

Place these files in the repository's reference directory or provide their actual paths:

1. `2026 Use Case - Physical Records Management System vfinalc0d4814.pdf`
2. `2. prms_hackathon_dataset_v2.xlsx`
3. `3. records_retention_policy_reference.docx`
4. `PRMS_Database_Design.zip`, extracted as `PRMS_Database_Complete/`

Within the workbook, start with `README`, `data_dictionary`, `column_dictionary`, then inspect all reference and operational sheets.

Within the database package, inspect:
- `README.md` and `START_HERE.html`
- `docs/DATABASE_GUIDE.md`
- `docs/COLUMN_DICTIONARY.md`
- `docs/RELATIONSHIPS.md`
- `docs/OPERATION_TABLE_MAP.md`
- `docs/VALIDATION.md`
- `sql/01_schema.sql`
- `sql/02_seed_reference.sql`
- `sql/03_runtime_grants.sql`
- `sql/04_constraint_checks.sql`
- `mermaid/` and `diagrams/`

If a file is missing, state exactly which one. Continue with available evidence without claiming to have inspected missing content. Do not invent data, passwords, organizer answers or expected reconciliation counts.

### Source precedence

Original materials define requirements, but contain conflicts. Record conflicts explicitly; do not silently choose whichever source is easiest. Confirmed organizer clarification takes precedence. The database design is a proposed implementation foundation, not an authority that overrides the brief. Improve it through reviewed migrations when necessary.

### Known workbook counts

These are source rows, not validated unique records:

| Sheet | Rows |
|---|---:|
| carton_inventory | 1,600 |
| file_index | 9,453 |
| requests | 3,876 |
| event_log | 11,068 |
| vendor_recertification_feed | 4,827 |
| vendor_invoices | 21 |
| vendor_invoice_lines | 10,293 |
| destruction_certificates | 215 |
| legal_holds | 30 |

The workbook says it was generated as of 2026-08-01. Historical reconciliation must use artifact-specific timestamps, not automatically today's date.

## 4. Team and delivery assumptions

Names, skill levels, deadline, weekly availability, required hosting and final judging time have not been confirmed.

Provisional planning baseline: four members, six weeks, 15 hours per member per week, 360 person-hours capacity, approximately 272 hours planned work and 88 hours reserve. This is not a committed schedule.

| Placeholder | Responsibility | Typical reviewer |
|---|---|---|
| A | Backend, authentication, event engine, lifecycle and integration | C |
| B | Frontend, Business/Vendor workflows, dashboards and integration | A or D |
| C | Imports, retention, holds, cost engine and inventory reconciliation | A |
| D | CI, Compliance/Facilities screens, invoice/certificate reconciliation and delivery | C or B |

Give each task one accountable owner and one non-author reviewer. Pair inexperienced members on real features. Everyone tests their own work. Adjust assignments after learning actual skills and availability.

## 5. Scope and definition of success

### Required MVP / submission

1. Four-role authentication and server-side access control.
2. Repeatable ingestion of the supplied workbook, with rejected-row reporting.
3. Carton registration and file indexing.
4. Pickup, collection, warehouse receipt, retrieval, return and destruction workflow.
5. One append-only event log with readable carton history.
6. Policy-driven retention dates and actionable alerts.
7. Compliance-controlled legal holds and independent destruction approval.
8. All THREE reconciliations: inventory, invoices and destruction certificates.
9. One exception register with severity, owner, evidence and aging.
10. Role-specific dashboards, filters, drill-down and scoped exports.
11. Facilities user administration and authorized reference maintenance.
12. Reproducible setup, tests, documentation, demo and backup plan.

### Optional after required behavior works

Natural-language search, richer SLA trends, advanced stalled-state analytics, barcode simulation, PDF report polish and large-scale performance work. Basic overdue alerts required by workflows still belong in the required implementation.

### Out of scope

OCR, scanned document viewer, digital archives, external vendor portal integration, live courier tracking, scanner/RFID hardware, microservices, Kubernetes and paid AI dependencies.

### Acceptance targets

- All seven acceptance criteria in the source brief can be demonstrated.
- Every relevant committed command appends the appropriate event(s) atomically with projections.
- Retrying the same command does not duplicate an action or event.
- Event replay reproduces current state and historical custody.
- A policy edit changes calculated retention dates without code edits.
- A legal hold blocks destruction even when applied after approval.
- Business users cannot access other departments; vendor users cannot access other vendors, costs or carton contents.
- Repeated reconciliation on unchanged evidence does not duplicate findings.
- Later cycles age existing exceptions rather than recreate them.
- Every rejected row/finding has traceable evidence.
- Installation succeeds from a clean checkout. List/filter responses target under two seconds on the supplied sample and documented hardware; measure rather than promise.

## 6. Application roles and permissions

### Business User
Own entity/department scope only. Register cartons, index files, raise pickup/retrieval/return/destruction requests, view scoped history and alerts. Cannot approve destruction, manage holds, confirm vendor operations or edit history.

### Vendor User
Own vendor code only. View assigned operational requests, acknowledge, confirm collection and warehouse receipt separately, deliver retrievals, receive returns, execute authorized destruction and lodge certificate evidence. May submit own inventory declaration. Never expose carton contents, rates, costs or other vendors' work.

### Compliance Officer
Cross-entity compliance scope. Apply/release holds, record matter/reason/owner, approve or reject destruction, inspect history and critical findings. Cannot raise destruction requests, execute physical operations or edit history. Requester and approver must be different individuals.

### Facilities Team
Cross-entity monitoring, reconciliation, financial review, exception investigation, user access administration and permitted vendor/location/rate/SLA maintenance. Cannot initiate Business requests, approve destruction, manage holds, confirm physical work or alter event history.

A vendor-owned dispute does not authorize vendor access to financial details. Separate exception ownership from visibility. Retention-policy editing authority needs an explicit decision; the source policy names a Records Management Office that is not a fifth application login role.

## 7. Lifecycle and business rules

### Normal journey
Business registers carton/files → requests pickup → Vendor acknowledges → confirms collection → carton is in transit → Vendor confirms warehouse receipt → carton is in storage.

Business requests retrieval → Vendor confirms delivery → carton is with Business → Business requests return → Vendor confirms warehouse receipt → carton returns to storage.

### Destruction journey
Policy-derived retention expires → Business requests destruction → Compliance verifies and approves → Vendor rechecks eligibility → Vendor executes destruction → certificate evidence is recorded.

Check retention, active holds, physical warehouse custody, approval and terminal state on the server. Recheck at execution, not only when the request is first submitted. A destroyed carton cannot resume physical operations.

### Important distinction
Workflow status and physical custody are separate. `Destruction Requested` and `Approved for Destruction` can both have `WAREHOUSE` custody. Storage billing must not stop merely because a request changed workflow status.

### Rules
- Collection alone is never warehouse receipt.
- Retention date = trigger date + years from applicable document-type/archival-policy rule.
- Missing trigger or policy produces a data-quality finding; do not substitute creation date by default.
- One carton contains one document type; preserve historical mismatches as source evidence and findings.
- Legal holds block destruction but permit otherwise valid retrieval/return/movement.
- Only Compliance applies/releases holds; release requires date, actor and reason for new actions.
- New destruction requests come from Business, approvals from independent Compliance users.
- No client-provided authoritative status, calculated retention date, approver identity or ownership scope.
- SLA calculations exclude weekends and supplied holidays. Destruction starts at approval, not submission. Open overdue requests can breach too.
- Billing uses effective rates for the service period and decimal arithmetic.
- Supplied tax is 18%; configure its covered date range explicitly.
- Certificates and associated disposal evidence are retained for the synthetic policy's ten-year period; no purge feature is needed.

## 8. Source conflicts: keep visible

| Issue | Interim handling |
|---|---|
| Policy: three business days in transit; workbook: 30 calendar days suspected-loss threshold | Distinguish operational delay from stalled/loss finding. Use configurable rules and confirm interpretation |
| Destruction SLA: approval-to-certificate versus separate execution and certificate windows | Store execution and certificate timestamps; supplied workbook definition is provisional KPI basis |
| Certificate reuse across batches/dates versus legitimate vendor/month batches | Accept repeated IDs within legitimate batches; flag cross-vendor/month misuse; confirm finer date semantics |
| No return rate in supplied rate card | Report missing rate; do not use zero or pickup rate |
| Historical events predate available rate/holiday coverage | Mark calculations incomplete; do not invent historical coverage |
| Entity-specific retention and vendor-specific SLAs requested, but reference sheets are more general | Support scoped overrides with supplied global defaults; do not invent overrides |
| Brief mentions 180-day escalation not defined in supplied policy | Record unresolved; do not invent the rule |
| Policy editing authority unspecified among four roles | Explicit product decision; no blanket admin permission |
| Terminal carton history versus later certificate issue | Separate physical terminal events from certificate evidence stream; confirm intended source interpretation |
| Date-only hold/release versus timestamped destruction | Preserve precision; treat same-day ordering ambiguity explicitly |
| Partial-month and cross-vendor storage charges | Provisional one carton/vendor/month when warehouse custody overlaps month; confirm proration/transfer terms |

Record each decision, rationale, source and affected tests in `docs/decisions.md`. Reversible defaults must be labelled; destructive actions should fail safely when eligibility is unresolved.

## 9. Recommended technology stack

Unless repository requirements or confirmed team skills indicate otherwise:
- Frontend: React + Vite; TypeScript if the team can support it.
- Backend: Python + FastAPI.
- Database: PostgreSQL 16+ with `btree_gist` available.
- Persistence: SQLAlchemy + Alembic.
- Authentication: properly hashed passwords, server-side sessions, secure HttpOnly cookies and CSRF protection.
- Imports: maintained XLSX reader with explicit row validation.
- Tests: pytest for rules/API/database; a small browser smoke suite for critical journeys.
- Optional Docker Compose for local PostgreSQL and consistent development startup.
- One repository and modular monolith. Separate HTTP handling, business services and data access.

Pin compatible dependency versions, verify documentation for the selected versions, and explain any stack changes. If the team already knows Spring Boot, prefer existing skills over unnecessary framework changes.

## 10. Existing database foundation

The supplied package contains **37 tables and 82 foreign-key relationships**, a derived retention view, indexes, evidence immutability triggers, reference seeds and constraint checks. DDL/seed/checks were executed successfully using embedded PostgreSQL through PGlite. This is NOT proof that application services, authorization, operational imports or reconciliation are implemented. Validate against the project's actual PostgreSQL environment as well.

### Tables

| Group | Tables |
|---|---|
| Organization / identity | business_entity, department, vendor, warehouse, app_user, user_session |
| Reference data | document_type, archival_policy, retention_policy, vendor_rate, sla_rule, holiday, threshold_rule, tax_rule, carton_status, event_type, lifecycle_transition |
| Import evidence | import_batch, import_row, import_issue |
| Records / workflow | carton, file_record, service_request |
| Events / projections | event_log, carton_state, custody_interval, legal_hold |
| Vendor evidence | vendor_declaration, vendor_declaration_item, vendor_invoice, vendor_invoice_line, certificate_evidence |
| Reconciliation / alerts | reconciliation_run, expected_charge, exception_case, reconciliation_finding, alert |

The `carton_retention` view computes due dates; it is not a table.

### Essential design invariants
- One event log is canonical; do not add a second competing audit log.
- `event_log` supports carton and non-carton streams for configuration, users, certificates, exceptions and reconciliation.
- Status/location/hold summaries are rebuildable projections, not independent truth.
- Event payload schemas must include enough initial and changed facts to replay state. Historical incomplete metadata needs explicit provenance-bearing migration baselines.
- Preserve source IDs as text; use generated bigint for internal evidence identities.
- Use date for dates and timestamptz for instants. Assume naive source times are Asia/Kolkata until confirmed; preserve raw values and precision.
- Store money in numeric/decimal, never float.
- Rates and custody intervals use half-open ranges. Convert source inclusive rate end dates to exclusive end dates.
- Optional entity-specific retention and vendor-specific SLA overrides take precedence over global defaults.
- User scope shape is constrained in SQL; actual permission and active-user checks remain server responsibilities.
- Raw vendor carton/request references intentionally lack operational FKs. Unknown/malformed evidence is a reconciliation input, not something to discard.
- Repeated certificate IDs are legitimate across cartons within an allowed batch.
- Imported actor references may be vendor codes rather than login user IDs. Do not invent users to satisfy them.
- Runtime database credentials must be non-owner and non-superuser. End users never receive direct SQL access.

The SQL is an initial migration for an empty database, not an idempotent reset script. Reference seed is separate from the operational workbook importer. If adapting to Alembic, make one clear migration authority; do not independently run duplicate schema-creation mechanisms.

## 11. Events, transactions and concurrency

For a state-changing command:
1. Authenticate active user; validate role, row scope and field permissions.
2. Begin transaction and lock the carton row. Hold, movement and destruction commands must share the same lock discipline.
3. Check idempotency key and input fingerprint. Same key with different input is an error.
4. Validate expected version and all business prerequisites against current server state.
5. Append the event(s), actor/request/channel evidence and rule snapshots.
6. Update projections and related request/hold/custody records atomically.
7. Commit; return result. On error, roll back all changes. For an already committed retry, end the transaction and return the original result.

Replay by occurrence time with a documented deterministic tie-breaker; do not treat source event ID as chronological order. Preserve recorded time separately. NULL resulting_status means unchanged, not unknown or deleted status. Metadata and holds must not reset state_since or custody intervals unnecessarily.

Do not resurrect a destroyed carton due to a corrupt historical event. Preserve the event, raise a finding and apply terminal-state rules. Corrections append compensating evidence referencing the original event through an authorized reviewed process.

The existing DDL protects append-only records but does not itself implement the complete reducer or business command functions. Test rollback, duplicate submission, concurrent hold/destruction and stale version handling explicitly.

## 12. Lossless ingestion

Never edit the original workbook. Preserve exact source artifacts and every populated row with file hash, sheet name, row number, original values and type/precision information.

Import order:
1. Create/reuse file fingerprint and preserve raw rows.
2. Load reference data and provision imported identities without invented passwords.
3. Load valid carton/file/request metadata; retain conflicts and invalid rows with issues.
4. Import attributable events with stable idempotency keys and source references.
5. Reconcile legal-hold rows with existing hold events; avoid duplicate reconstructed holds.
6. Replay projections and compare supplied cached status/location/hold values.
7. Store vendor declarations, invoices and certificate evidence separately.
8. Produce per-sheet accepted/rejected/duplicate counts with evidence references.

Handle actual workbook formats: stale ref_locations alias, Jan-2026 month strings, title-case activity/line labels, blank rows, duplicate identifiers, missing trigger dates, orphan vendor references and historical actor types. Avoid failing the whole batch because a planted bad row violates a strict canonical constraint.

Never claim historical facts unsupported by the sources. If adding migration events to represent independently supplied hold/master evidence, label provenance and missing precision honestly. Synthetic test fixtures are allowed for tests but must not be presented as real supplied data or used to inflate demo results. A dataset generator is referenced by the workbook, but its actual availability must be checked.

## 13. Reconciliation requirements

Facilities explicitly selects reconciliation type and period/artifact, runs it and sees recorded results. All runs record who, when, parameters, input fingerprint, rule snapshot, counts and status.

### Inventory reconciliation
Compare vendor declaration with internal custody at exact declared_at. Detect:
- Missing at vendor: High, Facilities.
- Unknown to us: High, Facilities.
- Wrong warehouse: Medium, Facilities.

### Invoice reconciliation
Pass 1 validates invoice arithmetic against its own lines. Pass 2 compares with independently calculated event/request/rate-based costs. Detect:
- Header/line arithmetic disagreement: High, Vendor.
- One monthly storage line charging multiple months: Medium, Vendor.
- Charges exceeding contract: Medium, Vendor.
- Activity without instruction/reference: Medium, Vendor.
- Storage after destruction month: High, Vendor.
- Storage/activity mismatch with event evidence: Medium, Facilities.
Also surface undercharges and source-quality issues when supported by evidence. Do not infer charges from the vendor invoice itself.

### Certificate reconciliation
Compare certificate, request, destruction event and historical hold interval. Detect:
- Destruction under active hold: Critical, Compliance.
- Certificate reused across vendors/months: High, Vendor.
- Destroyed but no certificate lodged: High, Vendor.
- Certificate for carton never destroyed: High, Facilities.
- Physical action after destruction: High, Facilities.
- Certificate/event destruction date mismatch: Medium, Vendor.

### Idempotency and continuity
Same kind + scope + unchanged input/rule fingerprint returns the existing run. A changed evidence/rule set creates an identifiable new run. Persist findings in one exception register; do not create a separate register per reconciliation.

Stable exception keys must not include cycle/run ID for continuing inventory discrepancies. Preserve first discovery; advance last observed cutoff without regressing when an older cycle is run. Findings keep immutable evidence per run. Resolve/reopen through documented rules and recorded reasons. Test legitimate examples to prevent false positives, especially valid certificate batches.

## 14. API and UI contracts

Agree contracts before parallel frontend/backend work. Use a versioned API prefix, clear schemas, pagination, stable IDs, normalized enums, explicit date conventions, standard errors and idempotency headers/keys.

Suggested endpoint families: `/auth`, `/users`, `/cartons`, `/cartons/{id}/files`, `/cartons/{id}/history`, `/requests`, request-specific acknowledge/collect/receive/deliver/approve/reject/destroy actions, `/holds`, `/imports`, `/reconciliations`, `/exceptions`, `/dashboard`, `/exports`, `/reference-data`.

Do not expose arbitrary status updates or a public append-any-event endpoint. Use action-specific service commands. Standard error shape: code, message, field errors where relevant and correlation ID. Failures must explain permitted details without leaking another department/vendor's data.

Required screens:
- Shared: login, role navigation, accessible forms, loading/empty/error states.
- Business: dashboard, carton registration/detail, file index, requests, alerts, history.
- Vendor: own request queue, acknowledgment/action confirmations, inventory upload, certificate evidence.
- Compliance: hold register, approval queue, history and critical exceptions.
- Facilities: estate dashboard, import report, reconciliation runs, exception investigation, financial review, users and authorized reference maintenance.

Prioritize usable forms/tables and clear errors over decorative UI. Never mock a successful backend action after the real call fails.

## 15. Repository and collaboration

Suggested structure:
```text
frontend/
backend/app/api/
backend/app/services/
backend/app/models/
backend/app/repositories/
backend/tests/
backend/migrations/
scripts/
reference/
docs/requirements.md
docs/design.md
docs/tasks.md
docs/decisions.md
docs/demo.md
.github/workflows/
.github/pull_request_template.md
.env.example
README.md
```

Use one issue per small task, short-lived branches such as feat/T15-retention, meaningful commits and small reviewed PRs. One non-author review and passing checks before main merge. Coordinate migrations and API changes explicitly. Do not overwrite teammates' changes or resolve conflicts blindly.

Definition of done: acceptance criteria met, relevant positive/negative tests pass, authorized server behavior verified, migrations/configuration/docs updated, no secrets, reviewed and integrated against the real database/API.

Daily update: Completed / Next / Blocked / Help needed / PR or demo link. Twice-weekly integration demo; weekly milestone review. Ask for help after two focused blocked hours; pair or reassign after one working day.

## 16. Step-by-step implementation plan

Produce dependency-linked tasks of roughly 4–12 person-hours. Estimates are effort, not elapsed time. Re-estimate based on actual team skills and repository state.

### Phase 0 — inspect and specify
Read all source materials and repository instructions. Create requirements, design, task checklist, permissions matrix and decision log. Map every required criterion to implementation tasks and tests. Identify existing versus missing components. Agree stack and unresolved business interpretations.
Exit: understandable, source-traceable plan; no fabricated requirements or findings.

### Phase 1 — foundation and reference data
Create runnable app skeleton, migrations, PostgreSQL setup, reference seed, environment template, health check and basic CI. Provision credentials outside Git. Establish API/error conventions.
Exit: clean checkout starts; migrations and reference checks pass on project PostgreSQL.

### Phase 2 — authentication and early vertical slice
Implement sessions, scope enforcement, event append/replay and carton registration. Build Business pickup request and Vendor acknowledgment, collection and warehouse receipt screens/APIs.
Exit: Business login → create carton → request pickup → Vendor collect → receive → history. Data persists after restart; collection is visibly distinct from storage.

### Phase 3 — operational data and remaining lifecycle
Implement lossless workbook importer and projection comparison. Add file indexing, retrieval and return with server transitions, destination validation and history.
Exit: repeat imports do not duplicate; bad rows are reported; retrieval/return works on real data and own-scope permissions.

### Phase 4 — compliance
Implement retention view use, alert refresh/deduplication, holds, release, independent approval, destruction and certificate evidence.
Exit: policy edits recompute; missing trigger alerts; held destruction and self-approval denied; concurrent hold/execution tested; terminal state protected.

### Phase 5 — Facilities reconciliation
Build shared run/exception framework, as-of inventory comparison, cost engine, invoice arithmetic and independent matching, certificate reconciliation and investigation screens.
Exit: all three reconciliations produce evidence-backed findings; valid controls avoid false positives; reruns/later periods behave correctly.

### Phase 6 — administration and reporting
Finish role dashboards, scoped drill-down/export, user deactivation, authorized reference maintenance, business-day/overdue rules and operational error handling.
Exit: counts tie to filtered rows; deactivation removes access; vendor exports contain no restricted data; configurations change behavior.

### Phase 7 — integration and delivery
Run full critical-journey tests, clean-install test, release checks and rehearsal. Document assumptions, source conflicts, limitations and measured performance. Tag release and prepare backup recording/local demo.
Exit: another teammate follows README and reproduces the working demonstration.

Provisional milestones: week 1 foundation; week 2 early lifecycle; week 3 lifecycle/compliance; week 4 reconciliations; week 5 integration/feature freeze; week 6 fixes/docs/demo. These depend on confirmed capacity. If late, cut optional NLP/charts/polish/public hosting first; never silently remove mandatory holds, access controls, history or reconciliation.

## 17. Required verification scenarios

| Area | Minimum checks |
|---|---|
| Access | Cross-department/vendor denial through direct API, detail URLs and exports; vendor content/cost redaction |
| Lifecycle | Collection versus receipt; complete retrieval/return; invalid transition; terminal destruction |
| Retention | Policy combinations, missing trigger/policy, entity override, policy edit, leap-day boundary |
| Holds | Apply/release, multiple holds, hold after approval, historical hold interval, same-day ambiguity |
| Events | Atomic rollback, replay, immutable rows, non-state events, duplicate command, stale version |
| Concurrency | Simultaneous destruction/hold; duplicate confirmations cannot create two movements |
| Imports | Same file twice, duplicate IDs, malformed row, unknown vendor carton, source-count reconciliation |
| Inventory | Exact declaration cutoff; matching, missing, unknown and wrong-location controls |
| Billing | Effective rate change, missing return rate, duplicate activity, incorrect totals/tax, post-destruction storage |
| Certificates | Legitimate batch, cross-vendor/month misuse, no destruction, no certificate, wrong date, held destruction |
| Runs | Same inputs dedupe, changed input fingerprint, later cycle aging, older-cycle rerun, failed-run recovery |
| Delivery | Clean installation, seed repeatability, restart persistence, demo reset and backup |

Do not invent a test pass, run result, reconciliation count or benchmark. Report exact commands and outcomes, and say when an environment limitation prevents execution.

## 18. Demo and final deliverables

Deliver working source, pinned dependencies, migrations, repeatable import, .env.example, architecture/ERD, role matrix, tests, setup instructions, known limitations and a short demo script. Public deployment is optional until required by the team/evaluation.

Suggested ten-minute demo: problem/roles (1m), pickup and receipt (2m), retrieval/history (2m), retention edit and hold refusal (2m), reconciliation evidence (2m), access denial/limitations (1m). Use an eligible supplied historical carton for destruction; do not fabricate source results to improve the presentation.

Keep a local tagged release, resettable demo database, screenshots and short recording as backup. Clearly label recorded evidence if live execution fails.

## 19. Your first response and action

First inspect what is actually present. Return:
1. Materials read and missing files.
2. Confirmed requirements, assumptions and conflicts.
3. Up to five essential questions, each with a reasonable proposed default.
4. Recommended architecture and any justified changes to the supplied schema.
5. A dependency-ordered implementation checklist with owner placeholders, deliverables, effort and acceptance criteria.
6. A clear distinction between existing implemented code and design-only assets.

Then create/update the specification documents and begin the runnable foundation using confirmed or labelled defaults. Keep progressing through unblocked tasks; demonstrate and record verification at every phase. Do not stop after generating only a plan, and do not claim the whole application is finished after generating files.
