import { useParams } from "react-router-dom";
import { Card, EmptyState } from "../components/common";
import styles from "./PagePlaceholder.module.css";

function ResultsPage() {
  const { projectId } = useParams();

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Results</h1>
      <p className={styles.description}>Results and analytics placeholder for project {projectId}.</p>
      <Card>
        <EmptyState title="Results foundation" description="Assessment reports and analytics will be connected in a future iteration." />
      </Card>
    </div>
  );
}

export default ResultsPage;
