import { runBlockingHookFromRaw } from "./blockingHookBridge";

export function augmentCodeBuddyPayloadJson(trimmed: string): string {
  if (!trimmed) {
    throw new Error("codeBuddyHook: empty payload");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(trimmed) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`codeBuddyHook: invalid JSON: ${message}`);
  }

  if (!("tool" in payload)) {
    payload.tool = "codebuddy";
  }
  if (!("source" in payload)) {
    payload.source = "codebuddy";
  }

  return JSON.stringify(payload);
}

export async function runCodeBuddyHookPipeline(
  rawStdin: string,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const outbound = augmentCodeBuddyPayloadJson(rawStdin.trim());
  return runBlockingHookFromRaw(outbound, env);
}
