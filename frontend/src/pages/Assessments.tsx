import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../components/common";
import { ROUTES } from "../routes/routePaths";
import { getUsers } from "../services/adminService";
import { assessmentService, type AssessmentListItem } from "../services/assessmentService";
import { useAuthStore } from "../store/authStore";
import { normalizeRole } from "../utils/roles";
import styles from "./Assessment.module.css";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function AssessmentsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const role = normalizeRole(user?.role ?? user?.roles?.[0]);
  const [assessments, setAssessments] = useState<AssessmentListItem[]>([]);
  const [learnerNames, setLearnerNames] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError("");

    Promise.all([
      assessmentService.listActive(),
      role === "ADMIN" ? getUsers().catch(() => []) : Promise.resolve([]),
    ])
      .then(([rows, users]) => {
        if (!isMounted) return;
        setAssessments(rows);
        setLearnerNames(
          users.reduce<Record<string, string>>((lookup, learner) => {
            lookup[learner.id] = `${learner.name} (${learner.email})`;
            return lookup;
          }, {}),
        );
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

  const filteredAssessments = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return assessments;
    return assessments.filter(
      (assessment) =>
        assessment.title.toLowerCase().includes(query) ||
        assessment.kt_topic_title.toLowerCase().includes(query) ||
        assessment.repository_name.toLowerCase().includes(query),
    );
  }, [assessments, search]);

  if (isLoading) {
    return <div className={styles.state}>Loading assessments...</div>;
  }

  if (error) {
    return <div className={styles.state}>{error}</div>;
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{role === "ADMIN" ? "Assessment Management" : "Assigned Assessments"}</p>
          <h1 className={styles.heading}>{role === "ADMIN" ? "Active Assessments" : "My Assessments"}</h1>
        </div>
        <input
          className={styles.search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search assessments"
          type="search"
          value={search}
        />
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>{role === "ADMIN" ? "Active Assessments" : "My Assessments"}</h2>
            <p>{filteredAssessments.length} assessments matched</p>
          </div>
        </div>
        {filteredAssessments.length === 0 ? (
          <EmptyState title="No assessments available" description="Assessments will appear here after they are created and assigned." />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>KT Topic</th>
                  <th>Repository</th>
                  {role === "ADMIN" ? <th>Assigned To</th> : null}
                  <th>Duration</th>
                  <th>Created At</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssessments.map((assessment) => (
                  <tr key={assessment.id}>
                    <td><div className={styles.assessmentName}>{assessment.title}</div></td>
                    <td>{assessment.kt_topic_title || "-"}</td>
                    <td>{assessment.repository_name || "-"}</td>
                    {role === "ADMIN" ? <td>{assessment.assigned_to ? learnerNames[assessment.assigned_to] || assessment.assigned_to : "Unassigned"}</td> : null}
                    <td>{assessment.duration_minutes} min</td>
                    <td>{formatDate(assessment.created_at)}</td>
                    <td>{assessment.assigned_to === null && role === "ADMIN" ? "Unassigned" : assessment.has_submitted ? "Submitted" : "Pending"}</td>
                    <td>
                      {role === "ADMIN" ? (
                        <button
                          className={styles.action}
                          onClick={() => navigate(ROUTES.assessmentResults.replace(":assessmentId", assessment.id))}
                          type="button"
                        >
                          View Results
                        </button>
                      ) : assessment.has_submitted ? (
                        <button
                          className={styles.action}
                          onClick={() => navigate(ROUTES.assessmentMyResult.replace(":assessmentId", assessment.id))}
                          type="button"
                        >
                          View My Result
                        </button>
                      ) : (
                        <button
                          className={styles.action}
                          onClick={() => navigate(ROUTES.assessmentTake.replace(":assessmentId", assessment.id))}
                          type="button"
                        >
                          Start Assessment
                        </button>
                      )}
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
