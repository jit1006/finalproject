# API Documentation — Physical Records Management System (PRMS)

## 1. Overview & Protocol Standards

The PRMS backend exposes a RESTful JSON API using Node's built-in HTTP server (`node:http`). 

### Core Protocol Standards
- **Base URL Prefix**: `/api/v1` (with the exception of `/health`, which is mounted at root `/health`).
- **Transport & Encoding**: All request and response bodies use `application/json; charset=utf-8`.
- **Authentication**: Stateful sessions authenticated via an `HttpOnly`, `SameSite=Lax` cookie named `prms_session`. Clients must pass `credentials: "include"`.
- **Correlation Tracking**: Every request receives a correlation ID via the `X-Correlation-Id` header (or server-generated UUIDv4) for distributed tracing.
- **Idempotency**: All carton lifecycle commands accept or derive a deterministic idempotency key (`create:<cartonId>`, `request:<requestId>`, `hold-apply:<holdId>`, etc.) to prevent duplicate side effects upon network retry.

### Standard Error Response Shape
All 4xx and 5xx responses conform to a unified error payload:
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Carton belongs to another department",
    "fieldErrors": {},
    "correlationId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

#### Standard Error Codes
| Code | HTTP Status | Description |
| :--- | :---: | :--- |
| `UNAUTHORIZED` | 401 | Missing, invalid, expired, or revoked session token. |
| `FORBIDDEN` | 403 | User lacks required role, row scope, or field visibility permissions. |
| `NOT_FOUND` | 404 | Target carton, request, hold, file, or route does not exist. |
| `CONFLICT` | 409 | State machine violation, terminal state lock, hold-blocking destruction, duplicate ID. |
| `UNPROCESSABLE` | 422 | Payload validation error, invalid JSON, or missing required attributes. |
| `INTERNAL` | 500 | Unexpected server or database exception. |

---

## 2. Authentication & Identity Endpoints

### 2.1 Authenticate User (Login)
- **Method & Route**: `POST /api/v1/auth/login`
- **Purpose**: Authenticates credentials and sets an `HttpOnly` session cookie.
- **Authentication**: None (Public).
- **Permissions**: Any active user.
- **Handler**: `backend/src/http/routes.js` -> `auth_service.authenticate` & `createSession`.

#### Request Body
```json
{
  "email": "dina@example.com",
  "password": "demo"
}
```

#### Validations
- `email`: Required, case-insensitive match against `app_user.email`.
- `password`: Required, verified against `scrypt` hash. User status must be `ACTIVE`.

#### Response: `200 OK`
*Headers: `Set-Cookie: prms_session=<raw_token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`*
```json
{
  "user_id": "U-BIZ",
  "full_name": "Dina Business",
  "email": "dina@example.com",
  "role_code": "BUSINESS",
  "scope_type": "DEPARTMENT",
  "entity_id": "ENT-BRN",
  "department_id": "DEP-BRN-DEL",
  "vendor_id": null
}
```

#### Error Responses
- `401 UNAUTHORIZED`: Uniform message `"Invalid email or password"` (prevents email enumeration).

---

### 2.2 Terminate Session (Logout)
- **Method & Route**: `POST /api/v1/auth/logout`
- **Purpose**: Revokes current session token in `app_session` and clears client cookie.
- **Authentication**: Session cookie.
- **Handler**: `backend/src/http/routes.js` -> `auth_service.revokeSession`.

#### Response: `200 OK`
*Headers: `Set-Cookie: prms_session=; Path=/; Max-Age=0`*
```json
{
  "ok": true
}
```

---

### 2.3 Get Current Authenticated Profile
- **Method & Route**: `GET /api/v1/auth/me`
- **Purpose**: Returns profile and scope attributes of the currently logged-in user.
- **Authentication**: Session cookie required.
- **Handler**: `backend/src/http/routes.js` -> `requireUser`.

#### Response: `200 OK`
```json
{
  "user_id": "U-BIZ",
  "full_name": "Dina Business",
  "email": "dina@example.com",
  "role_code": "BUSINESS",
  "scope_type": "DEPARTMENT",
  "entity_id": "ENT-BRN",
  "department_id": "DEP-BRN-DEL",
  "vendor_id": null
}
```

#### Error Responses
- `401 UNAUTHORIZED`: Session expired or invalid.

---

## 3. Cartons & Files Endpoints

