import { ReactNode } from "react";
import { Inbox } from "lucide-react";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  action?: ReactNode;
  description?: string;
  icon?: ReactNode;
  title: string;
}

function EmptyState({ action, description, icon, title }: EmptyStateProps) {
  return (
    <section className={styles.empty}>
      <span className={styles.icon} aria-hidden="true">
        {icon || <Inbox size={24} />}
      </span>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action && <div>{action}</div>}
    </section>
  );
}

export default EmptyState;
