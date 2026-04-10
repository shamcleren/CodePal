import fs from "node:fs";
import path from "node:path";
import type { SessionEvent } from "../session/sessionStore";
import { ACTIVE_SESSION_STALENESS_MS } from "../session/sessionStore";
import { createAdaptivePollScheduler } from "../session/createAdaptivePollScheduler";

type JetBrainsSessionWatcherOptions = {
  logRoot: string;
  onEvent: (event: SessionEvent) => void;
  pollIntervalMs?: number;
  initialBootstrapLookbackMs?: number;
};

type FileCursor = {
  offset: number;
  remainder: string;
};

type PendingRegister = {
  requestId: string;
  sourceSessionId?: string;
  editorName?: string;
  appVersion?: string;
  workspacePath: string;
  repo?: string;
};

type WorkspaceSession = {
  uuid: string;
  sourceSessionId?: string;
  editorName?: string;
  appVersion?: string;
  workspacePath: string;
  repo?: string;
};

function resolveLogFiles(root: string): string[] {
  const files = new Set<string>();
  const trimmedRoot = root.trim();
  if (!trimmedRoot) {
    return [];
  }

  if (trimmedRoot.endsWith(".log")) {
    if (fs.existsSync(trimmedRoot)) {
      files.add(trimmedRoot);
    }
    return Array.from(files).sort();
  }

  const chatAgentLog = path.join(trimmedRoot, "gongfeng-chat-agent", "log", "chat-agent.log");
  if (fs.existsSync(chatAgentLog)) {
    files.add(chatAgentLog);
  }

  const baseName = path.basename(trimmedRoot);
  if (baseName === ".gongfeng-copilot") {
    const homeDir = path.dirname(trimmedRoot);
    const jetBrainsLogsRoot = path.join(homeDir, "Library", "Logs", "JetBrains");
    if (fs.existsSync(jetBrainsLogsRoot)) {
      for (const ideDir of fs.readdirSync(jetBrainsLogsRoot)) {
        const ideLogDir = path.join(jetBrainsLogsRoot, ideDir);
        let stat: fs.Stats;
        try {
          stat = fs.statSync(ideLogDir);
        } catch {
          continue;
        }
        if (!stat.isDirectory()) {
          continue;
        }
        for (const fileName of fs.readdirSync(ideLogDir)) {
          if (/^idea(?:\.\d+)?\.log$/i.test(fileName)) {
            files.add(path.join(ideLogDir, fileName));
          }
        }
      }
    }
  }

  return Array.from(files).sort();
}

function parseTimestampPrefix(line: string): number {
  const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[.,]\d{3})/);
  if (!match) return Date.now();
  const parsed = Date.parse(match[1].replace(" ", "T").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function hasTimestampPrefix(line: string): boolean {
  return /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[.,]\d{3})/.test(line);
}

function parseJsonObject(line: string): Record<string, unknown> | null {
  return parseConcatenatedJsonObjects(line)[0] ?? null;
}

function firstString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function firstObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function firstArrayString(value: unknown): string | undefined {
  return Array.isArray(value) ? firstString(value[0]) : undefined;
}

function firstArrayRecord(value: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return firstObject(value[0]);
}

function extractJetBrainsConversationId(params: Record<string, unknown> | undefined): string | undefined {
  return firstString(params?.conversationId) ?? firstString(params?.conversation_Id);
}

function extractJetBrainsUserInput(params: Record<string, unknown> | undefined): string | undefined {
  const chatExtra = firstObject(params?.chatExtra) ?? firstObject(params?.chat_extra);
  return (
    firstString(params?.user_input) ??
    firstString(chatExtra?.user_input) ??
    firstString(firstArrayRecord(params?.user_input_segments)?.content) ??
    firstString(firstArrayRecord(params?.contextVariables)?.value)
  );
}

function extractJetBrainsWorkspacePath(params: Record<string, unknown> | undefined): string | undefined {
  const chatExtra = firstObject(params?.chatExtra) ?? firstObject(params?.chat_extra);
  return (
    fileUrlToPath(firstArrayString(params?.workspace_uris)) ??
    fileUrlToPath(firstString(chatExtra?.main_workspace_url)) ??
    fileUrlToPath(firstString(firstObject(params?.visual_area)?.file_abs_path))
  );
}

