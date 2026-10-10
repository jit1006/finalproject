# Role × permission matrix

Legend: ✔ allowed · ✖ denied · (scope) row-scoped

| Capability | Business | Vendor | Compliance | Facilities |
|---|---|---|---|---|
| Log in | ✔ | ✔ | ✔ | ✔ |
| View carton | ✔ (own dept) | ✔ (own vendor) | ✔ | ✔ |
| View carton contents (files) | ✔ (own dept) | ✖ | ✔ | ✔ |
| Register carton / index files | ✔ | ✖ | ✖ | ✖ |
| Raise pickup/retrieval/return | ✔ (own dept) | ✖ | ✖ | ✖ |
| Raise destruction request | ✔ (own dept) | ✖ | ✖ | ✖ |
| Acknowledge / collect / receive / deliver | ✖ | ✔ (own vendor) | ✖ | ✖ |
| Execute destruction | ✖ | ✔ (own vendor) | ✖ | ✖ |
| Approve destruction | ✖ | ✖ | ✔ (≠ requester) | ✖ |
| Apply / release legal hold | ✖ | ✖ | ✔ | ✖ |
| View legal holds | ✖ | ✖ | ✔ | ✔ |
| Run reconciliation | ✖ | ✖ | ✖ | ✔ |
| View exceptions | business-scoped | own vendor, redacted | ✔ | ✔ |

## Enforcement points (all server-side)

- **Role:** `requireRoles(ctx, ...)` in `http/routes.js`.
- **Row scope:** `services/scope.js`.
- **Field redaction:** vendor users refused carton contents in the files route;
  exception visibility filtered in `recon_service`.
- **Separation of duties:** destruction approver ≠ requester in
  `request_service.approveDestruction`.

The frontend hides controls for usability only; it is never the authority.
