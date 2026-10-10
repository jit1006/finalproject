# Setup and Deployment Guide — Physical Records Management System (PRMS)

## 1. System Requirements & Prerequisites

### 1.1 Verified Prerequisites
- **Node.js**: Version **>= 22.5.0** is strictly required for the backend because it relies on Node's native built-in SQLite engine (`node:sqlite`). 
  > *Current host environment verified: Node.js v24.18.0, npm v11.16.0.*
- **Operating System**: Cross-platform (Windows, macOS, Linux).
- **SQLite**: The built-in SQLite engine is embedded directly in Node.js. No separate system-level `sqlite3` installation is required to run the application (though a standalone `sqlite3` CLI is convenient for manual file inspection).

### 1.2 Dependency Footprint
- **Backend**: **Zero runtime dependencies**. The backend does not require running `npm install` to execute; it runs entirely on Node standard libraries (`node:sqlite`, `node:http`, `node:crypto`, `node:fs`, `node:path`, `node:test`).
- **Frontend**: Standard Node development packages (`react`, `react-dom`, `react-router-dom`, `vite`, `typescript`). Requires running `npm install` in `frontend/`.

---

## 2. Environment Configuration

Copy the template from `.env.example` to `backend/.env` (optional, as defaults are built in):

```bash
# In repository root
cp .env.example backend/.env
```

### Environment Variables Reference

| Variable | Default Value | Description | Production Guidance |
| :--- | :--- | :--- | :--- |
| `PRMS_PORT` | `8000` | HTTP port the Node backend listens on. | Configure behind an internal reverse proxy port (e.g. 8000). |
| `PRMS_DATABASE_FILE` | `./prms.db` | Relative or absolute path to the SQLite database file. | Set to an absolute path on a persistent volume with regular backups. |
| `PRMS_SESSION_SECRET` | Auto-generated per process | Secret used to sign session states if configured. | **Critical**: Set a static 64-character hex secret so user sessions survive server restarts. |
| `PRMS_SESSION_TTL_MINUTES` | `480` (8 hours) | Duration of a user login session before requiring re-authentication. | Adjust according to internal security compliance policies. |
| `PRMS_SESSION_COOKIE` | `prms_session` | Name of the HttpOnly session cookie. | Keep default or prefix with organization identifier. |
| `PRMS_SECURE_COOKIES` | `false` | When `true`, appends `Secure;` flag to session cookies (HTTPS only). | **Must be set to `true` in production** when served over HTTPS/TLS. |
| `PRMS_FRONTEND_ORIGIN` | `http://localhost:5173` | Allowed CORS origin for the browser frontend. | Set to the public production domain (e.g., `https://prms.internal.bank`). |
| `PRMS_ENV` | `development` | Environment label (`development`, `staging`, `production`). | Set to `production` in live environments. |
| `VITE_API_TARGET` | `http://localhost:8000` | Vite dev server reverse proxy target (frontend configuration). | Only used during `npm run dev` in `frontend/`. |

---

## 3. Step-by-Step Local Setup

### Step 1: Initialize the Database
Navigate to the `backend/` directory and apply the 16-table schema and reference seed data:
```bash
cd backend
npm run db:init
```
*Expected Console Output:*
```text
applied schema.sql
applied seed.sql
Database initialized.
```
This generates the SQLite database file (`prms.db`) containing the complete 16-table schema, retention view, triggers, and vocabulary lookup rows.

---

### Step 2: Provision User Accounts
The reference seed data establishes organizational entities and vendors, but contains no pre-provisioned user passwords for security reasons. Provision demo accounts across the four system roles using `scripts/create_user.js`:

```bash
# 1. Business User (Branch Banking - Delhi Branch)
node --experimental-sqlite scripts/create_user.js \
  --id U-BIZ --name "Dina Business" --email dina@example.com --role BUSINESS \
  --password demo --entity ENT-BRN --department DEP-BRN-DEL

# 2. Vendor User (SecureVault Storage Pvt Ltd)
node --experimental-sqlite scripts/create_user.js \
  --id U-VND --name "Victor Vendor" --email victor@sv.example --role VENDOR \
  --password demo --vendor VND-001

# 3. Compliance Officer (Global Scope)
node --experimental-sqlite scripts/create_user.js \
  --id U-CMP --name "Carla Compliance" --email carla@example.com --role COMPLIANCE \
  --password demo

# 4. Facilities Team (Global Scope)
node --experimental-sqlite scripts/create_user.js \
  --id U-FAC --name "Fay Facilities" --email fay@example.com --role FACILITIES \
  --password demo
```

