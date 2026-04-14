import {
  isValidElement,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { SessionStatus } from "../../shared/sessionTypes";
import { useI18n } from "../i18n";
import type { TimelineItem } from "../monitorSession";
import { parseMessageBody, toRenderableMessageBody } from "../messageBody";

type HoverDetailsProps = {
  items: TimelineItem[];
  sessionStatus: SessionStatus;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
};

type PrimaryRenderEntry = {
  renderKey: string;
  item: TimelineItem;
  isTypingItem: boolean;
};

type PrimaryDisplayItem =
  | {
      kind: "item";
      renderKey: string;
      entry: PrimaryRenderEntry;
    }
  | {
      kind: "tool-group";
      renderKey: string;
      items: TimelineItem[];
      activeArtifact: boolean;
    };

const PRIMARY_ITEM_GAP_PX = 10;
const PRIMARY_VIRTUALIZATION_THRESHOLD = 24;
const PRIMARY_OVERSCAN_PX = 360;

function extractCodeText(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map((item) => extractCodeText(item)).join("");
  if (isValidElement<{ children?: unknown }>(node)) {
    return extractCodeText(node.props.children);
  }
  return "";
}

function noteToneLabel(item: TimelineItem, t: (key: string) => string): string {
  switch (item.tone) {
    case "completed":
      return t("session.note.completed");
    case "running":
      return t("session.note.running");
    case "waiting":
      return t("session.note.waiting");
    case "idle":
      return t("session.note.idle");
    case "error":
      return t("session.note.error");
    default:
      return t("session.note.default");
  }
}

const COMPACT_STATUS_BODIES = new Set([
  "completed",
  "running",
  "working",
  "waiting",
  "done",
  "idle",
  "offline",
  "error",
]);

function isCompactStatusNote(item: TimelineItem): boolean {
  const body = item.body.trim().toLowerCase();
  const label = item.label.trim().toLowerCase();
  const toneLabel = item.tone?.trim().toLowerCase() ?? "system";

  return COMPACT_STATUS_BODIES.has(body) || body === label || body === toneLabel;
}

function isLowSignalSystemEvent(item: TimelineItem): boolean {
  const body = item.body.trim().toLowerCase();
  const title = item.title.trim().toLowerCase();

  if (isCompactStatusNote(item)) {
    return true;
  }

  return (
    title === "file edit" ||
    body === "file edited" ||
    body.startsWith("edited ") ||
    body.startsWith("file edited")
  );
}

function messageRole(label: string): "user" | "agent" | "assistant" {
  const normalized = label.trim().toLowerCase();
  if (normalized === "user") {
    return "user";
  }
  if (normalized === "assistant") {
    return "assistant";
  }
  return "agent";
}

function isExternalTarget(href: string): boolean {
  if (/^https?:\/\//i.test(href)) {
    return true;
  }

  return href.startsWith("/") || /^[.]{1,2}\//.test(href) || /^[A-Za-z0-9_-]+\//.test(href);
}

function RichTextBlock({ text }: { text: string }) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const i18n = useI18n();
  const { cleanedText, chips } = parseMessageBody(text, (key, params) => i18n.t(key, params));
  const hasMarkdownBody = cleanedText.trim().length > 0;
  const renderableText = toRenderableMessageBody(text);

  async function copyCodeBlock(code: string) {
    setCopiedCode(code);
    try {
      await window.codepal.writeClipboardText(code);
    } catch {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        throw new Error("clipboard unavailable");
      }
    }
    window.setTimeout(() => {
      setCopiedCode((current) => (current === code ? null : current));
    }, 1200);
  }

  return (
    <div className="session-stream__richtext">
      {hasMarkdownBody ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => {
              const target = typeof href === "string" ? href : "";
              if (!isExternalTarget(target)) {
                return <>{children}</>;
              }
              return (
                <a
                  className="session-stream__link"
                  href={target}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => {
                    event.preventDefault();
                    void window.codepal.openExternalTarget(target);
                  }}
                >
                  {children}
                </a>
              );
            },
            code: ({ className, children }) => {
              const isBlockCode = typeof className === "string" && className.includes("language-");
              return (
                <code
                  className={[
                    isBlockCode ? "session-stream__codeblock-code" : "session-stream__code",
                    className,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {children}
                </code>
              );
            },
            pre: ({ children }) => {
              const codeText = extractCodeText(children).replace(/\n$/, "");
              const copied = copiedCode === codeText;
              return (
                <div className="session-stream__codeblock-shell">
                  <button
                    type="button"
                    className="session-stream__codeblock-copy"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void copyCodeBlock(codeText);
                    }}
                  >
                    {copied ? i18n.t("common.copied") : i18n.t("common.copy")}
                  </button>
                  <div className="session-stream__codeblock-content">
                    <pre className="session-stream__codeblock">{children}</pre>
                  </div>
                </div>
              );
            },
            p: ({ children }) => <p>{children}</p>,
            ul: ({ children }) => <ul className="session-stream__list">{children}</ul>,
            strong: ({ children }) => <strong className="session-stream__strong">{children}</strong>,
            em: ({ children }) => <em className="session-stream__em">{children}</em>,
          }}
        >
          {renderableText}
        </ReactMarkdown>
      ) : null}
      {chips.length > 0 ? (
        <div className="session-stream__directive-chips" aria-label={i18n.t("session.directives")}>
          {chips.map((chip) => (
            <span key={chip.id} className="session-stream__directive-chip">
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function looksLikeDiff(text: string): boolean {
  const normalized = text.trimStart();
  return (
    normalized.startsWith("diff --git ") ||
    normalized.startsWith("--- ") ||
    normalized.startsWith("+++ ") ||
    normalized.includes("\n@@ ") ||
    normalized.includes("\nindex ")
  );
}

function normalizeJsonText(text: string): string | null {
  const trimmed = text.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return null;
  }

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
}

function diffLineClass(line: string): string {
  if (line.startsWith("diff --git ") || line.startsWith("index ") || line.startsWith("+++ ") || line.startsWith("--- ")) {
    return "session-stream__plaintext-line--meta";
  }
  if (line.startsWith("@@")) {
    return "session-stream__plaintext-line--hunk";
  }
  if (line.startsWith("+")) {
    return "session-stream__plaintext-line--add";
  }
  if (line.startsWith("-")) {
    return "session-stream__plaintext-line--remove";
  }
  return "session-stream__plaintext-line--plain";
}

function ToolTextBlock({ text }: { text: string }) {
  if (looksLikeDiff(text)) {
    return (
      <div className="session-stream__plaintext session-stream__plaintext--diff">
        {text.split("\n").map((line, index) => (
          <span
            key={`${index}:${line}`}
            className={`session-stream__plaintext-line ${diffLineClass(line)}`}
          >
            {line || " "}
          </span>
        ))}
      </div>
    );
  }

  const formattedJson = normalizeJsonText(text);
  if (formattedJson) {
    return (
      <pre className="session-stream__plaintext session-stream__plaintext--json">
        {formattedJson}
      </pre>
    );
  }

  return <pre className="session-stream__plaintext session-stream__plaintext--log">{text}</pre>;
}

function toolBodySummary(text: string): string {
  const compact = text
    .replace(/\s+/g, " ")
    .replace(/\s*([{}[\],:])\s*/g, "$1 ")
    .trim();

  if (!compact) {
    return "";
  }

  return compact;
}

function shouldShowArtifactName(item: TimelineItem): boolean {
  if (!item.toolName) {
    return false;
  }
  return item.toolName.trim().toLowerCase() !== item.label.trim().toLowerCase();
}

export function buildItemRenderKeys(items: TimelineItem[]): string[] {
  const seenCounts = new Map<string, number>();

  return items.map((item) => {
    const currentCount = seenCounts.get(item.id) ?? 0;
    seenCounts.set(item.id, currentCount + 1);
    return `${item.id}::${currentCount}`;
  });
}

export function buildPrimaryRenderEntries(
  primaryItems: TimelineItem[],
  sessionStatus: SessionStatus,
  typingLabel: string,
): PrimaryRenderEntry[] {
  const primaryItemRenderKeys = buildItemRenderKeys(primaryItems);
  const renderedPrimaryItems =
    sessionStatus === "running" && primaryItems.length > 0
      ? [
          ...primaryItems,
          {
            id: "session-stream-typing-indicator",
            kind: "message" as const,
            source: "assistant" as const,
            label: "Assistant",
            title: "Assistant",
            body: typingLabel,
            timestamp: Number.MAX_SAFE_INTEGER,
          },
        ]
      : primaryItems;

  return renderedPrimaryItems.map((item, index) => ({
    renderKey:
      item.id === "session-stream-typing-indicator"
        ? item.id
        : (primaryItemRenderKeys[index] ?? `${item.id}::${index}`),
    item,
    isTypingItem: item.id === "session-stream-typing-indicator",
  }));
}

export function buildPrimaryDisplayItems(
  primaryItems: TimelineItem[],
  sessionStatus: SessionStatus,
  typingLabel: string,
): PrimaryDisplayItem[] {
  const entries = buildPrimaryRenderEntries(primaryItems, sessionStatus, typingLabel);
  const displayItems: PrimaryDisplayItem[] = [];
  let index = 0;

  while (index < entries.length) {
    const current = entries[index];
    if (current.item.kind !== "tool") {
      displayItems.push({
        kind: "item",
        renderKey: current.renderKey,
        entry: current,
      });
      index += 1;
      continue;
    }

    const toolItems: TimelineItem[] = [];
    const firstToolIndex = index;
    while (index < entries.length && entries[index].item.kind === "tool") {
      toolItems.push(entries[index].item);
      index += 1;
    }

    displayItems.push({
      kind: "tool-group",
      renderKey: `tool-group:${entries[firstToolIndex].renderKey}`,
      items: toolItems,
      activeArtifact: sessionStatus === "running" && firstToolIndex === 0,
    });
  }

  return displayItems;
}

function estimatePrimaryEntryHeight(entry: PrimaryRenderEntry): number {
  if (entry.isTypingItem) {
    return 76;
  }

  const { item } = entry;
  if (item.kind === "tool") {
    const lineCount = item.body.split("\n").length;
    return Math.max(88, Math.min(220, 72 + lineCount * 16));
  }

  const bodyLength = item.body.trim().length;
  const estimatedLines = Math.max(1, Math.ceil(bodyLength / 72));
  return Math.max(74, Math.min(260, 54 + estimatedLines * 22));
}

export function calculateVirtualWindow(
  offsets: number[],
  heights: number[],
  visibleTop: number,
  visibleBottom: number,
): { startIndex: number; endIndex: number } {
  if (offsets.length === 0 || heights.length === 0) {
    return { startIndex: 0, endIndex: -1 };
  }

  let startIndex = 0;
  while (startIndex < offsets.length) {
    const itemBottom = offsets[startIndex] + heights[startIndex];
    if (itemBottom >= visibleTop) {
      break;
    }
    startIndex += 1;
  }

  let endIndex = startIndex;
  while (endIndex < offsets.length) {
    if (offsets[endIndex] > visibleBottom) {
      break;
    }
    endIndex += 1;
  }

  return {
    startIndex: Math.min(startIndex, offsets.length - 1),
    endIndex: Math.min(offsets.length - 1, Math.max(startIndex, endIndex)),
  };
}

function PrimaryStreamItem({
  entry,
  entryIndex,
  primaryItems,
  sessionStatus,
  expandedTools,
  onToggleTool,
}: {
  entry: PrimaryRenderEntry;
  entryIndex: number;
  primaryItems: TimelineItem[];
  sessionStatus: SessionStatus;
  expandedTools: Record<string, boolean>;
  onToggleTool: (renderKey: string) => void;
}) {
  const i18n = useI18n();
  const { item, isTypingItem, renderKey } = entry;

  if (item.kind === "message") {
    return (
      <div
        className={`session-stream__item session-stream__item--message session-stream__item--message-${messageRole(item.label)} ${
          isTypingItem ? "session-stream__item--typing" : ""
        }`}
      >
        <div className="session-stream__header">
          <span className="session-stream__label">{item.label}</span>
        </div>
        <div className="session-stream__body">
          {isTypingItem ? (
            <div className="session-stream__typing-indicator" aria-label={i18n.t("session.agentTyping")}>
              <span className="session-stream__typing-text">{i18n.t("session.typing")}</span>
              <span className="session-stream__typing-dots" aria-hidden="true" />
            </div>
          ) : (
            <RichTextBlock text={item.body} />
          )}
        </div>
      </div>
    );
  }

  const expanded = expandedTools[renderKey] ?? false;
  const activeArtifact =
    sessionStatus === "running" &&
    !primaryItems.slice(0, entryIndex).some((candidate) => candidate.kind === "tool");

  const artifactPhaseClass = item.toolPhase
    ? `session-stream__item--artifact-${item.toolPhase.toLowerCase()}`
    : "";

  return (
    <div
      className={`session-stream__item session-stream__item--artifact ${artifactPhaseClass} ${
        activeArtifact ? "session-stream__item--artifact-active" : ""
      }`}
    >
      <div className="session-stream__artifact-accent" aria-hidden="true" />
      <div className="session-stream__artifact-copy">
        <div className="session-stream__header">
          <span className="session-stream__artifact-kicker">{i18n.t("session.execution")}</span>
          <span className="session-stream__label">{item.label}</span>
          {shouldShowArtifactName(item) ? (
            <span className="session-stream__artifact-name">{item.toolName}</span>
          ) : null}
          {item.toolPhase ? (
            <span className="session-stream__artifact-type">{item.toolPhase}</span>
          ) : null}
          {item.body.length > 72 || item.body.includes("\n") ? (
            <button
              type="button"
              className="session-stream__artifact-toggle"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleTool(renderKey);
              }}
            >
              {expanded ? i18n.t("session.collapse") : i18n.t("session.expand")}
            </button>
          ) : null}
        </div>
        <div className="session-stream__body">
          <div className="session-stream__artifact-body-shell">
            {expanded ? (
              <div className="session-stream__artifact-body session-stream__artifact-body--expanded">
                <ToolTextBlock text={item.body} />
              </div>
            ) : (
              <div className="session-stream__artifact-summary" title={item.body}>
                {toolBodySummary(item.body)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolGroupItem({
  items,
  activeArtifact,
}: {
  items: TimelineItem[];
  activeArtifact: boolean;
}) {
  const i18n = useI18n();

  return (
    <div
      className={`session-stream__item session-stream__item--artifact session-stream__item--artifact-group ${
        activeArtifact ? "session-stream__item--artifact-active" : ""
      }`}
    >
      <div className="session-stream__artifact-accent" aria-hidden="true" />
      <div className="session-stream__artifact-copy">
        <div className="session-stream__header">
          <span className="session-stream__artifact-kicker">{i18n.t("session.execution")}</span>
          <span className="session-stream__label">Tools</span>
          <span className="session-stream__artifact-type">{items.length}</span>
        </div>
        <div className="session-stream__body">
          <div className="session-stream__artifact-group-list">
            {items.map((item) => {
              const toolLabel = item.toolName?.trim() || item.label.trim() || item.title.trim();
              const phaseLabel = item.toolPhase === "call" ? "call" : "result";
              return (
                <div key={item.id} className="session-stream__artifact-group-row" title={item.body}>
                  <span className="session-stream__artifact-group-tool">{toolLabel}</span>
                  <span className="session-stream__artifact-group-phase">{phaseLabel}</span>
                  <span className="session-stream__artifact-group-body">
                    {toolBodySummary(item.body)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function HoverDetails({ items, sessionStatus, scrollContainerRef }: HoverDetailsProps) {
  const i18n = useI18n();
  const chronologicalItems = [...items].reverse();
  const primaryItems = chronologicalItems.filter((item) => item.kind === "message" || item.kind === "tool");
  const notes = chronologicalItems
    .filter((item) => item.kind === "note" || item.kind === "system")
    .filter((item) => !(primaryItems.length > 0 && isLowSignalSystemEvent(item)));
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const primarySectionRef = useRef<HTMLDivElement | null>(null);
  const itemNodesRef = useRef(new Map<string, HTMLElement>());
  const measuredHeightsRef = useRef<Record<string, number>>({});
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [metricsVersion, setMetricsVersion] = useState(0);
  const [scrollMetrics, setScrollMetrics] = useState({
    scrollTop: 0,
    viewportHeight: 0,
    sectionOffsetTop: 0,
  });

  const primaryDisplayItems = buildPrimaryDisplayItems(primaryItems, sessionStatus, i18n.t("session.typing"));
  const primaryEntries = buildPrimaryRenderEntries(primaryItems, sessionStatus, i18n.t("session.typing"));
  const shouldVirtualize =
    primaryDisplayItems.length >= PRIMARY_VIRTUALIZATION_THRESHOLD && Boolean(scrollContainerRef?.current);

  function toggleTool(renderKey: string) {
    setExpandedTools((current) => ({
      ...current,
      [renderKey]: !current[renderKey],
    }));
  }

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const key = entry.target.getAttribute("data-render-key");
        if (!key) {
          continue;
        }
        const nextHeight = Math.ceil(entry.contentRect.height);
        if (nextHeight > 0 && measuredHeightsRef.current[key] !== nextHeight) {
          measuredHeightsRef.current[key] = nextHeight;
          changed = true;
        }
      }
      if (changed) {
        setMetricsVersion((current) => current + 1);
      }
    });

    resizeObserverRef.current = observer;
    itemNodesRef.current.forEach((node) => observer.observe(node));
    return () => {
      resizeObserverRef.current = null;
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const activeKeys = new Set(
      primaryDisplayItems.map((entry) =>
        entry.kind === "item" ? entry.entry.renderKey : entry.renderKey,
      ),
    );
    for (const cachedKey of Object.keys(measuredHeightsRef.current)) {
      if (!activeKeys.has(cachedKey)) {
        delete measuredHeightsRef.current[cachedKey];
      }
    }
  }, [primaryDisplayItems]);

  useEffect(() => {
    if (!shouldVirtualize) {
      return;
    }

    const container = scrollContainerRef?.current;
    const section = primarySectionRef.current;
    if (!container || !section) {
      return;
    }

    const syncMetrics = () => {
      setScrollMetrics({
        scrollTop: container.scrollTop,
        viewportHeight: container.clientHeight,
        sectionOffsetTop: section.offsetTop,
      });
    };

    syncMetrics();

    container.addEventListener("scroll", syncMetrics, { passive: true });
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            syncMetrics();
          })
        : null;
    observer?.observe(container);
    observer?.observe(section);

    return () => {
      container.removeEventListener("scroll", syncMetrics);
      observer?.disconnect();
    };
  }, [scrollContainerRef, shouldVirtualize, primaryDisplayItems.length, metricsVersion]);

  function registerPrimaryItemNode(renderKey: string) {
    return (node: HTMLDivElement | null) => {
      const previous = itemNodesRef.current.get(renderKey);
      if (previous && resizeObserverRef.current) {
        resizeObserverRef.current.unobserve(previous);
      }
      if (!node) {
        itemNodesRef.current.delete(renderKey);
        return;
      }
      itemNodesRef.current.set(renderKey, node);
      node.setAttribute("data-render-key", renderKey);
      resizeObserverRef.current?.observe(node);
    };
  }

  let primaryContent: JSX.Element;
  if (!shouldVirtualize) {
    primaryContent = (
      <div ref={primarySectionRef} className="session-stream__section session-stream__section--primary">
        {primaryDisplayItems.map((entry, index) =>
          entry.kind === "tool-group" ? (
            <ToolGroupItem
              key={entry.renderKey}
              items={entry.items}
              activeArtifact={entry.activeArtifact}
            />
          ) : (
            <PrimaryStreamItem
              key={entry.renderKey}
              entry={entry.entry}
              entryIndex={index}
              primaryItems={primaryItems}
              sessionStatus={sessionStatus}
              expandedTools={expandedTools}
              onToggleTool={toggleTool}
            />
          ),
        )}
      </div>
    );
  } else {
    const heights = primaryDisplayItems.map((entry) => {
      const renderKey = entry.kind === "item" ? entry.entry.renderKey : entry.renderKey;
      if (entry.kind === "tool-group") {
        return measuredHeightsRef.current[renderKey] ?? Math.max(90, 60 + entry.items.length * 26);
      }
      return measuredHeightsRef.current[renderKey] ?? estimatePrimaryEntryHeight(entry.entry);
    });
    const offsets: number[] = [];
    let cursor = 0;
    for (let index = 0; index < heights.length; index += 1) {
      offsets.push(cursor);
      cursor += heights[index] + (index < heights.length - 1 ? PRIMARY_ITEM_GAP_PX : 0);
    }
    const totalHeight = cursor;
    const visibleTop = Math.max(
      0,
      scrollMetrics.scrollTop - scrollMetrics.sectionOffsetTop - PRIMARY_OVERSCAN_PX,
    );
    const visibleBottom =
      scrollMetrics.viewportHeight > 0
        ? Math.max(
            visibleTop,
            scrollMetrics.scrollTop +
              scrollMetrics.viewportHeight -
              scrollMetrics.sectionOffsetTop +
              PRIMARY_OVERSCAN_PX,
          )
        : Number.POSITIVE_INFINITY;
    const { startIndex, endIndex } =
      Number.isFinite(visibleBottom)
        ? calculateVirtualWindow(offsets, heights, visibleTop, visibleBottom)
        : { startIndex: 0, endIndex: primaryEntries.length - 1 };
    const visibleEntries = primaryDisplayItems.slice(startIndex, endIndex + 1);

    primaryContent = (
      <div ref={primarySectionRef} className="session-stream__section session-stream__section--primary">
        <div className="session-stream__virtual-viewport" style={{ height: `${totalHeight}px` }}>
          {visibleEntries.map((entry, visibleIndex) => {
            const absoluteIndex = startIndex + visibleIndex;
            const renderKey = entry.kind === "item" ? entry.entry.renderKey : entry.renderKey;
            return (
              <div
                key={renderKey}
                ref={registerPrimaryItemNode(renderKey)}
                className="session-stream__virtual-item"
                style={{ top: `${offsets[absoluteIndex]}px` }}
              >
                {entry.kind === "tool-group" ? (
                  <ToolGroupItem
                    items={entry.items}
                    activeArtifact={entry.activeArtifact}
                  />
                ) : (
                  <PrimaryStreamItem
                    entry={entry.entry}
                    entryIndex={absoluteIndex}
                    primaryItems={primaryItems}
                    sessionStatus={sessionStatus}
                    expandedTools={expandedTools}
                    onToggleTool={toggleTool}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="session-stream" role="region" aria-label={i18n.t("session.activityStream")}>
      {items.length === 0 ? (
        <div className="session-stream__empty">{i18n.t("session.noDetails")}</div>
      ) : (
        <>
          {primaryContent}
          {notes.length > 0 ? (
            <div className="session-stream__section session-stream__section--notes">
              {notes.map((item) => (
                <div key={item.id} className="session-stream__item session-stream__item--note">
                  <div className={`session-stream__note session-stream__note--${item.tone ?? "system"}`}>
                    <span className="session-stream__note-dot" aria-hidden="true" />
                    <span className="session-stream__note-body">{item.body}</span>
                    <span className="session-stream__note-meta">{noteToneLabel(item, i18n.t)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
