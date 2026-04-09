import { isPendingAction } from "../../shared/sessionTypes";
import { runBlockingHookFromRaw } from "./blockingHookBridge";
import { sendEventLine } from "./sendEventBridge";

export function augmentCodexInternalPayloadJson(trimmed: string): string {
  if (!trimmed) {
    throw new Error("codexInternalHook: empty payload");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(trimmed) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`codexInternalHook: invalid JSON: ${message}`);
  }

  if (!("tool" in payload)) {
    payload.tool = "codex-internal";
  }
  if (!("source" in payload)) {
    payload.source = "codex-internal";
  }

  return JSON.stringify(payload);
}

function hasStableCodexInternalSessionIdentity(payload: Record<string, unknown>): boolean {
  if (typeof payload.sessionId === "string" && payload.sessionId.trim()) {
    return true;
  }
  if (typeof payload.session_id === "string" && payload.session_id.trim()) {
    return true;
  }
  return false;
}

function codexInternalPayloadType(payload: Record<string, unknown>): string {
  return typeof payload.type === "string" && payload.type.trim() ? payload.type.trim() : "unknown";
}

export async function runCodexInternalHookPipeline(
  rawStdin: string,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const outbound = augmentCodexInternalPayloadJson(rawStdin.trim());
  const parsed = JSON.parse(outbound) as Record<string, unknown>;

  if (!hasStableCodexInternalSessionIdentity(parsed)) {
    console.warn(
      "[CodePal Codex-Internal] unsupported notify payload ignored:",
      "missing_session_id",
      codexInternalPayloadType(parsed),
    );
    return undefined;
  }

  if (isPendingAction(parsed.pendingAction)) {
    return runBlockingHookFromRaw(outbound, env);
  }

  await sendEventLine(outbound, env);
  return undefined;
}