---

### Step 3: Install Frontend Dependencies
In a separate terminal window, install the required packages for the React application:
```bash
cd ../frontend
npm install
```

---

### Step 4: Start the Services

#### Start the Backend Service
In the `backend/` folder:
```bash
cd backend
npm start
```
*Console output:*
```text
PRMS backend (Node+SQLite) listening on http://localhost:8000
DB file: ./prms.db · env: development
```
*Verify with Health Check:*
```bash
curl http://localhost:8000/health
# {"status":"ok","database":"up","env":"development"}
```

#### Start the Frontend Development Server
In the `frontend/` folder:
```bash
cd frontend
npm run dev
```
*Console output:*
```text
  VITE v6.4.4  ready in 1200 ms
  ➜  Local:   http://localhost:5173/
```

Access the application in your browser at: **`http://localhost:5173`**.

---

## 4. Production Deployment Procedure

### 4.1 Production Frontend Build
Compile the TypeScript code and generate static production assets:
```bash
cd frontend
npm run build
```
This produces optimized production bundles in `frontend/dist/`.

### 4.2 Production Process Management (systemd or PM2)
To run the Node.js backend continuously in the background under process supervision, use PM2 or a systemd service unit.

#### PM2 Configuration (`ecosystem.config.cjs`)
```javascript
module.exports = {
  apps: [
    {
      name: "prms-backend",
      cwd: "./backend",
      script: "src/server.js",
      node_args: "--experimental-sqlite",
      env: {
        PRMS_PORT: 8000,
        PRMS_DATABASE_FILE: "/var/lib/prms/prms.db",
        PRMS_SESSION_SECRET: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        PRMS_SECURE_COOKIES: "true",
        PRMS_FRONTEND_ORIGIN: "https://prms.internal.bank",
        PRMS_ENV: "production"
      }
    }
  ]
};
```

### 4.3 Reverse Proxy Configuration (Nginx)
In production, serve static frontend assets directly and reverse proxy API calls to the Node.js server:

```nginx
server {
    listen 443 ssl http2;
    server_name prms.internal.bank;

    ssl_certificate /etc/ssl/certs/prms.crt;
    ssl_certificate_key /etc/ssl/private/prms.key;

    # Serve static frontend build
    root /var/www/prms/frontend/dist;
    index index.html;

    # Static assets fallback to SPA router
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy REST API requests to Node backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check probe
    location /health {
        proxy_pass http://127.0.0.1:8000/health;
    }
}
```

---

## 5. Troubleshooting & Common Pitfalls

### Issue 1: `TypeError: DatabaseSync is not a constructor` or `Unknown flag --experimental-sqlite`
- **Cause**: Node.js version is older than 22.5.0.
- **Solution**: Upgrade Node.js using `nvm` or official installer to version `>= 22.5.0` (Node 24 LTS recommended). Verify with `node -v`.

### Issue 2: `Port 8000 or 5173 is already in use`
- **Cause**: A previous instance is still running in the background.
- **Solution**:
  - Windows: Run `Get-NetTCPConnection -LocalPort 8000, 5173` and terminate using `Stop-Process -Id <PID>`.
  - Linux/macOS: Run `lsof -i :8000` and `kill -9 <PID>`.

### Issue 3: `SQLite error: database is locked (code 5)`
- **Cause**: Another process or CLI instance opened the database file in exclusive lock mode.
- **Solution**: PRMS configures `PRAGMA journal_mode = WAL;` and `busy_timeout = 5000;` to minimize lock contention. Ensure any external SQLite tools (like DB Browser for SQLite) are closed or opened in read-only mode.

### Issue 4: `401 UNAUTHORIZED: Session expired or invalid` immediately after restarting the server
- **Cause**: `PRMS_SESSION_SECRET` is unset in development, so the server generates a new random secret on each boot, invalidating existing sessions.
- **Solution**: Define a static `PRMS_SESSION_SECRET` in `backend/.env`.

### Issue 5: `CORS error` when frontend communicates with backend
- **Cause**: Accessing the backend directly from a different host/origin without proper CORS headers.
- **Solution**: In development, always use the Vite proxy (`http://localhost:5173/api/...`), which forwards calls same-origin to port 8000. In production, ensure `PRMS_FRONTEND_ORIGIN` matches your application's domain.

