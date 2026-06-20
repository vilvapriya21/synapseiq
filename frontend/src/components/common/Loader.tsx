import styles from "./Loader.module.css";

export interface LoaderProps {
  className?: string;
  label?: string;
}

function Loader({ className = "", label = "Loading" }: LoaderProps) {
  return (
    <div className={`${styles.loader} ${className}`} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export default Loader;
