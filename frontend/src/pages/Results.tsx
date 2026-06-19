import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { EmptyState, Loader, PageHero } from "../components/common";
import { resultService } from "../services/resultService";
import { useAuthStore } from "../store/authStore";
import { ResultResponse } from "../types";
import { normalizeRole } from "../utils/roles";
import styles from "./Results.module.css";

function ResultsPage() {
  const { projectId = "alpha-payments" } = useParams();
  const role = normalizeRole(useAuthStore((state) => state.user?.roles[0]));
  const [results, setResults] = useState<ResultResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    resultService
      .getResults(projectId, role)
      .then((data) => {
        if (isMounted) {
          setResults(data);
        }
      })
      .catch(() => {
        if (isMounted) {
          setError("Results could not be loaded.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [projectId, role]);

  if (isLoading) {
    return <div className={styles.state}><Loader label="Loading results..." /></div>;
  }

  if (error || !results) {
    return (
      <EmptyState
        title={error ? "Unable to load results" : "No results available"}
        description={error || "Results will appear after an assessment is submitted."}
      />
    );
  }

  if (results.overallScore === null) {
    return (
      <div className={styles.page}>
        <PageHero eyebrow={`Project ${projectId}`} heading={role === "ADMIN" ? "Team Results" : "My Results"} />
        <EmptyState title="No previous assessments" description="Results will appear after an assessment is submitted." />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHero
        eyebrow={`Project ${projectId}`}
        heading={role === "ADMIN" ? "Team Results" : "My Results"}
        action={
          <div className={styles.scoreCard}>
            <span>Overall Score</span>
            <strong>{results.overallScore}%</strong>
          </div>
        }
      />

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Category Scores</h2>
        </div>
        <div className={styles.categoryGrid}>
          {results.categoryScores.map((item) => (
            <article className={styles.category} key={item.category}>
              <span>{item.category}</span>
              <strong>{item.score}%</strong>
              <div className={styles.track}>
                <div style={{ width: `${item.score}%` }} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.gridTwo}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Strengths</h2>
          </div>
          <ul>{results.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
        </article>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Knowledge Gaps</h2>
          </div>
          <ul>{results.knowledgeGaps.map((item) => <li key={item}>{item}</li>)}</ul>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Recommended Learning Path</h2>
        </div>
        <ol>{results.recommendedLearningPath.map((item) => <li key={item}>{item}</li>)}</ol>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Assessment History</h2>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Assessment</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {results.assessmentHistory.map((item) => (
                <tr key={item.id}>
                  <td>{item.date}</td>
                  <td>{item.assessmentName}</td>
                  <td>{item.score}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {role === "ADMIN" && results.teamResults && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Team Results</h2>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Learner</th>
                  <th>Project</th>
                  <th>Score</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {results.teamResults.map((item) => (
                  <tr key={`${item.learner}-${item.project}`}>
                    <td>{item.learner}</td>
                    <td>{item.project}</td>
                    <td>{item.score ? `${item.score}%` : "Not started"}</td>
                    <td>{item.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export default ResultsPage;
