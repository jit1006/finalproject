import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { DashboardSummary } from "../api/types";
import { useAuth } from "../auth/AuthContext";

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<DashboardSummary>("/dashboard").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Loading dashboard…</p>;

  return (
    <section>
      <h2>{user?.role_code} dashboard</h2>
      <div className="stat-grid">
        <div className="card stat">
          <span className="stat-value">{data.totalCartons}</span>
          <span className="stat-label">Cartons in scope</span>
        </div>
        <div className="card stat">
          <span className="stat-value">{data.totalRequests}</span>
          <span className="stat-label">Requests</span>
        </div>
      </div>
      <h3>Cartons by status</h3>
      <table className="data-table">
        <thead><tr><th>Status</th><th>Count</th></tr></thead>
        <tbody>
          {data.cartonsByStatus.length === 0 && (
            <tr><td colSpan={2} className="empty">No cartons yet.</td></tr>
          )}
          {data.cartonsByStatus.map((row) => (
            <tr key={row.status_code}><td>{row.status_code}</td><td>{row.n}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
