# Development Guide & Engineering Standards — PRMS

## 1. Development Principles & Code Conventions

### 1.1 Architecture & Separation of Concerns
When contributing to PRMS, maintain the established unidirectional flow:
```text
Routes ──▶ Services ──▶ Repositories ──▶ Models ──▶ Database Connection
```
1. **Never write SQL in Routes or Services**: All SQL queries must reside exclusively within the `repositories/` directory.
2. **Never execute business logic in Routes**: Route handlers only validate HTTP parameters, enforce role guards, and invoke service methods.
3. **Always use Model Mappers**: Repositories must return domain objects created via Model `fromRow()` methods. Never leak raw snake_case database rows into services or controllers.
4. **Always use Transactions for State Changes**: Any service method that alters database state must wrap its logic inside `tx(() => { ... })` from `db/connection.js`.

### 1.2 Language & Naming Standards
- **ES Modules**: The project uses native ES modules (`"type": "module"` in `package.json`). Always use standard `import` and `export` statements with explicit file extensions (e.g. `import { db } from "./db/connection.js";`).
- **Naming Conventions**:
  - Database columns & SQL queries: `snake_case` (e.g. `carton_id`, `legal_hold_flag`).
  - JavaScript variables, properties & functions: `camelCase` (e.g. `cartonId`, `legalHoldFlag`).
  - Constants & Enums: `UPPER_SNAKE_CASE` (e.g. `PRMS_PORT`, `WAREHOUSE_STATUSES`).
  - Classes & Models: `PascalCase` (e.g. `AppError`, `Carton`).
- **JSDoc Typing**: Use JSDoc comments (`@typedef`, `@property`, `@returns`) to maintain type clarity in backend modules.

---

## 2. Step-by-Step: Adding a New Feature

To illustrate our development process, here is an end-to-end guide to implementing a new capability (e.g., adding a "Barcoding & Physical Audit Scan" feature):

### Step 1: Update the Domain Model
In `backend/src/models/`, update or create the relevant model (e.g. `carton.js`):
```javascript
// models/carton.js
export const Carton = {
  fromRow(row) {
    if (!row) return null;
    return {
      // ... existing fields
      lastScannedAt: row.last_scanned_at ?? null,
    };
  },
  toRow(c) {
    return {
      // ... existing fields
      last_scanned_at: c.lastScannedAt ?? null,
    };
  }
};
```

### Step 2: Implement the Repository Query
In `backend/src/repositories/carton_repo.js`, add the parameterized SQL operation:
```javascript
export function recordBarcodeScan(cartonId, scannedAt) {
  db.prepare(
    "UPDATE carton SET last_scanned_at = @scannedAt WHERE carton_id = @cartonId"
  ).run({ cartonId, scannedAt });
  return findById(cartonId);
}
```

### Step 3: Implement Business Logic in the Service Layer
In `backend/src/services/carton_service.js`, enforce role checks and transaction safety:
```javascript
import { tx } from "../db/connection.js";
import { cartonRepo } from "../repositories/index.js";
import { appendCartonEvent } from "./event_engine.js";
import { nowIso } from "../models/index.js";

export function scanCartonBarcode(user, cartonId, barcode) {
  const carton = cartonRepo.findById(cartonId);
  if (!carton) throw notFound(`Carton ${cartonId} not found`);
  if (carton.barcode !== barcode) throw conflict("Scanned barcode does not match carton record");

  const now = nowIso();
  return tx(() => {
    appendCartonEvent({
      cartonId,
      eventType: "BARCODE_AUDIT_VERIFIED",
      actorUserId: user.userId,
      occurredAt: now,
      idempotencyKey: `scan:${cartonId}:${now}`,
    });
    return cartonRepo.recordBarcodeScan(cartonId, now);
  });
}
```

### Step 4: Register the REST Route
In `backend/src/http/routes.js`, mount the route and enforce role security:
```javascript
router.post("/api/v1/cartons/:cartonId/scan", (ctx) => {
  const user = requireRoles(ctx, "BUSINESS", "VENDOR");
  const result = cartonService.scanCartonBarcode(user, ctx.params.cartonId, ctx.body.barcode);
  return { status: 200, body: Carton.toPublic(result) };
});
```

### Step 5: Update the Frontend Client & Component
1. In `frontend/src/api/types.ts`, update the `Carton` interface.
2. In `frontend/src/pages/CartonDetailPage.tsx`, add the action button and API trigger:
```tsx
const handleScan = async (scannedBarcode: string) => {
  try {
    await api.post(`/cartons/${cartonId}/scan`, { barcode: scannedBarcode });
    load(); // Refresh state
  } catch (err) {
    setError(err instanceof ApiError ? err.message : "Scan verification failed");
  }
};
```

---

## 3. Database Schema Modifications

Because the project uses raw SQL DDL rather than an ORM migration tool:

1. **Modify Schema**: Update [`backend/src/db/schema.sql`](file:///c:/Users/hp/Desktop/16table/localproject/sqlite-app/backend/src/db/schema.sql) with new tables, columns, or triggers.
2. **Update Seed Data**: If reference lookup values are affected, update [`backend/src/db/seed.sql`](file:///c:/Users/hp/Desktop/16table/localproject/sqlite-app/backend/src/db/seed.sql).
3. **Re-initialize Development DB**:
   ```bash
   cd backend
   npm run db:init
   ```
4. **Provision Demo Users**: Run the seed scripts to restore login credentials.

---

## 4. Debugging Guidelines

### 4.1 Inspecting the SQLite Database File Directly
You can inspect database state directly using Node's CLI:
```bash
node --experimental-sqlite -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('./prms.db');
console.table(db.prepare('SELECT carton_id, current_status, current_location_id, legal_hold_flag FROM carton').all());
"
```
Or inspect using the standard `sqlite3` CLI tool:
```bash
sqlite3 backend/prms.db
sqlite> .tables
sqlite> SELECT * FROM event_log ORDER BY event_timestamp DESC LIMIT 5;
```

### 4.2 Tracing Network & API Requests
- Check the server console log for incoming request outputs and error stack traces.
- Every API error response contains a `correlationId`. Cross-reference this ID against terminal logs to locate unhandled exceptions.

---

## 5. Pull Request & Code Review Checklist

Before opening a pull request or submitting code:

- [ ] **Tests Pass**: Executed `npm test` in `backend/` and all tests pass without warnings.
- [ ] **Frontend Builds**: Executed `npm run build` in `frontend/` and confirmed TypeScript compiles with zero errors.
- [ ] **No Raw SQL in Services/Routes**: All SQL operations are isolated within `repositories/`.
- [ ] **Transactions Protected**: All state-modifying service functions use `tx(fn)`.
- [ ] **Role & Scope Enforced**: Added `requireRoles` and scope assertions (`scope.js`) to new endpoints.
- [ ] **No Hardcoded Secrets**: Verified that no private keys, passwords, or personal test tokens are committed.
- [ ] **API Documentation Updated**: Updated `docs/API_DOCUMENTATION.md` with new endpoints and sample payloads.

