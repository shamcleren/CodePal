import { useCallback, useEffect, useState } from "react";
import type { SessionCapabilityManifest } from "../../shared/capabilityTypes";
import { useI18n } from "../i18n";

type SessionActionBarProps = {
  sessionId: string;
  capabilities: SessionCapabilityManifest | null;
};

type ActionFeedback = {
  action: string;
  status: "loading" | "success" | "error";
  message?: string;
};

export function SessionActionBar({
  sessionId,
  capabilities,
}: SessionActionBarProps) {
  const i18n = useI18n();
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [caps, setCaps] = useState<SessionCapabilityManifest | null>(capabilities);

  useEffect(() => {
    if (capabilities) {
      setCaps(capabilities);
      return;
    }
    window.codepal.getSessionCapabilities(sessionId).then((manifest) => {
      setCaps(manifest);
    });
  }, [sessionId, capabilities]);

  const executeAction = useCallback(
    async (action: string) => {
      setFeedback({ action, status: "loading" });
      try {
        const result = await window.codepal.executeSessionAction(
          sessionId,
          action as import("../../shared/capabilityTypes").SessionActionType,
        );
        if (result.ok) {
          setFeedback({ action, status: "success" });
        } else {
          setFeedback({ action, status: "error", message: result.error });
        }
      } catch (err) {
        setFeedback({
          action,
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
      setTimeout(() => setFeedback(null), 2000);
    },
    [sessionId],
  );

  if (!caps) return null;

  const canJump = caps.jump.support === "supported" || caps.jump.support === "best_effort";

  if (!canJump) return null;

  return (
    <div className="session-action-bar">
      <button
        type="button"
        className="session-action-bar__btn"
        title={i18n.t("actionBar.jump")}
        onClick={() => void executeAction("jump")}
        disabled={feedback?.action === "jump" && feedback.status === "loading"}
      >
        <span className="session-action-bar__icon">↗</span>
        <span className="session-action-bar__label">{i18n.t("actionBar.jump")}</span>
        {caps.jump.support === "best_effort" ? (
          <span className="session-action-bar__confidence" title={caps.jump.reason}>~</span>
        ) : null}
      </button>

      {feedback?.status === "error" ? (
        <span className="session-action-bar__feedback session-action-bar__feedback--error">
          {feedback.message ?? i18n.t("actionBar.error")}
        </span>
      ) : null}
      {feedback?.status === "success" ? (
        <span className="session-action-bar__feedback session-action-bar__feedback--success">
          ✓
        </span>
      ) : null}
    </div>
  );
}
