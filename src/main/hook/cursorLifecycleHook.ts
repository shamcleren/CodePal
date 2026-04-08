export type CursorLifecyclePhase = "sessionStart" | "stop";

function pickSessionId(raw: Record<string, unknown>): string | null {
  const value = raw.session_id ?? raw.sessionId;
  if (value === undefined || value === null) {
    return null;
  }
  const sessionId = String(value).trim();
  return sessionId.length > 0 ? sessionId : null;
}

export function buildCursorLifecycleEventLine(
  phase: CursorLifecyclePhase,
  raw: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): string {
  const sessionId = pickSessionId(raw);
  if (!sessionId) {
    throw new Error("cursorLifecycleHook: session_id is required");
  }

  let status = "running";
  let task: string | undefined;

  if (phase === "sessionStart") {
    const composerMode = raw.composer_mode;
    if (typeof composerMode === "string" && composerMode.trim()) {
      task = composerMode.trim();
    }
  } else {
    const stopStatus = raw.status;
    if (stopStatus === "completed") {
      status = "completed";
    } else if (stopStatus === "error") {
      status = "error";
    } else {
      status = "offline";
    }
    if (typeof stopStatus === "string" && stopStatus.trim()) {
      task = stopStatus.trim();
    }
  }

  const payload: Record<string, unknown> = {
    hook_event_name: "StatusChange",
    session_id: sessionId,
    status,
  };
  if (task !== undefined) {
    payload.task = task;
  }
  const cwd = env.CURSOR_PROJECT_DIR;
  if (typeof cwd === "string" && cwd.trim()) {
    payload.cwd = cwd.trim();
  }

  return JSON.stringify(payload);
}
