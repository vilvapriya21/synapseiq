import { ArrowLeft } from "lucide-react";
import styles from "./BackLink.module.css";

interface BackLinkProps {
  label?: string;
  onClick: () => void;
}

function BackLink({ label = "Back", onClick }: BackLinkProps) {
  return (
    <button className={styles.backLink} onClick={onClick} type="button">
      <ArrowLeft aria-hidden="true" size={16} />
      {label}
    </button>
  );
}

export default BackLink;
