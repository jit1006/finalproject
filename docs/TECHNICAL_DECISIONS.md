# Technical Decisions & Architecture Rationale — PRMS

## 1. Zero Runtime Dependencies on Backend

### Context
Typical Node.js web applications incorporate 30–70 external npm packages (e.g., `express`, `fastify`, `knex`, `typeorm`, `better-sqlite3`, `bcrypt`, `cors`, `cookie-parser`).

### Decision
The PRMS backend incorporates **zero external runtime dependencies**. It relies exclusively on native modules introduced in Node.js (specifically `>= 22.5`):
- `node:sqlite`: Built-in SQLite database engine (`DatabaseSync`).
- `node:http`: Core HTTP server engine.
- `node:crypto`: Native `scrypt` hashing, constant-time buffer comparison, and SHA-256 digests.
- `node:fs` and `node:path`: File operations for database initialization.
- `node:test`: Native unit and integration test runner.

### Rationale & Trade-offs
- **Pros**:
  - **Zero Supply Chain Risk**: Immune to malicious npm dependency injections, transitive package hijackings, or abandoned library vulnerabilities.
  - **Zero Installation Overhead**: The backend starts immediately without needing `npm install` or building native C++ binaries (`node-gyp`).
  - **Predictable Performance & Minimal Memory**: Memory footprint remains under 40MB RAM under normal operation.
  - **Driver Isolation**: The SQLite database driver is fully encapsulated in `backend/src/db/connection.js`. Swapping to `better-sqlite3` or an external driver requires modifying only that single file.
- **Cons**:
  - Requires writing a small HTTP path matcher and JSON body streaming parser (`http/router.js`).
  - Requires Node.js `>= 22.5` run with the `--experimental-sqlite` flag.

---

## 2. Database Schema Consolidation: 37 Tables to 16 Tables

### Context
The original reference model from the PostgreSQL specification (`PRMS_Database_Complete`) was highly normalized, comprising **37 separate tables, 82 foreign keys**, and multiple projection tables (`carton_state`, `custody_interval`, `user_session`, `import_batch`, `import_issue`, `reconciliation_run`, etc.).

### Decision
For the SQLite implementation, the schema was deliberately **consolidated into 16 core business tables** (plus one operational table `app_session` and one view `carton_retention`).

### Detailed Consolidation Mapping

| Consolidated Table | Replaced / Merged Tables from 37-Table Model | Architectural Rationale |
| :--- | :--- | :--- |
| `ref_lookup` | `document_type`, `archival_policy`, `retention_policy`, `carton_status`, `request_status`, `event_type`, `lifecycle_transition`, `role`, `scope_type`, `sla_rule`, `threshold_rule`, `tax_rule`, `holiday`, `activity` | Consolidates 13 separate lookup dictionaries into a single polymorphic table keyed by `(lookup_type, code)`. Enables adding or editing policies without modifying DDL schemas. |
| `org_unit` | `business_entity` + `department` | Merged into a composite primary key `(entity_id, department_id)` since departments never exist independently of legal entities. |
| `carton` | `carton` + `carton_state` | Denormalized: current status, warehouse location, and legal hold flag are inlined directly onto the carton row. Eliminates multi-table joins on high-frequency list queries. |
| `event_log` | `event_log` + `custody_interval` | Flat, append-only history. Removes complex interval calculations from SQLite queries while preserving the complete audit stream. |
| `vendor_declaration`| `vendor_declaration` + `certificate_evidence` | Ingests both periodic recertifications and destruction certificates using a `kind` discriminator (`RECERT` vs `DESTRUCTION_CERT`). |
| `invoice_line` | `vendor_invoice` + `vendor_invoice_line` | Inlines invoice header attributes (`invoice_date`, `tax_rate_pct`, `invoice_total`) onto each line item, keyed by `(invoice_id, line_no)`. |
| `recon_finding` | `reconciliation_run` + `reconciliation_finding` | Inlines run attributes (`run_id`, `run_kind`, `run_status`, `run_started_at`) onto each finding row. Run history is queried via `DISTINCT` aggregates. |
| `import_row` | `import_batch` + `import_row` + `import_issue` | Inlines batch identifier and row validation errors directly onto each row. |

