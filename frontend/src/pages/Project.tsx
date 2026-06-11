import { useParams } from "react-router-dom";
import { Card, EmptyState } from "../components/common";
import styles from "./PagePlaceholder.module.css";

function ProjectPage() {
  const { projectId } = useParams();

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Project {projectId}</h1>
      <p className={styles.description}>Project workspace placeholder for repository intelligence, KT assets, and assessment readiness.</p>
      <Card>
        <EmptyState title="Project workspace" description="Project-level business features are intentionally not implemented yet." />
      </Card>
    </div>
  );
}

export default ProjectPage;
