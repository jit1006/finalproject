# Security Architecture & Risk Assessment — PRMS

## 1. Security Overview

The Physical Records Management System (PRMS) governs sensitive banking records, contracts, customer loan agreements, and legal dispute materials. Security controls are implemented directly at the database, runtime, and HTTP transport layers.

### Summary of Security Posture

| Defense Domain | Implementation Mechanism | Status |
| :--- | :--- | :---: |
| **Password Storage** | `scrypt` hashing with 16-byte random salt, 64-byte key length | **Implemented** |
| **Password Verification** | Constant-time comparison via `crypto.timingSafeEqual` | **Implemented** |
| **Session Tokens** | 32-byte cryptographically secure random bearer tokens (`base64url`) | **Implemented** |
| **Token Storage** | Only SHA-256 digests stored in database; raw tokens never persisted | **Implemented** |
| **Cookie Hardening** | `HttpOnly`, `SameSite=Lax`, configurable `Secure` flag | **Implemented** |
| **Access Control (RBAC)** | Role-based gatekeeping (`requireRoles`) on every sensitive route | **Implemented** |
| **Row-Level Security** | Programmatic entity/department and vendor scoping (`scope.js`) | **Implemented** |
| **Data Masking / Redaction**| File contents and PII blocked from Vendor users (HTTP 403) | **Implemented** |
| **Separation of Duties** | Requester cannot approve destruction (`approved_by <> raised_by`) | **Implemented** |
| **SQL Injection Prevention** | 100% parameterized prepared statements (`db.prepare(...).run/get/all`) | **Implemented** |
| **Audit Immutability** | Database triggers abort `UPDATE` and `DELETE` on audit tables | **Implemented** |
| **Payload Size Capping** | JSON body size capped at 1,000,000 bytes (1MB) to prevent memory exhaustion | **Implemented** |
| **Rate Limiting** | Throttling on `/auth/login` or sensitive endpoints | *Not Implemented (Recommended)* |
| **CSRF Defense** | Anti-CSRF double-submit token headers on mutating POST requests | *Not Implemented (Recommended)* |

---

## 2. Implemented Security Controls

### 2.1 Password Handling
- Passwords are encrypted using Node's native `node:crypto.scryptSync`:
  ```javascript
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(plain, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
  ```
- To prevent timing attacks, candidate hashes are compared using `crypto.timingSafeEqual`:
  ```javascript
  const derived = scryptSync(plain, salt, 64);
  const expectedBuf = Buffer.from(expected, "hex");
  return derived.length === expectedBuf.length && timingSafeEqual(derived, expectedBuf);
  ```
- Passwords are never returned in API payloads (`AppUser.toPublic` strips `passwordHash`).

### 2.2 Session Management
- Sessions use stateful opaque tokens generated via `crypto.randomBytes(32).toString("base64url")`.
- The database never stores raw tokens. It stores the SHA-256 digest (`crypto.createHash("sha256").update(token).digest("hex")`) in `app_session`. Even a complete database dump will not expose valid bearer tokens.
- Cookies are configured with:
  - `HttpOnly`: Inaccessible to client-side JavaScript (`document.cookie`), preventing token theft via Cross-Site Scripting (XSS).
  - `SameSite=Lax`: Mitigates unauthorized cross-site form submissions.
  - `Secure`: Configurable via `PRMS_SECURE_COOKIES=true` for HTTPS deployments.
  - `Max-Age`: Automatically expires after `PRMS_SESSION_TTL_MINUTES * 60` seconds.

### 2.3 SQL Injection Prevention
- The codebase uses **zero string concatenation** for dynamic values in SQL queries.
- Every repository uses parameterized queries with prepared statements:
  ```javascript
  // carton_repo.js
  db.prepare("SELECT * FROM carton WHERE carton_id = ?").get(cartonId);

  // user_repo.js
  db.prepare("SELECT * FROM app_user WHERE lower(email) = lower(?)").get(email);
  ```

### 2.4 Separation of Duties & Anti-Tampering Triggers
- **Destruction Approval**: In `request_service.js`, the server checks:
  ```javascript
  if (req.raisedBy === user.userId) {
    throw forbidden("Approver must differ from the requester (separation of duties)");
  }
  ```
- **Database Triggers**: The database schema prevents accidental or malicious tampering with history:
  ```sql
  CREATE TRIGGER protect_event_log_upd BEFORE UPDATE ON event_log
    BEGIN SELECT RAISE(ABORT, 'append-only: event_log cannot be updated'); END;
  CREATE TRIGGER protect_event_log_del BEFORE DELETE ON event_log
    BEGIN SELECT RAISE(ABORT, 'append-only: event_log cannot be deleted'); END;
  ```

### 2.5 Information Disclosure & Content Masking
- **Login Uniformity**: If a login attempt fails, the API responds with `"Invalid email or password"` regardless of whether the email exists, preventing user enumeration.
- **Vendor PII Redaction**: Route `GET /api/v1/cartons/:cartonId/files` checks if `user.roleCode === "VENDOR"` and immediately throws an HTTP 403 Forbidden error, preventing vendors from inspecting file dossiers, document titles, or PII.

---

## 3. Identified Risks & Production Recommendations

### Risk 1: Absence of Explicit CSRF Tokens on State-Modifying POST Endpoints
- **Vulnerability**: While cookies use `SameSite=Lax`, top-level GET navigations and certain cross-origin browser interactions could pose CSRF risks if third-party content is embedded.
- **Mitigation Recommendation**: Implement an anti-CSRF token mechanism (such as requiring a custom header `X-CSRF-Token` or comparing request `Origin` headers against `PRMS_FRONTEND_ORIGIN` on all `POST` requests).

### Risk 2: Lack of Login Rate Limiting / Brute-Force Protection
- **Vulnerability**: The endpoint `POST /api/v1/auth/login` does not track or restrict consecutive failed login attempts. An attacker could attempt brute-force dictionary attacks against known employee emails.
- **Mitigation Recommendation**: Introduce an in-memory or database-backed IP/email rate limiter (e.g., maximum 5 failed attempts per 5 minutes before applying exponential backoff or temporary account locking).

### Risk 3: Ephemeral Session Secret Fallback in Development
- **Vulnerability**: In `config.js`, if `PRMS_SESSION_SECRET` is unset, `randomBytes(32).toString("hex")` is generated on process startup. While secure, any server restart immediately invalidates all active browser sessions.
- **Mitigation Recommendation**: In production, make `PRMS_SESSION_SECRET` a mandatory environment variable; fail process startup if it is not provided.

### Risk 4: Cookie Transmission over Plain HTTP
- **Vulnerability**: In local development, `PRMS_SECURE_COOKIES` defaults to `false`. If accidentally deployed to production without setting `PRMS_SECURE_COOKIES=true`, session cookies could be intercepted over unencrypted networks.
- **Mitigation Recommendation**: Ensure reverse proxies enforce TLS/HTTPS termination and explicitly set `PRMS_SECURE_COOKIES=true` in production deployment scripts.

