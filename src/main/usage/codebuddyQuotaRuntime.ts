import type { CodeBuddyEndpointSettings, CodeBuddySettings } from "../../shared/appSettings";
import type {
  CodeBuddyQuotaConnectResult,
  CodeBuddyQuotaDiagnostics,
  CodeBuddyQuotaStatus,
} from "../../shared/codebuddyQuotaTypes";
import type { UsageSnapshot } from "../../shared/usageTypes";
import { createCodeBuddyQuotaService } from "./codebuddyQuotaService";
import { createCodeBuddyInternalQuotaService } from "./codebuddyInternalQuotaService";

type CodeBuddyQuotaEndpoint = "code" | "enterprise";

type CodeBuddyQuotaServiceLike = {
  getDiagnostics(): Promise<CodeBuddyQuotaDiagnostics>;
  refreshUsage(): Promise<CodeBuddyQuotaConnectResult>;
  connectAndSync(): Promise<CodeBuddyQuotaConnectResult>;
  clearAuth(): Promise<CodeBuddyQuotaDiagnostics>;
  updateConfig(config: CodeBuddyEndpointSettings): void;
};

type CodeBuddyQuotaRuntimeOptions = {
  settings: CodeBuddySettings;
  onUsageSnapshot: (snapshot: UsageSnapshot) => void;
  broadcastUsageOverview: () => void;
  createCodeService?: (options: Parameters<typeof createCodeBuddyQuotaService>[0]) => CodeBuddyQuotaServiceLike;
  createInternalService?: (
    options: Parameters<typeof createCodeBuddyInternalQuotaService>[0],
  ) => CodeBuddyQuotaServiceLike;
};

function normalizeRuntimeSettings(settings: CodeBuddySettings): CodeBuddySettings {
  return {
    refreshIntervalMinutes: settings.refreshIntervalMinutes,
    code: settings.code,
    enterprise: {
      ...settings.enterprise,
      enabled: false,
      loginUrl: "",
      quotaEndpoint: "",
    },
  };
}

function refreshIntervalMsFor(settings: CodeBuddySettings): number {
  return settings.refreshIntervalMinutes * 60 * 1000;
}

export function createCodeBuddyQuotaRuntime(options: CodeBuddyQuotaRuntimeOptions) {
  let settings = normalizeRuntimeSettings(options.settings);
  let refreshIntervalMs = refreshIntervalMsFor(settings);
  let timer: ReturnType<typeof setInterval> | null = null;

  const onUsageSnapshot = (snapshot: UsageSnapshot) => {
    options.onUsageSnapshot(snapshot);
    options.broadcastUsageOverview();
  };

  const code = (options.createCodeService ?? createCodeBuddyQuotaService)({
    config: settings.code,
    onUsageSnapshot,
  });
  const enterprise = (options.createInternalService ?? createCodeBuddyInternalQuotaService)({
    config: settings.enterprise,
    onUsageSnapshot,
  });

  function serviceFor(endpoint: CodeBuddyQuotaEndpoint): CodeBuddyQuotaServiceLike {
    return endpoint === "code" ? code : enterprise;
  }

  async function refreshEnabled(): Promise<CodeBuddyQuotaConnectResult[]> {
    const tasks: Array<Promise<CodeBuddyQuotaConnectResult>> = [];
    if (settings.code.enabled) {
      tasks.push(code.refreshUsage());
    }
    return Promise.all(tasks);
  }

  function start() {
    if (timer !== null) {
      return;
    }
    void refreshEnabled().catch((error) => {
      console.error("[CodePal CodeBuddy Quota] refresh failed:", (error as Error).message);
    });
    scheduleRefreshTimer();
  }

  function scheduleRefreshTimer() {
    timer = setInterval(() => {
      void refreshEnabled().catch((error) => {
        console.error("[CodePal CodeBuddy Quota] refresh failed:", (error as Error).message);
      });
    }, refreshIntervalMs);
  }

  function stop() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  async function getStatus(): Promise<CodeBuddyQuotaStatus> {
    const [codeDiagnostics, enterpriseDiagnostics] = await Promise.all([
      code.getDiagnostics(),
      enterprise.getDiagnostics(),
    ]);
    return {
      code: codeDiagnostics,
      enterprise: enterpriseDiagnostics,
    };
  }

  function updateSettings(nextSettings: CodeBuddySettings) {
    const previousRefreshIntervalMs = refreshIntervalMs;
    settings = normalizeRuntimeSettings(nextSettings);
    refreshIntervalMs = refreshIntervalMsFor(settings);
    code.updateConfig(settings.code);
    enterprise.updateConfig(settings.enterprise);
    if (timer !== null && refreshIntervalMs !== previousRefreshIntervalMs) {
      stop();
      scheduleRefreshTimer();
    }
  }

  return {
    start,
    stop,
    refreshEnabled,
    getStatus,
    updateSettings,
    refreshUsage(endpoint: CodeBuddyQuotaEndpoint) {
      return serviceFor(endpoint).refreshUsage();
    },
    connectAndSync(endpoint: CodeBuddyQuotaEndpoint) {
      return serviceFor(endpoint).connectAndSync();
    },
    clearAuth(endpoint: CodeBuddyQuotaEndpoint) {
      return serviceFor(endpoint).clearAuth();
    },
  };
}
