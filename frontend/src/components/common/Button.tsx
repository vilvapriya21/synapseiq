import { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  isLoading?: boolean;
  variant?: ButtonVariant;
}

function Button({ children, className = "", isLoading = false, variant = "primary", disabled, ...props }: ButtonProps) {
  return (
    <button
      className={`${styles.button} ${styles[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? "Loading" : children}
    </button>
  );
}

export default Button;
