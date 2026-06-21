import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BackLink, PageHero } from "../components/common";
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
    return {
      totalSubmitted: submitted.length,
      totalAttempts: results.length,
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
      <PageHero
        eyebrowContent={<BackLink label="Back to Assessments" onClick={() => navigate(ROUTES.assessments)} />}
        heading="Assessment Results"
      />

      <section className={styles.stats}>
        <article>
          <span>Total Submitted</span>
          <span><strong>{stats.totalSubmitted} / {stats.totalAttempts}</strong> Completed</span>
        </article>
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