### 3.1 Register a New Carton
- **Method & Route**: `POST /api/v1/cartons`
- **Purpose**: Creates a new carton record and automatically records the `CARTON_CREATED` genesis event.
- **Authentication**: Required.
- **Permissions**: `BUSINESS` role only.
- **Handler**: `backend/src/http/routes.js` -> `carton_service.registerCarton`.

#### Request Body
```json
{
  "carton_id": "CT-100492",
  "document_type": "Client KYC",
  "archival_policy": "Standard",
  "carton_created_date": "2026-10-10",
  "assigned_vendor_id": "VND-001",
  "retention_trigger_date": "2026-10-10",
  "declared_file_count": 12,
  "barcode": "BAR-100492",
  "remarks": "Priority archival box"
}
```

#### Validations
- Role must be `BUSINESS`.
- `carton_id`: Must be unique; returns `409 CONFLICT` if already exists.
- `entity_id` and `department_id` are automatically assigned from the user's scope.
- Initial status is automatically set to `Created` and `legal_hold_flag = false`.

#### Response: `201 Created`
```json
{
  "carton_id": "CT-100492",
  "entity_id": "ENT-BRN",
  "department_id": "DEP-BRN-DEL",
  "document_type": "Client KYC",
  "archival_policy": "Standard",
  "assigned_vendor_id": "VND-001",
  "current_location_id": null,
  "current_status": "Created",
  "legal_hold_flag": false,
  "retention_trigger_date": "2026-10-10",
  "declared_file_count": 12,
  "barcode": "BAR-100492"
}
```

---

### 3.2 Get Carton Metadata
- **Method & Route**: `GET /api/v1/cartons/:cartonId`
- **Purpose**: Retrieves metadata for a specific carton.
- **Authentication**: Required.
- **Permissions**: Scoped (`BUSINESS` own department; `VENDOR` own vendor; `COMPLIANCE` & `FACILITIES` global).
- **Handler**: `backend/src/http/routes.js` -> `cartonRepo.findById` & `scope.assertCanViewCarton`.

#### Path Parameters
- `cartonId`: Unique carton identifier.

#### Response: `200 OK`
```json
{
  "carton_id": "CT-100492",
  "entity_id": "ENT-BRN",
  "department_id": "DEP-BRN-DEL",
  "document_type": "Client KYC",
  "archival_policy": "Standard",
  "assigned_vendor_id": "VND-001",
  "current_location_id": null,
  "current_status": "Created",
  "legal_hold_flag": false,
  "retention_trigger_date": "2026-10-10",
  "declared_file_count": 12,
  "barcode": "BAR-100492"
}
```

#### Error Responses
- `403 FORBIDDEN`: User is outside carton scope.
- `404 NOT_FOUND`: Carton does not exist.

---

