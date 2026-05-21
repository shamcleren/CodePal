import { useCallback, useEffect, useRef, useState } from "react";
import { defaultAppSettings, type AppSettings, type AppSettingsPatch } from "../shared/appSettings";
import type { HistoryDiagnostics } from "../shared/historyTypes";
import type { IntegrationAgentId, IntegrationDiagnostics } from "../shared/integrationTypes";
import type { AppUpdateState } from "../shared/updateTypes";
import type { UsageOverview } from "../shared/usageTypes";
import type { ProviderGatewayStatus } from "../shared/providerGatewayTypes";
import type { ProviderGatewayClientSetupTarget } from "../shared/providerGatewayTypes";
import { DisplayPreferencesPanel } from "./components/DisplayPreferencesPanel";
import { HistorySettingsPanel } from "./components/HistorySettingsPanel";
import { IntegrationPanel } from "./components/IntegrationPanel";
import { AnalyticsPage } from "./components/AnalyticsPage";
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

type SettingsSectionId =
  | "overview"
  | "providerGateway"
  | "integrations"
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
  const [activeView, setActiveView] = useState<"sessions" | "analytics">("sessions");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSectionId>("overview");
  const [usageOverview, setUsageOverview] = useState<UsageOverview | null>(null);
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
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

    void loadProviderGatewayStatus();
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
    triggerRef.current?.focus();
    setIntegrationFeedback(null);
    setIntegrationError(null);
    setProviderGatewayFeedback(null);
    setProviderGatewayError(null);
  }

  useEffect(() => {
    if (!settingsOpen) return;
    const drawer = drawerRef.current;
    if (!drawer) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSettingsDrawer();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = drawer!.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    drawer.addEventListener("keydown", handleKeyDown);
    const firstFocusable = drawer.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    firstFocusable?.focus();
    return () => drawer.removeEventListener("keydown", handleKeyDown);
  }, [settingsOpen]);

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
          loadProviderGatewayStatus(),
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
    <div className="app app-shell" data-theme={appSettings.display.theme}>
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
            ref={triggerRef}
            type="button"
            className="app-settings-trigger"
            aria-label={i18n.t("app.openSettings")}
            onClick={openSettingsDrawer}
          >
            {i18n.t("app.settings")}
          </button>
        </div>
      </div>
      <div className="app-view-tabs">
        <button
          type="button"
          className={`app-view-tab ${activeView === "sessions" ? "app-view-tab--active" : ""}`}
          onClick={() => setActiveView("sessions")}
        >
          {i18n.t("nav.sessions")}
        </button>
        <button
          type="button"
          className={`app-view-tab ${activeView === "analytics" ? "app-view-tab--active" : ""}`}
          onClick={() => setActiveView("analytics")}
        >
          {i18n.t("nav.analytics")}
        </button>
      </div>
      {activeView === "sessions" ? (
        <StatusBar
          usage={<UsageStatusStrip overview={usageOverview} settings={appSettings.display} />}
        />
      ) : null}
      {activeView === "sessions" ? (
        <>
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
        </>
      ) : (
        <AnalyticsPage />
      )}
      {settingsOpen ? (
        <button
          type="button"
          className="app-settings-backdrop"
          aria-label={i18n.t("app.closeSettings")}
          onClick={closeSettingsDrawer}
        />
      ) : null}
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={i18n.t("app.settings.title")}
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
                    <button
                      type="button"
                      className="display-panel__card display-panel__card--clickable"
                      onClick={() => setActiveSettingsSection("integrations")}
                    >
                      <div className="display-panel__title">{i18n.t("settings.overview.listener")}</div>
                      <div className="integration-panel__summary">{listenerSummary}</div>
                    </button>
                    <button
                      type="button"
                      className="display-panel__card display-panel__card--clickable"
                      onClick={() => setActiveSettingsSection("providerGateway")}
                    >
                      <div className="display-panel__title">{i18n.t("providerGateway.title")}</div>
                      <div className="integration-panel__summary">{gatewaySummary}</div>
                    </button>
                    <button
                      type="button"
                      className="display-panel__card display-panel__card--clickable"
                      onClick={() => setActiveSettingsSection("providerGateway")}
                    >
                      <div className="display-panel__title">{i18n.t("settings.overview.providerToken")}</div>
                      <div className="integration-panel__summary">
                        {providerGatewayStatus?.provider?.tokenConfigured
                          ? i18n.t("providerGateway.status.tokenConfigured")
                          : i18n.t("providerGateway.status.tokenMissing")}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="display-panel__card display-panel__card--clickable"
                      onClick={() => setActiveSettingsSection("integrations")}
                    >
                      <div className="display-panel__title">{i18n.t("settings.overview.attention")}</div>
                      <div className="integration-panel__summary">{integrationAttentionCount}</div>
                    </button>
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
                    onThemeChange={(nextValue) =>
                      void updateAppSettings({
                        display: {
                          ...appSettings.display,
                          theme: nextValue,
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