function fileUrlToPath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("file://")) {
    try {
      return decodeURIComponent(new URL(value).pathname);
    } catch {
      return undefined;
    }
  }
  return value;
}

function workspaceLabel(workspacePath: string): string {
  const trimmed = workspacePath.trim();
  return path.basename(trimmed) || trimmed || "Workspace";
}

function editorLabel(editorName: string | undefined): string {
  const raw = editorName?.trim();
  if (!raw) return "JetBrains";
  const normalized = raw.toLowerCase();
  if (normalized.includes("goland")) return "GoLand";
  if (normalized.includes("pycharm")) return "PyCharm";
  return "JetBrains";
}

function toolKey(editorName: string | undefined): string {
  const normalized = editorName?.toLowerCase() ?? "";
  if (normalized.includes("pycharm")) {
    return "pycharm";
  }
  if (normalized.includes("goland")) {
    return "goland";
  }
  return "jetbrains";
}

function inferEditorName(platform: string | undefined): string | undefined {
  const normalized = platform?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes("goland")) return "JetBrainsGoLand";
  if (normalized.includes("pycharm")) return "JetBrainsPyCharm";
  if (normalized.includes("jetbrains")) return "JetBrains";
  return undefined;
}

function inferEditorNameFromIdeaLogPath(filePath: string): string | undefined {
  const normalized = filePath.toLowerCase();
  if (normalized.includes("/goland")) return "JetBrainsGoLand";
  if (normalized.includes("/pycharm")) return "JetBrainsPyCharm";
  return undefined;
}

function isIgnorableTransportError(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return (
    normalized.includes("websocket: close 1006") &&
    normalized.includes("unexpected eof")
  );
}

function parseConcatenatedJsonObjects(content: string): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  let index = 0;
  while (index < content.length) {
    const start = content.indexOf("{", index);
    if (start < 0) {
      break;
    }
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let i = start; i < content.length; i += 1) {
      const ch = content[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === "\"") {
          inString = false;
        }
        continue;
      }
      if (ch === "\"") {
        inString = true;
        continue;
      }
      if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end <= start) {
      break;
    }
    try {
      const parsed = JSON.parse(content.slice(start, end)) as Record<string, unknown>;
      result.push(parsed);
    } catch {
      // Ignore malformed fragments and keep scanning.
    }
    index = end;
  }
  return result;
}

function extractResultPreview(content: string | undefined): string {
  const raw = content?.trim();
  if (!raw) return "Tool result received";
  const firstLine = raw.split("\n")[0]?.trim() ?? "";
  if (!firstLine) return "Tool result received";
  return firstLine.length > 180 ? `${firstLine.slice(0, 177)}...` : firstLine;
}

