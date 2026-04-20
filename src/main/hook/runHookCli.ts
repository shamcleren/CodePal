import { runBlockingHookFromRaw } from "./blockingHookBridge";
import {
  isClaudePreToolUsePayload,
  runClaudeHookPipeline,
  runClaudePreToolUsePipeline,
} from "./claudeHook";
import { buildClaudeStatusLineUsageLine } from "./claudeStatusLine";
import { runCodexHookPipeline } from "./codexHook";
import { buildCursorLifecycleEventLine } from "./cursorLifecycleHook";
import { runCodeBuddyHookPipeline } from "./codeBuddyHook";
import { runCursorHookPipeline } from "./cursorHook";
import { sendEventLine } from "./sendEventBridge";
import { runKeepAliveHook } from "./keepAliveHook";

export const HOOK_CLI_NOT_HOOK_MODE = -1;

function readStdinStream(stdin: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stdin.on("data", (chunk: string | Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stdin.on("error", reject);
  });
}

function formatHookError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

type ParsedArgv =
  | { kind: "none" }
  | { kind: "invalid"; message: string }
  | { kind: "claude" }
  | { kind: "claude-statusline" }
  | { kind: "codebuddy" }
  | { kind: "codex"; payloadArg?: string }
  | { kind: "cursor" }
  | { kind: "cursor-lifecycle"; phase: "sessionStart" | "stop" }
  | { kind: "send-event" }
  | { kind: "blocking-hook" }
  | { kind: "keep-alive"; sessionId: string; tool: string };

function parseArgv(argv: string[]): ParsedArgv {
  const index = argv.indexOf("--codepal-hook");
  if (index === -1) {
    return { kind: "none" };
  }

  const subcommand = argv[index + 1];
  if (!subcommand) {
    return {
      kind: "invalid",
      message: "codepal-hook: missing subcommand after --codepal-hook",
    };
  }
  if (subcommand === "codebuddy") {
    return { kind: "codebuddy" };
  }
  if (subcommand === "claude") {
    return { kind: "claude" };
  }
  if (subcommand === "claude-statusline") {
    return { kind: "claude-statusline" };
  }
  if (subcommand === "codex") {
    const payloadArg = argv[index + 2];
    return typeof payloadArg === "string" && payloadArg.trim()
      ? { kind: "codex", payloadArg }
      : { kind: "codex" };
  }
  if (subcommand === "cursor") {
    return { kind: "cursor" };
  }
  if (subcommand === "send-event") {
    return { kind: "send-event" };
  }
  if (subcommand === "blocking-hook") {
    return { kind: "blocking-hook" };
  }
  if (subcommand === "cursor-lifecycle") {
    const phase = argv[index + 2];
    if (!phase) {
      return {
        kind: "invalid",
        message: "codepal-hook: cursor-lifecycle requires sessionStart or stop",
      };
    }
    if (phase !== "sessionStart" && phase !== "stop") {
      return {
        kind: "invalid",
        message: `codepal-hook: unknown cursor-lifecycle phase ${JSON.stringify(phase)}`,
      };
    }
    return { kind: "cursor-lifecycle", phase };
  }
  if (subcommand === "keep-alive") {
    const sessionIdIdx = argv.indexOf("--session-id");
    const toolIdx = argv.indexOf("--tool");
    const sessionId = sessionIdIdx >= 0 ? argv[sessionIdIdx + 1] : undefined;
    const tool = toolIdx >= 0 ? argv[toolIdx + 1] : undefined;
    if (!sessionId || !tool) {
      return { kind: "invalid", message: "keep-alive requires --session-id and --tool" };
    }
    return { kind: "keep-alive", sessionId, tool };
  }

  return {
    kind: "invalid",
    message: `codepal-hook: unknown subcommand ${JSON.stringify(subcommand)}`,
  };
}

