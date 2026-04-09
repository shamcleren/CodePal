import { createClaudeSessionWatcher } from "./claude/claudeSessionWatcher";
import { createClaudeInternalSessionWatcher } from "./claude-internal/claudeInternalSessionWatcher";
import { createCodeBuddySessionWatcher } from "./codebuddy/codebuddySessionWatcher";
import { createCodexSessionWatcher } from "./codex/codexSessionWatcher";
import { createCodexInternalSessionWatcher } from "./codex-internal/codexInternalSessionWatcher";
import { createJetBrainsSessionWatcher } from "./jetbrains/jetbrainsSessionWatcher";
import type { createIntegrationService } from "./integrations/integrationService";
import type { SessionEvent } from "./session/sessionStore";
import type { createSessionStore } from "./session/sessionStore";
import type { UsageSnapshot } from "../shared/usageTypes";
import type { createUsageStore } from "./usage/usageStore";

type SessionStoreLike = Pick<ReturnType<typeof createSessionStore>, "applyEvent">;
type UsageStoreLike = Pick<ReturnType<typeof createUsageStore>, "applySnapshot">;
type IntegrationServiceLike = Pick<ReturnType<typeof createIntegrationService>, "recordEvent">;

type WatcherSet = {
  codex: ReturnType<typeof createCodexSessionWatcher>;
  codexInternal: ReturnType<typeof createCodexInternalSessionWatcher>;
  claude: ReturnType<typeof createClaudeSessionWatcher>;
  claudeInternal: ReturnType<typeof createClaudeInternalSessionWatcher>;
  codeBuddy: ReturnType<typeof createCodeBuddySessionWatcher>;
  jetbrains: ReturnType<typeof createJetBrainsSessionWatcher> | null;
};

type StartSessionWatchersOptions = {
  homeDir: string;
  env: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  sessionStore: SessionStoreLike;
  usageStore: UsageStoreLike;
  integrationService: IntegrationServiceLike;
  broadcastSessions: () => void;
  broadcastUsageOverview: () => void;
  createCodexSessionWatcher?: typeof createCodexSessionWatcher;
  createCodexInternalSessionWatcher?: typeof createCodexInternalSessionWatcher;
  createClaudeSessionWatcher?: typeof createClaudeSessionWatcher;
  createClaudeInternalSessionWatcher?: typeof createClaudeInternalSessionWatcher;
  createCodeBuddySessionWatcher?: typeof createCodeBuddySessionWatcher;
  createJetBrainsSessionWatcher?: typeof createJetBrainsSessionWatcher;
};

function routeSessionEvent(
  sessionStore: SessionStoreLike,
  integrationService: IntegrationServiceLike,
  broadcastSessions: () => void,
  event: SessionEvent,
) {
  sessionStore.applyEvent(event);
  integrationService.recordEvent(event.tool, event.status, event.timestamp);
  broadcastSessions();
}

function routeUsageSnapshot(
  usageStore: UsageStoreLike,
  broadcastUsageOverview: () => void,
  snapshot: UsageSnapshot,
) {
  usageStore.applySnapshot(snapshot);
  broadcastUsageOverview();
}

function logInitialPollError(label: string, error: unknown) {
  console.error(`[CodePal ${label}] initial poll failed:`, (error as Error).message);
}

export function resolveJetBrainsLogRoot(
  homeDir: string,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const override = env.CODEPAL_JETBRAINS_LOG_ROOT?.trim();
  if (override) {
    return override;
  }

  // The watcher reads gongfeng-chat-agent/log/chat-agent.log under this root.
  if (platform === "darwin") {
    return `${homeDir}/.gongfeng-copilot`;
  }

  return null;
}