### 3.3 Index a File into a Carton
- **Method & Route**: `POST /api/v1/cartons/:cartonId/files`
- **Purpose**: Adds an individual file/dossier record to a carton index and generates a `FILE_INDEXED` audit event.
- **Authentication**: Required.
- **Permissions**: `BUSINESS` role only (must own carton's department).
- **Handler**: `backend/src/http/routes.js` -> `carton_service.indexFile`.

#### Request Body
```json
{
  "file_id": "F-90210",
  "file_ref": "REF-ACC-8831",
  "document_type": "Client KYC",
  "file_description": "Corporate KYC files for Branch 12",
  "document_year": 2026,
  "contains_pii": true
}
```

#### Response: `201 Created`
```json
{
  "fileId": "F-90210"
}
```

#### Error Responses
- `409 CONFLICT`: File ID already exists.

---

### 3.4 List Files in a Carton
- **Method & Route**: `GET /api/v1/cartons/:cartonId/files`
- **Purpose**: Lists indexed files in a carton.
- **Authentication**: Required.
- **Permissions**: `BUSINESS`, `COMPLIANCE`, `FACILITIES`. **Explicitly forbidden for `VENDOR`**.
- **Handler**: `backend/src/http/routes.js` -> `carton_service.listFiles`.

#### Response: `200 OK`
```json
[
  {
    "file_id": "F-90210",
    "file_ref": "REF-ACC-8831",
    "document_type": "Client KYC",
    "file_description": "Corporate KYC files for Branch 12",
    "document_year": 2026
  }
]
```

#### Error Responses
- `403 FORBIDDEN`: If called by a user with role `VENDOR` (field redaction protection).

---

### 3.5 Get Carton History & Event Stream
- **Method & Route**: `GET /api/v1/cartons/:cartonId/history`
- **Purpose**: Returns the carton's current projection state and full immutable event log history.
- **Authentication**: Required.
- **Permissions**: Scoped read access.
- **Handler**: `backend/src/http/routes.js` -> `eventRepo.history`.

#### Response: `200 OK`
```json
{
  "state": {
    "cartonId": "CT-100492",
    "status": "In Storage",
    "currentLocationId": "LOC-DEL-01",
    "legalHoldFlag": false
  },
  "events": [
    {
      "eventId": "EV-329482",
      "eventType": "CARTON_CREATED",
      "occurredAt": "2026-10-10T12:00:00.000Z",
      "actorId": "U-BIZ",
      "resultingStatus": "Created"
    },
    {
      "eventId": "EV-329485",
      "eventType": "PICKUP_REQUESTED",
      "occurredAt": "2026-10-10T12:05:00.000Z",
      "actorId": "U-BIZ",
      "resultingStatus": "Pickup Requested"
    },
    {
      "eventId": "EV-329490",
      "eventType": "PICKED_UP_BY_VENDOR",
      "occurredAt": "2026-10-10T14:00:00.000Z",
      "actorId": "U-VND",
      "resultingStatus": "In Transit to Vendor"
    },
    {
      "eventId": "EV-329495",
      "eventType": "RECEIVED_AT_WAREHOUSE",
      "occurredAt": "2026-10-10T16:30:00.000Z",
      "actorId": "U-VND",
      "resultingStatus": "In Storage"
    }
  ]
}
```

---

### 3.6 Get Carton Retention Calculation
- **Method & Route**: `GET /api/v1/cartons/:cartonId/retention`
- **Purpose**: Returns the calculated destruction due date from the `carton_retention` database view.
- **Authentication**: Required.
- **Permissions**: Scoped read access.
- **Handler**: `backend/src/http/routes.js` -> `cartonService.retention`.

#### Response: `200 OK`
```json
{
  "carton_id": "CT-100492",
  "retention_trigger_date": "2026-10-10",
  "policy_code": "Client KYC|Standard",
  "retention_years": 8,
  "destruction_due_on": "2034-10-10",
  "calculation_status": "CALCULATED"
}
```

---

## 4. Service Requests & Vendor Queue Endpoints

### 4.1 Raise an Operational Request
- **Method & Route**: `POST /api/v1/requests`
- **Purpose**: Submits a logistics instruction (`PICKUP`, `RETRIEVAL`, `RETURN`, or `DESTRUCTION`).
- **Authentication**: Required.
- **Permissions**: `BUSINESS` role only (own department).
- **Handler**: `backend/src/http/routes.js` -> `request_service.raiseRequest`.

#### Request Body
```json
{
  "request_id": "REQ-PICKUP-100492",
  "carton_id": "CT-100492",
  "request_type": "PICKUP"
}
```

#### Validations
- `request_type`: Must be one of `PICKUP`, `RETRIEVAL`, `RETURN`, `DESTRUCTION`.
- If `request_type === "DESTRUCTION"`, the server checks `holdRepo.activeForCarton(cartonId)`. If an active legal hold exists, throws `409 CONFLICT`.

#### Response: `201 Created`
```json
{
  "request_id": "REQ-PICKUP-100492",
  "carton_id": "CT-100492",
  "request_type": "PICKUP",
  "vendor_id": "VND-001",
  "request_status": "Open",
  "approved_by": null
}
```

---

### 4.2 List Vendor Work Queue
- **Method & Route**: `GET /api/v1/requests/queue`
- **Purpose**: Lists all open/active requests assigned to the logged-in vendor.
- **Authentication**: Required.
- **Permissions**: `VENDOR` role only.
- **Handler**: `backend/src/http/routes.js` -> `request_service.listVendorQueue`.

#### Response: `200 OK`
```json
[
  {
    "request_id": "REQ-PICKUP-100492",
    "carton_id": "CT-100492",
    "request_type": "PICKUP",
    "vendor_id": "VND-001",
    "request_status": "Open",
    "approved_by": null
  }
]
```

---

### 4.3 Vendor Action: Acknowledge Request
- **Method & Route**: `POST /api/v1/requests/:requestId/acknowledge`
- **Purpose**: Vendor acknowledges receipt of the instruction.
- **Permissions**: `VENDOR` assigned to request.
- **Event Generated**: `REQUEST_ACKNOWLEDGED`. Status remains `In Progress`.
- **Response**: `200 OK` returning updated request object.

---

### 4.4 Vendor Action: Confirm Collection
- **Method & Route**: `POST /api/v1/requests/:requestId/collect`
- **Purpose**: Vendor confirms physical pickup of carton from business office.
- **Permissions**: `VENDOR` assigned to request.
- **Event Generated**: `PICKED_UP_BY_VENDOR`. Carton transitions to `In Transit to Vendor`.
- **Response**: `200 OK`.

---

### 4.5 Vendor Action: Confirm Warehouse Receipt
- **Method & Route**: `POST /api/v1/requests/:requestId/receive`
- **Purpose**: Vendor confirms arrival and intake at their warehouse.
- **Permissions**: `VENDOR` assigned to request.
- **Event Generated**: `RECEIVED_AT_WAREHOUSE`. Carton transitions to `In Storage`. Request marked `Completed`.
- **Response**: `200 OK`.

---

### 4.6 Vendor Action: Deliver Retrieval
- **Method & Route**: `POST /api/v1/requests/:requestId/deliver`
- **Purpose**: Vendor confirms delivery of retrieved carton to business premises.
- **Permissions**: `VENDOR` assigned to request.
- **Event Generated**: `DELIVERED_TO_BUSINESS`. Carton transitions to `With Business`. Request marked `Completed`.
- **Response**: `200 OK`.

---

### 4.7 Compliance Action: Approve Destruction
- **Method & Route**: `POST /api/v1/requests/:requestId/approve`
- **Purpose**: Compliance verifies eligibility and approves a destruction instruction.
- **Permissions**: `COMPLIANCE` role only.
- **Validations**:
  - `req.raisedBy !== user.userId` (Separation of duties: requester cannot approve).
  - No active legal hold exists on carton.
- **Event Generated**: `DESTRUCTION_APPROVED`. Carton transitions to `Approved for Destruction`.
- **Response**: `200 OK`.

---

### 4.8 Vendor Action: Execute Destruction
- **Method & Route**: `POST /api/v1/requests/:requestId/destroy`
- **Purpose**: Vendor executes physical destruction of the carton.
- **Permissions**: `VENDOR` assigned to request.
- **Validations**:
  - Request must have `approved_by` populated.
  - Carton must currently be in `Approved for Destruction` status.
  - **Re-check Legal Holds**: Checks `holdRepo.activeForCarton()`. If a hold was applied after approval, execution is blocked with `409 CONFLICT`.
- **Event Generated**: `DESTROYED`. Carton transitions to terminal status `Destroyed`.
- **Response**: `200 OK`.

---

## 5. Legal Holds Endpoints

### 5.1 List Legal Holds
- **Method & Route**: `GET /api/v1/holds`
- **Purpose**: Lists legal holds across cartons.
- **Authentication**: Required.
- **Query Parameters**:
  - `active_only`: Boolean (`true` or `false`).
- **Permissions**: `COMPLIANCE` and `FACILITIES`.
- **Handler**: `backend/src/http/routes.js` -> `hold_service.listHolds`.

#### Response: `200 OK`
```json
[
  {
    "hold_id": "H-9812",
    "carton_id": "CT-100492",
    "matter_reference": "LIT-2026-SEC-01",
    "reason": "Subpoena from Enforcement Directorate",
    "starts_at": "2026-10-10T10:00:00.000Z",
    "released_at": null
  }
]
```

---

### 5.2 Apply Legal Hold
- **Method & Route**: `POST /api/v1/holds`
- **Purpose**: Places a legal hold on a carton and sets `carton.legal_hold_flag = 1`.
- **Permissions**: `COMPLIANCE` role only.
- **Handler**: `backend/src/http/routes.js` -> `hold_service.applyHold`.

#### Request Body
```json
{
  "hold_id": "H-9812",
  "carton_id": "CT-100492",
  "matter_reference": "LIT-2026-SEC-01",
  "reason": "Subpoena from Enforcement Directorate"
}
```

#### Response: `201 Created`
```json
{
  "hold_id": "H-9812"
}
```

---

### 5.3 Release Legal Hold
- **Method & Route**: `POST /api/v1/holds/:holdId/release`
- **Purpose**: Releases an active legal hold. Clears `carton.legal_hold_flag = 0` if no other active holds remain on that carton.
- **Permissions**: `COMPLIANCE` role only.
- **Handler**: `backend/src/http/routes.js` -> `hold_service.releaseHold`.

#### Request Body
```json
{
  "reason": "Matter settled in High Court"
}
```

#### Response: `200 OK`
```json
{
  "hold_id": "H-9812",
  "hold_release_date": "2026-10-10T16:00:00.000Z"
}
```

---

## 6. Reconciliation & Exceptions Endpoints

### 6.1 Trigger Reconciliation Run
- **Method & Route**: `POST /api/v1/reconciliations`
- **Purpose**: Initiates or replays a reconciliation check. Run fingerprinting guarantees idempotency.
- **Permissions**: `FACILITIES` role only.
- **Handler**: `backend/src/http/routes.js` -> `recon_service.startRun`.

#### Request Body
```json
{
  "run_kind": "INVENTORY",
  "scope_key": "VND-001:2026-Q1",
  "parameters": {}
}
```

#### Response: `201 Created`
```json
{
  "run_id": "a94a8fe5ccb19ba61c4c0873d391e987",
  "status": "COMPLETED",
  "deduplicated": false,
  "findings": 0
}
```

---

### 6.2 List Historical Reconciliation Runs
- **Method & Route**: `GET /api/v1/reconciliations`
- **Purpose**: Returns all historical reconciliation runs grouped over findings.
- **Permissions**: `FACILITIES` role only.
- **Response**: `200 OK` array of runs with finding counts.

---

### 6.3 List Exception Cases
- **Method & Route**: `GET /api/v1/exceptions`
- **Purpose**: Lists exception cases. Vendors only see exceptions owned by their `vendor_id`.
- **Permissions**: All authenticated roles (scoped).
- **Response**: `200 OK` array of exception items.

---

## 7. Dashboard & Reference Data Endpoints

### 7.1 Role-Scoped Dashboard Metrics
- **Method & Route**: `GET /api/v1/dashboard`
- **Purpose**: Returns aggregate statistics scoped to the user's role and boundary.
- **Permissions**: Any authenticated user.
- **Handler**: `backend/src/http/routes.js` -> `cartonRepo.totalCartons`, `requestRepo.countForUser`, `cartonRepo.countsByStatus`.

#### Response: `200 OK`
```json
{
  "role": "BUSINESS",
  "totalCartons": 14,
  "totalRequests": 3,
  "cartonsByStatus": [
    { "status_code": "In Storage", "n": 9 },
    { "status_code": "Created", "n": 3 },
    { "status_code": "In Transit to Vendor", "n": 2 }
  ]
}
```

---

### 7.2 Get Vendor Directory
- **Method & Route**: `GET /api/v1/reference-data/vendors`
- **Purpose**: Returns list of all active storage vendors for dropdown forms.
- **Response**: `200 OK` array of `{ vendor_id, vendor_name, status }`.

---

## 8. System & Health Check Endpoints

### 8.1 System Health
- **Method & Route**: `GET /health` (Mounted at root, no `/api/v1` prefix).
- **Purpose**: Liveness and database connectivity probe for orchestrators and load balancers.
- **Authentication**: None.
- **Handler**: `backend/src/server.js`.

#### Response: `200 OK`
```json
{
  "status": "ok",
  "database": "up",
  "env": "development"
}
```

---

## 9. Implementation Status Summary

| Endpoint | Implemented & Verified | Planned / Incomplete |
| :--- | :---: | :---: |
| Auth (`/login`, `/logout`, `/me`) | Verified | — |
| Cartons (`POST /cartons`, `GET /cartons/:id`) | Verified | — |
| File Indexing (`POST/GET /cartons/:id/files`) | Verified | — |
| Carton History (`GET /cartons/:id/history`) | Verified | — |
| Retention View (`GET /cartons/:id/retention`) | Verified | — |
| Requests (`POST /requests`, `GET /queue`) | Verified | — |
| Operational Actions (`ack`, `collect`, `receive`, `deliver`) | Verified | — |
| Destruction Approval & Execution (`approve`, `destroy`) | Verified | — |
| Legal Holds (`GET/POST /holds`, `release`) | Verified | — |
| Reconciliation Framework (`POST/GET /reconciliations`) | Verified | Detection algorithms return 0 findings |
| Exceptions (`GET /exceptions`) | Verified | Findings produced manually or in next phase |
| Dashboard & Vendors (`/dashboard`, `/reference-data/vendors`)| Verified | — |
| Ingestion Endpoints (`POST /api/v1/imports/workbook`) | Not Implemented | Planned next increment |

