import { ReactNode } from "react";
import { useEffect } from "react";
import { usePageTitle } from "../../context/PageTitleContext";
import styles from "./PageHero.module.css";

export interface PageHeroProps {
  action?: ReactNode;
  cornerAction?: ReactNode;
  eyebrow?: string;
  eyebrowContent?: ReactNode;
  heading: string;
  subtitle?: string;
}

function PageHero({ action, cornerAction, eyebrow, eyebrowContent, heading, subtitle }: PageHeroProps) {
  const { setTitle } = usePageTitle();

  useEffect(() => {
    setTitle({ eyebrow: eyebrow || "", heading });
  }, [eyebrow, heading, setTitle]);

  return (
    <section className={styles.hero}>
      <div className={styles.content}>
        {eyebrowContent || eyebrow ? (
          <p className={styles.eyebrow}>{eyebrowContent ?? eyebrow}</p>
        ) : null}
        <h1 className={styles.heading}>{heading}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {cornerAction ? <div className={styles.cornerAction}>{cornerAction}</div> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </section>
  );
}

export default PageHero;