export function startSessionWatchers(options: StartSessionWatchersOptions) {
  const makeCodexWatcher = options.createCodexSessionWatcher ?? createCodexSessionWatcher;
  const makeCodexInternalWatcher = options.createCodexInternalSessionWatcher ?? createCodexInternalSessionWatcher;
  const makeClaudeWatcher = options.createClaudeSessionWatcher ?? createClaudeSessionWatcher;
  const makeClaudeInternalWatcher = options.createClaudeInternalSessionWatcher ?? createClaudeInternalSessionWatcher;
  const makeCodeBuddyWatcher =
    options.createCodeBuddySessionWatcher ?? createCodeBuddySessionWatcher;
  const makeJetBrainsWatcher =
    options.createJetBrainsSessionWatcher ?? createJetBrainsSessionWatcher;
  const jetBrainsLogRoot = resolveJetBrainsLogRoot(
    options.homeDir,
    options.env,
    options.platform,
  );

  const watchers: WatcherSet = {
    codex: makeCodexWatcher({
      sessionsRoot:
        options.env.CODEPAL_CODEX_SESSIONS_ROOT?.trim() || `${options.homeDir}/.codex/sessions`,
      onEvent: (event) =>
        routeSessionEvent(
          options.sessionStore,
          options.integrationService,
          options.broadcastSessions,
          event,
        ),
      onUsageSnapshot: (snapshot) =>
        routeUsageSnapshot(options.usageStore, options.broadcastUsageOverview, snapshot),
    }),
    codexInternal: makeCodexInternalWatcher({
      sessionsRoot:
        options.env.CODEPAL_CODEX_INTERNAL_SESSIONS_ROOT?.trim() || `${options.homeDir}/.codex-internal/sessions`,
      onEvent: (event) =>
        routeSessionEvent(
          options.sessionStore,
          options.integrationService,
          options.broadcastSessions,
          event,
        ),
      onUsageSnapshot: (snapshot) =>
        routeUsageSnapshot(options.usageStore, options.broadcastUsageOverview, snapshot),
    }),
    claude: makeClaudeWatcher({
      projectsRoot:
        options.env.CODEPAL_CLAUDE_PROJECTS_ROOT?.trim() || `${options.homeDir}/.claude/projects`,
      onEvent: (event) =>
        routeSessionEvent(
          options.sessionStore,
          options.integrationService,
          options.broadcastSessions,
          event,
        ),
      onUsageSnapshot: (snapshot) =>
        routeUsageSnapshot(options.usageStore, options.broadcastUsageOverview, snapshot),
    }),
    claudeInternal: makeClaudeInternalWatcher({
      projectsRoot:
        options.env.CODEPAL_CLAUDE_INTERNAL_PROJECTS_ROOT?.trim() || `${options.homeDir}/.claude-internal/projects`,
      onEvent: (event) =>
        routeSessionEvent(
          options.sessionStore,
          options.integrationService,
          options.broadcastSessions,
          event,
        ),
      onUsageSnapshot: (snapshot) =>
        routeUsageSnapshot(options.usageStore, options.broadcastUsageOverview, snapshot),
    }),
    codeBuddy: makeCodeBuddyWatcher({
      projectsRoot:
        options.env.CODEPAL_CODEBUDDY_PROJECTS_ROOT?.trim() ||
        `${options.homeDir}/.codebuddy/projects`,
      appTasksRoot:
        options.env.CODEPAL_CODEBUDDY_APP_TASKS_ROOT?.trim() ||
        `${options.homeDir}/Library/Application Support/CodeBuddy CN/User/globalStorage/tencent.planning-genie/tasks`,
      appHistoryRoot:
        options.env.CODEPAL_CODEBUDDY_APP_HISTORY_ROOT?.trim() ||
        `${options.homeDir}/Library/Application Support/CodeBuddyExtension/Data`,
      onEvent: (event) =>
        routeSessionEvent(
          options.sessionStore,
          options.integrationService,
          options.broadcastSessions,
          event,
        ),
    }),
    jetbrains: jetBrainsLogRoot
      ? makeJetBrainsWatcher({
          logRoot: jetBrainsLogRoot,
          onEvent: (event) =>
            routeSessionEvent(
              options.sessionStore,
              options.integrationService,
              options.broadcastSessions,
              event,
            ),
        })
      : null,
  };

  void watchers.codex.pollOnce().catch((error) => {
    logInitialPollError("Codex", error);
  });
  void watchers.codexInternal.pollOnce().catch((error) => {
    logInitialPollError("Codex-Internal", error);
  });
  void watchers.claude.pollOnce().catch((error) => {
    logInitialPollError("Claude", error);
  });
  void watchers.claudeInternal.pollOnce().catch((error) => {
    logInitialPollError("Claude-Internal", error);
  });
  void watchers.codeBuddy.pollOnce().catch((error) => {
    logInitialPollError("CodeBuddy", error);
  });
  if (watchers.jetbrains) {
    void watchers.jetbrains.pollOnce().catch((error) => {
      logInitialPollError("JetBrains", error);
    });
  }

  watchers.codex.start();
  watchers.codexInternal.start();
  watchers.claude.start();
  watchers.claudeInternal.start();
  watchers.codeBuddy.start();
  watchers.jetbrains?.start();

  return {
    stop() {
      watchers.codex.stop();
      watchers.codexInternal.stop();
      watchers.claude.stop();
      watchers.claudeInternal.stop();
      watchers.codeBuddy.stop();
      watchers.jetbrains?.stop();
    },
  };
}
