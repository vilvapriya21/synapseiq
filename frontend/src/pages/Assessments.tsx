import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../components/common";
import { ROUTES } from "../routes/routePaths";
import { dashboardService, DashboardResponse } from "../services/dashboardService";
import { getAssignedRepositories, Repository } from "../services/repositoryService";
import { useAuthStore } from "../store/authStore";
import { normalizeRole } from "../utils/roles";
import styles from "./Assessment.module.css";

interface AssessmentRow {
  id: string;
  name: string;
  repository: string;
  language: string;
  status: string;
  knowledgeBaseStatus: string;
}

function AssessmentsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const role = normalizeRole(user?.roles[0]);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [assignedRepositories, setAssignedRepositories] = useState<Repository[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    const request = role === "LEARNER" ? getAssignedRepositories() : dashboardService.getDashboard();

    request
      .then((data) => {
        if (isMounted) {
          if (role === "LEARNER") {
            setAssignedRepositories((data as { repositories: Repository[] }).repositories);
            setDashboard(null);
          } else {
            setDashboard(data as DashboardResponse);
            setAssignedRepositories([]);
          }
          setError("");
        }
      })
      .catch(() => {
        if (isMounted) setError("Assessments could not be loaded.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [role]);

  const projects = useMemo(() => {
    const query = search.trim().toLowerCase();
    const allProjects: AssessmentRow[] = role === "LEARNER"
      ? assignedRepositories.map((repository) => ({
          id: repository.id,
          name: repository.name,
          repository: repository.url || `upload/${repository.name}`,
          language: repository.language || "Unknown",
          status: repository.status,
          knowledgeBaseStatus: repository.knowledge_base_status || "none",
        }))
      : (dashboard?.projects ?? []).map((project) => ({
          id: project.id,
          name: project.name,
          repository: project.repository,
          language: project.language,
          status: project.status,
          knowledgeBaseStatus: project.knowledge_base_status,
        }));
    if (!query) return allProjects;
    return allProjects.filter(
      (project) =>
        project.name.toLowerCase().includes(query) ||
        project.repository.toLowerCase().includes(query) ||
        project.language.toLowerCase().includes(query),
    );
  }, [assignedRepositories, dashboard?.projects, role, search]);

  if (isLoading) {
    return <div className={styles.state}>Loading assessments...</div>;
  }

  if (error) {
    return <div className={styles.state}>{error || "No assessment data available."}</div>;
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{role === "ADMIN" ? "Assessment Management" : "Assigned Assessments"}</p>
          <h1 className={styles.heading}>Assessment</h1>
        </div>
        <input
          className={styles.search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search projects"
          type="search"
          value={search}
        />
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Project Assessments</h2>
            <p>Select a project to view or take its assessment.</p>
          </div>
        </div>
        {projects.length === 0 ? (
          <EmptyState title="No assessments available" description="No projects are currently available for assessment." />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Project Name</th>
                  <th>Repository</th>
                  <th>Language</th>
                  <th>Status</th>
                  <th>KB Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <div className={styles.assessmentName}>{project.name}</div>
                    </td>
                    <td>{project.repository}</td>
                    <td>{project.language}</td>
                    <td>{project.status}</td>
                    <td>{project.knowledgeBaseStatus}</td>
                    <td>
                      <button
                        className={styles.action}
                        onClick={() => navigate(ROUTES.projectAssessment.replace(":projectId", project.id))}
                        type="button"
                      >
                        Open Assessment
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default AssessmentsPage;
