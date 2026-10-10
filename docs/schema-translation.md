# Schema: consolidated 16-table design

This project uses a deliberately **consolidated 16-table** SQLite schema (see the
ERD this was built from). It descends from the authoritative PostgreSQL model in
`PRMS_Database_Complete/sql/01_schema.sql` but merges many tables for a smaller,
flatter footprint suited to SQLite and a single-node deployment.

## The 16 tables

| # | Table | Replaces / notes |
|---|-------|------------------|
| 1 | `ref_lookup` | **Polymorphic reference** keyed by `(lookup_type, code)`. Folds in document_type, archival_policy, retention_policy, sla_rule, threshold_rule, carton_status, event_type, lifecycle_transition, roles, scope types, holidays, tax, activities. `numeric_value` = retention years / SLA days / threshold days / tax pct×100; `attrs_json` = everything else (trigger, allowed-from/to statuses, raised_by role, is_terminal, …) |
| 2 | `org_unit` | `business_entity` + `department` merged (composite PK) |
| 3 | `vendor` | — |
| 4 | `warehouse_location` | `warehouse` |
| 5 | `app_user` | role_code FK → `ref_lookup('ROLE', …)` via a generated column |
| 6 | `rate_card` | `vendor_rate` with natural composite PK `(vendor_id, activity, effective_from)` |
| 7 | `carton` | **Denormalized**: `current_status`, `current_location_id`, `legal_hold_flag` folded in (absorbs the old `carton_state` projection) |
| 8 | `file_index` | `file_record` |
| 9 | `request` | `service_request` |
| 10 | `event_log` | Flat history (TEXT `event_id`); no stream-version / custody-interval projections. Still append-only. |
| 11 | `legal_hold` | — (status enum ACTIVE/RELEASED) |
| 12 | `vendor_declaration` | recert + destruction-certificate evidence merged via `kind` |
| 13 | `invoice_line` | `vendor_invoice` + `vendor_invoice_line` merged (header inlined per line, composite PK `(invoice_id, line_no)`) |
| 14 | `recon_exception` | single exception register |
| 15 | `recon_finding` | reconciliation-run fields **inlined** (`run_id`, `run_kind`, `run_started_at`, `run_status`) — no separate run table |
| 16 | `import_row` | import batch + issue fields **inlined** onto each row |

## SQLite-specific handling

- **Types:** `TEXT`/`INTEGER`/`REAL`; dates/instants as ISO-8601 TEXT; money as
  `NUMERIC` (keep exact — never float arithmetic); JSON as TEXT + `json_valid()`.
- **Role FK into a composite PK:** `app_user.role_lookup_type` is a
  `GENERATED ALWAYS AS ('ROLE') VIRTUAL` column so
  `FOREIGN KEY (role_lookup_type, role_code) REFERENCES ref_lookup(lookup_type, code)`
  pins the lookup type. (SQLite can't FK a single column into a 2-col PK.)
- **Append-only** evidence (`event_log`, `import_row`, `recon_finding`) enforced
  by `BEFORE UPDATE/DELETE … RAISE(ABORT)` triggers.
- **Retention** is a view: it joins `carton` to the `RETENTION_POLICY` lookup
  (code = `"<DOC_TYPE>|<ARCHIVAL_POLICY>"`, `numeric_value` = years) and reports
  `MISSING_TRIGGER` / `MISSING_POLICY` instead of inventing a date.

## Invariants moved to the application layer

Because this design is denormalized and SQLite lacks exclusion constraints, the
**services** guarantee:

1. **current_status / current_location_id on carton** stay in step with
   `event_log` — the event engine patches them in the same transaction as the
   append. `event_log` remains the immutable audit source of truth.
2. **legal_hold_flag** on carton mirrors whether any `legal_hold` row is ACTIVE
   (set on apply, cleared on release when no active holds remain).
3. **Genesis event** (`CARTON_CREATED`) is valid only as a carton's first event
   (`attrs_json.from` contains `null`); the engine checks there are no prior
   events rather than a prior status.
4. **Non-overlapping rate windows** per `(vendor, activity)` — insert-time check
   in the reference-maintenance path.

## Honest trade-offs

- Denormalizing status/location onto `carton` means two writes per command
  (event + carton patch) kept atomic by `tx()`; a corrupt manual edit to
  `carton` could drift from `event_log`. The audit log stays authoritative and
  state is rebuildable from it.
- `ref_lookup` trades referential-integrity granularity for flexibility: a typo
  in a `lookup_type` won't be caught by the DB (only `(lookup_type, code)` pairs
  that are actually FK targets — ROLE — are enforced).
- Sessions use a tiny side table `app_session` (not one of the 16 business
  tables), and `app_user.password_hash` is retained for login — both are
  operational necessities not shown in the ERD.
