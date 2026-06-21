import { Fragment, FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import axios from "axios";
import { EmptyState, Loader } from "./common";
import { getChatHistory, postChatMessage, type ChatMessage } from "../services/repositoryService";
import styles from "./ChatPanel.module.css";

interface ChatPanelProps {
  repoId: string;
}

function renderInlineMarkdown(value: string): ReactNode[] {
  return value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code className={styles.inlineCode} key={index}>{part.slice(1, -1)}</code>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function FormattedAssistantMessage({ content }: { content: string }) {
  return (
    <div className={styles.formattedMessage}>
      {content.split(/\r?\n/).map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div className={styles.messageSpacer} key={index} />;

        const markdownHeading = trimmed.match(/^#{1,3}\s+(.+)$/);
        const boldHeading = trimmed.match(/^\*\*([^*]+)\*\*$/);
        if (markdownHeading || boldHeading) {
          return <h3 key={index}>{renderInlineMarkdown(markdownHeading?.[1] ?? boldHeading?.[1] ?? "")}</h3>;
        }

        const bullet = trimmed.match(/^[-*]\s+(.+)$/);
        if (bullet) {
          return <div className={styles.listItem} key={index}><span aria-hidden="true">•</span><div>{renderInlineMarkdown(bullet[1])}</div></div>;
        }

        const numbered = trimmed.match(/^(\d+)\.\s+(.+)$/);
        if (numbered) {
          return <div className={styles.listItem} key={index}><span>{numbered[1]}.</span><div>{renderInlineMarkdown(numbered[2])}</div></div>;
        }

        return <p key={index}>{renderInlineMarkdown(trimmed)}</p>;
      })}
    </div>
  );
}

function getChatErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 409) {
      return "Knowledge base is still building. Try again once analysis is ready.";
    }
    if (error.response?.status === 503) {
      return error.response?.data?.detail || "AI assistant unavailable. Check the configured LLM provider and try again.";
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

  const applySuggestion = (question: string) => {
    setInput(question);
  };

  return (
    <div className={styles.chatPanel}>
      <div className={styles.header}>
        <div>
          <h2>AI Assistant</h2>
          <p>Ask about this repository</p>
        </div>
        <span className={styles.statusDot} aria-hidden="true" />
      </div>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      <div className={styles.suggestions}>
        {["Summarize this repository", "What modules matter most?", "Create onboarding bullets"].map((question) => (
          <button key={question} type="button" onClick={() => applySuggestion(question)}>
            {question}
          </button>
        ))}
      </div>

      <div className={styles.messageList} ref={messageListRef}>
        {loading ? <Loader label="Loading chat..." /> : null}
        {!loading && messages.length === 0 ? (
          <EmptyState
            title="No messages yet"
            description="Ask a question about files, modules, dependencies, or onboarding context."
          />
        ) : null}
        {messages.map((message, index) => (
          <div
            key={message.id || `${message.role}-${index}`}
            className={`${styles.messageRow} ${message.role === "user" ? styles.userRow : styles.assistantRow}`}
          >
            <div className={`${styles.messageBubble} ${message.role === "user" ? styles.userBubble : styles.assistantBubble}`}>
              {message.role === "assistant" ? <FormattedAssistantMessage content={message.content} /> : message.content}
            </div>
            {message.role === "assistant" && message.sources?.length ? (
              <div className={styles.sources}>
                Sources: {message.sources.join(", ")}
              </div>
            ) : null}
          </div>
        ))}
        {sending ? (
          <div className={`${styles.messageRow} ${styles.assistantRow}`}>
            <div className={`${styles.messageBubble} ${styles.assistantBubble}`}>
              <span className={styles.thinkingDots}>Thinking...</span>
            </div>
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
