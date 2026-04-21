import { useEffect, useRef, useState } from "react";
import type { SessionStatus } from "../../shared/sessionTypes";
import { useI18n } from "../i18n";

type SessionMessageInputProps = {
  sessionId: string;
  status: SessionStatus;
  tool: string;
  onSend: (sessionId: string, text: string) => void;
};

export function getPlaceholder(
  status: SessionStatus,
  tool: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (status === "waiting") {
    return t("sendMessage.placeholder.waiting");
  }
  return t("sendMessage.placeholder.running", { agent: tool });
}

export function SessionMessageInput({
  sessionId,
  status,
  tool,
  onSend,
}: SessionMessageInputProps) {
  const i18n = useI18n();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const errorTimerRef = useRef(0);

  const isWaiting = status === "waiting";
  const placeholder = getPlaceholder(status, tool, i18n.t);

  useEffect(() => {
    return window.codepal.onSendMessageResult((result) => {
      if (result.sessionId !== sessionId) return;
      if (result.result === "error") {
        setError(result.error ?? i18n.t("sendMessage.error.default"));
        window.clearTimeout(errorTimerRef.current);
        errorTimerRef.current = window.setTimeout(() => setError(null), 3000);
      }
    });
  }, [sessionId]);

  useEffect(() => {
    return () => {
      window.clearTimeout(errorTimerRef.current);
    };
  }, []);

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(sessionId, trimmed);
    setText("");
    setError(null);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  const className = [
    "session-message-input",
    isWaiting ? "session-message-input--waiting" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <div className={className}>
        <input
          ref={inputRef}
          type="text"
          className="session-message-input__field"
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="session-message-input__btn"
          onClick={handleSubmit}
          disabled={text.trim().length === 0}
        >
          {i18n.t("sendMessage.send")} ↵
        </button>
      </div>
      {error ? <div className="session-message-input__error">{error}</div> : null}
    </div>
  );
}
