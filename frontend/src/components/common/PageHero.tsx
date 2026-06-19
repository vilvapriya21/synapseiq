import { ReactNode } from "react";
import styles from "./PageHero.module.css";

export interface PageHeroProps {
  action?: ReactNode;
  eyebrow: string;
  heading: string;
  subtitle?: string;
}

function PageHero({ action, eyebrow, heading, subtitle }: PageHeroProps) {
  return (
    <section className={styles.hero}>
      <div className={styles.content}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.heading}>{heading}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </section>
  );
}

export default PageHero;
