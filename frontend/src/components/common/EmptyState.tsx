import { ReactNode } from "react";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  action?: ReactNode;
  description?: string;
  title: string;
}

function EmptyState({ action, description, title }: EmptyStateProps) {
  return (
    <section className={styles.empty}>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action && <div>{action}</div>}
    </section>
  );
}

export default EmptyState;
