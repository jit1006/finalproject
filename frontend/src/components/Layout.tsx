import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { Role } from "../api/types";

interface NavItem {
  to: string;
  label: string;
  roles: Role[] | "all";
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", roles: "all" },
  { to: "/cartons", label: "Cartons", roles: ["BUSINESS", "FACILITIES", "COMPLIANCE"] },
  { to: "/queue", label: "My Queue", roles: ["VENDOR"] },
  { to: "/approvals", label: "Approvals", roles: ["COMPLIANCE"] },
  { to: "/holds", label: "Legal Holds", roles: ["COMPLIANCE", "FACILITIES"] },
  { to: "/reconciliation", label: "Reconciliation", roles: ["FACILITIES"] },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const visible = NAV.filter((n) => n.roles === "all" || (user && n.roles.includes(user.role_code)));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1 className="brand">PRMS</h1>
        <div className="role-badge">{user?.role_code}</div>
        <nav>
          {visible.map((n) => (
            <Link key={n.to} to={n.to} className={loc.pathname === n.to ? "active" : ""}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="user-footer">
          <div>{user?.full_name}</div>
          <button onClick={() => void logout()}>Sign out</button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
