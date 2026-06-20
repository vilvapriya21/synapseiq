import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import AttemptResultView from "../components/AttemptResultView";
import { PageHero } from "../components/common";
import { assessmentService, type AttemptResult } from "../services/assessmentService";
import styles from "./AttemptDetail.module.css";

function AttemptDetail() {
  const { attemptId, assessmentId } = useParams();
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    const request = attemptId
      ? assessmentService.getAttemptDetail(attemptId)
      : assessmentId
        ? assessmentService.getMyResult(assessmentId)
        : Promise.resolve(null);

    request
      .then((data) => {
        if (isMounted) setResult(data);
      })
      .catch(() => {
        if (isMounted) setError("Attempt detail could not be loaded.");
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [attemptId, assessmentId]);

  if (isLoading) {
    return <div className={styles.state}>Loading attempt detail...</div>;
  }

  if (error || !result) {
    return <div className={styles.state}>{error || "No submitted result found."}</div>;
  }

  return (
    <div className={styles.page}>
      <PageHero eyebrow="Attempt Detail" heading="Assessment Result" />
      <AttemptResultView result={result} />
    </div>
  );
}

export default AttemptDetail;
