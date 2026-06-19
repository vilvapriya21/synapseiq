import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, EmptyState, PageHero } from "../components/common";
import Card from "../components/common/Card";
import Loader from "../components/common/Loader";
import { ROUTES } from "../routes/routePaths";
import { dashboardService, type DashboardResponse } from "../services/dashboardService";
import {
  getAssignedRepositories,
  getMyAssignments,
  type MyAssignment,
  type Repository,
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
  const role = normalizeRole(user?.roles[0]);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [assignedRepositories, setAssignedRepositories] = useState<RepositoryListResponse | null>(null);
  const [myAssignments, setMyAssignments] = useState<MyAssignment[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError("");

    const request = role === "LEARNER"
      ? Promise.all([getAssignedRepositories(), getMyAssignments()])
      : dashboardService.getDashboard();

    request
      .then((data) => {
        if (!isMounted) return;
        if (role === "LEARNER") {
          const [repositoriesResponse, assignmentsResponse] = data as [RepositoryListResponse, MyAssignment[]];
          setAssignedRepositories(repositoriesResponse);
          setMyAssignments(assignmentsResponse);
          setDashboard(null);
        } else {
          setDashboard(data as DashboardResponse);
          setAssignedRepositories(null);
          setMyAssignments([]);
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

  const filteredAssignedRepositories = useMemo(() => {
    const repositories = assignedRepositories?.repositories || [];
    const query = search.toLowerCase().trim();
    if (!query) return repositories;
    return repositories.filter(
      (repository) =>
        repository.name.toLowerCase().includes(query) ||
        (repository.url || "").toLowerCase().includes(query) ||
        (repository.language || "").toLowerCase().includes(query),
    );
  }, [assignedRepositories?.repositories, search]);

  if (isLoading) {
    return <Card className={styles.state}><Loader label="Loading dashboard..." /></Card>;
  }

  if (error) {
    return <Card className={styles.state}>{error}</Card>;
  }

  if (role === "LEARNER") {
    const assignedCount = assignedRepositories?.total ?? filteredAssignedRepositories.length;
    const knowledgeBasesReady = filteredAssignedRepositories.filter(
      (repository) => repository.knowledge_base_status === "ready",
    ).length;

    return (
      <div className={styles.page}>
        <PageHero
          eyebrow={`Welcome ${user?.name || "User"}`}
          heading="Learner Dashboard"
          action={
            <input
              className={styles.search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search repositories"
              type="search"
              value={search}
            />
          }
        />

        <section className={styles.stats}>
          <Card className={styles.statCard}>
            <span className={styles.statLabel}>Repositories Assigned</span>
            <span className={styles.statValue}>{assignedCount}</span>
            <span className={styles.statHint}>Available to learn</span>
          </Card>
          <Card className={styles.statCard}>
            <span className={styles.statLabel}>Knowledge Bases Ready</span>
            <span className={styles.statValue}>{knowledgeBasesReady}</span>
            <span className={styles.statHint}>Ready to query</span>
          </Card>
        </section>

        <Card className={styles.card}>
          <h2>My Current Learning</h2>
          {myAssignments.length === 0 ? (
            <EmptyState
              title="No repositories assigned yet"
              description="Assigned repositories and KT topics will appear here when your admin assigns them."
            />
          ) : (
            <div className={styles.assignmentGrid}>
              {myAssignments.map((assignment) => (
                <div key={assignment.assignment_id} className={styles.assignmentCard}>
                  <span className={styles.repoTag}>{assignment.repository_name}</span>
                  <h3>{assignment.kt_topic_title || assignment.repository_name}</h3>
                  {assignment.kt_topic_description ? <p>{assignment.kt_topic_description}</p> : null}
                  <span className={styles.statusBadge}>{assignment.status}</span>
                  <button
                    className={styles.primaryButton}
                    onClick={() => navigate(`/repositories/${assignment.repository_id}`)}
                    type="button"
                  >
                    Start Learning
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Assigned Repositories</h2>
              <p>{filteredAssignedRepositories.length} repositories matched</p>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>Language</th>
                  <th>Status</th>
                  <th>KB Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssignedRepositories.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState title="No assigned repositories" description="No repositories matched your search." />
                    </td>
                  </tr>
                ) : null}
                {filteredAssignedRepositories.map((repository) => (
                  <tr key={repository.id}>
                    <td>
                      <div className={styles.projectName}>{repository.name}</div>
                      <div className={styles.repository}>{repository.url || `upload/${repository.name}`}</div>
                    </td>
                    <td>{repository.language || "Unknown"}</td>
                    <td>
                      <span className={badgeClass(repository.status)}>{repository.status}</span>
                    </td>
                    <td className={repository.knowledge_base_status === "none" ? styles.repository : undefined}>
                      {repository.knowledge_base_status || "none"}
                    </td>
                    <td>
                      <button
                        className={styles.action}
                        onClick={() => navigate(`/repositories/${repository.id}`)}
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
        </Card>
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
          <div>
            <span className={styles.welcomeLabel}>WELCOME {user?.name || "User"}</span>
            <h1 className={styles.bannerTitle}>Admin Dashboard</h1>
          </div>
          <input
            className={styles.search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search repositories"
            type="search"
            value={search}
          />
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
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={7}>
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
      </Card>
    </div>
  );
}

export default DashboardPage;
