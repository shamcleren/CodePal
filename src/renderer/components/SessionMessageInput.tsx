import { useEffect, useRef, useState } from "react";
import type { SessionStatus } from "../../shared/sessionTypes";
import { useI18n } from "../i18n";

type SessionMessageInputProps = {
  sessionId: string;
  status: SessionStatus;
  hasInputChannel: boolean;
  tool: string;
  onSend: (sessionId: string, text: string) => void;
};

export function getPlaceholder(
  status: SessionStatus,
  hasInputChannel: boolean,
  tool: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (!hasInputChannel) {
    return t("sendMessage.placeholder.disconnected", { agent: tool });
  }
  if (status === "waiting") {
    return t("sendMessage.placeholder.waiting");
  }
  return t("sendMessage.placeholder.running", { agent: tool });
}

export function renderSessionMessageInputProps(options: {
  status: SessionStatus;
  hasInputChannel: boolean;
  tool: string;
}) {
  const disabled = !options.hasInputChannel;
  const isWaiting = options.status === "waiting" && options.hasInputChannel;
  return { disabled, isWaiting };
}

export function SessionMessageInput({
  sessionId,
  status,
  hasInputChannel,
  tool,
  onSend,
}: SessionMessageInputProps) {
  const i18n = useI18n();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const errorTimerRef = useRef(0);

  const { disabled, isWaiting } = renderSessionMessageInputProps({
    status,
    hasInputChannel,
    tool,
  });

  const placeholder = getPlaceholder(status, hasInputChannel, tool, i18n.t);

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
    if (!trimmed || disabled) return;
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
          disabled={disabled}
        />
        <button
          type="button"
          className="session-message-input__btn"
          onClick={handleSubmit}
          disabled={disabled || text.trim().length === 0}
        >
          {i18n.t("sendMessage.send")} ↵
        </button>
      </div>
      {error ? <div className="session-message-input__error">{error}</div> : null}
    </div>
  );
}
