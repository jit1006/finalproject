-- PRMS SQLite schema — CONSOLIDATED 16-TABLE DESIGN (v2).
-- Apply once to an empty database file. SQLite 3.40+.
--
-- This is a deliberate consolidation of the earlier 37-table model into 16
-- tables, per the supplied ERD. Key design shifts vs the normalized version:
--   * ref_lookup       : ONE polymorphic reference table keyed by (lookup_type,
--                        code). Replaces document_type, archival_policy,
--                        retention_policy, sla_rule, threshold_rule,
--                        carton_status, event_type, lifecycle_transition, roles,
--                        holidays and tax. numeric_value holds retention years /
--                        SLA days / threshold days / tax pct; attrs_json holds
--                        the rest (trigger event, allowed_next_status, etc.).
--   * org_unit         : business_entity + department merged (composite PK).
--   * rate_card        : vendor_rate with a natural composite PK.
--   * carton           : DENORMALIZED — carries current_status,
--                        current_location_id and legal_hold_flag directly
--                        (absorbs the old carton_state projection).
--   * event_log        : flat history (TEXT event_id); no stream-version /
--                        custody-interval projections. Still append-only.
--   * vendor_declaration: recert + destruction-certificate evidence merged (kind).
--   * invoice_line     : invoice header fields inlined onto each line.
--   * recon_finding    : reconciliation-run fields inlined onto each finding.
--   * import_row       : batch + issue fields inlined onto each row.
--
-- Trade-off noted honestly: current_status/location on carton is a cached
-- projection of event_log. Services keep them in step inside one transaction;
-- event_log remains the audit source of truth.

PRAGMA foreign_keys = ON;

-- 1. REFERENCE LOOKUP (polymorphic) ------------------------------------------
CREATE TABLE ref_lookup (
    lookup_type   TEXT NOT NULL,   -- ROLE, SCOPE_TYPE, CARTON_STATUS, REQUEST_STATUS,
                                   -- EVENT_TYPE, DOC_TYPE, ARCHIVAL_POLICY,
                                   -- RETENTION_POLICY, THRESHOLD, SLA, HOLIDAY, TAX, ACTIVITY
    code          TEXT NOT NULL,
    name          TEXT,
    meaning       TEXT,
    numeric_value INTEGER,         -- retention years / SLA days / threshold days / tax pct*100
    attrs_json    TEXT CHECK (attrs_json IS NULL OR json_valid(attrs_json)),
    PRIMARY KEY (lookup_type, code)
);

-- 2. ORG UNIT (entity + department merged) -----------------------------------
CREATE TABLE org_unit (
    entity_id       TEXT NOT NULL,
    department_id   TEXT NOT NULL,
    entity_name     TEXT NOT NULL,
    department_name TEXT NOT NULL,
    PRIMARY KEY (entity_id, department_id)
);
CREATE INDEX org_unit_entity_idx ON org_unit (entity_id);

-- 3. VENDOR ------------------------------------------------------------------
CREATE TABLE vendor (
    vendor_id                 TEXT PRIMARY KEY,
    vendor_name               TEXT NOT NULL,
    status                    TEXT NOT NULL CHECK (status IN ('Active','Terminated')),
    contract_start            TEXT,
    contract_ref              TEXT,
    ops_contact_email         TEXT,
    recertification_frequency TEXT NOT NULL DEFAULT 'Quarterly'
);

-- 4. WAREHOUSE LOCATION ------------------------------------------------------
CREATE TABLE warehouse_location (
    location_id      TEXT PRIMARY KEY,
    vendor_id        TEXT NOT NULL REFERENCES vendor(vendor_id),
    location_name    TEXT NOT NULL,
    city             TEXT NOT NULL,
    capacity_cartons INTEGER CHECK (capacity_cartons >= 0),
    UNIQUE (vendor_id, location_id)
);

-- 5. APP USER ----------------------------------------------------------------
CREATE TABLE app_user (
    user_id       TEXT PRIMARY KEY,
    full_name     TEXT NOT NULL,
    email         TEXT NOT NULL,
    role_code     TEXT NOT NULL,   -- FK -> ref_lookup(lookup_type='ROLE', code)
    scope_type    TEXT NOT NULL CHECK (scope_type IN ('DEPARTMENT','VENDOR','GLOBAL')),
    entity_id     TEXT,
    department_id TEXT,
    vendor_id     TEXT REFERENCES vendor(vendor_id),
    password_hash TEXT,            -- NULL until provisioned
    status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
    created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    role_lookup_type TEXT GENERATED ALWAYS AS ('ROLE') VIRTUAL,  -- pins the FK's lookup_type
    FOREIGN KEY (role_lookup_type, role_code) REFERENCES ref_lookup (lookup_type, code),
    FOREIGN KEY (entity_id, department_id) REFERENCES org_unit (entity_id, department_id),
    CHECK (
      (scope_type = 'DEPARTMENT' AND entity_id IS NOT NULL AND department_id IS NOT NULL AND vendor_id IS NULL)
   OR (scope_type = 'VENDOR'     AND entity_id IS NULL AND department_id IS NULL AND vendor_id IS NOT NULL)
   OR (scope_type = 'GLOBAL'     AND entity_id IS NULL AND department_id IS NULL AND vendor_id IS NULL)
    )
);
CREATE UNIQUE INDEX app_user_email_ci ON app_user (lower(email));
-- role_code is FK'd into ref_lookup(lookup_type='ROLE', code) via the generated
-- role_lookup_type column. Email uniqueness is case-insensitive (index above).

