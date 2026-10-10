# API contract (Node + SQLite backend)

Base prefix **`/api/v1`**. Auth is a session cookie (`prms_session`, HttpOnly);
send `credentials: include`. Error shape:

```json
{ "error": { "code": "FORBIDDEN", "message": "…", "fieldErrors": {}, "correlationId": "…" } }
```

Codes: `UNAUTHORIZED` 401 · `FORBIDDEN` 403 · `NOT_FOUND` 404 · `CONFLICT` 409 ·
`UNPROCESSABLE` 422.

Idempotency: carton commands derive a stable key server-side (`create:<id>`,
`request:<id>`, `destroy:<id>`, `hold-apply:<id>`, …); replays return the
original event instead of duplicating.

## Endpoints

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/auth/login` | any | `{email,password}` → sets cookie |
| POST | `/auth/logout` | any | clears cookie |
| GET | `/auth/me` | authed | current user |
| POST | `/cartons` | BUSINESS | register carton |
| GET | `/cartons/:id` | scoped | view |
| POST | `/cartons/:id/files` | BUSINESS | index a file |
| GET | `/cartons/:id/files` | not VENDOR | list files (vendor forbidden) |
| GET | `/cartons/:id/history` | scoped | state + event log |
| GET | `/cartons/:id/retention` | scoped | from the view |
| POST | `/requests` | BUSINESS | PICKUP/RETRIEVAL/RETURN/DESTRUCTION |
| GET | `/requests/queue` | VENDOR | own-vendor queue |
| POST | `/requests/:id/acknowledge` | VENDOR | |
| POST | `/requests/:id/collect` | VENDOR | collection ≠ receipt |
| POST | `/requests/:id/receive` | VENDOR | → In Storage |
| POST | `/requests/:id/deliver` | VENDOR | retrieval delivery |
| POST | `/requests/:id/approve` | COMPLIANCE | approver ≠ requester |
| POST | `/requests/:id/destroy` | VENDOR | re-checks hold at execution |
| GET | `/holds?active_only=` | COMPLIANCE/FACILITIES | |
| POST | `/holds` | COMPLIANCE | apply |
| POST | `/holds/:id/release` | COMPLIANCE | release |
| POST | `/reconciliations` | FACILITIES | idempotent by kind+scope+fingerprint |
| GET | `/reconciliations` | FACILITIES | list runs |
| GET | `/exceptions` | scoped | vendor sees own redacted |
| GET | `/dashboard` | any | counts scoped to role |
| GET | `/reference-data/vendors` | any | vendor list |
| GET | `/health` | — | liveness + DB check (no prefix) |
