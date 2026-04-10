import type { ActivityItem, SessionRecord } from "../shared/sessionTypes";
import type { ResolvedLocale } from "../shared/i18nTypes";
import type { MonitorSessionRow, TimelineItem } from "./monitorSession";
import { createI18nValue } from "./i18n";
import { summarizeMessageBody } from "./messageBody";

function formatDuration(updatedAt: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}m`;
}

function formatUpdatedAt(updatedAt: number, locale: ResolvedLocale): string {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  return date.toLocaleString(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const LOW_SIGNAL_EVENT_NAMES = new Set([
  "Stop",
  "SubagentStop",
  "UserPromptSubmit",
  "SessionStart",
  "SessionEnd",
  "PreToolUse",
  "PostToolUse",
  "beforeSubmitPrompt",
  "beforeShellExecution",
  "beforeReadFile",
  "beforeMCPExecution",
  "afterMCPExecution",
  "afterShellExecution",
  "afterAgentThought",
  "afterAgentResponse",
  "afterFileEdit",
]);

const NORMALIZED_LOW_SIGNAL_EVENT_NAMES = new Set(
  Array.from(LOW_SIGNAL_EVENT_NAMES, (name) => name.trim().toLowerCase()),
);

function isLowSignalSurfaceText(text: string | undefined): boolean {
  if (!text) {
    return true;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }

  if (LOW_SIGNAL_SYSTEM_BODIES.has(trimmed)) {
    return true;
  }

  return (
    LOW_SIGNAL_EVENT_NAMES.has(trimmed) ||
    NORMALIZED_LOW_SIGNAL_EVENT_NAMES.has(trimmed.toLowerCase())
  );
}

function looksLikeRejectedToolUseText(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return (
    normalized.startsWith("the user doesn't want to proceed with this tool use") ||
    normalized.startsWith("the tool use was rejected")
  );
}

function looksLikeCommandJson(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return false;
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return typeof parsed.command === "string" && parsed.command.trim().length > 0;
  } catch {
    return false;
  }
}

function looksLikeCodeSnippetSummary(text: string): boolean {
  const compact = text.trim();
  if (!compact) {
    return false;
  }

  const withoutLineNumber = compact.replace(/^\d+\s+/, "");
  return (
    /^(import|export|const|let|var|function|class|describe|it|expect)\b/.test(withoutLineNumber) ||
    /\bfrom\s+["'][^"']+["']\s*;?$/.test(withoutLineNumber) ||
    /^(<[^>]+>|diff --git )/.test(withoutLineNumber)
  );
}

function isLowValueSummaryText(text: string | undefined): boolean {
  if (!text) {
    return true;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }

  if (trimmed === "正在整理回复" || trimmed === "正在整理回复...") {
    return true;
  }

  return (
    isLowSignalSurfaceText(trimmed) ||
    looksLikeRejectedToolUseText(trimmed) ||
    looksLikeCommandJson(trimmed) ||
    looksLikeCodeSnippetSummary(trimmed)
  );
}

function preferredTimelineSurfaceText(timelineItems: TimelineItem[]): string | undefined {
  for (const item of timelineItems) {
    const body = item.body.trim();
    if (!body || isLowValueSummaryText(body)) {
      continue;
    }
    if (item.kind === "message") {
      return lastMeaningfulSentence(body);
    }
    return body;
  }

  return undefined;
}

function latestMeaningfulMessage(
  timelineItems: TimelineItem[],
  source: "user" | "assistant",
): TimelineItem | undefined {
  return timelineItems.find(
    (item) =>
      item.kind === "message" &&
      item.source === source &&
      !isLowValueSummaryText(item.body),
  );
}

function buildTitleLabel(
  record: SessionRecord,
  timelineItems: TimelineItem[],
  locale: ResolvedLocale,
): string {
  const i18n = createI18nValue(locale);
  const latestUserMessage = latestMeaningfulMessage(timelineItems, "user");
  if (latestUserMessage) {
    return lastMeaningfulSentence(latestUserMessage.body);
  }

  if (record.title?.trim() && !isLowValueSummaryText(record.title)) {
    return record.title.trim();
  }

  if (record.task?.trim() && !isLowValueSummaryText(record.task)) {
    return record.task.trim();
  }

  const preferredTimeline = preferredTimelineSurfaceText(timelineItems);
  if (preferredTimeline) {
    return preferredTimeline;
  }

  return i18n.t("session.title.fallback", {
    time: formatUpdatedAt(record.updatedAt, locale),
  });
}

function shortSessionId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.length <= 4) {
    return trimmed || "----";
  }
  return trimmed.slice(-4);
}

const FILLER_SENTENCES = new Set(["好的", "继续", "嗯", "收到", "ok", "OK"]);
const LOW_SIGNAL_SYSTEM_BODIES = new Set([
  "Completed",
  "Running",
  "Waiting",
  "Done",
  "Idle",
  "Offline",
  "Error",
  "Working",
]);

function isLowInformationLoadingState(record: SessionRecord, timelineItems: TimelineItem[]): boolean {
  if (record.status !== "running") {
    return false;
  }

  if (timelineItems.length === 0) {
    return true;
  }

  return timelineItems.every((item) => {
    if (item.kind === "message" || item.kind === "tool") {
      return false;
    }
    return LOW_SIGNAL_SYSTEM_BODIES.has(item.body.trim()) || item.body.trim() === "Working";
  });
}

function normalizeComparableText(text: string): string {
  return summarizeMessageBody(text)
    .replace(/^(Agent|User|Assistant)\s*:\s*/i, "")
    .replace(/^(Completed|Running|Waiting|Done|Idle|Offline|Error)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripDialogPrefix(text: string): string {
  return summarizeMessageBody(text).replace(/^(Agent|User|Assistant)\s*:\s*/i, "").trim();
}

function lastMeaningfulSentence(text: string): string {
  const normalized = stripDialogPrefix(text);
  const parts = normalized
    .split(/(?<=[。！？?!])/)
    .map((part) => part.trim())
    .filter(Boolean);

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const candidate = parts[index];
    if (!FILLER_SENTENCES.has(candidate)) {
      return candidate;
    }
  }

  return normalized;
}

function trimKnownPrefix(text: string): string {
  return text.replace(/^[A-Za-z][A-Za-z\s_-]*:\s*/, "").trim();
}

function titleCaseToken(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function classifyImplicitArtifact(trimmed: string, index: number): TimelineItem | null {
  if (/^[a-z][A-Za-z0-9_-]{2,}$/.test(trimmed)) {
    return {
      id: `timeline-${index}`,
      kind: "tool",
      source: "tool",
      label: titleCaseToken(trimmed),
      title: titleCaseToken(trimmed),
      body: trimmed,
      timestamp: index,
      toolName: titleCaseToken(trimmed),
      toolPhase: "result",
    };
  }

  return null;
}

function looksLikeNaturalLanguageMessage(trimmed: string): boolean {
  if (/^(Closed action|Notification|Pending action)/i.test(trimmed)) {
    return false;
  }

  if (/^(Completed|Running|Waiting|Done|Idle|Offline|Error)\s*:/i.test(trimmed)) {
    return false;
  }

  return /[。！？?!]/.test(trimmed) || /[\u4e00-\u9fff]/.test(trimmed) || /\s{1,}/.test(trimmed);
}

function parseStatusPrefix(
  text: string,
): { tone: TimelineItem["tone"]; body: string } | null {
  const match = text.match(/^(Completed|Running|Waiting|Done|Idle|Offline|Error)\s*:\s*(.+)$/i);
  if (!match) {
    return null;
  }

  const status = match[1].toLowerCase();
  const body = match[2].trim();
  const tone: TimelineItem["tone"] =
    status === "done"
      ? "completed"
      : status === "offline"
        ? "system"
        : (status as TimelineItem["tone"]);

  return { tone, body };
}

function classifyArtifact(trimmed: string, index: number): TimelineItem | null {
  if (trimmed.startsWith("Tool call:")) {
    return {
      id: `timeline-${index}`,
      kind: "tool",
      source: "tool",
      label: trimmed.slice("Tool call:".length).trim() || "Tool",
      title: trimmed.slice("Tool call:".length).trim() || "Tool",
      body: trimmed,
      timestamp: index,
      toolName: trimmed.slice("Tool call:".length).trim() || "Tool",
      toolPhase: "call",
    };
  }

  if (/^(Edited|已编辑)\s+/i.test(trimmed)) {
    return {
      id: `timeline-${index}`,
      kind: "system",
      source: "system",
      label: "File Edit",
      title: "File Edit",
      body: trimmed,
      timestamp: index,
    };
  }

  if (/^(Ran|已运行)\s+/i.test(trimmed)) {
    const artifactType = /(test|lint|build|verify|验证)/i.test(trimmed)
      ? "verification"
      : "command";
    return {
      id: `timeline-${index}`,
      kind: "tool",
      source: "tool",
      label: artifactType === "verification" ? "Verification" : "Command",
      title: artifactType === "verification" ? "Verification" : "Command",
      body: trimKnownPrefix(trimmed),
      timestamp: index,
      toolName: artifactType === "verification" ? "Verification" : "Command",
      toolPhase: "result",
    };
  }

  if (
    /^(npm|pnpm|yarn|bun|git|make|python|python3|node|cargo|go|pytest|vitest|playwright)\b/i.test(
      trimmed,
    )
  ) {
    const artifactType = /(test|lint|build|verify)/i.test(trimmed) ? "verification" : "command";
    return {
      id: `timeline-${index}`,
      kind: "tool",
      source: "tool",
      label: artifactType === "verification" ? "Verification" : "Command",
      title: artifactType === "verification" ? "Verification" : "Command",
      body: trimmed,
      timestamp: index,
      toolName: artifactType === "verification" ? "Verification" : "Command",
      toolPhase: "result",
    };
  }

  return null;
}

function classifyActivity(line: string, index: number): TimelineItem {
  const trimmed = line.trim();
  if (/^(Agent|User|Assistant)\s*:/i.test(trimmed)) {
    const label = trimmed.split(":")[0]?.trim() || "Dialog";
    return {
      id: `timeline-${index}`,
      kind: "message",
      source: label.trim().toLowerCase() === "user" ? "user" : "assistant",
      label,
      title: label,
      body: stripDialogPrefix(trimmed),
      timestamp: index,
    };
  }

  const artifact = classifyArtifact(trimmed, index);
  if (artifact) {
    return artifact;
  }

  const implicitArtifact = classifyImplicitArtifact(trimmed, index);
  if (implicitArtifact) {
    return implicitArtifact;
  }

  if (looksLikeNaturalLanguageMessage(trimmed)) {
    return {
      id: `timeline-${index}`,
      kind: "message",
      source: "assistant",
      label: "Agent",
      title: "Agent",
      body: trimmed,
      timestamp: index,
    };
  }

  const statusPrefixed = parseStatusPrefix(trimmed);
  if (statusPrefixed) {
    return {
      id: `timeline-${index}`,
      kind: "note",
      source: "system",
      label: "Status",
      title: "Status",
      body: statusPrefixed.body,
      tone: statusPrefixed.tone,
      timestamp: index,
    };
  }

  return {
    id: `timeline-${index}`,
    kind: /^Closed action/i.test(trimmed) ? "system" : "note",
    source: "system",
    label: LOW_SIGNAL_SYSTEM_BODIES.has(trimmed) ? "Status" : "System",
    title: LOW_SIGNAL_SYSTEM_BODIES.has(trimmed) ? "Status" : "System",
    body: trimmed,
    tone:
      trimmed.toLowerCase() === "completed" || trimmed.toLowerCase() === "done"
        ? "completed"
        : trimmed.toLowerCase() === "running"
          ? "running"
          : trimmed.toLowerCase() === "waiting"
            ? "waiting"
            : trimmed.toLowerCase() === "idle"
              ? "idle"
            : trimmed.toLowerCase() === "error"
              ? "error"
              : "system",
    timestamp: index,
  };
}

function timelineFromActivityItem(item: ActivityItem): TimelineItem {
  return {
    ...item,
    label: item.title,
  };
}

function buildTimelineItems(record: SessionRecord): TimelineItem[] {
  if (record.activityItems?.length) {
    const seen = new Set<string>();
    const messageBodies = new Set<string>();
    const items: TimelineItem[] = [];
    for (const item of record.activityItems) {
      const normalized = normalizeComparableText(item.body);
      const dedupKey = `${item.kind}:${item.source}:${normalized}`;
      if (!normalized || seen.has(dedupKey)) {
        continue;
      }
      if (item.kind === "message") {
        messageBodies.add(normalized);
      } else if ((item.kind === "note" || item.kind === "system") && messageBodies.has(normalized)) {
        continue;
      }
      seen.add(dedupKey);
      items.push(timelineFromActivityItem(item));
    }
    return items;
  }

  const seenBodies = new Set<string>();
  const messageBodies = new Set<string>();
  const items: TimelineItem[] = [];

  for (const [index, line] of (record.activities ?? []).entries()) {
    const item = classifyActivity(line, index);
    const normalized = normalizeComparableText(item.body);

    if (!normalized) {
      continue;
    }

    if (item.kind === "note" && LOW_SIGNAL_SYSTEM_BODIES.has(item.body.trim())) {
      continue;
    }

    if (item.kind === "message") {
      if (seenBodies.has(normalized)) {
        continue;
      }
      messageBodies.add(normalized);
      seenBodies.add(normalized);
      items.push(item);
      continue;
    }

    if (item.kind === "note" && messageBodies.has(normalized)) {
      continue;
    }

    if (seenBodies.has(normalized)) {
      continue;
    }

    seenBodies.add(normalized);
    items.push(item);
  }

  return items;
}

function buildCollapsedSummary(record: SessionRecord, timelineItems: TimelineItem[]): string {
  const pendingTitle = record.pendingActions?.[0]?.title?.trim();
  if (pendingTitle) {
    return pendingTitle;
  }

  const latestUserMessage = latestMeaningfulMessage(timelineItems, "user");
  const latestAssistantMessage = latestMeaningfulMessage(timelineItems, "assistant");
  if (latestAssistantMessage) {
    return lastMeaningfulSentence(latestAssistantMessage.body);
  }

  const titleLike = new Set(
    [record.title, record.task]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .map(normalizeComparableText),
  );

  const preferred = timelineItems.find((item) => {
    const comparable = normalizeComparableText(item.body);
    if (titleLike.has(comparable)) {
      return false;
    }
    if (isLowValueSummaryText(item.body)) {
      return false;
    }
    if (item.kind === "tool") {
      return true;
    }
    if (item.kind === "message") {
      return false;
    }
    return !LOW_SIGNAL_SYSTEM_BODIES.has(item.body.trim());
  });

  if (!preferred) {
    if (latestUserMessage) {
      return lastMeaningfulSentence(latestUserMessage.body);
    }
    if (record.task?.trim() && !isLowValueSummaryText(record.task)) {
      return record.task.trim();
    }
    if (record.title?.trim() && !isLowValueSummaryText(record.title)) {
      return record.title.trim();
    }
    return record.status;
  }

  if (preferred.kind === "message") {
    return lastMeaningfulSentence(preferred.body);
  }

  if (preferred.kind === "tool") {
    return preferred.body;
  }

  return preferred.body;
}

export function sessionRecordToRow(
  record: SessionRecord,
  locale: ResolvedLocale = "en",
): MonitorSessionRow {
  const timelineItems = buildTimelineItems(record);
  const loading = isLowInformationLoadingState(record, timelineItems);
  const i18n = createI18nValue(locale);
  const fallbackSummary = loading ? i18n.t("session.loading") : undefined;
  return {
    ...record,
    titleLabel: buildTitleLabel(record, timelineItems, locale),
    shortId: shortSessionId(record.id),
    updatedLabel: formatUpdatedAt(record.updatedAt, locale),
    durationLabel: formatDuration(record.updatedAt),
    pendingCount: record.pendingActions?.length ?? 0,
    loading,
    collapsedSummary: fallbackSummary ?? buildCollapsedSummary(record, timelineItems),
    timelineItems,
    activityItems: record.activityItems ?? [],
    hoverSummary:
      fallbackSummary ??
      record.task ??
      record.activityItems?.[0]?.body ??
      record.activities?.[0] ??
      record.status,
  };
}
