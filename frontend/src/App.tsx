import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { CartonsPage } from "./pages/CartonsPage";
import { CartonDetailPage } from "./pages/CartonDetailPage";
import { VendorQueuePage } from "./pages/VendorQueuePage";
import { HoldsPage } from "./pages/HoldsPage";
import { ReconciliationPage } from "./pages/ReconciliationPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="centered">Loading…</div>;
  if (!user) return <LoginPage />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/cartons" element={<CartonsPage />} />
        <Route path="/cartons/:cartonId" element={<CartonDetailPage />} />
        {user.role_code === "VENDOR" && <Route path="/queue" element={<VendorQueuePage />} />}
        {user.role_code === "COMPLIANCE" && <Route path="/approvals" element={<ApprovalsPage />} />}
        {(user.role_code === "COMPLIANCE" || user.role_code === "FACILITIES") && (
          <Route path="/holds" element={<HoldsPage />} />
        )}
        {user.role_code === "FACILITIES" && <Route path="/reconciliation" element={<ReconciliationPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
