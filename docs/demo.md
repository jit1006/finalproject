# Demo script (Node + SQLite)

Setup:

```bash
cd sqlite-app/backend
npm run db:init
npm run seed:users -- --id U-BIZ --name "Dina Business" --email dina@example.com --role BUSINESS --password demo --entity ENT-BRN --department DEP-BRN-DEL
npm run seed:users -- --id U-VND --name "Victor Vendor" --email victor@sv.example --role VENDOR --password demo --vendor VND-001
npm run seed:users -- --id U-CMP --name "Carla Compliance" --email carla@example.com --role COMPLIANCE --password demo
npm run seed:users -- --id U-FAC --name "Fay Facilities" --email fay@example.com --role FACILITIES --password demo
npm start
# in another terminal: cd ../frontend && npm install && VITE_API_TARGET=http://localhost:8000 npm run dev
```

## Walkthrough (~10 min)

1. **Roles (1m).** Log in as each role; the nav changes (Vendor → My Queue only;
   Facilities → Reconciliation).
2. **Pickup & receipt (2m).** Business registers a carton, raises Pickup. Vendor
   Acknowledge → Collect → Receive. History shows collection and warehouse
   receipt as **separate** events; only after receipt is status **In Storage**.
3. **Retrieval & history (2m).** Business raises Retrieval; Vendor Delivers. Show
   the event-log-derived history on the carton detail page.
4. **Retention & hold (2m).** Open a carton's retention (from the view). Edit a
   `retention_policy` row (e.g. with the `sqlite3` CLI) and refresh — the due
   date changes, no code edit. As Compliance apply a hold; Business destruction
   request is then refused.
5. **Reconciliation (2m).** As Facilities start a run; show it recorded with
   who/when/scope and that re-running the same scope deduplicates. (Detection
   engines are the next increment — say so.)
6. **Access denial (1m).** As Vendor, open a carton's files → forbidden. As
   Business, open another department's carton → forbidden.

Use an eligible historical carton for destruction; don't fabricate results.
