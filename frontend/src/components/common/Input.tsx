import { InputHTMLAttributes, ReactNode } from "react";
import styles from "./Input.module.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  fieldClassName?: string;
  label?: ReactNode;
  startAdornment?: ReactNode;
}

function Input({ className = "", error, fieldClassName = "", id, label, startAdornment, ...props }: InputProps) {
  const inputId = id || props.name;

  return (
    <label className={`${styles.field} ${fieldClassName}`} htmlFor={inputId}>
      {label && <span className={styles.label}>{label}</span>}
      {startAdornment ? (
        <span className={styles.inputShell}>
          <span className={styles.adornment}>{startAdornment}</span>
          <input id={inputId} className={`${styles.input} ${className}`} aria-invalid={Boolean(error)} {...props} />
        </span>
      ) : (
        <input id={inputId} className={`${styles.input} ${className}`} aria-invalid={Boolean(error)} {...props} />
      )}
      {error && <span className={styles.error}>{error}</span>}
    </label>
  );
}

export default Input;
