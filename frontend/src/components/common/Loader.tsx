import styles from "./Loader.module.css";

export interface LoaderProps {
  label?: string;
}

function Loader({ label = "Loading" }: LoaderProps) {
  return (
    <div className={styles.loader} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export default Loader;