export async function runHookCli(
  argv: string[],
  stdin: NodeJS.ReadableStream,
  stdout: NodeJS.WritableStream,
  stderr: NodeJS.WritableStream,
  env: NodeJS.ProcessEnv,
): Promise<number> {
  const parsed = parseArgv(argv);
  if (parsed.kind === "none") {
    return HOOK_CLI_NOT_HOOK_MODE;
  }
  if (parsed.kind === "invalid") {
    stderr.write(`${parsed.message}\n`);
    return 1;
  }

  if (parsed.kind === "keep-alive") {
    const host = env.CODEPAL_IPC_HOST ?? "127.0.0.1";
    const port = Number(env.CODEPAL_IPC_PORT) || 17371;
    const socketPath = env.CODEPAL_SOCKET_PATH;

    const abort = new AbortController();
    process.on("SIGTERM", () => abort.abort());
    process.on("SIGINT", () => abort.abort());

    await runKeepAliveHook({
      sessionId: parsed.sessionId,
      tool: parsed.tool,
      host,
      port,
      writeStdout: (line) => stdout.write(line + "\n"),
      signal: abort.signal,
      socketPath,
    });
    return 0;
  }

  let rawText: string;
  try {
    rawText = (await readStdinStream(stdin)).trim();
  } catch (error) {
    stderr.write(`codepal-hook: ${formatHookError(error)}\n`);
    return 1;
  }

  try {
    if (parsed.kind === "send-event") {
      if (!rawText) {
        throw new Error("send-event: empty payload");
      }
      await sendEventLine(rawText, env);
      return 0;
    }

    if (parsed.kind === "blocking-hook") {
      if (!rawText) {
        throw new Error("blocking-hook: empty payload");
      }
      const line = await runBlockingHookFromRaw(rawText, env);
      if (line !== undefined && line !== "") {
        stdout.write(`${line}\n`);
      }
      return 0;
    }

    if (parsed.kind === "codebuddy") {
      if (!rawText) {
        throw new Error("codeBuddyHook: empty payload");
      }
      const line = await runCodeBuddyHookPipeline(rawText, env);
      if (line !== undefined && line !== "") {
        stdout.write(`${line}\n`);
      }
      return 0;
    }

    if (parsed.kind === "claude") {
      if (!rawText) {
        throw new Error("claudeHook: empty payload");
      }
      if (isClaudePreToolUsePayload(rawText)) {
        // PreToolUse is a blocking approval path — errors must NEVER propagate
        // as a non-zero exit code, which could affect Claude's native flow.
        // runClaudePreToolUsePipeline already catches internally, but we
        // guard here as well for defense-in-depth.
        try {
          const responseJson = await runClaudePreToolUsePipeline(rawText, env);
          if (responseJson) {
            stdout.write(`${responseJson}\n`);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          stderr.write(`codepal-hook: PreToolUse degraded to native flow: ${message}\n`);
        }
        return 0;
      }
      const line = await runClaudeHookPipeline(rawText, env);
      await sendEventLine(line, env);
      return 0;
    }

    if (parsed.kind === "claude-statusline") {
      if (!rawText) {
        throw new Error("claudeStatusLine: empty payload");
      }
      const line = buildClaudeStatusLineUsageLine(rawText, env);
      if (line) {
        await sendEventLine(line, env);
      }
      return 0;
    }

    if (parsed.kind === "codex") {
      const codexPayload = rawText || parsed.payloadArg?.trim() || "";
      if (!codexPayload) {
        throw new Error("codexHook: empty payload");
      }
      const line = await runCodexHookPipeline(codexPayload, env);
      if (line !== undefined && line !== "") {
        stdout.write(`${line}\n`);
      }
      return 0;
    }

    if (parsed.kind === "cursor") {
      if (!rawText) {
        throw new Error("cursorHook: empty payload");
      }
      const line = await runCursorHookPipeline(rawText, env);
      if (line !== undefined && line !== "") {
        stdout.write(`${line}\n`);
      }
      return 0;
    }

    if (!rawText) {
      throw new Error("cursorLifecycleHook: empty payload");
    }

    let rawObject: Record<string, unknown>;
    try {
      rawObject = JSON.parse(rawText) as Record<string, unknown>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`cursorLifecycleHook: invalid JSON: ${message}`);
    }

    const line = buildCursorLifecycleEventLine(parsed.phase, rawObject, env);
    await sendEventLine(line, env);
    return 0;
  } catch (error) {
    stderr.write(`codepal-hook: ${formatHookError(error)}\n`);
    return 1;
  }
}
