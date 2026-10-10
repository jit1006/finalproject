import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { ServiceRequest } from "../api/types";

const ACTIONS: Record<string, { label: string; endpoint: string }[]> = {
  PICKUP: [
    { label: "Acknowledge", endpoint: "acknowledge" },
    { label: "Collect", endpoint: "collect" },
    { label: "Receive at warehouse", endpoint: "receive" },
  ],
  RETRIEVAL: [
    { label: "Acknowledge", endpoint: "acknowledge" },
    { label: "Deliver", endpoint: "deliver" },
  ],
  RETURN: [
    { label: "Acknowledge", endpoint: "acknowledge" },
    { label: "Receive at warehouse", endpoint: "receive" },
  ],
  DESTRUCTION: [
    { label: "Acknowledge", endpoint: "acknowledge" },
    { label: "Execute destruction", endpoint: "destroy" },
  ],
};

export function VendorQueuePage() {
  const [rows, setRows] = useState<ServiceRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.get<ServiceRequest[]>("/requests/queue").then(setRows).catch((e) => setError(e.message));
  useEffect(() => void load(), []);

  const act = async (requestId: string, endpoint: string) => {
    setError(null);
    try {
      await api.post(`/requests/${requestId}/${endpoint}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed");
    }
  };

  return (
    <section>
      <h2>My request queue</h2>
      {error && <p className="error">{error}</p>}
      <table className="data-table">
        <thead><tr><th>Request</th><th>Carton</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={5} className="empty">No requests assigned.</td></tr>}
          {rows.map((r) => (
            <tr key={r.request_id}>
              <td>{r.request_id}</td>
              <td>{r.carton_id}</td>
              <td>{r.request_type}</td>
              <td>
                {r.request_status}
                {r.request_type === "DESTRUCTION" && (
                  <span className="muted" style={{ display: "block", fontSize: "0.75rem" }}>
                    {r.approved_by ? `Approved by ${r.approved_by}` : "Pending Compliance approval"}
                  </span>
                )}
              </td>
              <td className="row">
                {(ACTIONS[r.request_type] ?? []).map((a) => {
                  if (a.endpoint === "destroy" && !r.approved_by) {
                    return (
                      <button
                        key={a.endpoint}
                        disabled
                        title="Compliance approval is required before execution"
                      >
                        Awaiting Approval
                      </button>
                    );
                  }
                  return (
                    <button key={a.endpoint} onClick={() => act(r.request_id, a.endpoint)}>
                      {a.label}
                    </button>
                  );
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Collection and warehouse receipt are separate confirmations — a collected carton is not yet in storage.</p>
    </section>
  );
}
