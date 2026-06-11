import { useParams } from "react-router-dom";
import { Card, EmptyState } from "../components/common";
import styles from "./PagePlaceholder.module.css";

function AssessmentPage() {
  const { projectId } = useParams();

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Assessment</h1>
      <p className={styles.description}>Assessment workflow placeholder for project {projectId}.</p>
      <Card>
        <EmptyState title="Assessment foundation" description="Assessment generation and scoring will be implemented later." />
      </Card>
    </div>
  );
}

export default AssessmentPage;
