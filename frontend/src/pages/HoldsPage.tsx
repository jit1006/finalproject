import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface Hold {
  hold_id: string;
  carton_id: string;
  matter_reference: string;
  reason: string;
  starts_at: string | null;
  released_at: string | null;
}

export function HoldsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Hold[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ hold_id: "", carton_id: "", matter_reference: "", reason: "" });

  const load = () => api.get<Hold[]>("/holds").then(setRows).catch((e) => setError(e.message));
  useEffect(() => void load(), []);

  const apply = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/holds", form);
      setForm({ hold_id: "", carton_id: "", matter_reference: "", reason: "" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to apply hold");
    }
  };

  const release = async (holdId: string) => {
    const reason = window.prompt("Release reason?");
    if (!reason) return;
    try {
      await api.post(`/holds/${holdId}/release`, { reason });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to release");
    }
  };

  const isCompliance = user?.role_code === "COMPLIANCE";

  return (
    <section>
      <h2>Legal holds</h2>
      {error && <p className="error">{error}</p>}

      {isCompliance && (
        <form className="card" onSubmit={apply}>
          <h3>Apply a hold</h3>
          <div className="form-grid">
            <label>Hold ID<input required value={form.hold_id} onChange={(e) => setForm({ ...form, hold_id: e.target.value })} /></label>
            <label>Carton ID<input required value={form.carton_id} onChange={(e) => setForm({ ...form, carton_id: e.target.value })} /></label>
            <label>Matter reference<input required value={form.matter_reference} onChange={(e) => setForm({ ...form, matter_reference: e.target.value })} /></label>
            <label>Reason<input required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label>
          </div>
          <button type="submit">Apply hold</button>
        </form>
      )}

      <table className="data-table">
        <thead><tr><th>Hold</th><th>Carton</th><th>Matter</th><th>Status</th>{isCompliance && <th></th>}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={isCompliance ? 5 : 4} className="empty">No holds.</td></tr>}
          {rows.map((h) => (
            <tr key={h.hold_id}>
              <td>{h.hold_id}</td>
              <td>{h.carton_id}</td>
              <td>{h.matter_reference}</td>
              <td>{h.released_at ? "Released" : "Active"}</td>
              {isCompliance && <td>{!h.released_at && <button onClick={() => release(h.hold_id)}>Release</button>}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