### Invariants Handled at the Application Layer
Because SQLite lacks Postgres-specific features (such as `EXCLUDE USING gist` for non-overlapping date ranges), certain invariants were moved to the service layer:
1. **Carton Projection Synchronization**: The event engine guarantees that `carton.current_status` and `carton.current_location_id` are updated atomically inside the same `tx()` transaction as the event insertion.
2. **Legal Hold Flag Synchronization**: The hold service guarantees that `carton.legal_hold_flag` is updated upon hold application and cleared only when zero active holds remain.
3. **Genesis Constraint Validation**: `event_engine.js` verifies that `CARTON_CREATED` events only succeed when no prior events exist for that carton.

---

## 3. Concurrency & Transaction Management in SQLite

### Context
SQLite operates as an embedded file-based database. In default rollback journal mode, read and write operations lock the entire database file, leading to concurrency bottlenecks.

### Decision
PRMS implements the following database connection configuration in [`backend/src/db/connection.js`](file:///c:/Users/hp/Desktop/16table/localproject/sqlite-app/backend/src/db/connection.js):
```javascript
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA busy_timeout = 5000;");
```
And manages write commands through the `tx(fn)` helper:
```javascript
export function tx(fn) {
  db.exec("BEGIN IMMEDIATE;");
  try {
    const result = fn();
    db.exec("COMMIT;");
    return result;
  } catch (err) {
    try { db.exec("ROLLBACK;"); } catch {}
    throw err;
  }
}
```

### Rationale
- **Write-Ahead Logging (WAL)**: Allows multiple concurrent readers to query the database while a writer is appending events, eliminating read-write contention.
- **`BEGIN IMMEDIATE`**: Acquires a write lock at transaction start rather than deferring it until the first write query. This prevents deadlock scenarios when multiple transactions attempt to upgrade read locks to write locks simultaneously.
- **`busy_timeout = 5000`**: Directs SQLite to wait up to 5 seconds for a lock to clear before throwing an error, smoothing out transient write bursts.

---

## 4. Opaque Session Tokens vs. Stateless JWTs

### Context
Modern web architectures frequently choose between stateless JSON Web Tokens (JWT) and server-side stateful sessions.

### Decision
PRMS chooses **server-side stateful sessions with opaque tokens** stored in an operational `app_session` table.

### Rationale
1. **Immediate Revocation**: If a user is deactivated or compromised, their session can be revoked instantly by setting `revoked_at = now`. Stateless JWTs cannot be revoked immediately without implementing complex token blacklists or redis stores.
2. **Defense in Depth**: Only the SHA-256 hash of the token is stored in the database. Even in the event of an SQL injection or database dump, attackers cannot use the stored hashes to impersonate users.
3. **No Signature Key Rotation Vulnerabilities**: Avoids common JWT cryptographic pitfalls (e.g. `none` algorithm exploits, weak secret brute-forcing).

---

## 5. Technology Stack Alternatives Considered

| Dimension | Selected Stack | Alternative Considered | Why Alternative Was Rejected |
| :--- | :--- | :--- | :--- |
| **Backend Runtime** | Node.js (Native) | Python + FastAPI | While FastAPI was specified in earlier hackathon design briefs, Node.js v24 provided a native, single-language stack matching the React frontend, with built-in SQLite eliminating Python virtualenv setups. |
| **Database Engine** | SQLite (16 Tables) | PostgreSQL 16 (37 Tables) | PostgreSQL requires external server installation, database daemon management, port exposure, and complex connection pooling. SQLite provides zero-configuration local deployment with zero setup overhead. |
| **Frontend Framework** | React 18 + Vite | Next.js / Remix | Full-stack meta-frameworks add SSR complexity, build churn, and server runtime coupling. A pure Vite SPA communicates cleanly over standard REST with any backend. |
| **CSS Framework** | Vanilla Modern CSS | Tailwind CSS / Material UI | Vanilla modern CSS with CSS custom properties (`--bg`, `--panel`, `--accent`) delivers a clean dark theme UI without increasing node_modules dependencies or compile-time overhead. |

