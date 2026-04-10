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

  await sendEventLine(outbound, env);
  return undefined;
}
