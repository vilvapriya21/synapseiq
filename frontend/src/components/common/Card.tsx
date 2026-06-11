import { HTMLAttributes, ReactNode } from "react";
import styles from "./Card.module.css";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

function Card({ children, className = "", ...props }: CardProps) {
  return (
    <section className={`${styles.card} ${className}`} {...props}>
      {children}
    </section>
  );
}

export default Card;
