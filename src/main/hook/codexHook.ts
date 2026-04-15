import { isPendingAction } from "../../shared/sessionTypes";
import { runBlockingHookFromRaw } from "./blockingHookBridge";
import { sendEventLine } from "./sendEventBridge";

export function augmentCodexPayloadJson(trimmed: string): string {
  if (!trimmed) {
    throw new Error("codexHook: empty payload");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(trimmed) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`codexHook: invalid JSON: ${message}`);
  }

  if (!("tool" in payload)) {
    payload.tool = "codex";
  }
  if (!("source" in payload)) {
    payload.source = "codex";
  }

  return JSON.stringify(payload);
}

function hasStableCodexSessionIdentity(payload: Record<string, unknown>): boolean {
  if (typeof payload.sessionId === "string" && payload.sessionId.trim()) {
    return true;
  }
  if (typeof payload.session_id === "string" && payload.session_id.trim()) {
    return true;
  }
  return false;
}

function codexPayloadType(payload: Record<string, unknown>): string {
  return typeof payload.type === "string" && payload.type.trim() ? payload.type.trim() : "unknown";
}

function looksLikePermissionMessage(message: string): boolean {
  return /\b(permission|approval|approve|allow)\b/i.test(message) || /权限|授权|审批|批准|允许/.test(message);
}

function codexPermissionMessage(payload: Record<string, unknown>): string | undefined {
  const candidates = [
    payload.message,
    payload.notification,
    payload.prompt,
    payload.task,
    payload["last-assistant-message"],
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      const message = value.trim();
      if (looksLikePermissionMessage(message)) {
        return message;
      }
    }
  }
  return undefined;
}

function codexExternalApprovalEvent(
  payload: Record<string, unknown>,
  message: string,
): string {
  const sessionId =
    (typeof payload.sessionId === "string" && payload.sessionId.trim()) ||
    (typeof payload.session_id === "string" && payload.session_id.trim()) ||
    "";
  const cwd = typeof payload.cwd === "string" && payload.cwd.trim() ? payload.cwd.trim() : undefined;
  const timestamp =
    typeof payload.timestamp === "number" && Number.isFinite(payload.timestamp)
      ? payload.timestamp
      : Date.now();

  return JSON.stringify({
    type: "status_change",
    sessionId,
    tool: "codex",
    status: "waiting",
    task: message,
    timestamp,
    meta: {
      codex_event_type: codexPayloadType(payload),
      ...(cwd ? { cwd } : {}),
    },
    externalApproval: {
      kind: "approval_required",
      title: "Approval required in Codex",
      message,
      sourceTool: "codex",
      updatedAt: timestamp,
      jumpTarget: {
        agent: "codex",
        appName: "Terminal",
        ...(cwd ? { workspacePath: cwd } : {}),
        sessionId,
        fallbackBehavior: "activate_app",
      },
    },
  });
}

export async function runCodexHookPipeline(
  rawStdin: string,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const outbound = augmentCodexPayloadJson(rawStdin.trim());
  const parsed = JSON.parse(outbound) as Record<string, unknown>;

  if (!hasStableCodexSessionIdentity(parsed)) {
    console.warn(
      "[CodePal Codex] unsupported notify payload ignored:",
      "missing_session_id",
      codexPayloadType(parsed),
    );
    return undefined;
  }

  if (isPendingAction(parsed.pendingAction)) {
    return runBlockingHookFromRaw(outbound, env);
  }

  const permissionMessage = codexPermissionMessage(parsed);
  await sendEventLine(permissionMessage ? codexExternalApprovalEvent(parsed, permissionMessage) : outbound, env);
  return undefined;
}
