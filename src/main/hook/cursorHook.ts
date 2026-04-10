import { isPendingAction } from "../../shared/sessionTypes";
import { runBlockingHookFromRaw } from "./blockingHookBridge";
import { sendEventLine } from "./sendEventBridge";

function augmentCursorPayloadJson(trimmed: string): string {
  if (!trimmed) {
    throw new Error("cursorHook: empty payload");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(trimmed) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`cursorHook: invalid JSON: ${message}`);
  }

  if (!("tool" in payload)) {
    payload.tool = "cursor";
  }
  if (!("source" in payload)) {
    payload.source = "cursor";
  }

  return JSON.stringify(payload);
}

export async function runCursorHookPipeline(
  rawStdin: string,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const outbound = augmentCursorPayloadJson(rawStdin.trim());
  const parsed = JSON.parse(outbound) as Record<string, unknown>;

  if (isPendingAction(parsed.pendingAction)) {
    return runBlockingHookFromRaw(outbound, env);
  }

  await sendEventLine(outbound, env);
  return undefined;
}

