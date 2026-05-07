import { useCallback, useEffect, useState } from "react";
import { defaultAppSettings, type AppSettings, type AppSettingsPatch } from "../shared/appSettings";
import type { ClaudeQuotaDiagnostics } from "../shared/claudeQuotaTypes";
import type { CodeBuddyQuotaDiagnostics } from "../shared/codebuddyQuotaTypes";
import type { CursorDashboardDiagnostics } from "../shared/cursorDashboardTypes";
import type { HistoryDiagnostics } from "../shared/historyTypes";
import type { IntegrationAgentId, IntegrationDiagnostics } from "../shared/integrationTypes";
import type { AppUpdateState } from "../shared/updateTypes";
import type { UsageOverview } from "../shared/usageTypes";
import type { ProviderGatewayStatus } from "../shared/providerGatewayTypes";
import type { ProviderGatewayClientSetupTarget } from "../shared/providerGatewayTypes";
import { DisplayPreferencesPanel } from "./components/DisplayPreferencesPanel";
import { CursorDashboardPanel } from "./components/CursorDashboardPanel";
import { CodeBuddyQuotaPanel } from "./components/CodeBuddyQuotaPanel";
import { ClaudeQuotaPanel } from "./components/ClaudeQuotaPanel";
import { HistorySettingsPanel } from "./components/HistorySettingsPanel";
import { IntegrationPanel } from "./components/IntegrationPanel";
import { MainUpdateButton } from "./components/MainUpdateButton";
import { NotificationPreferencesPanel } from "./components/NotificationPreferencesPanel";
import { ProviderGatewayPanel } from "./components/ProviderGatewayPanel";
import { StatusBar } from "./components/StatusBar";
import { SessionList } from "./components/SessionList";
import { UpdatePanel } from "./components/UpdatePanel";
import { UsageStatusStrip } from "./components/UsageStatusStrip";
import { SupportPanel } from "./components/SupportPanel";
import type { MonitorSessionRow } from "./monitorSession";
import { createI18nValue, I18nProvider, resolveLocale } from "./i18n";
import { formatSettingsPathForDisplay } from "./settingsPath";
import { SUPPORT_LINKS } from "./supportLinks";
import { buildSupportDiagnosticsReport } from "./supportDiagnostics";
import { hydrateRowsIfEmpty, reconcileRows, rowsFromSessions } from "./sessionBootstrap";
import {
  type UsageAgentId,
} from "./usageDisplaySettings";

const CURSOR_DASHBOARD_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const CODEBUDDY_QUOTA_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
type SettingsSectionId =
  | "overview"
  | "providerGateway"
  | "integrations"
  | "usage"
  | "preferences"
  | "advanced";
type SettingsSection = {
  id: SettingsSectionId;
  label: string;
  eyebrow: string;
  summary: string;
};

export function buildFallbackHistoryDiagnostics(enabled: boolean): HistoryDiagnostics {
  return {
    enabled,
    dbPath: "",
    dbSizeBytes: 0,
    estimatedSessionCount: 0,
    estimatedActivityCount: 0,
    lastCleanupAt: null,
  };
}

