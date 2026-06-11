import { InputHTMLAttributes } from "react";
import styles from "./Input.module.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

function Input({ error, id, label, ...props }: InputProps) {
  const inputId = id || props.name;

  return (
    <label className={styles.field} htmlFor={inputId}>
      {label && <span className={styles.label}>{label}</span>}
      <input id={inputId} className={styles.input} aria-invalid={Boolean(error)} {...props} />
      {error && <span className={styles.error}>{error}</span>}
    </label>
  );
}

export default Input;
