import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ROUTES } from "../routes/routePaths";
import { useAuthStore } from "../store/authStore";
import styles from "./DashboardLayout.module.css";

const navigation = [
  { label: "Dashboard", to: ROUTES.dashboard },
  { label: "Repository Onboarding", to: ROUTES.repositoryOnboard },
];

function DashboardLayout() {
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const navigate = useNavigate();

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
          {navigation.map((item) => {
            const isActive = location.pathname === item.to;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={styles.link}
                style={{
                  background: isActive ? "rgba(99, 130, 240, 0.2)" : "transparent",
                  color: isActive ? "rgb(165, 180, 252)" : "rgba(255,255,255,0.55)",
                }}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(item.to);
                }}
              >
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <div className={styles.content}>
        <header className={styles.header}>
          <span>Production Workspace</span>
          <div className={styles.profile}>
            <span>{user?.name || "Workspace User"}</span>
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
