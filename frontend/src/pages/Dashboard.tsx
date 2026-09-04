import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, EmptyState, SearchInput } from "../components/common";
import Card from "../components/common/Card";
import Loader from "../components/common/Loader";
import { ROUTES } from "../routes/routePaths";
import { dashboardService, type DashboardResponse } from "../services/dashboardService";
import {
  getAssignedRepositories,
  getMyKtProviderAssignments,
  type MyAssignment,
  type RepositoryListResponse,
} from "../services/repositoryService";
import { useAuthStore } from "../store/authStore";
import { normalizeRole } from "../utils/roles";
import styles from "./Dashboard.module.css";

const adminStatLabels = [
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

function truncate(value: string, maxLength = 40) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const role = normalizeRole(user?.role ?? "");
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [assignedRepositories, setAssignedRepositories] = useState<RepositoryListResponse | null>(null);
  const [ktProviderAssignments, setKtProviderAssignments] = useState<MyAssignment[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError("");

    const request = role === "LEARNER"
      ? Promise.all([
          getAssignedRepositories(),
          getMyKtProviderAssignments().catch(() => [] as MyAssignment[]),
        ])
      : dashboardService.getDashboard();

    request
      .then((data) => {
        if (!isMounted) return;
        if (role === "LEARNER") {
          const [repositories, providerAssignments] = data as [RepositoryListResponse, MyAssignment[]];
          setAssignedRepositories(repositories);
          setKtProviderAssignments(providerAssignments);
          setDashboard(null);
        } else {
          setDashboard(data as DashboardResponse);
          setAssignedRepositories(null);
          setKtProviderAssignments([]);
        }
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
  }, [role]);

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
    return <Card className={styles.state}><Loader label="Loading dashboard..." /></Card>;
  }

  if (error) {
    return <Card className={styles.state}>{error}</Card>;
  }

  if (role === "LEARNER") {
    const learnerRepositories = assignedRepositories?.repositories ?? [];
    const assignedCount = assignedRepositories?.total ?? learnerRepositories.length;
    const indexedCount = learnerRepositories.filter(
      (repository) => repository.status === "indexed",
    ).length;
    const pendingCount = learnerRepositories.filter(
      (repository) => repository.status === "pending" || repository.status === "indexing",
    ).length;
    const knowledgeBasesReady = learnerRepositories.filter(
      (repository) => repository.knowledge_base_status === "ready",
    ).length;

    return (
      <div className={styles.page}>
        <div className={styles.banner}>
          <div className={styles.bannerTop}>
            <p className={styles.bannerGreeting}>
              Welcome back, <strong>{user?.name || "User"}</strong>
            </p>
          </div>
          <div className={styles.bannerStats}>
            <div className={styles.statTile}>
              <span className={styles.statLabel}>Assigned Repositories</span>
              <span className={styles.statValue}>{assignedCount}</span>
              <span className={styles.statHint}>Available to learn</span>
            </div>
            <div className={styles.statTile}>
              <span className={styles.statLabel}>Indexed</span>
              <span className={styles.statValue}>{indexedCount}</span>
              <span className={styles.statHint}>Ready for knowledge extraction</span>
            </div>
            <div className={styles.statTile}>
              <span className={styles.statLabel}>Pending / Indexing</span>
              <span className={styles.statValue}>{pendingCount}</span>
              <span className={styles.statHint}>Analysis in progress</span>
            </div>
            <div className={styles.statTile}>
              <span className={styles.statLabel}>Knowledge Bases</span>
              <span className={styles.statValue}>{knowledgeBasesReady}</span>
              <span className={styles.statHint}>Ready to query</span>
            </div>
          </div>
        </div>
        {ktProviderAssignments.length > 0 ? (
          <Card className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>My KT Assignments <span className={styles.providerBadge}>Provider</span></h2>
                <p>You have been assigned to deliver knowledge transfer on these topics.</p>
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Repository</th>
                    <th>KT Topic</th>
                    <th>Assigned On</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {ktProviderAssignments.map((assignment) => (
                    <tr key={assignment.assignment_id}>
                      <td><strong>{assignment.repository_name}</strong></td>
                      <td>{assignment.kt_topic_title ?? "General"}</td>
                      <td>{new Date(assignment.assigned_at).toLocaleDateString()}</td>
                      <td>
                        <button
                          className={styles.action}
                          onClick={() => navigate(`/repositories/${assignment.repository_id}`)}
                          type="button"
                        >
                          View Repository
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}
      </div>
    );
  }

  if (!dashboard) {
    return <EmptyState title="No dashboard data available" description="Dashboard metrics will appear once repository data is available." />;
  }

  return (
    <div className={styles.page}>
      <div className={styles.banner}>
        <div className={styles.bannerTop}>
          <p className={styles.bannerGreeting}>
            Welcome back, <strong>{user?.name || "User"}</strong>
          </p>
        </div>
        <div className={styles.bannerStats}>
          {adminStatLabels.map(([key, label, hint]) => (
            <div className={styles.statTile} key={key}>
              <span className={styles.statLabel}>{label}</span>
              <span className={styles.statValue}>{dashboard.stats[key] ?? 0}</span>
              <span className={styles.statHint}>{hint}</span>
            </div>
          ))}
        </div>
      </div>

      <Card className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Repositories</h2>
            <p>{filteredProjects.length} repositories matched</p>
          </div>
          <div className={styles.panelActions}>
            <SearchInput
              aria-label="Search repositories"
              wrapperClassName={styles.search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search repositories"
              value={search}
            />
            <Button className={styles.addRepositoryButton} onClick={() => navigate(ROUTES.repositoryOnboard)} type="button">
              Add Repository
            </Button>
          </div>
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
                <th>Action</th>
              </tr>
            </thead>
              <tbody>
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState title="No repositories found" description="No repositories matched your search." />
                  </td>
                </tr>
              ) : null}
              {filteredProjects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <div className={styles.projectName}>{project.name}</div>
                  </td>
                  <td className={styles.repository}>{truncate(project.repository)}</td>
                  <td>{project.language}</td>
                  <td>{project.module_count}</td>
                  <td>
                    <span className={badgeClass(project.status)}>{project.status}</span>
                  </td>
                  <td>
                    <button
                      className={styles.action}
                      onClick={() => navigate(`/repositories/${project.id}`)}
                      type="button"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default DashboardPage;