export function App() {
  const [rows, setRows] = useState<MonitorSessionRow[]>([]);
  const [integrationDiagnostics, setIntegrationDiagnostics] =
    useState<IntegrationDiagnostics | null>(null);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [installingAgentId, setInstallingAgentId] = useState<IntegrationAgentId | null>(null);
  const [integrationFeedback, setIntegrationFeedback] = useState<string | null>(null);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSectionId>("overview");
  const [usageOverview, setUsageOverview] = useState<UsageOverview | null>(null);
  const [claudeQuotaDiagnostics, setClaudeQuotaDiagnostics] =
    useState<ClaudeQuotaDiagnostics | null>(null);
  const [claudeQuotaLoading, setClaudeQuotaLoading] = useState(false);
  const [cursorDashboardDiagnostics, setCursorDashboardDiagnostics] =
    useState<CursorDashboardDiagnostics | null>(null);
  const [cursorDashboardLoading, setCursorDashboardLoading] = useState(false);
  const [codeBuddyQuotaDiagnostics, setCodeBuddyQuotaDiagnostics] =
    useState<CodeBuddyQuotaDiagnostics | null>(null);
  const [codeBuddyQuotaLoading, setCodeBuddyQuotaLoading] = useState(false);
  const [codeBuddyInternalQuotaDiagnostics, setCodeBuddyInternalQuotaDiagnostics] =
    useState<CodeBuddyQuotaDiagnostics | null>(null);
  const [codeBuddyInternalQuotaLoading, setCodeBuddyInternalQuotaLoading] = useState(false);
  const [providerGatewayStatus, setProviderGatewayStatus] =
    useState<ProviderGatewayStatus | null>(null);
  const [providerGatewayLoading, setProviderGatewayLoading] = useState(false);
  const [providerGatewayTokenSaving, setProviderGatewayTokenSaving] = useState(false);
  const [providerGatewayHealthChecking, setProviderGatewayHealthChecking] = useState(false);
  const [providerGatewayClientSetupTarget, setProviderGatewayClientSetupTarget] =
    useState<ProviderGatewayClientSetupTarget | null>(null);
  const [providerGatewayFeedback, setProviderGatewayFeedback] = useState<string | null>(null);
  const [providerGatewayError, setProviderGatewayError] = useState<string | null>(null);
  const [historyDiagnostics, setHistoryDiagnostics] = useState<HistoryDiagnostics | null>(null);
  const [historyStoreClearing, setHistoryStoreClearing] = useState(false);
  const [historyStoreVersion, setHistoryStoreVersion] = useState(0);
  const [sessionHistoryClearing, setSessionHistoryClearing] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultAppSettings);
  const [appSettingsPath, setAppSettingsPath] = useState("");
  const [homeDir, setHomeDir] = useState("");
  const [updateState, setUpdateState] = useState<AppUpdateState | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const resolvedLocale = resolveLocale(
    appSettings.locale,
    typeof navigator !== "undefined" ? navigator.language : undefined,
  );
  const i18n = createI18nValue(resolvedLocale);
  const supportDiagnosticsReport = buildSupportDiagnosticsReport({
    generatedAt: Date.now(),
    resolvedLocale,
    appSettings,
    appSettingsPath,
    homeDir,
    integrationDiagnostics,
    claudeQuotaDiagnostics,
    cursorDashboardDiagnostics,
    codeBuddyQuotaDiagnostics,
    codeBuddyInternalQuotaDiagnostics,
    historyDiagnostics,
    updateState,
  });
  const settingsSections: SettingsSection[] = [
    {
      id: "overview",
      label: i18n.t("settings.overview.title"),
      eyebrow: i18n.t("settings.overview.eyebrow"),
      summary: i18n.t("settings.overview.summary"),
    },
    {
      id: "providerGateway",
      label: i18n.t("providerGateway.title"),
      eyebrow: i18n.t("settings.providerGateway.eyebrow"),
      summary: i18n.t("settings.providerGateway.summary"),
    },
    {
      id: "integrations",
      label: i18n.t("settings.integrations.title"),
      eyebrow: i18n.t("settings.integrations.eyebrow"),
      summary: i18n.t("settings.integrations.summary"),
    },
    {
      id: "usage",
      label: i18n.t("settings.usage.title"),
      eyebrow: i18n.t("settings.usage.eyebrow"),
      summary: i18n.t("settings.usage.summary"),
    },
    {
      id: "preferences",
      label: i18n.t("settings.preferences.title"),
      eyebrow: i18n.t("settings.preferences.eyebrow"),
      summary: i18n.t("settings.preferences.summary"),
    },
    {
      id: "advanced",
      label: i18n.t("settings.advanced.title"),
      eyebrow: i18n.t("settings.advanced.eyebrow"),
      summary: i18n.t("settings.advanced.summary"),
    },
  ];
  const activeSettingsSectionConfig =
    settingsSections.find((section) => section.id === activeSettingsSection) ?? settingsSections[0];

  function clearSessionHistory() {
    setSessionHistoryClearing(true);
    return window.codepal
      .clearSessionHistory()
      .then((sessions) => {
        setRows(reconcileRows([], sessions, resolvedLocale));
        return sessions;
      })
      .finally(() => {
        setSessionHistoryClearing(false);
      });
  }

  function loadClaudeQuotaDiagnostics() {
    return window.codepal
      .getClaudeQuotaDiagnostics()
      .then((diagnostics) => {
        setClaudeQuotaDiagnostics(diagnostics);
        return diagnostics;
      })
      .catch((error: unknown) => {
        const diagnostics = {
          state: "error" as const,
          message: (error as Error).message,
        };
        setClaudeQuotaDiagnostics(diagnostics);
        return diagnostics;
      });
  }

  function loadCursorDashboardDiagnostics() {
    return window.codepal
      .getCursorDashboardDiagnostics()
      .then((cursorDiagnostics) => {
        setCursorDashboardDiagnostics(cursorDiagnostics);
        return cursorDiagnostics;
      })
      .catch((error: unknown) => {
        const diagnostics = {
          state: "error" as const,
          message: (error as Error).message,
        };
        setCursorDashboardDiagnostics(diagnostics);
        return diagnostics;
      });
  }

  function loadCodeBuddyQuotaDiagnostics() {
    return window.codepal
      .getCodeBuddyQuotaDiagnostics()
      .then((diagnostics) => {
        setCodeBuddyQuotaDiagnostics(diagnostics);
        return diagnostics;
      })
      .catch((error: unknown) => {
        const diagnostics = {
          state: "error" as const,
          message: (error as Error).message,
          endpoint: "",
        };
        setCodeBuddyQuotaDiagnostics(diagnostics);
        return diagnostics;
      });
  }

  function loadCodeBuddyInternalQuotaDiagnostics() {
    return window.codepal
      .getCodeBuddyInternalQuotaDiagnostics()
      .then((diagnostics) => {
        setCodeBuddyInternalQuotaDiagnostics(diagnostics);
        return diagnostics;
      })
      .catch((error: unknown) => {
        const diagnostics = {
          kind: "internal" as const,
          label: "CodeBuddy Enterprise",
          state: "error" as const,
          message: (error as Error).message,
          endpoint: "",
        };
        setCodeBuddyInternalQuotaDiagnostics(diagnostics);
        return diagnostics;
      });
  }

  function loadProviderGatewayStatus() {
    setProviderGatewayLoading(true);
    setProviderGatewayError(null);
    return window.codepal
      .getProviderGatewayStatus()
      .then((status) => {
        setProviderGatewayStatus(status);
        return status;
      })
      .catch((error: unknown) => {
        setProviderGatewayError((error as Error).message);
        return null;
      })
      .finally(() => {
        setProviderGatewayLoading(false);
      });
  }

  function loadHistoryDiagnostics(enabled: boolean) {
    return window.codepal
      .getHistoryDiagnostics()
      .then((diagnostics) => {
        setHistoryDiagnostics(diagnostics);
        return diagnostics;
      })
      .catch(() => {
        const diagnostics = buildFallbackHistoryDiagnostics(enabled);
        setHistoryDiagnostics(diagnostics);
        return diagnostics;
      });
  }

  function runClaudeQuotaRefresh() {
    setClaudeQuotaLoading(true);
    return window.codepal
      .refreshClaudeQuota()
      .then((result) => {
        setClaudeQuotaDiagnostics(result.diagnostics);
        return result;
      })
      .catch((error: unknown) => {
        const diagnostics = {
          state: "error" as const,
          message: (error as Error).message,
        };
        setClaudeQuotaDiagnostics(diagnostics);
        return {
          diagnostics,
          synced: false,
        };
      })
      .finally(() => {
        setClaudeQuotaLoading(false);
      });
  }

  function runCursorDashboardSync(mode: "connect" | "refresh") {
    setCursorDashboardLoading(true);
    const action =
      mode === "connect"
        ? window.codepal.connectCursorDashboard()
        : window.codepal.refreshCursorDashboardUsage();
    return action
      .then((result) => {
        setCursorDashboardDiagnostics(result.diagnostics);
        return result;
      })
      .catch((error: unknown) => {
        const diagnostics = {
          state: "error" as const,
          message: (error as Error).message,
        };
        setCursorDashboardDiagnostics(diagnostics);
        return {
          diagnostics,
          synced: false,
        };
      })
      .finally(() => {
        setCursorDashboardLoading(false);
      });
  }

  function clearCursorDashboardAuth() {
    setCursorDashboardLoading(true);
    return window.codepal
      .clearCursorDashboardAuth()
      .then((diagnostics) => {
        setCursorDashboardDiagnostics(diagnostics);
        return diagnostics;
      })
      .catch((error: unknown) => {
        const diagnostics = {
          state: "error" as const,
          message: (error as Error).message,
        };
        setCursorDashboardDiagnostics(diagnostics);
        return diagnostics;
      })
      .finally(() => {
        setCursorDashboardLoading(false);
      });
  }

  function runCodeBuddyQuotaSync(mode: "connect" | "refresh") {
    setCodeBuddyQuotaLoading(true);
    const action =
      mode === "connect"
        ? window.codepal.connectCodeBuddyQuota()
        : window.codepal.refreshCodeBuddyQuota();
    return action
      .then((result) => {
        setCodeBuddyQuotaDiagnostics(result.diagnostics);
        return result;
      })
      .catch((error: unknown) => {
        const diagnostics = {
          state: "error" as const,
          message: (error as Error).message,
          endpoint: "",
        };
        setCodeBuddyQuotaDiagnostics(diagnostics);
        return {
          diagnostics,
          synced: false,
        };
      })
      .finally(() => {
        setCodeBuddyQuotaLoading(false);
      });
  }

  function clearCodeBuddyQuotaAuth() {
    setCodeBuddyQuotaLoading(true);
    return window.codepal
      .clearCodeBuddyQuotaAuth()
      .then((diagnostics) => {
        setCodeBuddyQuotaDiagnostics(diagnostics);
        return diagnostics;
      })
      .catch((error: unknown) => {
        const diagnostics = {
          state: "error" as const,
          message: (error as Error).message,
          endpoint: "",
        };
        setCodeBuddyQuotaDiagnostics(diagnostics);
        return diagnostics;
      })
      .finally(() => {
        setCodeBuddyQuotaLoading(false);
      });
  }

  function runCodeBuddyInternalQuotaSync(mode: "connect" | "refresh") {
    setCodeBuddyInternalQuotaLoading(true);
    const action =
      mode === "connect"
        ? window.codepal.connectCodeBuddyInternalQuota()
        : window.codepal.refreshCodeBuddyInternalQuota();
    return action
      .then((result) => {
        setCodeBuddyInternalQuotaDiagnostics(result.diagnostics);
        return result;
      })
      .catch((error: unknown) => {
        const diagnostics = {
          kind: "internal" as const,
          label: "CodeBuddy Enterprise",
          state: "error" as const,
          message: (error as Error).message,
          endpoint: "",
        };
        setCodeBuddyInternalQuotaDiagnostics(diagnostics);
        return {
          diagnostics,
          synced: false,
        };
      })
      .finally(() => {
        setCodeBuddyInternalQuotaLoading(false);
      });
  }

  function clearCodeBuddyInternalQuotaAuth() {
    setCodeBuddyInternalQuotaLoading(true);
    return window.codepal
      .clearCodeBuddyInternalQuotaAuth()
      .then((diagnostics) => {
        setCodeBuddyInternalQuotaDiagnostics(diagnostics);
        return diagnostics;
      })
      .catch((error: unknown) => {
        const diagnostics = {
          kind: "internal" as const,
          label: "CodeBuddy Enterprise",
          state: "error" as const,
          message: (error as Error).message,
          endpoint: "",
        };
        setCodeBuddyInternalQuotaDiagnostics(diagnostics);
        return diagnostics;
      })
      .finally(() => {
        setCodeBuddyInternalQuotaLoading(false);
      });
  }

  function saveProviderGatewayToken(providerId: string, token: string) {
    setProviderGatewayTokenSaving(true);
    setProviderGatewayFeedback(null);
    setProviderGatewayError(null);
    return window.codepal
      .updateProviderGatewayToken(providerId, token)
      .then((result) => {
        setProviderGatewayStatus(result.status);
        setProviderGatewayFeedback(i18n.t("providerGateway.token.saved"));
      })
      .catch((error: unknown) => {
        setProviderGatewayError((error as Error).message);
      })
      .finally(() => {
        setProviderGatewayTokenSaving(false);
      });
  }

  function runProviderGatewayHealthCheck() {
    setProviderGatewayHealthChecking(true);
    setProviderGatewayFeedback(null);
    setProviderGatewayError(null);
    return window.codepal
      .runProviderGatewayHealthCheck()
      .then((status) => {
        setProviderGatewayStatus(status);
        setProviderGatewayFeedback(i18n.t("providerGateway.health.finished"));
      })
      .catch((error: unknown) => {
        setProviderGatewayError((error as Error).message);
      })
      .finally(() => {
        setProviderGatewayHealthChecking(false);
      });
  }

  function configureProviderGatewayClient(target: ProviderGatewayClientSetupTarget) {
    setProviderGatewayClientSetupTarget(target);
    setProviderGatewayFeedback(null);
    setProviderGatewayError(null);
    return window.codepal
      .configureProviderGatewayClient(target)
      .then((result) => {
        setProviderGatewayFeedback(result.message);
        return window.codepal.getProviderGatewayStatus();
      })
      .then((status) => {
        setProviderGatewayStatus(status);
      })
      .catch((error: unknown) => {
        setProviderGatewayError((error as Error).message);
      })
      .finally(() => {
        setProviderGatewayClientSetupTarget(null);
      });
  }

  function refreshIntegrations() {
    setIntegrationLoading(true);
    setIntegrationError(null);
    setIntegrationFeedback(null);
    void window.codepal
      .getIntegrationDiagnostics()
      .then((diagnostics) => {
        setIntegrationDiagnostics(diagnostics);
      })
      .catch((error: unknown) => {
        setIntegrationError((error as Error).message);
      })
      .finally(() => {
        setIntegrationLoading(false);
      });

    void loadClaudeQuotaDiagnostics();
    void loadProviderGatewayStatus();
    void loadCursorDashboardDiagnostics();
    void loadCodeBuddyQuotaDiagnostics();
    void loadCodeBuddyInternalQuotaDiagnostics();
    void loadHistoryDiagnostics(appSettings.history.persistenceEnabled);
  }

  function openSettingsSection(section: SettingsSectionId) {
    setActiveSettingsSection(section);
    setSettingsOpen(true);
    refreshIntegrations();
  }

  function openSettingsDrawer() {
    openSettingsSection("overview");
  }

  function openMaintenanceSettings() {
    openSettingsSection("advanced");
  }

  function closeSettingsDrawer() {
    setSettingsOpen(false);
  }

  useEffect(() => {
    void reloadAppSettings();
  }, []);

  function reloadAppSettings() {
    return Promise.all([
      window.codepal.reloadAppSettings(),
      window.codepal.getAppSettingsPath(),
      window.codepal.getHomeDir?.() ?? Promise.resolve(""),
    ]).then(([settings, settingsPath, nextHomeDir]) => {
        setAppSettings(settings);
        setAppSettingsPath(settingsPath);
        setHomeDir(nextHomeDir);
        return Promise.all([
          loadClaudeQuotaDiagnostics(),
          loadProviderGatewayStatus(),
          loadCodeBuddyQuotaDiagnostics(),
          loadCodeBuddyInternalQuotaDiagnostics(),
          loadHistoryDiagnostics(settings.history.persistenceEnabled),
        ]).then(() => ({ settings, settingsPath }));
      },
    );
  }

  useEffect(() => {
    let active = true;
    const unsub = window.codepal.onSessions((sessions) => {
      setRows((currentRows) => reconcileRows(currentRows, sessions, resolvedLocale));
    });
    void window.codepal.getSessions().then((sessions) => {
      if (!active) {
        return;
      }
      setRows((currentRows) => hydrateRowsIfEmpty(currentRows, sessions, resolvedLocale));
    });
    return () => {
      active = false;
      unsub();
    };
  }, [resolvedLocale]);

  useEffect(() => {
    void window.codepal.getSessions().then((sessions) => {
      setRows(rowsFromSessions(sessions, resolvedLocale));
    });
  }, [resolvedLocale]);

  useEffect(() => {
    void loadClaudeQuotaDiagnostics();
  }, []);

  useEffect(() => {
    void loadCursorDashboardDiagnostics();
  }, []);

  useEffect(() => {
    void loadCodeBuddyQuotaDiagnostics();
  }, []);

  useEffect(() => {
    void loadCodeBuddyInternalQuotaDiagnostics();
  }, []);

  useEffect(() => {
    void loadProviderGatewayStatus();
  }, []);

  useEffect(() => {
    void loadHistoryDiagnostics(appSettings.history.persistenceEnabled);
  }, []);

  useEffect(() => {
    let active = true;
    const unsub = window.codepal.onUsageOverview((overview) => {
      setUsageOverview(overview);
    });
    void window.codepal.getUsageOverview().then((overview) => {
      if (!active) {
        return;
      }
      setUsageOverview(overview);
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const unsub = window.codepal.onUpdateState((nextState) => {
      setUpdateState(nextState);
      if (
        nextState.phase !== "checking" &&
        nextState.phase !== "downloading"
      ) {
        setUpdateBusy(false);
      }
    });
    void window.codepal.getUpdateState().then((nextState) => {
      if (active) {
        setUpdateState(nextState);
      }
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    const unsub = window.codepal.onOpenSettings(() => {
      openSettingsDrawer();
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!settingsOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeSettingsDrawer();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (cursorDashboardLoading || cursorDashboardDiagnostics?.state !== "connected") {
      return;
    }

    if (!cursorDashboardDiagnostics.lastSyncAt) {
      void runCursorDashboardSync("refresh");
      return;
    }

    const timer = window.setInterval(() => {
      void runCursorDashboardSync("refresh");
    }, CURSOR_DASHBOARD_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    cursorDashboardDiagnostics?.lastSyncAt,
    cursorDashboardDiagnostics?.state,
    cursorDashboardLoading,
  ]);

  useEffect(() => {
    if (codeBuddyQuotaLoading || codeBuddyQuotaDiagnostics?.state !== "connected") {
      return;
    }

    if (!codeBuddyQuotaDiagnostics.lastSyncAt) {
      void runCodeBuddyQuotaSync("refresh");
      return;
    }

    const timer = window.setInterval(() => {
      void runCodeBuddyQuotaSync("refresh");
    }, CODEBUDDY_QUOTA_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    codeBuddyQuotaDiagnostics?.lastSyncAt,
    codeBuddyQuotaDiagnostics?.state,
    codeBuddyQuotaLoading,
  ]);

  useEffect(() => {
    if (codeBuddyInternalQuotaLoading || codeBuddyInternalQuotaDiagnostics?.state !== "connected") {
      return;
    }

    if (!codeBuddyInternalQuotaDiagnostics.lastSyncAt) {
      void runCodeBuddyInternalQuotaSync("refresh");
      return;
    }

    const timer = window.setInterval(() => {
      void runCodeBuddyInternalQuotaSync("refresh");
    }, CODEBUDDY_QUOTA_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    codeBuddyInternalQuotaDiagnostics?.lastSyncAt,
    codeBuddyInternalQuotaDiagnostics?.state,
    codeBuddyInternalQuotaLoading,
  ]);

  function updateAppSettings(nextValue: AppSettingsPatch) {
    return window.codepal.updateAppSettings(nextValue).then((settings) => {
      setAppSettings(settings);
      return loadHistoryDiagnostics(settings.history.persistenceEnabled).then(() => settings);
    });
  }

  function clearPersistedHistory() {
    setHistoryStoreClearing(true);
    return window.codepal
      .clearHistoryStore()
      .then((diagnostics) => {
        setHistoryDiagnostics(diagnostics);
        setHistoryStoreVersion((current) => current + 1);
        return diagnostics;
      })
      .finally(() => {
        setHistoryStoreClearing(false);
      });
  }

  function runUpdateAction(
    action: () => Promise<AppUpdateState>,
    options?: { keepBusyUntilEvent?: boolean },
  ) {
    setUpdateBusy(true);
    return action()
      .then((nextState) => {
        setUpdateState(nextState);
        return nextState;
      })
      .finally(() => {
        if (!options?.keepBusyUntilEvent) {
          setUpdateBusy(false);
        }
      });
  }

  function toggleUsageAgent(agent: UsageAgentId) {
    const hiddenAgents = appSettings.display.hiddenAgents.includes(agent)
      ? appSettings.display.hiddenAgents.filter((value) => value !== agent)
      : [...appSettings.display.hiddenAgents, agent];

    void updateAppSettings({
      display: {
        ...appSettings.display,
        hiddenAgents,
      },
    });
  }

  const handleRespond = useCallback((sessionId: string, actionId: string, option: string) => {
    window.codepal.respondToPendingAction(sessionId, actionId, option);
  }, []);
  const integrationAttentionCount = (integrationDiagnostics?.agents ?? []).filter((agent) => {
    return (
      agent.supported &&
      (agent.health !== "active" || (agent.id === "codex" && !agent.hookInstalled))
    );
  }).length;
  const listenerSummary = integrationDiagnostics?.listener.mode === "tcp"
    ? `127.0.0.1:${integrationDiagnostics.listener.port}`
    : integrationDiagnostics?.listener.mode === "socket"
      ? integrationDiagnostics.listener.socketPath
      : integrationDiagnostics?.listener.message ?? i18n.t("settings.overview.unknown");
  const gatewaySummary =
    providerGatewayStatus?.listener.state === "listening"
      ? providerGatewayStatus.listener.localUrl
      : providerGatewayStatus?.listener.state === "disabled"
        ? i18n.t("settings.overview.disabled")
        : providerGatewayStatus?.listener.message ?? i18n.t("settings.overview.unknown");

  return (
    <I18nProvider locale={resolvedLocale}>
    <div className="app app-shell">
      <div className="app-header">
        <div className="app-header__meta">
          <h1 className="app-title">CodePal</h1>
        </div>
        <div className="app-header__actions">
          <MainUpdateButton
            state={updateState}
            busy={updateBusy}
            onOpenMaintenance={openMaintenanceSettings}
            onInstall={() => {
              void runUpdateAction(() => window.codepal.installUpdate());
            }}
          />
          <button
            type="button"
            className="app-settings-trigger"
            aria-label={i18n.t("app.openSettings")}
            onClick={openSettingsDrawer}
          >
            {i18n.t("app.settings")}
          </button>
        </div>
      </div>
      <StatusBar
        usage={<UsageStatusStrip overview={usageOverview} settings={appSettings.display} />}
      />
      {rows.length === 0 ? (
        <p className="app-hint" style={{ padding: "0 12px", opacity: 0.75 }}>
          {i18n.t("app.waitingForSessions")}
        </p>
      ) : null}
      <SessionList
        sessions={rows}
        historyVersion={historyStoreVersion}
        onRespond={handleRespond}
      />
      {settingsOpen ? (
        <button
          type="button"
          className="app-settings-backdrop"
          aria-label={i18n.t("app.closeSettings")}
          onClick={closeSettingsDrawer}
        />
      ) : null}
      <aside
        className={`app-settings-drawer ${settingsOpen ? "app-settings-drawer--open" : ""}`}
        aria-hidden={!settingsOpen}
      >
        <div className="app-settings-drawer__header">
          <div>
            <h2 className="app-title">{i18n.t("app.settings.title")}</h2>
            <p className="app-subtitle">{i18n.t("app.settings.subtitle")}</p>
          </div>
          <button
            type="button"
            className="app-settings-close"
            aria-label={i18n.t("app.returnToMain")}
            onClick={closeSettingsDrawer}
          >
            {i18n.t("app.settings.close")}
          </button>
        </div>
        <div className="app-settings-drawer__content">
          <nav className="settings-nav" aria-label={i18n.t("app.settings")}>
            {settingsSections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`settings-nav__item ${
                  activeSettingsSection === section.id ? "settings-nav__item--active" : ""
                }`}
                onClick={() => setActiveSettingsSection(section.id)}
              >
                <span className="settings-nav__eyebrow">{section.eyebrow}</span>
                <span className="settings-nav__label">{section.label}</span>
              </button>
            ))}
          </nav>
          <div className="settings-content">
            <section className="settings-section-shell" aria-label={activeSettingsSectionConfig.label}>
              <header className="settings-section-shell__header">
                <span className="settings-section-shell__eyebrow">
                  {activeSettingsSectionConfig.eyebrow}
                </span>
                <h3 className="settings-section-shell__title">{activeSettingsSectionConfig.label}</h3>
                <p className="settings-section-shell__subtitle">
                  {activeSettingsSectionConfig.summary}
                </p>
              </header>
              {activeSettingsSection === "overview" ? (
                <div className="settings-stack">
                  <div className="integration-panel__status-grid">
                    <div className="display-panel__card">
                      <div className="display-panel__title">{i18n.t("settings.overview.listener")}</div>
                      <div className="integration-panel__summary">{listenerSummary}</div>
                    </div>
                    <div className="display-panel__card">
                      <div className="display-panel__title">{i18n.t("providerGateway.title")}</div>
                      <div className="integration-panel__summary">{gatewaySummary}</div>
                    </div>
                    <div className="display-panel__card">
                      <div className="display-panel__title">{i18n.t("settings.overview.providerToken")}</div>
                      <div className="integration-panel__summary">
                        {providerGatewayStatus?.provider?.tokenConfigured
                          ? i18n.t("providerGateway.status.tokenConfigured")
                          : i18n.t("providerGateway.status.tokenMissing")}
                      </div>
                    </div>
                    <div className="display-panel__card">
                      <div className="display-panel__title">{i18n.t("settings.overview.attention")}</div>
                      <div className="integration-panel__summary">{integrationAttentionCount}</div>
                    </div>
                  </div>
                </div>
              ) : null}
              {activeSettingsSection === "providerGateway" ? (
                <ProviderGatewayPanel
                  status={providerGatewayStatus}
                  loading={providerGatewayLoading}
                  tokenSaving={providerGatewayTokenSaving}
                  healthChecking={providerGatewayHealthChecking}
                  clientSetupTarget={providerGatewayClientSetupTarget}
                  feedback={providerGatewayFeedback}
                  error={providerGatewayError}
                  onRefresh={() => {
                    void loadProviderGatewayStatus();
                  }}
                  onSaveToken={(providerId, token) => saveProviderGatewayToken(providerId, token)}
                  onRunHealthCheck={() => runProviderGatewayHealthCheck()}
                  onConfigureClient={(target) => configureProviderGatewayClient(target)}
                  onCopy={(text) => {
                    void window.codepal.writeClipboardText(text);
                  }}
                />
              ) : null}
              {activeSettingsSection === "integrations" ? (
                <IntegrationPanel
                  showHeader={false}
                  diagnostics={integrationDiagnostics}
                  loading={integrationLoading}
                  installingAgentId={installingAgentId}
                  feedbackMessage={integrationFeedback}
                  errorMessage={integrationError}
                  onRefresh={refreshIntegrations}
                  onInstall={(agentId) => {
                    setInstallingAgentId(agentId);
                    setIntegrationError(null);
                    setIntegrationFeedback(null);
                    void window.codepal
                      .installIntegrationHooks(agentId)
                      .then((result) => {
                        setIntegrationFeedback(
                          i18n.translateMessage(
                            result.message,
                            result.messageKey,
                            result.messageParams,
                          ),
                        );
                        return window.codepal.getIntegrationDiagnostics();
                      })
                      .then((diagnostics) => {
                        setIntegrationDiagnostics(diagnostics);
                      })
                      .catch((error: unknown) => {
                        setIntegrationError((error as Error).message);
                      })
                      .finally(() => {
                        setInstallingAgentId(null);
                      });
                  }}
                />
              ) : null}
              {activeSettingsSection === "usage" ? (
                <div className="settings-stack settings-stack--usage">
                  <ClaudeQuotaPanel
                    overview={usageOverview}
                    diagnostics={claudeQuotaDiagnostics}
                    loading={claudeQuotaLoading}
                    onRefresh={() => {
                      void runClaudeQuotaRefresh();
                    }}
                  />
                  <CodeBuddyQuotaPanel
                    diagnostics={codeBuddyQuotaDiagnostics}
                    loading={codeBuddyQuotaLoading}
                    onConnect={() => {
                      void runCodeBuddyQuotaSync("connect");
                    }}
                    onRefresh={() => {
                      void runCodeBuddyQuotaSync("refresh");
                    }}
                    onClearAuth={() => {
                      void clearCodeBuddyQuotaAuth();
                    }}
                  />
                  {appSettings.codebuddy.enterprise.enabled ? (
                    <CodeBuddyQuotaPanel
                      diagnostics={codeBuddyInternalQuotaDiagnostics}
                      loading={codeBuddyInternalQuotaLoading}
                      onConnect={() => {
                        void runCodeBuddyInternalQuotaSync("connect");
                      }}
                      onRefresh={() => {
                        void runCodeBuddyInternalQuotaSync("refresh");
                      }}
                      onClearAuth={() => {
                        void clearCodeBuddyInternalQuotaAuth();
                      }}
                    />
                  ) : null}
                  <CursorDashboardPanel
                    diagnostics={cursorDashboardDiagnostics}
                    loading={cursorDashboardLoading}
                    onConnect={() => {
                      void runCursorDashboardSync("connect");
                    }}
                    onRefresh={() => {
                      void runCursorDashboardSync("refresh");
                    }}
                    onClearAuth={() => {
                      void clearCursorDashboardAuth();
                    }}
                  />
                </div>
              ) : null}
              {activeSettingsSection === "preferences" ? (
                <div className="settings-stack">
                  <DisplayPreferencesPanel
                    showHeader={false}
                    settings={appSettings.display}
                    onToggleStrip={(nextValue) =>
                      void updateAppSettings({
                        display: {
                          ...appSettings.display,
                          showInStatusBar: nextValue,
                        },
                      })
                    }
                    onToggleAgent={toggleUsageAgent}
                    onDensityChange={(nextValue) =>
                      void updateAppSettings({
                        display: {
                          ...appSettings.display,
                          density: nextValue,
                        },
                      })
                    }
                    localeSetting={appSettings.locale}
                    onLocaleChange={(nextValue) =>
                      void updateAppSettings({
                        locale: nextValue,
                      })
                    }
                  />
                  <NotificationPreferencesPanel
                    showHeader={false}
                    settings={appSettings.notifications}
                    onUpdate={(patch) =>
                      void updateAppSettings({
                        notifications: {
                          ...appSettings.notifications,
                          ...patch,
                        },
                      })
                    }
                  />
                </div>
              ) : null}
              {activeSettingsSection === "advanced" ? (
                <div className="settings-stack settings-stack--maintenance">
                  <div className="settings-stack__column">
                    <UpdatePanel
                      state={updateState}
                      busy={updateBusy}
                      onCheck={() => {
                        void runUpdateAction(() => window.codepal.checkForUpdates(), {
                          keepBusyUntilEvent: true,
                        });
                      }}
                      onDownload={() => {
                        void runUpdateAction(() => window.codepal.downloadUpdate(), {
                          keepBusyUntilEvent: true,
                        });
                      }}
                      onInstall={() => {
                        void runUpdateAction(() => window.codepal.installUpdate());
                      }}
                      onSkip={() => {
                        void runUpdateAction(() => window.codepal.skipUpdateVersion());
                      }}
                      onClearSkipped={() => {
                        void runUpdateAction(() => window.codepal.clearSkippedUpdateVersion());
                      }}
                    />
                    <div
                      className="display-panel__subsection-block"
                      aria-label={i18n.t("settings.yaml.title")}
                    >
                      <div className="display-panel__header">
                        <div className="display-panel__title">{i18n.t("settings.yaml.title")}</div>
                        <div className="display-panel__subtitle">
                          {i18n.t("settings.yaml.subtitle")}
                        </div>
                        {appSettingsPath ? (
                          <div className="display-panel__subtitle">
                            {formatSettingsPathForDisplay(appSettingsPath, homeDir)}
                          </div>
                        ) : null}
                      </div>
                      <div className="display-panel__actions">
                        <button
                          type="button"
                          className="integration-panel__refresh"
                          onClick={() => {
                            void window.codepal.openExternalTarget(appSettingsPath);
                          }}
                        >
                          {i18n.t("settings.yaml.open")}
                        </button>
                        <button
                          type="button"
                          className="integration-panel__refresh integration-panel__refresh--secondary"
                          onClick={() => {
                            void reloadAppSettings();
                          }}
                        >
                          {i18n.t("settings.yaml.reload")}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="settings-stack__column">
                    <HistorySettingsPanel
                      settings={appSettings.history}
                      diagnostics={historyDiagnostics}
                      loading={historyStoreClearing}
                      sessionHistoryLoading={sessionHistoryClearing}
                      onUpdate={(patch) => {
                        void updateAppSettings({
                          history: patch,
                        });
                      }}
                      onClear={() => {
                        void clearPersistedHistory();
                      }}
                      onClearSessionHistory={() => {
                        void clearSessionHistory();
                      }}
                    />
                    <SupportPanel
                      diagnosticsReport={supportDiagnosticsReport}
                      showHeader={false}
                      onCopyDiagnostics={() => {
                        void window.codepal.writeClipboardText(supportDiagnosticsReport);
                      }}
                      onOpenPrivacy={() => {
                        void window.codepal.openExternalTarget(SUPPORT_LINKS.privacy);
                      }}
                      onOpenSupportScope={() => {
                        void window.codepal.openExternalTarget(SUPPORT_LINKS.supportScope);
                      }}
                      onOpenTroubleshooting={() => {
                        void window.codepal.openExternalTarget(SUPPORT_LINKS.troubleshooting);
                      }}
                      onOpenIssues={() => {
                        void window.codepal.openExternalTarget(SUPPORT_LINKS.issues);
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </aside>
    </div>
    </I18nProvider>
  );
}
