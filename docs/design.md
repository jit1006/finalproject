# Design (Node.js + SQLite)

## Architecture — layered, separation of concerns

```
React SPA ──HTTP (session cookie)──▶ node:http server
                                      └── http/routes.js   translate HTTP ↔ services (no logic)
                                            └── services/   business logic + permissions + event engine
                                                  └── repositories/   all SQL
                                                        └── models/    row ↔ domain mappers
                                                              └── db/connection.js (node:sqlite + tx())
                                                                    └── SQLite file (schema.sql)
```

Rules:
- Routes never contain business logic or SQL; they call services.
- Services never write SQL inline; they call repositories and run inside `tx()`.
- Repositories return domain objects via model mappers, never raw rows.
- The SQL schema file is the source of truth for structure.

## Zero-dependency choices

- **DB driver:** Node's built-in `node:sqlite` (`DatabaseSync`). Isolated in
  `db/connection.js`; swapping to `better-sqlite3` touches only that file.
- **HTTP:** `node:http` with a tiny router (`http/router.js`) supporting path
  params, JSON bodies, cookies, and the standard error shape. No express.
- **Passwords:** `scrypt` from `node:crypto` (no bcrypt dependency).
- **Sessions:** opaque token in an HttpOnly cookie; only its SHA-256 digest is
  stored in `user_session`.

## Event engine (core invariant)

One canonical append-only `event_log`; `carton_state` and `custody_interval` are
rebuildable projections. A state-changing command (inside `tx()`):

1. Idempotency check — same `idempotency_key` returns the original event.
2. Validate the lifecycle transition via `lifecycle_transition`; refuse to leave
   the terminal `Destroyed` state.
3. Append the event (next `stream_version`) with actor/role/channel evidence.
4. Update `carton_state`; close the open custody interval and open a new one when
   custody changes; populate vendor+warehouse when custody becomes WAREHOUSE.

SQLite serializes writes (one writer), and `tx()` uses `BEGIN IMMEDIATE`, which
provides the needed atomicity + mutual exclusion for commands in this single-node
app (the Postgres variant uses `SELECT … FOR UPDATE` row locks instead).

## Retention

`carton_retention` is a view computing `destruction_due_on` from the applicable
`retention_policy` (entity-specific preferred over global), reporting
`MISSING_TRIGGER` / `MISSING_POLICY` rather than inventing a date. Editing a
policy row recomputes due dates with no code change.

## Legal holds

Only Compliance applies/releases. Holds block destruction (at request **and**
re-checked at execution, so a hold applied after approval still blocks) but
permit otherwise-valid retrieval/return/movement.

## Reconciliation (framework now; engines next)

`reconciliation_run` records who/when/scope/fingerprint; runs are idempotent on
`run_kind + scope_key + input_fingerprint`. Findings persist into one
`exception_case` register. The three detection engines (inventory, invoice,
certificate) are the documented next increment — see the PostgreSQL variant's
`docs/design.md` and `KIRO_PROJECT_CONTEXT.md` §13 for the exact rules.

## Known limitations

- Reconciliation detection engines and the lossless XLSX importer are not yet
  implemented (framework + schema are).
- Retrying `destroy` on an already-destroyed carton returns a CONFLICT (correct:
  no duplicate), rather than replaying the original result — a minor refinement.
- Money is stored as TEXT; the cost engine must apply exact decimal arithmetic.
