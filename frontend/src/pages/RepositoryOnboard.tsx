import { Card, EmptyState } from "../components/common";
import styles from "./PagePlaceholder.module.css";

function RepositoryOnboardPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Repository Onboarding</h1>
      <p className={styles.description}>Connect and prepare repositories for future knowledge transfer analysis.</p>
      <Card>
        <EmptyState title="Repository onboarding foundation" description="Business logic will be added in the next implementation phase." />
      </Card>
    </div>
  );
}

export default RepositoryOnboardPage;