-- 6. RATE CARD (vendor rates; natural composite PK) --------------------------
CREATE TABLE rate_card (
    vendor_id      TEXT NOT NULL REFERENCES vendor(vendor_id),
    activity       TEXT NOT NULL CHECK (activity IN ('PICKUP','RETRIEVAL','RETURN','DESTRUCTION','STORAGE')),
    effective_from TEXT NOT NULL,
    effective_to   TEXT,          -- EXCLUSIVE upper bound; source inclusive +1 day
    rate_inr       NUMERIC NOT NULL CHECK (rate_inr >= 0),
    unit           TEXT NOT NULL CHECK (unit IN ('PER_CARTON','PER_CARTON_MONTH')),
    PRIMARY KEY (vendor_id, activity, effective_from),
    CHECK (effective_to IS NULL OR effective_to > effective_from),
    CHECK ((activity = 'STORAGE') = (unit = 'PER_CARTON_MONTH'))
    -- Non-overlapping windows per (vendor,activity) enforced in services.
);

-- 7. CARTON (denormalized: current status/location/hold flag) ----------------
CREATE TABLE carton (
    carton_id              TEXT PRIMARY KEY,
    entity_id              TEXT NOT NULL,
    department_id          TEXT NOT NULL,
    owner_user_id          TEXT NOT NULL REFERENCES app_user(user_id),
    document_type          TEXT NOT NULL,                 -- ref_lookup DOC_TYPE
    archival_policy        TEXT NOT NULL,                 -- ref_lookup ARCHIVAL_POLICY
    carton_created_date    TEXT NOT NULL,
    retention_trigger_date TEXT,                          -- nullable; never invent
    declared_file_count    INTEGER CHECK (declared_file_count >= 0),
    assigned_vendor_id     TEXT REFERENCES vendor(vendor_id),
    current_location_id    TEXT REFERENCES warehouse_location(location_id),
    current_status         TEXT NOT NULL DEFAULT 'Created', -- ref_lookup CARTON_STATUS
    legal_hold_flag        INTEGER NOT NULL DEFAULT 0 CHECK (legal_hold_flag IN (0,1)),
    barcode                TEXT,
    remarks                TEXT,
    FOREIGN KEY (entity_id, department_id) REFERENCES org_unit (entity_id, department_id)
);
CREATE INDEX carton_scope_idx    ON carton (entity_id, department_id);
CREATE INDEX carton_vendor_idx   ON carton (assigned_vendor_id);
CREATE INDEX carton_status_idx   ON carton (current_status);
CREATE INDEX carton_location_idx ON carton (current_location_id);

-- 8. FILE INDEX --------------------------------------------------------------
CREATE TABLE file_index (
    file_id          TEXT PRIMARY KEY,
    carton_id        TEXT NOT NULL REFERENCES carton(carton_id),
    file_ref         TEXT NOT NULL,
    document_type    TEXT NOT NULL,
    file_description TEXT,
    document_year    INTEGER CHECK (document_year BETWEEN 1000 AND 9999),
    contains_pii     INTEGER NOT NULL DEFAULT 1 CHECK (contains_pii IN (0,1))
);
CREATE INDEX file_carton_idx ON file_index (carton_id);

