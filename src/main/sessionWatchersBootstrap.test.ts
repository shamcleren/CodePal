import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionEvent } from "./session/sessionStore";

function createWatcherStub(pollOnceImpl: () => Promise<void> = async () => {}) {
  return {
    pollOnce: vi.fn(pollOnceImpl),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

describe("sessionWatchersBootstrap", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts all session watchers, routes their events, and uses the resolved default roots", async () => {
    const applyEvent = vi.fn();
    const recordEvent = vi.fn();
    const broadcastSessions = vi.fn();
    const onSessionEventAccepted = vi.fn();
    const applySnapshot = vi.fn();
    const broadcastUsageOverview = vi.fn();

    const codexWatcher = createWatcherStub();
    const claudeWatcher = createWatcherStub();
    const codeBuddyWatcher = createWatcherStub();
    const jetbrainsWatcher = createWatcherStub();

    const codexEvent: SessionEvent = {
      sessionId: "codex-1",
      tool: "codex",
      status: "running",
      timestamp: 111,
    };
    const claudeEvent: SessionEvent = {
      sessionId: "claude-1",
      tool: "claude",
      status: "completed",
      timestamp: 222,
    };
    const codeBuddyEvent: SessionEvent = {
      sessionId: "codebuddy-1",
      tool: "codebuddy",
      status: "waiting",
      timestamp: 333,
    };
    const jetbrainsEvent: SessionEvent = {
      sessionId: "jb-1",
      tool: "goland",
      status: "error",
      timestamp: 444,
    };

    const codexFactory = vi.fn(
      (options: {
        sessionsRoot: string;
        onEvent: (event: SessionEvent) => void;
        onUsageSnapshot: (snapshot: unknown) => void;
      }) => {
        options.onEvent(codexEvent);
        options.onUsageSnapshot({ kind: "codex" });
        return codexWatcher;
      },
    );
    const claudeFactory = vi.fn(
      (options: {
        projectsRoot: string;
        onEvent: (event: SessionEvent) => void;
        onUsageSnapshot: (snapshot: unknown) => void;
      }) => {
        options.onEvent(claudeEvent);
        options.onUsageSnapshot({ kind: "claude" });
        return claudeWatcher;
      },
    );
    const codeBuddyFactory = vi.fn(
      (options: {
        projectsRoot: string;
        appTasksRoot?: string;
        appHistoryRoot?: string;
        onEvent: (event: SessionEvent) => void;
      }) => {
        options.onEvent(codeBuddyEvent);
        return codeBuddyWatcher;
      },
    );
    const jetbrainsFactory = vi.fn(
      (options: {
        logRoot: string;
        onEvent: (event: SessionEvent) => void;
      }) => {
        options.onEvent(jetbrainsEvent);
        return jetbrainsWatcher;
      },
    );

    const { resolveJetBrainsLogRoot, startSessionWatchers } = await import(
      "./sessionWatchersBootstrap"
    );

    expect(resolveJetBrainsLogRoot("/Users/tester", {}, "darwin")).toBe(
      "/Users/tester/.gongfeng-copilot",
    );
    expect(resolveJetBrainsLogRoot("/Users/tester", {}, "linux")).toBeNull();

    const watchers = startSessionWatchers({
      homeDir: "/Users/tester",
      env: {},
      platform: "darwin",
      sessionStore: { applyEvent } as never,
      usageStore: { applySnapshot } as never,
      integrationService: { recordEvent } as never,
      broadcastSessions,
      broadcastUsageOverview,
      onSessionEventAccepted,
      createCodexSessionWatcher: codexFactory,
      createClaudeSessionWatcher: claudeFactory,
      createCodeBuddySessionWatcher: codeBuddyFactory,
      createJetBrainsSessionWatcher: jetbrainsFactory,
    });

    expect(codexFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionsRoot: "/Users/tester/.codex/sessions",
      }),
    );
    expect(claudeFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        projectsRoot: "/Users/tester/.claude/projects",
      }),
    );
    expect(codeBuddyFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        projectsRoot: "/Users/tester/.codebuddy/projects",
        appTasksRoot:
          "/Users/tester/Library/Application Support/CodeBuddy CN/User/globalStorage/tencent.planning-genie/tasks",
        appHistoryRoot:
          "/Users/tester/Library/Application Support/CodeBuddyExtension/Data",
      }),
    );
    expect(jetbrainsFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        logRoot: "/Users/tester/.gongfeng-copilot",
      }),
    );

    expect(codexWatcher.pollOnce).toHaveBeenCalledTimes(1);
    expect(claudeWatcher.pollOnce).toHaveBeenCalledTimes(1);
    expect(codeBuddyWatcher.pollOnce).toHaveBeenCalledTimes(1);
    expect(jetbrainsWatcher.pollOnce).toHaveBeenCalledTimes(1);
    expect(codexWatcher.start).toHaveBeenCalledTimes(1);
    expect(claudeWatcher.start).toHaveBeenCalledTimes(1);
    expect(codeBuddyWatcher.start).toHaveBeenCalledTimes(1);
    expect(jetbrainsWatcher.start).toHaveBeenCalledTimes(1);

    expect(applyEvent).toHaveBeenCalledWith(codexEvent);
    expect(applyEvent).toHaveBeenCalledWith(claudeEvent);
    expect(applyEvent).toHaveBeenCalledWith(codeBuddyEvent);
    expect(applyEvent).toHaveBeenCalledWith(jetbrainsEvent);
    expect(recordEvent).toHaveBeenCalledWith("codex", "running", 111);
    expect(recordEvent).toHaveBeenCalledWith("claude", "completed", 222);
    expect(recordEvent).toHaveBeenCalledWith("codebuddy", "waiting", 333);
    expect(recordEvent).toHaveBeenCalledWith("goland", "error", 444);
    expect(onSessionEventAccepted).toHaveBeenCalledWith(codexEvent);
    expect(onSessionEventAccepted).toHaveBeenCalledWith(claudeEvent);
    expect(onSessionEventAccepted).toHaveBeenCalledWith(codeBuddyEvent);
    expect(onSessionEventAccepted).toHaveBeenCalledWith(jetbrainsEvent);
    expect(broadcastSessions).toHaveBeenCalledTimes(4);
    expect(applySnapshot).toHaveBeenCalledTimes(2);
    expect(broadcastUsageOverview).toHaveBeenCalledTimes(2);

    watchers.stop();

    expect(codexWatcher.stop).toHaveBeenCalledTimes(1);
    expect(claudeWatcher.stop).toHaveBeenCalledTimes(1);
    expect(codeBuddyWatcher.stop).toHaveBeenCalledTimes(1);
    expect(jetbrainsWatcher.stop).toHaveBeenCalledTimes(1);
  });

  it("does not start the jetbrains watcher on non-darwin without an explicit override", async () => {
    const codexWatcher = createWatcherStub();
    const claudeWatcher = createWatcherStub();
    const codeBuddyWatcher = createWatcherStub();
    const jetbrainsFactory = vi.fn(() => createWatcherStub());

    const { startSessionWatchers } = await import("./sessionWatchersBootstrap");

    const watchers = startSessionWatchers({
      homeDir: "/Users/tester",
      env: {},
      platform: "linux",
      sessionStore: { applyEvent: vi.fn() } as never,
      usageStore: { applySnapshot: vi.fn() } as never,
      integrationService: { recordEvent: vi.fn() } as never,
      broadcastSessions: vi.fn(),
      broadcastUsageOverview: vi.fn(),
      createCodexSessionWatcher: vi.fn(() => codexWatcher),
      createClaudeSessionWatcher: vi.fn(() => claudeWatcher),
      createCodeBuddySessionWatcher: vi.fn(() => codeBuddyWatcher),
      createJetBrainsSessionWatcher: jetbrainsFactory,
    });

    expect(jetbrainsFactory).not.toHaveBeenCalled();
    expect(codexWatcher.start).toHaveBeenCalledTimes(1);
    expect(claudeWatcher.start).toHaveBeenCalledTimes(1);
    expect(codeBuddyWatcher.start).toHaveBeenCalledTimes(1);

    watchers.stop();

    expect(codexWatcher.stop).toHaveBeenCalledTimes(1);
    expect(claudeWatcher.stop).toHaveBeenCalledTimes(1);
    expect(codeBuddyWatcher.stop).toHaveBeenCalledTimes(1);
  });

  it("starts the jetbrains watcher on non-darwin when CODEPAL_JETBRAINS_LOG_ROOT is set", async () => {
    const jetbrainsWatcher = createWatcherStub();
    const jetbrainsFactory = vi.fn(
      (options: {
        logRoot: string;
        onEvent: (event: SessionEvent) => void;
      }) => {
        options.onEvent({
          sessionId: "jb-1",
          tool: "jetbrains",
          status: "idle",
          timestamp: 123,
        });
        return jetbrainsWatcher;
      },
    );

    const { resolveJetBrainsLogRoot, startSessionWatchers } = await import(
      "./sessionWatchersBootstrap"
    );

    expect(
      resolveJetBrainsLogRoot(
        "/Users/tester",
        { CODEPAL_JETBRAINS_LOG_ROOT: "/tmp/jetbrains-logs" },
        "linux",
      ),
    ).toBe("/tmp/jetbrains-logs");

    const watchers = startSessionWatchers({
      homeDir: "/Users/tester",
      env: { CODEPAL_JETBRAINS_LOG_ROOT: "/tmp/jetbrains-logs" },
      platform: "linux",
      sessionStore: { applyEvent: vi.fn() } as never,
      usageStore: { applySnapshot: vi.fn() } as never,
      integrationService: { recordEvent: vi.fn() } as never,
      broadcastSessions: vi.fn(),
      broadcastUsageOverview: vi.fn(),
      createCodexSessionWatcher: vi.fn(() => createWatcherStub()),
      createClaudeSessionWatcher: vi.fn(() => createWatcherStub()),
      createCodeBuddySessionWatcher: vi.fn(() => createWatcherStub()),
      createJetBrainsSessionWatcher: jetbrainsFactory,
    });

    expect(jetbrainsFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        logRoot: "/tmp/jetbrains-logs",
      }),
    );
    expect(jetbrainsWatcher.pollOnce).toHaveBeenCalledTimes(1);
    expect(jetbrainsWatcher.start).toHaveBeenCalledTimes(1);

    watchers.stop();

    expect(jetbrainsWatcher.stop).toHaveBeenCalledTimes(1);
  });

  it("logs initial pollOnce rejections without preventing the watcher start", async () => {
    const pollError = new Error("boom");
    const codexWatcher = createWatcherStub(async () => {
      throw pollError;
    });
    const claudeWatcher = createWatcherStub();
    const codeBuddyWatcher = createWatcherStub();
    const jetbrainsWatcher = createWatcherStub();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const { startSessionWatchers } = await import("./sessionWatchersBootstrap");

    startSessionWatchers({
      homeDir: "/Users/tester",
      env: {},
      platform: "darwin",
      sessionStore: { applyEvent: vi.fn() } as never,
      usageStore: { applySnapshot: vi.fn() } as never,
      integrationService: { recordEvent: vi.fn() } as never,
      broadcastSessions: vi.fn(),
      broadcastUsageOverview: vi.fn(),
      createCodexSessionWatcher: vi.fn(() => codexWatcher),
      createClaudeSessionWatcher: vi.fn(() => claudeWatcher),
      createCodeBuddySessionWatcher: vi.fn(() => codeBuddyWatcher),
      createJetBrainsSessionWatcher: vi.fn(() => jetbrainsWatcher),
    });

    await Promise.resolve();

    expect(codexWatcher.start).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      "[CodePal Codex] initial poll failed:",
      "boom",
    );
  });
});
