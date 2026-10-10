import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Carton } from "../api/types";
import { useAuth } from "../auth/AuthContext";

export function CartonsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [lookupId, setLookupId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    carton_id: "",
    document_type: "Client KYC",
    archival_policy: "Standard",
    carton_created_date: new Date().toISOString().slice(0, 10),
    assigned_vendor_id: "VND-001",
    retention_trigger_date: "",
  });

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const payload = { ...form, retention_trigger_date: form.retention_trigger_date || null };
      const created = await api.post<Carton>("/cartons", payload);
      navigate(`/cartons/${created.carton_id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to register carton");
    }
  };

  return (
    <section>
      <h2>Cartons</h2>
      <div className="card">
        <h3>Open a carton</h3>
        <div className="row">
          <input placeholder="Carton ID" value={lookupId} onChange={(e) => setLookupId(e.target.value)} />
          <button disabled={!lookupId} onClick={() => navigate(`/cartons/${lookupId.trim()}`)}>View</button>
        </div>
      </div>

      {user?.role_code === "BUSINESS" && (
        <form className="card" onSubmit={register}>
          <h3>Register a new carton</h3>
          <div className="form-grid">
            <label>Carton ID<input required value={form.carton_id} onChange={(e) => setForm({ ...form, carton_id: e.target.value })} /></label>
            <label>Document type<input value={form.document_type} onChange={(e) => setForm({ ...form, document_type: e.target.value })} /></label>
            <label>Archival policy<input value={form.archival_policy} onChange={(e) => setForm({ ...form, archival_policy: e.target.value })} /></label>
            <label>Vendor<input value={form.assigned_vendor_id} onChange={(e) => setForm({ ...form, assigned_vendor_id: e.target.value })} /></label>
            <label>Created date<input type="date" value={form.carton_created_date} onChange={(e) => setForm({ ...form, carton_created_date: e.target.value })} /></label>
            <label>Retention trigger date<input type="date" value={form.retention_trigger_date} onChange={(e) => setForm({ ...form, retention_trigger_date: e.target.value })} /></label>
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit">Register carton</button>
        </form>
      )}
    </section>
  );
}