-- 9. REQUEST -----------------------------------------------------------------
CREATE TABLE request (
    request_id     TEXT PRIMARY KEY,
    request_type   TEXT NOT NULL CHECK (request_type IN ('PICKUP','RETRIEVAL','RETURN','DESTRUCTION')),
    carton_id      TEXT NOT NULL REFERENCES carton(carton_id),
    raised_by      TEXT NOT NULL REFERENCES app_user(user_id),
    raised_on      TEXT NOT NULL,
    vendor_id      TEXT NOT NULL REFERENCES vendor(vendor_id),
    sla_due_date   TEXT,
    vendor_ack_on  TEXT,
    completed_on   TEXT,
    approved_by    TEXT REFERENCES app_user(user_id),
    approved_on    TEXT,
    request_status TEXT NOT NULL CHECK (request_status IN ('Open','In Progress','Completed','Rejected','Cancelled')),
    CHECK (approved_by IS NULL OR approved_by <> raised_by),            -- separation of duties
    CHECK ((approved_by IS NULL) = (approved_on IS NULL)),
    CHECK (request_type = 'DESTRUCTION' OR approved_by IS NULL),
    CHECK (vendor_ack_on IS NULL OR vendor_ack_on >= raised_on),
    CHECK (completed_on IS NULL OR completed_on >= raised_on),
    CHECK (approved_on IS NULL OR approved_on >= raised_on)
);
CREATE INDEX request_vendor_queue_idx ON request (vendor_id, request_status, raised_on);
CREATE INDEX request_carton_idx       ON request (carton_id, raised_on);
CREATE INDEX request_raiser_idx       ON request (raised_by, request_status);

-- 10. EVENT LOG (flat, append-only) ------------------------------------------
CREATE TABLE event_log (
    event_id         TEXT PRIMARY KEY,
    carton_id        TEXT NOT NULL REFERENCES carton(carton_id),
    event_timestamp  TEXT NOT NULL,
    event_type       TEXT NOT NULL,                     -- ref_lookup EVENT_TYPE
    from_location    TEXT REFERENCES warehouse_location(location_id),
    to_location      TEXT REFERENCES warehouse_location(location_id),
    actor_id         TEXT REFERENCES app_user(user_id),
    request_id       TEXT REFERENCES request(request_id),
    resulting_status TEXT,                              -- NULL = status unchanged
    remarks          TEXT,
    idempotency_key  TEXT UNIQUE                        -- safe command retries
);
CREATE INDEX event_replay_idx ON event_log (carton_id, event_timestamp, event_id);
CREATE INDEX event_request_idx ON event_log (request_id);

-- 11. LEGAL HOLD -------------------------------------------------------------
CREATE TABLE legal_hold (
    hold_id           TEXT PRIMARY KEY,
    carton_id         TEXT NOT NULL REFERENCES carton(carton_id),
    matter_reference  TEXT NOT NULL,
    hold_reason       TEXT NOT NULL,
    raised_by         TEXT REFERENCES app_user(user_id),
    hold_start_date   TEXT NOT NULL,
    hold_release_date TEXT,
    hold_status       TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (hold_status IN ('ACTIVE','RELEASED')),
    CHECK (hold_release_date IS NULL OR hold_release_date >= hold_start_date),
    CHECK ((hold_status = 'RELEASED') = (hold_release_date IS NOT NULL))
);
CREATE INDEX hold_active_idx ON legal_hold (carton_id) WHERE hold_status = 'ACTIVE';

-- 12. VENDOR DECLARATION (recert + destruction cert merged) ------------------
CREATE TABLE vendor_declaration (
    declaration_id     TEXT PRIMARY KEY,
    kind               TEXT NOT NULL CHECK (kind IN ('RECERT','DESTRUCTION_CERT')),
    recert_cycle       TEXT,
    certificate_id     TEXT,
    carton_id          TEXT,                             -- NO FK by design (raw evidence)
    vendor_id          TEXT NOT NULL REFERENCES vendor(vendor_id),
    location_id        TEXT REFERENCES warehouse_location(location_id),
    declared_status    TEXT,
    destroyed_on       TEXT,
    destruction_method TEXT,
    witnessed_by       TEXT REFERENCES app_user(user_id),
    declared_on        TEXT NOT NULL,
    notes              TEXT
);
CREATE INDEX decl_vendor_idx ON vendor_declaration (vendor_id, kind);
CREATE INDEX decl_carton_idx ON vendor_declaration (carton_id);

-- 13. INVOICE LINE (header inlined per line) ---------------------------------
CREATE TABLE invoice_line (
    invoice_id     TEXT NOT NULL,
    line_no        INTEGER NOT NULL,
    vendor_id      TEXT NOT NULL REFERENCES vendor(vendor_id),
    billing_month  TEXT,
    invoice_date   TEXT,
    invoice_status TEXT,
    tax_rate_pct   NUMERIC,
    invoice_total  NUMERIC,
    line_type      TEXT,
    activity       TEXT,
    carton_id      TEXT REFERENCES carton(carton_id),
    request_id     TEXT REFERENCES request(request_id),
    quantity       NUMERIC,
    unit_rate      NUMERIC,
    line_amount    NUMERIC,
    PRIMARY KEY (invoice_id, line_no)
);
CREATE INDEX invoice_vendor_idx  ON invoice_line (vendor_id, billing_month);
CREATE INDEX invoice_request_idx ON invoice_line (request_id);

