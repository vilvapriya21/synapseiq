import { FormEvent, useEffect, useRef, useState } from "react";
import axios from "axios";
import { getChatHistory, postChatMessage, type ChatMessage } from "../services/repositoryService";
import styles from "./ChatPanel.module.css";

interface ChatPanelProps {
  repoId: string;
}

function getChatErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 409) {
      return "Knowledge base is still building. Try again once analysis is ready.";
    }
    if (error.response?.status === 503) {
      return "AI assistant unavailable. Check the configured LLM provider and try again.";
    }
  }
  return "Unable to reach the assistant right now.";
}

function ChatPanel({ repoId }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const messageListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const loadMessages = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await getChatHistory(repoId);
        setMessages(response.messages);
      } catch (err) {
        setError(getChatErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
  }, [repoId]);

  useEffect(() => {
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending]);

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = input.trim();
    if (!content || sending) {
      return;
    }

    const optimisticMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };

    setMessages((current) => [...current, optimisticMessage]);
    setInput("");
    setSending(true);
    setError("");

    try {
      const response = await postChatMessage(repoId, content);
      setMessages((current) => [...current, response.assistant_message]);
    } catch (err) {
      setError(getChatErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.chatPanel}>
      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      <div className={styles.messageList} ref={messageListRef}>
        {loading ? <p className={styles.stateText}>Loading chat...</p> : null}
        {!loading && messages.length === 0 ? (
          <p className={styles.stateText}>Ask a question about this repository.</p>
        ) : null}
        {messages.map((message, index) => (
          <div
            key={message.id || `${message.role}-${index}`}
            className={`${styles.messageRow} ${message.role === "user" ? styles.userRow : styles.assistantRow}`}
          >
            <div className={`${styles.messageBubble} ${message.role === "user" ? styles.userBubble : styles.assistantBubble}`}>
              {message.content}
            </div>
          </div>
        ))}
        {sending ? (
          <div className={`${styles.messageRow} ${styles.assistantRow}`}>
            <div className={`${styles.messageBubble} ${styles.assistantBubble}`}>thinking...</div>
          </div>
        ) : null}
      </div>

      <form className={styles.inputRow} onSubmit={handleSend}>
        <input
          className={styles.input}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about this repository"
          disabled={sending}
        />
        <button className={styles.sendButton} type="submit" disabled={sending || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

export default ChatPanel;
