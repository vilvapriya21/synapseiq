import { useState } from "react";
import { Bot, X } from "lucide-react";
import aiAvatar from "../assets/chat-bot.png";
import ChatPanel from "./ChatPanel";
import styles from "./FloatingChatWidget.module.css";

interface FloatingChatWidgetProps {
  repoId: string;
}

const CHAT_OPENED_KEY = "synapseiq:chat-opened";

function FloatingChatWidget({ repoId }: FloatingChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [hasBeenOpened, setHasBeenOpened] = useState(() => sessionStorage.getItem(CHAT_OPENED_KEY) === "true");
  const [isTriggerHovered, setIsTriggerHovered] = useState(false);

  const shouldShowHint = !isOpen && (!hasBeenOpened || isTriggerHovered);

  const handleToggle = () => {
    setIsOpen((current) => {
      const nextIsOpen = !current;

      if (nextIsOpen && !hasBeenOpened) {
        sessionStorage.setItem(CHAT_OPENED_KEY, "true");
        setHasBeenOpened(true);
      }

      return nextIsOpen;
    });
  };

  return (
    <>
      <div className={`${styles.panel} ${isOpen ? styles.panelOpen : ""}`} aria-hidden={!isOpen}>
        <ChatPanel repoId={repoId} />
      </div>
      <div
        className={`${styles.assistantHint} ${shouldShowHint ? styles.assistantHintVisible : ""}`}
        aria-hidden="true"
      >
        Hi, I&apos;m your AI assistant. How can I help?
      </div>
      <button
        className={styles.trigger}
        type="button"
        onClick={handleToggle}
        onBlur={() => setIsTriggerHovered(false)}
        onFocus={() => setIsTriggerHovered(true)}
        onMouseEnter={() => setIsTriggerHovered(true)}
        onMouseLeave={() => setIsTriggerHovered(false)}
        aria-label={isOpen ? "Close repository assistant" : "Open repository assistant"}
        aria-expanded={isOpen}
      >
        <span className={`${styles.pulseRing} ${!hasBeenOpened && !isOpen ? styles.pulseActive : ""}`} />
        {isOpen ? (
          <X size={24} />
        ) : avatarFailed ? (
          <Bot size={26} />
        ) : (
          <img
            src={aiAvatar}
            alt="AI assistant"
            className={styles.triggerAvatar}
            onError={() => setAvatarFailed(true)}
          />
        )}
      </button>
    </>
  );
}

export default FloatingChatWidget;