function normalizeEventTimestamp(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

function buildEvent(
  session: WorkspaceSession,
  timestamp: number,
  status: SessionEvent["status"],
  activity: SessionEvent["activityItems"][number],
  meta?: Record<string, unknown>,
): SessionEvent {
  const sessionId = session.sourceSessionId?.trim() || session.uuid;
  const workspace = workspaceLabel(session.workspacePath);
  const editor = editorLabel(session.editorName);
  return {
    sessionId,
    tool: toolKey(session.editorName),
    status,
    title: workspace,
    task: `${editor} · ${workspace}`,
    timestamp,
    meta: {
      editorName: session.editorName,
      appVersion: session.appVersion,
      workspacePath: session.workspacePath,
      repo: session.repo,
      sourceSessionId: session.sourceSessionId,
      uuid: session.uuid,
      ...meta,
    },
    activityItems: [
      {
        id: `${sessionId}:${timestamp}:${activity.title}`,
        timestamp,
        ...activity,
      },
    ],
  };
}

export function createJetBrainsSessionWatcher(options: JetBrainsSessionWatcherOptions) {
  const pollIntervalMs = options.pollIntervalMs ?? 2000;
  const initialBootstrapLookbackMs =
    options.initialBootstrapLookbackMs ?? ACTIVE_SESSION_STALENESS_MS;
  const cursors = new Map<string, FileCursor>();
  const pendingByRequestId = new Map<string, PendingRegister>();
  const sessionByUuid = new Map<string, WorkspaceSession>();
  const sessionBySourceSessionId = new Map<string, WorkspaceSession>();
  const uuidByConnectionId = new Map<string, string>();
  const scheduler = createAdaptivePollScheduler({
    poll: () => api.pollOnce(),
    fastIntervalMs: pollIntervalMs,
    maxIntervalMs: pollIntervalMs * 4,
    onError: (error) => {
      console.error("[CodePal JetBrains] poll failed:", (error as Error).message);
    },
  });
  let didInitialBootstrap = false;

  function rememberSession(session: WorkspaceSession) {
    sessionByUuid.set(session.uuid, session);
    if (session.sourceSessionId) {
      sessionBySourceSessionId.set(session.sourceSessionId, session);
    }
  }

  function bootstrapStatusPriority(event: SessionEvent): number {
    switch (event.status) {
      case "error":
        return 5;
      case "completed":
        return 4;
      case "idle":
        return 3;
      case "waiting":
        return 2;
      case "running":
        return 1;
      case "offline":
        return 0;
    }
  }

  function bootstrapContentPriority(event: SessionEvent): number {
    const item = event.activityItems?.[0];
    if (!item) {
      return 0;
    }
    if (item.kind === "message" && item.source === "user") {
      return 4;
    }
    if (item.kind === "message" && item.source === "assistant") {
      return 3;
    }
    if (item.kind === "tool") {
      return 2;
    }
    if (item.kind === "system" || item.kind === "note") {
      return 1;
    }
    return 0;
  }

  function chooseBootstrapEvent(current: SessionEvent | undefined, candidate: SessionEvent): SessionEvent {
    if (!current) {
      return candidate;
    }
    if (candidate.timestamp !== current.timestamp) {
      return candidate.timestamp > current.timestamp ? candidate : current;
    }
    const statusDiff = bootstrapStatusPriority(candidate) - bootstrapStatusPriority(current);
    if (statusDiff !== 0) {
      return statusDiff > 0 ? candidate : current;
    }
    const contentDiff = bootstrapContentPriority(candidate) - bootstrapContentPriority(current);
    if (contentDiff !== 0) {
      return contentDiff > 0 ? candidate : current;
    }
    return current;
  }

  function sessionFromConversation(
    conversationId: string,
    filePath: string,
    rawEvent: Record<string, unknown> | undefined,
  ): WorkspaceSession {
    const existing = sessionBySourceSessionId.get(conversationId);
    if (existing) {
      return existing;
    }
    const workspacePath =
      fileUrlToPath(firstString(rawEvent?.workspace_uri)) ??
      fileUrlToPath(firstString(rawEvent?.workspaceUri)) ??
      "JetBrains Workspace";
    const session: WorkspaceSession = {
      uuid: firstString(rawEvent?.uuid) ?? `conv:${conversationId}`,
      sourceSessionId: conversationId,
      editorName: inferEditorNameFromIdeaLogPath(filePath),
      workspacePath,
    };
    rememberSession(session);
    return session;
  }

  function parseIdeaConversationEvents(
    line: string,
    filePath: string,
    timestamp: number,
  ): SessionEvent[] {
    const marker = "fetchChatCompletion-onSuccess:";
    const markerIndex = line.indexOf(marker);
    if (markerIndex < 0) {
      return [];
    }
    const payload = line.slice(markerIndex + marker.length).trim();
    if (!payload) {
      return [];
    }

    const objects = parseConcatenatedJsonObjects(payload);
    if (objects.length === 0) {
      return [];
    }

    const events: SessionEvent[] = [];
    const assistantChunks = new Map<
      string,
      { session: WorkspaceSession; parts: string[]; timestamp: number }
    >();

    for (const record of objects) {
      const type = firstString(record.type) ?? firstString(record.event);
      const rawEvent = firstObject(record.rawEvent);
      const eventTimestamp = normalizeEventTimestamp(record.timestamp, timestamp);
      const conversationId =
        firstString(record.threadId) ??
        firstString(rawEvent?.conversation_id) ??
        firstString(record.conversation_id);
      if (!type || !conversationId) {
        continue;
      }

      const session = sessionFromConversation(conversationId, filePath, rawEvent);
      if (type === "RUN_STARTED") {
        events.push(
          buildEvent(
            session,
            eventTimestamp,
            "running",
            {
              kind: "system",
              source: "system",
              title: "Request started",
              body: "CodeBuddy request started",
              tone: "running",
            },
            {
              jetbrains_event_type: type,
              jetbrains_status_source: "lifecycle",
            },
          ),
        );
        continue;
      }

      if (type === "RUN_FINISHED") {
        events.push(
          buildEvent(
            session,
            eventTimestamp,
            "completed",
            {
              kind: "system",
              source: "system",
              title: "Request finished",
              body: "CodeBuddy request finished",
              tone: "completed",
            },
            {
              jetbrains_event_type: type,
              jetbrains_status_source: "lifecycle",
            },
          ),
        );
        continue;
      }

      if (type === "TEXT_MESSAGE_CONTENT") {
        const delta = nonEmptyString(record.delta) ?? nonEmptyString(rawEvent?.content);
        if (!delta) {
          continue;
        }
        const existing = assistantChunks.get(conversationId);
        if (existing) {
          existing.parts.push(delta);
          existing.timestamp = Math.max(existing.timestamp, eventTimestamp);
        } else {
          assistantChunks.set(conversationId, { session, parts: [delta], timestamp: eventTimestamp });
        }
        continue;
      }

      if (type === "TOOL_CALL_RESULT") {
        const toolName =
          firstString(record.toolCallName) ??
          firstString(rawEvent?.name) ??
          firstString(rawEvent?.display_name) ??
          "tool";
        const body = extractResultPreview(firstString(record.content));
        events.push(
          buildEvent(
            session,
            eventTimestamp,
            "running",
            {
              kind: "tool",
              source: "tool",
              title: toolName,
              body,
              tone: "running",
              toolName,
              toolPhase: "result",
            },
            {
              jetbrains_event_type: type,
              jetbrains_status_source: "activity",
            },
          ),
        );
      }
    }

    for (const chunk of assistantChunks.values()) {
      const text = chunk.parts.join("").trim();
      if (!text) {
        continue;
      }
      events.push(
        buildEvent(
          chunk.session,
          chunk.timestamp,
          "running",
          {
            kind: "message",
            source: "assistant",
            title: "Assistant",
            body: text,
            tone: "running",
          },
          {
            jetbrains_event_type: "TEXT_MESSAGE_CONTENT",
            jetbrains_status_source: "activity",
          },
        ),
      );
    }

    return events.sort((a, b) => b.timestamp - a.timestamp);
  }

  function pollLine(
    line: string,
    filePath: string,
    initialCutoffMs: number | null,
    timestamp: number,
  ): SessionEvent[] {
    const trimmed = line.trim();
    if (!trimmed) return [];

    if (initialCutoffMs !== null && timestamp < initialCutoffMs) {
      return [];
    }
    const ideaEvents = parseIdeaConversationEvents(trimmed, filePath, timestamp);
    if (ideaEvents.length > 0) {
      return ideaEvents;
    }
    const parsed = parseJsonObject(trimmed);
    if (parsed?.method === "gongfeng/chat-agent-register") {
      const params =
        parsed.params && typeof parsed.params === "object"
          ? (parsed.params as Record<string, unknown>)
          : undefined;
      const requestId = firstString(parsed.id);
      const workspacePath = fileUrlToPath(firstArrayString(params?.workspace));
      if (!requestId || !workspacePath) {
        return [];
      }
      pendingByRequestId.set(requestId, {
        requestId,
        workspacePath,
        sourceSessionId: firstString(params?.session_id),
        editorName: firstString(params?.editor_name),
        appVersion: firstString(params?.app_version),
        repo: firstArrayString(params?.repo),
      });
      return [];
    }

    if (
      parsed?.method === "gongfeng/chat" ||
      parsed?.method === "gongfeng/get-question-summarize"
    ) {
      const params =
        parsed.params && typeof parsed.params === "object"
          ? (parsed.params as Record<string, unknown>)
          : undefined;
      const conversationId = extractJetBrainsConversationId(params);
      const userInput = extractJetBrainsUserInput(params);
      const workspacePath = extractJetBrainsWorkspacePath(params);
      if (!conversationId || !userInput) {
        return [];
      }

      const existing = sessionBySourceSessionId.get(conversationId);
      const session: WorkspaceSession =
        existing ??
        {
          uuid: firstString(params?.uuid) ?? `conv:${conversationId}`,
          sourceSessionId: conversationId,
          editorName: inferEditorNameFromIdeaLogPath(filePath),
          workspacePath: workspacePath ?? "JetBrains Workspace",
        };
      if (!existing) {
        rememberSession(session);
      }

      return [
        buildEvent(
          session,
          timestamp,
          "running",
          {
            kind: "message",
            source: "user",
            title: "User",
            body: userInput,
            timestamp,
          },
          {
            jetbrains_event_type: firstString(parsed.method) ?? "gongfeng/chat",
            jetbrains_status_source: "user",
          },
        ),
      ];
    }

    if (parsed?.result && typeof parsed.result === "object") {
      const requestId = firstString(parsed.id);
      const result = parsed.result as Record<string, unknown>;
      const uuid = firstString(result.uuid);
      const pending = requestId ? pendingByRequestId.get(requestId) : undefined;
      const workspacePath =
        fileUrlToPath(firstString(result.workspace_uri)) ?? pending?.workspacePath;
      if (!requestId || !uuid || !pending || !workspacePath) {
        return [];
      }
      const session: WorkspaceSession = {
        uuid,
        sourceSessionId: pending.sourceSessionId,
        editorName: pending.editorName,
        appVersion: pending.appVersion,
        workspacePath,
        repo: pending.repo,
      };
      rememberSession(session);
      pendingByRequestId.delete(requestId);
      return [];
    }

    if (parsed?.method === "gongfeng/ask/begin") {
      const params =
        parsed.params && typeof parsed.params === "object"
          ? (parsed.params as Record<string, unknown>)
          : undefined;
      const uuid = firstString(params?.uuid);
      const workspacePath = fileUrlToPath(firstArrayString(params?.workspace));
      if (!uuid || !workspacePath) {
        return [];
      }
      const existing = sessionByUuid.get(uuid);
      const session: WorkspaceSession =
        existing ?? {
          uuid,
          sourceSessionId: firstString(params?.session_id),
          editorName: inferEditorName(firstString(params?.platform)),
          workspacePath,
        };
      if (!existing) {
        rememberSession(session);
      }
      return [
        buildEvent(
          session,
          timestamp,
          "running",
          {
            kind: "system",
            source: "system",
            title: "Request started",
            body: "CodeBuddy request started",
            tone: "running",
          },
          {
            jetbrains_event_type: "gongfeng/ask/begin",
            jetbrains_status_source: "lifecycle",
          },
        ),
      ];
    }

    const sessionConnMatch = trimmed.match(/uuid:([0-9a-f-]+),\s*connectionID:([0-9a-f-]+)/i);
    if (sessionConnMatch) {
      uuidByConnectionId.set(sessionConnMatch[2], sessionConnMatch[1]);
      return [];
    }

    const toolResultMatch = trimmed.match(/write tool call result, content:\s*(\{.+\})$/i);
    if (toolResultMatch) {
      try {
        const payload = JSON.parse(toolResultMatch[1]) as Record<string, unknown>;
        const messages = Array.isArray(payload.messages)
          ? (payload.messages as Array<Record<string, unknown>>)
          : [];
        const firstMessage = messages[0];
        if (!firstMessage || typeof firstMessage !== "object") {
          return [];
        }
        const connectionId = firstString(firstMessage.ConnId);
        const uuid = connectionId ? uuidByConnectionId.get(connectionId) : undefined;
        const session = uuid ? sessionByUuid.get(uuid) : undefined;
        if (!session) return [];

        const toolName = firstString(firstMessage.tool_call_name) ?? "tool";
        const encodedContent = firstString(firstMessage.content);
        let preview = extractResultPreview(encodedContent);
        let status: "running" | "completed" = "running";
        if (encodedContent) {
          try {
            const parsedContent = JSON.parse(encodedContent) as Record<string, unknown>;
            preview = extractResultPreview(
              firstString(parsedContent.content) ??
                firstString(parsedContent.realCommand) ??
                encodedContent,
            );
            const rawStatus = firstString(parsedContent.status)?.toLowerCase();
            if (rawStatus === "success" || rawStatus === "completed") {
              status = "completed";
            }
          } catch {
            // Best effort: keep the raw string preview when nested JSON is unavailable.
          }
        }

        return [
          buildEvent(
            session,
            timestamp,
            status,
            {
              kind: "tool",
              source: "tool",
              title: toolName,
              body: preview,
              tone: status,
              toolName,
              toolPhase: "result",
            },
            {
              jetbrains_event_type: "write tool call result",
              jetbrains_status_source: "activity",
            },
          ),
        ];
      } catch {
        return [];
      }
    }

    const connectedMatch = trimmed.match(/uuid from proxy:\s*([0-9a-f-]+)/i);
    if (connectedMatch) {
      return [];
    }

    const closeMatch = trimmed.match(/close connection to proxy:([0-9a-f-]+)/i);
    if (closeMatch) {
      const session = sessionByUuid.get(closeMatch[1]);
      if (!session) return [];
      return [
        buildEvent(
          session,
          timestamp,
          "idle",
          {
            kind: "system",
            source: "system",
            title: "Request finished",
            body: "CodeBuddy request finished",
            tone: "idle",
          },
          {
            jetbrains_event_type: "close connection to proxy",
            jetbrains_status_source: "lifecycle",
          },
        ),
      ];
    }

    const errorMatch = trimmed.match(
      /(accept stream failed|listen local failed):\s*(.+?),\s*([0-9a-f-]+)\s*$/i,
    );
    if (errorMatch) {
      const session = sessionByUuid.get(errorMatch[3]);
      if (!session) return [];
      const errorBody = `${errorMatch[1]}: ${errorMatch[2]}`.trim();
      if (isIgnorableTransportError(errorBody)) {
        return [];
      }
      return [
        buildEvent(
          session,
          timestamp,
          "error",
          {
            kind: "note",
            source: "system",
            title: "Connection error",
            body: errorBody,
            tone: "error",
          },
          {
            jetbrains_event_type: errorMatch[1],
            jetbrains_status_source: "lifecycle",
          },
        ),
      ];
    }

    return [];
  }

  async function pollFile(filePath: string, initialCutoffMs: number | null): Promise<boolean> {
    const stat = fs.statSync(filePath);
    const existing = cursors.get(filePath) ?? { offset: 0, remainder: "" };
    const offset = stat.size < existing.offset ? 0 : existing.offset;
    const content = fs.readFileSync(filePath).subarray(offset).toString("utf8");

    let nextOffset = stat.size;
    const text = `${existing.remainder}${content}`;
    const lines = text.split("\n");
    const remainder = lines.pop() ?? "";
    const initialEventsBySessionId = new Map<string, SessionEvent>();
    let lastTimestamp: number | undefined;

    for (const line of lines) {
      const timestamp = hasTimestampPrefix(line)
        ? parseTimestampPrefix(line)
        : (lastTimestamp ?? Date.now());
      if (hasTimestampPrefix(line)) {
        lastTimestamp = timestamp;
      }
      const events = pollLine(line, filePath, initialCutoffMs, timestamp);
      if (events.length === 0) {
        continue;
      }
      for (const event of events) {
        if (initialCutoffMs !== null) {
          if (event.status !== "error") {
            initialEventsBySessionId.set(
              event.sessionId,
              chooseBootstrapEvent(initialEventsBySessionId.get(event.sessionId), event),
            );
          }
        } else {
          options.onEvent(event);
        }
      }
    }

    if (initialCutoffMs !== null) {
      for (const event of initialEventsBySessionId.values()) {
        options.onEvent(event);
      }
    }

    if (remainder) {
      nextOffset -= Buffer.byteLength(remainder, "utf8");
    }
    cursors.set(filePath, { offset: nextOffset, remainder });
    return offset !== nextOffset || remainder !== existing.remainder;
  }

  const api = {
    async pollOnce() {
      const initialCutoffMs = didInitialBootstrap
        ? null
        : Number.isFinite(initialBootstrapLookbackMs)
          ? Date.now() - initialBootstrapLookbackMs
          : null;
      const logFiles = resolveLogFiles(options.logRoot);
      if (logFiles.length === 0) return false;
      let hadActivity = false;
      for (const logFile of logFiles) {
        hadActivity = (await pollFile(logFile, initialCutoffMs)) || hadActivity;
      }
      didInitialBootstrap = true;
      return hadActivity;
    },
    start() {
      scheduler.start();
    },
    stop() {
      scheduler.stop();
    },
  };

  return api;
}
