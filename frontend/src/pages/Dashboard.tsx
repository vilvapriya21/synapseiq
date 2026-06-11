import { Card, EmptyState } from "../components/common";
import styles from "./PagePlaceholder.module.css";

function DashboardPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Dashboard</h1>
      <p className={styles.description}>Operational overview placeholder for SynapseIQ workspaces and assessments.</p>
      <Card>
        <EmptyState title="No active projects yet" description="Repository onboarding and assessment workflows will appear here." />
      </Card>
    </div>
  );
}

export default DashboardPage;