-- 14. RECON EXCEPTION (single register) --------------------------------------
CREATE TABLE recon_exception (
    exception_id      TEXT PRIMARY KEY,
    stable_key        TEXT NOT NULL UNIQUE,
    exception_type    TEXT NOT NULL,
    severity          TEXT NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    owner_role        TEXT NOT NULL,
    owner_user_id     TEXT REFERENCES app_user(user_id),
    owner_vendor_id   TEXT REFERENCES vendor(vendor_id),
    carton_id         TEXT REFERENCES carton(carton_id),
    status            TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','INVESTIGATING','RESOLVED','ACCEPTED_RISK')),
    first_detected_at TEXT NOT NULL,
    last_detected_at  TEXT NOT NULL,
    resolution_reason TEXT,
    CHECK (last_detected_at >= first_detected_at),
    CHECK (status NOT IN ('RESOLVED','ACCEPTED_RISK') OR (resolution_reason IS NOT NULL AND trim(resolution_reason) <> ''))
);
CREATE INDEX exc_queue_idx  ON recon_exception (status, owner_role, severity);
CREATE INDEX exc_vendor_idx ON recon_exception (owner_vendor_id, status);

-- 15. RECON FINDING (run fields inlined) -------------------------------------
CREATE TABLE recon_finding (
    finding_id     TEXT PRIMARY KEY,
    exception_id   TEXT NOT NULL REFERENCES recon_exception(exception_id),
    run_id         TEXT NOT NULL,
    run_kind       TEXT NOT NULL CHECK (run_kind IN ('INVENTORY','INVOICE','CERTIFICATE','DATA_QUALITY')),
    run_started_at TEXT NOT NULL,
    run_status     TEXT NOT NULL CHECK (run_status IN ('RUNNING','COMPLETED','FAILED')),
    finding_key    TEXT NOT NULL,
    rule_code      TEXT NOT NULL,
    evidence_json  TEXT NOT NULL CHECK (json_valid(evidence_json)),
    UNIQUE (run_id, finding_key)
);
CREATE INDEX finding_exc_idx ON recon_finding (exception_id);
CREATE INDEX finding_run_idx ON recon_finding (run_id, run_kind);

-- 16. IMPORT ROW (batch + issue fields inlined) ------------------------------
CREATE TABLE import_row (
    row_id          INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id        TEXT NOT NULL,
    source_name     TEXT NOT NULL,
    source_kind     TEXT NOT NULL CHECK (source_kind IN ('WORKBOOK','INVENTORY','INVOICE','CERTIFICATE')),
    vendor_id       TEXT REFERENCES vendor(vendor_id),
    uploaded_by     TEXT REFERENCES app_user(user_id),
    sheet_name      TEXT NOT NULL,
    row_number      INTEGER NOT NULL CHECK (row_number > 0),
    raw_values_json TEXT NOT NULL CHECK (json_valid(raw_values_json)),
    issue_code      TEXT,                               -- nullable
    issue_message   TEXT,                               -- nullable
    disposition     TEXT CHECK (disposition IS NULL OR disposition IN ('ACCEPTED','REJECTED','WARNING','DUPLICATE')),
    uploaded_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (batch_id, sheet_name, row_number)
);
CREATE INDEX import_batch_idx ON import_row (batch_id);

-- APPEND-ONLY PROTECTION: evidence tables reject UPDATE/DELETE. ---------------
CREATE TRIGGER protect_event_log_upd BEFORE UPDATE ON event_log
  BEGIN SELECT RAISE(ABORT, 'append-only: event_log cannot be updated'); END;
CREATE TRIGGER protect_event_log_del BEFORE DELETE ON event_log
  BEGIN SELECT RAISE(ABORT, 'append-only: event_log cannot be deleted'); END;
CREATE TRIGGER protect_import_row_upd BEFORE UPDATE ON import_row
  BEGIN SELECT RAISE(ABORT, 'append-only: import_row cannot be updated'); END;
CREATE TRIGGER protect_import_row_del BEFORE DELETE ON import_row
  BEGIN SELECT RAISE(ABORT, 'append-only: import_row cannot be deleted'); END;
CREATE TRIGGER protect_finding_upd BEFORE UPDATE ON recon_finding
  BEGIN SELECT RAISE(ABORT, 'append-only: recon_finding cannot be updated'); END;
CREATE TRIGGER protect_finding_del BEFORE DELETE ON recon_finding
  BEGIN SELECT RAISE(ABORT, 'append-only: recon_finding cannot be deleted'); END;

-- RETENTION VIEW — resolves the policy from ref_lookup (RETENTION_POLICY).
-- A RETENTION_POLICY row's code is "<DOC_TYPE>|<ARCHIVAL_POLICY>" and
-- numeric_value is the retention years. attrs_json may carry an entity override.
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
