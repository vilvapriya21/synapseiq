import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/common";
import { ROUTES } from "../routes/routePaths";
import { dashboardService, DashboardResponse } from "../services/dashboardService";
import { useAuthStore } from "../store/authStore";
import { ProjectSummary } from "../types";
import { normalizeRole } from "../utils/roles";
import styles from "./Dashboard.module.css";

const adminStatLabels = [
  ["totalProjects", "Total Projects", "Across connected repositories"],
  ["activeProjects", "Active Projects", "Currently in progress"],
  ["pendingAssessments", "Pending Assessments", "Awaiting completion"],
  ["completedAssessments", "Completed Assessments", "Validated knowledge checks"],
] as const;

const learnerStatLabels = [
  ["assignedProjects", "Assigned Projects", "Knowledge paths assigned to you"],
  ["pendingAssessments", "Pending Assessments", "Awaiting completion"],
  ["completedAssessments", "Completed Assessments", "Validated knowledge checks"],
  ["averageScore", "Average Score", "Across completed assessments"],
] as const;

function badgeClass(status: ProjectSummary["status"]) {
  if (status === "Review") return `${styles.badge} ${styles.badgeReview}`;
  if (status === "Pending") return `${styles.badge} ${styles.badgePending}`;
  return styles.badge;
}

function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const role = normalizeRole(user?.roles[0]);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    dashboardService
      .getDashboard(role)
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
  }, [role]);

  const filteredProjects = useMemo(() => {
    const projects = dashboard?.projects || [];
    const query = search.toLowerCase().trim();
    if (!query) return projects;
    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(query) ||
        project.repository.toLowerCase().includes(query) ||
        project.status.toLowerCase().includes(query),
    );
  }, [dashboard?.projects, search]);

  if (isLoading) {
    return <div className={styles.state}>Loading dashboard...</div>;
  }

  if (error || !dashboard) {
    return <div className={styles.state}>{error || "No dashboard data available."}</div>;
  }

  const statLabels = role === "ADMIN" ? adminStatLabels : learnerStatLabels;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Welcome {user?.name || "User"}</p>
          <h1 className={styles.heading}>{role === "ADMIN" ? "Admin Dashboard" : "Learner Dashboard"}</h1>
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
            <span className={styles.statValue}>{dashboard.stats[key] ?? 0}{key === "averageScore" ? "%" : ""}</span>
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
          {role === "ADMIN" && (
            <Button onClick={() => navigate(ROUTES.repositoryOnboard)} type="button">
              Add Repository
            </Button>
          )}
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {role === "ADMIN" ? (
                  <>
                    <th>Project Name</th>
                    <th>Repository</th>
                    <th>Status</th>
                    <th>KT Progress</th>
                    <th>Assessment Completion</th>
                    <th>Actions</th>
                  </>
                ) : (
                  <>
                    <th>Project Name</th>
                    <th>KT Progress</th>
                    <th>Latest Score</th>
                    <th>Next Assessment</th>
                    <th>Action</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map((project) => (
                <tr key={project.id}>
                  {role === "ADMIN" ? (
                    <>
                      <td>
                        <div className={styles.projectName}>{project.name}</div>
                      </td>
                      <td className={styles.repository}>{project.repository}</td>
                      <td>
                        <span className={badgeClass(project.status)}>{project.status}</span>
                      </td>
                      <td>
                        <div className={styles.progressTrack}>
                          <div className={styles.progressFill} style={{ width: `${project.ktProgress}%` }} />
                        </div>
                        <div className={styles.progressText}>{project.ktProgress}% complete</div>
                      </td>
                      <td>{project.assessmentCompletion}%</td>
                      <td>
                        <button
                          className={styles.action}
                          onClick={() => navigate(ROUTES.project.replace(":projectId", project.id))}
                          type="button"
                        >
                          Manage Project
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <div className={styles.projectName}>{project.name}</div>
                      </td>
                      <td>
                        <div className={styles.progressTrack}>
                          <div className={styles.progressFill} style={{ width: `${project.ktProgress}%` }} />
                        </div>
                        <div className={styles.progressText}>{project.ktProgress}% complete</div>
                      </td>
                      <td>{project.assessmentScore ? `${project.assessmentScore}%` : "Not started"}</td>
                      <td>{project.nextAssessment ?? "Not scheduled"}</td>
                      <td>
                        <button
                          className={styles.action}
                          onClick={() => navigate(ROUTES.project.replace(":projectId", project.id))}
                          type="button"
                        >
                          Open Project
                        </button>
                      </td>
                    </>
                  )}
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
