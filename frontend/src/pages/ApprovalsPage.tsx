import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { ServiceRequest } from "../api/types";

export function ApprovalsPage() {
  const [rows, setRows] = useState<ServiceRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setError(null);
    return api
      .get<ServiceRequest[]>("/requests/pending-approvals")
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void load();
  }, []);

  const approve = async (requestId: string) => {
    setError(null);
    setNotice(null);
    try {
      await api.post(`/requests/${requestId}/approve`);
      setNotice(`Request ${requestId} approved successfully. Carton is now Approved for Destruction.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Approval failed");
    }
  };

  return (
    <section>
      <h2>Destruction Approvals Queue</h2>
      <p className="muted">
        Review and authorize physical destruction requests submitted by business units. Under banking compliance
        rules, destruction requires independent approval by Compliance before physical disposal can occur.
      </p>

      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {loading ? (
        <p>Loading pending approvals…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Request ID</th>
              <th>Carton ID</th>
              <th>Requested By</th>
              <th>Requested On</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  No destruction requests pending approval.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.request_id}>
                <td>{r.request_id}</td>
                <td>
                  <Link to={`/cartons/${r.carton_id}`}>{r.carton_id}</Link>
                </td>
                <td>{r.raised_by ?? "—"}</td>
                <td>{r.raised_on ? r.raised_on.slice(0, 19).replace("T", " ") : "—"}</td>
                <td>{r.request_status}</td>
                <td>
                  <button onClick={() => approve(r.request_id)}>Approve Destruction</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

