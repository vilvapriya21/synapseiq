import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Bell,
  ChevronDown,
  Home,
  Link2,
  Search,
  Settings,
  Sparkles,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { ROUTES } from "../routes/routePaths";
import { useAuthStore } from "../store/authStore";
import { UserRole } from "../types";
import { normalizeRole } from "../utils/roles";
import styles from "./DashboardLayout.module.css";

const navigation: Array<{ label: string; roles: UserRole[]; to: string }> = [
  { label: "Dashboard", roles: ["ADMIN", "LEARNER"], to: ROUTES.dashboard },
  { label: "Project Workspace", roles: ["ADMIN", "LEARNER"], to: ROUTES.projectWorkspace },
  { label: "Repository Onboarding", roles: ["ADMIN"], to: ROUTES.repositoryOnboard },
  { label: "User Management", roles: ["ADMIN"], to: ROUTES.adminUsers },
];

const navIcons: Record<string, LucideIcon> = {
  Dashboard: Home,
  "Project Workspace": Workflow,
  "Repository Onboarding": Link2,
  "User Management": Users,
};

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
  const initials = (user?.name || "Workspace User")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.logo}>
            <Sparkles size={21} />
          </span>
          <div>
            <strong>SynapseIQ</strong>
            <span>AI Knowledge Platform</span>
          </div>
        </div>
        <nav className={styles.nav}>
          {visibleNavigation.map((item) => {
            const Icon = navIcons[item.label] || Home;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? styles.activeLink : styles.link)}
              >
                <Icon size={18} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className={styles.upgradeCard}>
          <strong>Upgrade Plan</strong>
          <span>Unlock deeper insights and team collaboration.</span>
          <button type="button">Upgrade Now</button>
        </div>
        <div className={styles.sidebarProfile}>
          <span className={styles.avatar}>{initials}</span>
          <div>
            <strong>{user?.name || "Workspace User"}</strong>
            <span>{role}</span>
          </div>
          <ChevronDown size={16} />
        </div>
      </aside>
      <div className={styles.content}>
        <header className={styles.header}>
          <div className={styles.searchBox}>
            <Search size={17} />
            <input placeholder="Search repositories..." type="search" />
          </div>
          <div className={styles.profile}>
            <button className={styles.iconButton} type="button" aria-label="Notifications">
              <Bell size={18} />
            </button>
            <button className={styles.iconButton} type="button" aria-label="Settings">
              <Settings size={18} />
            </button>
            <span className={styles.avatar}>{initials}</span>
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
