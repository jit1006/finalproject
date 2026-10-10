# Testing Guide & Verification Evidence — PRMS

## 1. Test Framework & Philosophy

PRMS utilizes Node's built-in native test runner (`node:test`) paired with strict assertions (`node:assert/strict`). Aligned with the zero-dependency architecture of the backend, the testing suite requires no third-party libraries (such as Jest, Mocha, or Vitest) to execute.

### Key Architectural Highlights of the Test Suite
- **Zero External Dependencies**: Powered entirely by `node:test`.
- **Complete Database Isolation**: Each test run generates a unique, temporary database file in the operating system's temporary directory (`os.tmpdir()`) with a UUID suffix (`prms16-test-<UUID>.db`). This ensures tests never mutate local development or production databases.
- **Full Schema & Seed Setup**: The test runner programmatically reads and applies [`src/db/schema.sql`](file:///c:/Users/hp/Desktop/16table/localproject/sqlite-app/backend/src/db/schema.sql) and [`src/db/seed.sql`](file:///c:/Users/hp/Desktop/16table/localproject/sqlite-app/backend/src/db/seed.sql) before test execution using `before()` hooks.
- **Deterministic In-Memory / File Clones**: Ensures consistent test execution across local workstations and CI environments.

---

## 2. Test Execution & Verified Results

### How to Run Tests
From the backend directory:
```bash
cd backend
npm test
```
*(Runs: `node --experimental-sqlite --test tests/*.test.js`)*

### Verified Execution Output (Actual Run)
```text
> prms-backend-sqlite@0.1.0 test
> node --experimental-sqlite --test tests/*.test.js

✔ password hashing round-trips and rejects wrong/empty (262.7083ms)
✔ ref_lookup consolidates vocabularies and role FK is enforced (2.6763ms)
✔ hold blocks a destruction request and sets carton flag (253.2176ms)
✔ retention view computes due date and reports missing trigger (2.8894ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 918.9362
```

---

## 3. Analysis of Existing Test Cases

The existing automated test suite in [`backend/tests/lifecycle.test.js`](file:///c:/Users/hp/Desktop/16table/localproject/sqlite-app/backend/tests/lifecycle.test.js) verifies four critical system invariants:

### Test Case 1: Password Hashing Round-Trip & Verification
- **Target Function**: `hashPassword`, `verifyPassword` in [`src/security.js`](file:///c:/Users/hp/Desktop/16table/localproject/sqlite-app/backend/src/security.js).
- **Assertions**:
  - Encrypting `"correct horse"` produces a valid `scrypt` string containing salt and derived hash.
  - Verifying `"correct horse"` against the hash returns `true`.
  - Verifying an incorrect password `"wrong"` returns `false`.
  - Verifying against a `null` hash returns `false` without throwing an exception.

### Test Case 2: Polymorphic Lookup & Virtual Role FK Enforcement
- **Target Component**: `ref_lookup` and `app_user.role_lookup_type` generated column in [`src/db/schema.sql`](file:///c:/Users/hp/Desktop/16table/localproject/sqlite-app/backend/src/db/schema.sql).
- **Assertions**:
  - Asserts that exactly 4 roles (`BUSINESS`, `VENDOR`, `COMPLIANCE`, `FACILITIES`) are seeded in `ref_lookup`.
  - Attempts to insert an `app_user` with an invalid role code (`role_code = 'NOTAROLE'`).
  - Verifies that SQLite throws a foreign key violation (`assert.throws`), confirming that SQLite's generated column `role_lookup_type = 'ROLE'` successfully pins the composite foreign key into `ref_lookup(lookup_type, code)`.

### Test Case 3: Legal Hold Blocks Destruction & Synchronizes Flag
- **Target Component**: [`src/services/hold_service.js`](file:///c:/Users/hp/Desktop/16table/localproject/sqlite-app/backend/src/services/hold_service.js) & [`src/services/request_service.js`](file:///c:/Users/hp/Desktop/16table/localproject/sqlite-app/backend/src/services/request_service.js).
- **Assertions**:
  - Provisions a Business user (`B1`) and Compliance user (`C1`).
  - Inserts a sample carton in `In Storage` status.
  - Compliance user applies a legal hold (`holdService.applyHold`).
  - Confirms that the carton's denormalized `legal_hold_flag` immediately toggles to `true` in `carton`.
  - Business user attempts to submit a `DESTRUCTION` request (`requestService.raiseRequest`).
  - Asserts that the request service throws an error matching `/active legal hold/`, successfully blocking destruction.

### Test Case 4: Retention View Dynamic Due Date & Missing Trigger Flag
- **Target Component**: `carton_retention` database view in [`src/db/schema.sql`](file:///c:/Users/hp/Desktop/16table/localproject/sqlite-app/backend/src/db/schema.sql).
- **Assertions**:
  - Inserts a carton with `document_type = 'Client KYC'`, `archival_policy = 'Standard'`, and `retention_trigger_date = '2020-01-01'`.
  - Queries `carton_retention`.
  - Confirms `calculation_status === 'CALCULATED'`.
  - Confirms `destruction_due_on === '2028-01-01'` (correctly adding the 8 retention years specified in `ref_lookup` for KYC Standard).

---

## 4. Manual API & Integration Testing Guide

You can exercise the full operational lifecycle over HTTP using curl or PowerShell:

### 4.1 Login & Cookie Capture (PowerShell)
```powershell
$loginBody = @{ email = "dina@example.com"; password = "demo" } | ConvertTo-Json
$res = Invoke-WebRequest -Uri "http://localhost:8000/api/v1/auth/login" -Method Post -Body $loginBody -ContentType "application/json" -SessionVariable session
$res.StatusCode # 200
```

### 4.2 Carton Registration (Business)
```powershell
$cartonBody = @{
  carton_id = "CT-TEST-001"
  document_type = "Loan Agreements"
  archival_policy = "Standard"
  carton_created_date = "2026-10-10"
  retention_trigger_date = "2026-10-10"
  assigned_vendor_id = "VND-001"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8000/api/v1/cartons" -Method Post -Body $cartonBody -ContentType "application/json" -WebSession $session
```

### 4.3 Raise Pickup Request (Business)
```powershell
$reqBody = @{
  request_id = "REQ-PK-001"
  carton_id = "CT-TEST-001"
  request_type = "PICKUP"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8000/api/v1/requests" -Method Post -Body $reqBody -ContentType "application/json" -WebSession $session
```

### 4.4 Vendor Collection and Warehouse Receipt (Vendor)
```powershell
# Switch to Vendor Session
$vendorLogin = @{ email = "victor@sv.example"; password = "demo" } | ConvertTo-Json
Invoke-WebRequest -Uri "http://localhost:8000/api/v1/auth/login" -Method Post -Body $vendorLogin -ContentType "application/json" -SessionVariable vndSession

# Confirm Collection
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/requests/REQ-PK-001/collect" -Method Post -WebSession $vndSession

# Confirm Warehouse Receipt
Invoke-RestMethod -Uri "http://localhost:8000/api/v1/requests/REQ-PK-001/receive" -Method Post -WebSession $vndSession
```

---

## 5. Testing Strategy & Roadmap for Additional Coverage

To expand coverage as new features (e.g., XLSX importer and detection engines) are introduced, implement the following test suites:

| Test Area | Recommended Test Cases | Key Invariants to Verify |
| :--- | :--- | :--- |
| **Separation of Duties** | Compliance approves destruction where `user_id == request.raised_by`. | Service must throw `403 Forbidden` (`approver must differ from requester`). |
| **Terminal State Lock** | Attempting any movement or retrieval on a carton in `Destroyed` status. | Event engine must throw `409 Conflict` (`carton in terminal state`). |
| **Field Redaction** | Vendor user calls `GET /api/v1/cartons/:id/files`. | Route must throw `403 Forbidden` and return zero file records. |
| **Cross-Tenant Isolation** | Business user in Branch Delhi requests carton in Branch Mumbai. | Scope assertion must throw `403 Forbidden` (`carton belongs to another department`). |
| **Pre-Execution Hold Lock** | Carton approved for destruction, hold applied afterwards, Vendor executes `POST /destroy`. | `executeDestruction` must throw `409 Conflict` at execution time. |
| **Idempotency Replay** | Submitting the same request twice with identical `idempotency_key`. | Must return original event without creating duplicate rows in `event_log`. |
| **Policy Change Recomputation** | Update `ref_lookup` retention years for Loan Agreements from 10 to 12. | Query `carton_retention` and verify due date shifts by +2 years without updating `carton`. |

