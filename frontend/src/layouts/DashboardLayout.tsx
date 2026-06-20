import { type CSSProperties, useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
  Link2,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { ROUTES } from "../routes/routePaths";
import synapseLogo from "../assets/synapse-logo.svg";
import { usePageTitle } from "../context/PageTitleContext";
import { useAuthStore } from "../store/authStore";
import { UserRole } from "../types";
import { normalizeRole } from "../utils/roles";
import styles from "./DashboardLayout.module.css";

const SIDEBAR_COLLAPSED_KEY = "synapseiq:sidebar-collapsed";

const navigation: Array<{ label: string; roles: UserRole[]; to: string }> = [
  { label: "Dashboard", roles: ["ADMIN", "LEARNER"], to: ROUTES.dashboard },
  { label: "Repository Onboarding", roles: ["ADMIN"], to: ROUTES.repositoryOnboard },
  { label: "Project Workspace", roles: ["ADMIN", "LEARNER"], to: ROUTES.projectWorkspace },
  { label: "Assessment", roles: ["ADMIN", "LEARNER"], to: ROUTES.assessments },
  { label: "User Management", roles: ["ADMIN"], to: ROUTES.adminUsers },
];

const navIcons: Record<string, LucideIcon> = {
  Dashboard: Home,
  "Project Workspace": Workflow,
  "Repository Onboarding": Link2,
  "User Management": Users,
};

function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const role = normalizeRole(user?.role ?? "");
  const { title } = usePageTitle();
  const visibleNavigation = navigation.filter((item) => item.roles.includes(role));

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    } catch {
      // Ignore storage failures; the visual toggle should still work for this session.
    }
  }, [collapsed]);

  const handleLogout = () => {
    if (!window.confirm("Are you sure you want to sign out?")) {
      return;
    }

    logout();
    navigate(ROUTES.login, { replace: true });
  };
  const initials = (user?.name || "Workspace User")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={styles.shell}
      style={{ "--sidebar-width": collapsed ? "76px" : "260px" } as CSSProperties}
    >
      <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`}>
        <div className={styles.brand}>
          <span className={styles.logo}>
            <img alt="SynapseIQ" src={synapseLogo} />
          </span>
          <div className={styles.brandText}>
            <strong>
              <span className={styles.brandNameText}>SynapseIQ</span>
            </strong>
          </div>
        </div>
        <button
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={styles.sidebarToggle}
          type="button"
          onClick={() => setCollapsed((current) => !current)}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        <nav className={styles.nav}>
          {visibleNavigation.map((item) => {
            const Icon = navIcons[item.label] || Home;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? styles.activeLink : styles.link)}
                title={item.label}
              >
                <Icon size={18} />
                <span className={styles.linkLabel}>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className={styles.sidebarProfile}>
          <span className={styles.avatar}>{initials}</span>
          <div className={styles.sidebarProfileText}>
            <strong>{user?.name || "Workspace User"}</strong>
            <span>{role}</span>
          </div>
          <ChevronDown className={styles.sidebarProfileChevron} size={16} />
        </div>
      </aside>
      <div className={styles.content}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <span className={styles.headerAppName}>SynapseIQ</span>
            <span className={styles.headerTagline}>AI Knowledge Platform</span>
          </div>
          <div className={styles.profile}>
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
