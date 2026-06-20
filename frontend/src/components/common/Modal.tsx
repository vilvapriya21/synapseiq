import { ReactNode } from "react";
import { X } from "lucide-react";
import Button from "./Button";
import styles from "./Modal.module.css";

export interface ModalProps {
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  title: string;
}

function Modal({ children, isOpen, onClose, title }: ModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.backdrop} role="presentation">
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className={styles.header}>
          <h2 id="modal-title">{title}</h2>
          <Button aria-label="Close dialog" title="Close" type="button" variant="ghost" onClick={onClose}>
            <X aria-hidden="true" size={20} />
          </Button>
        </header>
        <div className={styles.body}>{children}</div>
      </section>
    </div>
  );
}

export default Modal;
