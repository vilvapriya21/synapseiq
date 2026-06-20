import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ROUTES } from "../routes/routePaths";
import { assessmentService, type LearnerAttemptSummary } from "../services/assessmentService";
import styles from "./AssessmentResults.module.css";

function formatDate(value: string | null) {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function AssessmentResults() {
  const { assessmentId = "" } = useParams();
  const navigate = useNavigate();
  const [results, setResults] = useState<LearnerAttemptSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    assessmentService
      .getAdminResults(assessmentId)
      .then((data) => {
        if (isMounted) setResults(data);
      })
      .catch(() => {
        if (isMounted) setError("Assessment results could not be loaded.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [assessmentId]);

  const stats = useMemo(() => {
    const submitted = results.filter((result) => result.submitted_at && result.score_percentage !== null);
    const average = submitted.length
      ? Math.round(submitted.reduce((total, result) => total + (result.score_percentage || 0), 0) / submitted.length)
      : 0;
    const passed = submitted.filter((result) => (result.score_percentage || 0) >= 70).length;
    return {
      average,
      totalSubmitted: submitted.length,
      passRate: submitted.length ? Math.round((passed / submitted.length) * 100) : 0,
    };
  }, [results]);

  if (isLoading) {
    return <div className={styles.state}>Loading results...</div>;
  }

  if (error) {
    return <div className={styles.state}>{error}</div>;
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Assessment Results</p>
          <h1 className={styles.heading}>Learner Results</h1>
        </div>
      </section>

      <section className={styles.stats}>
        <article><span>Average Score</span><strong>{stats.average}%</strong></article>
        <article><span>Pass Rate</span><strong>{stats.passRate}%</strong></article>
        <article><span>Total Submitted</span><strong>{stats.totalSubmitted}</strong></article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Attempts</h2>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Learner Name</th>
                <th>Learner Email</th>
                <th>Submitted At</th>
                <th>Score %</th>
                <th>Correct/Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => {
                const score = result.score_percentage;
                const status = score === null ? "Pending" : score >= 70 ? "Passed" : "Failed";
                return (
                  <tr key={result.attempt_id}>
                    <td>{result.learner_name}</td>
                    <td>{result.learner_email}</td>
                    <td>{formatDate(result.submitted_at)}</td>
                    <td>{score === null ? "-" : `${score}%`}</td>
                    <td>{result.correct_answers}/{result.total_questions}</td>
                    <td><span className={status === "Passed" ? styles.passBadge : status === "Failed" ? styles.failBadge : styles.pendingBadge}>{status}</span></td>
                    <td>
                      <button
                        className={styles.action}
                        disabled={!result.submitted_at}
                        onClick={() => navigate(ROUTES.attemptDetail.replace(":attemptId", result.attempt_id))}
                        type="button"
                      >
                        View Detail
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default AssessmentResults;
