import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Carton, CartonHistory, ServiceRequest } from "../api/types";
import { useAuth } from "../auth/AuthContext";

export function CartonDetailPage() {
  const { cartonId } = useParams<{ cartonId: string }>();
  const { user } = useAuth();
  const [carton, setCarton] = useState<Carton | null>(null);
  const [history, setHistory] = useState<CartonHistory | null>(null);
  const [retention, setRetention] = useState<Record<string, unknown> | null>(null);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => {
    if (!cartonId) return;
    setError(null);
    api.get<Carton>(`/cartons/${cartonId}`).then(setCarton).catch((e) => setError(e.message));
    api.get<CartonHistory>(`/cartons/${cartonId}/history`).then(setHistory).catch(() => {});
    api.get<Record<string, unknown>>(`/cartons/${cartonId}/retention`).then(setRetention).catch(() => {});
    api.get<ServiceRequest[]>(`/cartons/${cartonId}/requests`).then(setRequests).catch(() => {});
  };
  useEffect(() => { load(); }, [cartonId]);

  const raiseRequest = async (requestType: string) => {
    if (!cartonId) return;
    setNotice(null);
    try {
      await api.post("/requests", {
        request_id: `${requestType}-${cartonId}-${Date.now()}`,
        carton_id: cartonId,
        request_type: requestType,
      });
      setNotice(`${requestType} request raised.`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Request failed");
    }
  };

  const approveDestruction = async (requestId: string) => {
    setNotice(null);
    setError(null);
    try {
      await api.post(`/requests/${requestId}/approve`);
      setNotice("Destruction request approved by Compliance. Ready for Vendor execution.");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Approval failed");
    }
  };

  if (error) return <p className="error">{error}</p>;
  if (!carton) return <p>Loading carton…</p>;
  const canRequest = user?.role_code === "BUSINESS";
  const isCompliance = user?.role_code === "COMPLIANCE";

  return (
    <section>
      <h2>Carton {carton.carton_id}</h2>
      <div className="card">
        <dl className="detail">
          <dt>Entity / Dept</dt><dd>{carton.entity_id} / {carton.department_id}</dd>
          <dt>Document type</dt><dd>{carton.document_type}</dd>
          <dt>Archival policy</dt><dd>{carton.archival_policy}</dd>
          <dt>Vendor</dt><dd>{carton.assigned_vendor_id}</dd>
          {retention && (
            <>
              <dt>Destruction due</dt>
              <dd>{String(retention.destruction_due_on ?? "—")} <span className="muted">({String(retention.calculation_status)})</span></dd>
            </>
          )}
        </dl>
      </div>

      {carton.current_status === "Destruction Requested" && (
        <p className="notice" style={{ background: "rgba(245, 158, 11, 0.15)", borderColor: "#f59e0b", color: "#fbbf24" }}>
          ⚠️ Destruction has been requested by Business. Awaiting Compliance independent verification & approval before Vendor can execute.
        </p>
      )}
      {carton.current_status === "Approved for Destruction" && (
        <p className="notice" style={{ background: "rgba(16, 185, 129, 0.15)", borderColor: "#10b981", color: "#34d399" }}>
          ✅ Destruction has been approved by Compliance. Assigned Vendor can now execute physical destruction from their queue.
        </p>
      )}
      {carton.current_status === "Destroyed" && (
        <p className="error" style={{ background: "rgba(239, 68, 68, 0.15)", borderColor: "#ef4444", color: "#f87171" }}>
          🛑 This carton has been physically destroyed. This is a permanent, terminal state.
        </p>
      )}

      {notice && <p className="notice">{notice}</p>}
      {error && <p className="error">{error}</p>}

      {canRequest && carton.current_status !== "Destroyed" && (
        <div className="card">
          <h3>Raise a request</h3>
          <div className="row">
            <button onClick={() => raiseRequest("PICKUP")}>Pickup</button>
            <button onClick={() => raiseRequest("RETRIEVAL")}>Retrieval</button>
            <button onClick={() => raiseRequest("RETURN")}>Return</button>
            <button onClick={() => raiseRequest("DESTRUCTION")}>Destruction</button>
          </div>
        </div>
      )}

      {requests.length > 0 && (
        <div className="card">
          <h3>Associated Requests</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Request ID</th>
                <th>Type</th>
                <th>Status</th>
                <th>Requested By</th>
                <th>Approved By</th>
                {isCompliance && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.request_id}>
                  <td>{r.request_id}</td>
                  <td>{r.request_type}</td>
                  <td>{r.request_status}</td>
                  <td>{r.raised_by ?? "—"}</td>
                  <td>{r.approved_by ? `Approved by ${r.approved_by}` : "—"}</td>
                  {isCompliance && (
                    <td>
                      {r.request_type === "DESTRUCTION" && !r.approved_by && r.request_status !== "Completed" && (
                        <button onClick={() => approveDestruction(r.request_id)}>
                          Approve Destruction
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3>Current state</h3>
        {history?.state ? (
          <dl className="detail">
            <dt>Status</dt><dd>{String(history.state.status)}</dd>
            <dt>Location</dt><dd>{String(history.state.currentLocationId ?? "—")}</dd>
            <dt>Legal hold</dt><dd>{history.state.legalHoldFlag ? "Yes" : "No"}</dd>
          </dl>
        ) : (
          <p className="empty">No state yet.</p>
        )}
      </div>

      <div className="card">
        <h3>History (event log)</h3>
        <table className="data-table">
          <thead><tr><th>When</th><th>Event</th><th>Actor</th><th>Resulting status</th></tr></thead>
          <tbody>
            {(history?.events ?? []).map((e) => (
              <tr key={e.eventId}>
                <td>{e.occurredAt?.slice(0, 19).replace("T", " ")}</td>
                <td>{e.eventType}</td>
                <td>{e.actorId ?? "—"}</td>
                <td>{e.resultingStatus ?? "—"}</td>
              </tr>
            ))}
            {(history?.events ?? []).length === 0 && (
              <tr><td colSpan={4} className="empty">No events.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
