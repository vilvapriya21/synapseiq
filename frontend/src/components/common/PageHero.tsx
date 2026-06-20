import { ReactNode } from "react";
import { useEffect } from "react";
import { usePageTitle } from "../../context/PageTitleContext";
import styles from "./PageHero.module.css";

export interface PageHeroProps {
  action?: ReactNode;
  cornerAction?: ReactNode;
  eyebrow?: string;
  heading: string;
  subtitle?: string;
}

function PageHero({ action, cornerAction, eyebrow, heading, subtitle }: PageHeroProps) {
  const { setTitle } = usePageTitle();

  useEffect(() => {
    setTitle({ eyebrow: eyebrow || "", heading });
  }, [eyebrow, heading, setTitle]);

  return (
    <section className={styles.hero}>
      <div className={styles.content}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <h1 className={styles.heading}>{heading}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {cornerAction ? <div className={styles.cornerAction}>{cornerAction}</div> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </section>
  );
}

export default PageHero;
