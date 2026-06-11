import { NavLink, Outlet } from "react-router-dom";
import { ROUTES } from "../routes/routePaths";
import { useAuthStore } from "../store/authStore";
import styles from "./DashboardLayout.module.css";

const navigation = [
  { label: "Dashboard", to: ROUTES.dashboard },
  { label: "Repository Onboard", to: ROUTES.repositoryOnboard },
];

function DashboardLayout() {
  const logout = useAuthStore((state) => state.logout);

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>SynapseIQ</div>
        <nav className={styles.nav}>
          {navigation.map((item) => (
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
          <button type="button" className={styles.logout} onClick={logout}>
            Sign out
          </button>
        </header>
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
