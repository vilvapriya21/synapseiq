import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { ROUTES } from "../routes/routePaths";
import { useAuthStore } from "../store/authStore";
import { UserRole } from "../types";
import { normalizeRole } from "../utils/roles";
import styles from "./DashboardLayout.module.css";

const navigation: Array<{ label: string; roles: UserRole[]; to: string }> = [
  { label: "Dashboard", roles: ["ADMIN", "LEARNER"], to: ROUTES.dashboard },
  { label: "Assessment", roles: ["ADMIN", "LEARNER"], to: ROUTES.assessments },
  { label: "Repository Onboarding", roles: ["ADMIN"], to: ROUTES.repositoryOnboard },
  { label: "User Management", roles: ["ADMIN"], to: ROUTES.adminUsers },
];

function DashboardLayout() {
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const role = normalizeRole(user?.roles[0]);
  const visibleNavigation = navigation.filter((item) => item.roles.includes(role));

  const handleLogout = () => {
    logout();
    navigate(ROUTES.login, { replace: true });
  };

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.logo}>
            <img alt="" src="/synapse-logo.svg" />
          </span>
          <div>
            <strong>SynapseIQ</strong>
            <span>Knowledge Platform</span>
          </div>
        </div>
        <nav className={styles.nav}>
          {visibleNavigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? styles.activeLink : styles.link)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className={styles.content}>
        <header className={styles.header}>
          <span>Production Workspace</span>
          <div className={styles.profile}>
            <span>{user?.name || "Workspace User"} - {role}</span>
            <button type="button" className={styles.logout} onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </header>
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
