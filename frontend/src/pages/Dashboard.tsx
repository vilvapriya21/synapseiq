import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/common";
import { ROUTES } from "../routes/routePaths";
import { dashboardService, DashboardProject, DashboardResponse } from "../services/dashboardService";
import { useAuthStore } from "../store/authStore";
import styles from "./Dashboard.module.css";

const statLabels = [
  ["totalRepositories", "Total Repositories", "Connected and analysed"],
  ["indexedRepositories", "Indexed", "Ready for knowledge extraction"],
  ["pendingRepositories", "Pending / Indexing", "Analysis in progress"],
  ["knowledgeBasesReady", "Knowledge Bases", "Ready to query"],
] as const;

function badgeClass(status: string) {
  if (status === "indexed") return `${styles.badge} ${styles.badgeActive}`;
  if (status === "indexing") return `${styles.badge} ${styles.badgeReview}`;
  if (status === "error") return `${styles.badge} ${styles.badgeError}`;
  return `${styles.badge} ${styles.badgePending}`;
}

function truncateSource(value: string) {
  return value.length > 40 ? `${value.slice(0, 40)}...` : value;
}

function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    dashboardService
      .getDashboard()
      .then((data) => {
        if (isMounted) setDashboard(data);
      })
      .catch(() => {
        if (isMounted) setError("Dashboard data could not be loaded.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredProjects = useMemo(() => {
    const projects = dashboard?.projects || [];
    const query = search.toLowerCase().trim();
    if (!query) return projects;
    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(query) ||
        project.repository.toLowerCase().includes(query) ||
        project.language.toLowerCase().includes(query),
    );
  }, [dashboard?.projects, search]);

  if (isLoading) {
    return <div className={styles.state}>Loading dashboard...</div>;
  }

  if (error || !dashboard) {
    return <div className={styles.state}>{error || "No dashboard data available."}</div>;
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Welcome {user?.name || "User"}</p>
          <h1 className={styles.heading}>Dashboard</h1>
        </div>
        <input
          className={styles.search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search projects"
          type="search"
          value={search}
        />
      </section>

      <section className={styles.stats}>
        {statLabels.map(([key, label, hint]) => (
          <article className={styles.statCard} key={key}>
            <span className={styles.statLabel}>{label}</span>
            <span className={styles.statValue}>{dashboard.stats[key]}</span>
            <span className={styles.statHint}>{hint}</span>
          </article>
        ))}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Projects</h2>
            <p>{filteredProjects.length} repositories matched</p>
          </div>
          <Button onClick={() => navigate(ROUTES.repositoryOnboard)} type="button">
            Add Repository
          </Button>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Repository Name</th>
                <th>URL/Source</th>
                <th>Language</th>
                <th>Modules</th>
                <th>Status</th>
                <th>KB Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map((project) => (
                <tr key={project.id}>
                  <td>
                      <div className={styles.projectName}>{project.name}</div>
                    </td>
                  <td className={styles.repository} title={project.repository}>
                    {truncateSource(project.repository)}
                  </td>
                  <td>{project.language}</td>
                  <td>{project.module_count}</td>
                  <td>
                    <span className={badgeClass(project.status)}>{project.status}</span>
                  </td>
                  <td className={project.knowledge_base_status === "none" ? styles.repository : undefined}>
                    {project.knowledge_base_status}
                  </td>
                  <td>
                    <button
                      className={styles.action}
                      onClick={() => navigate(`/repositories/${project.id}`)}
                      type="button"
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default DashboardPage;
