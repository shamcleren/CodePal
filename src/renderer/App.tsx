import { useCallback, useEffect, useState } from "react";
import { defaultAppSettings, type AppSettings } from "../shared/appSettings";
import type { CodeBuddyQuotaDiagnostics } from "../shared/codebuddyQuotaTypes";
import type { CursorDashboardDiagnostics } from "../shared/cursorDashboardTypes";
import type { IntegrationAgentId, IntegrationDiagnostics } from "../shared/integrationTypes";
import type { UsageOverview } from "../shared/usageTypes";
import { DisplayPreferencesPanel } from "./components/DisplayPreferencesPanel";
import { CursorDashboardPanel } from "./components/CursorDashboardPanel";
import { CodeBuddyQuotaPanel } from "./components/CodeBuddyQuotaPanel";
import { IntegrationPanel } from "./components/IntegrationPanel";
import { SessionHistoryPanel } from "./components/SessionHistoryPanel";
import { StatusBar } from "./components/StatusBar";
import { SessionList } from "./components/SessionList";
import { UsageStatusStrip } from "./components/UsageStatusStrip";
import type { MonitorSessionRow } from "./monitorSession";
import { formatSettingsPathForDisplay } from "./settingsPath";
import { hydrateRowsIfEmpty, reconcileRows } from "./sessionBootstrap";
import {
  type UsageAgentId,
} from "./usageDisplaySettings";

const CURSOR_DASHBOARD_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const CODEBUDDY_QUOTA_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export function App() {
  const [rows, setRows] = useState<MonitorSessionRow[]>([]);
  const [integrationDiagnostics, setIntegrationDiagnostics] =
    useState<IntegrationDiagnostics | null>(null);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [installingAgentId, setInstallingAgentId] = useState<IntegrationAgentId | null>(null);
  const [integrationFeedback, setIntegrationFeedback] = useState<string | null>(null);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [usageOverview, setUsageOverview] = useState<UsageOverview | null>(null);
  const [cursorDashboardDiagnostics, setCursorDashboardDiagnostics] =
    useState<CursorDashboardDiagnostics | null>(null);
  const [cursorDashboardLoading, setCursorDashboardLoading] = useState(false);
  const [codeBuddyQuotaDiagnostics, setCodeBuddyQuotaDiagnostics] =
    useState<CodeBuddyQuotaDiagnostics | null>(null);
  const [codeBuddyQuotaLoading, setCodeBuddyQuotaLoading] = useState(false);
  const [codeBuddyInternalQuotaDiagnostics, setCodeBuddyInternalQuotaDiagnostics] =
    useState<CodeBuddyQuotaDiagnostics | null>(null);
  const [codeBuddyInternalQuotaLoading, setCodeBuddyInternalQuotaLoading] = useState(false);
  const [sessionHistoryClearing, setSessionHistoryClearing] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultAppSettings);
  const [appSettingsPath, setAppSettingsPath] = useState("");
  const [homeDir, setHomeDir] = useState("");

  function clearSessionHistory() {
    setSessionHistoryClearing(true);
    return window.codepal
      .clearSessionHistory()
      .then((sessions) => {
        setRows(reconcileRows([], sessions));
        return sessions;
      })
      .finally(() => {
        setSessionHistoryClearing(false);
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
          label: "CodeBuddy 内网版",
          state: "error" as const,
          message: (error as Error).message,
          endpoint: "",
        };
        setCodeBuddyInternalQuotaDiagnostics(diagnostics);
        return diagnostics;
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
          label: "CodeBuddy 内网版",
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
          label: "CodeBuddy 内网版",
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

    void loadCursorDashboardDiagnostics();
    void loadCodeBuddyQuotaDiagnostics();
    void loadCodeBuddyInternalQuotaDiagnostics();
  }

  function openSettingsDrawer() {
    setSettingsOpen(true);
    refreshIntegrations();
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
          loadCodeBuddyQuotaDiagnostics(),
          loadCodeBuddyInternalQuotaDiagnostics(),
        ]).then(() => ({ settings, settingsPath }));
      },
    );
  }

  useEffect(() => {
    let active = true;
    const unsub = window.codepal.onSessions((sessions) => {
      setRows((currentRows) => reconcileRows(currentRows, sessions));
    });
    void window.codepal.getSessions().then((sessions) => {
      if (!active) {
        return;
      }
      setRows((currentRows) => hydrateRowsIfEmpty(currentRows, sessions));
    });
    return () => {
      active = false;
      unsub();
    };
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

  function updateAppSettings(nextValue: Partial<AppSettings>) {
    return window.codepal.updateAppSettings(nextValue).then((settings) => {
      setAppSettings(settings);
      return settings;
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

  const usageStrip = UsageStatusStrip({
    overview: usageOverview,
    settings: appSettings.display,
  });

  return (
    <div className="app app-shell">
      <div className="app-header">
        <div className="app-header__meta">
          <h1 className="app-title">CodePal</h1>
        </div>
        <button
          type="button"
          className="app-settings-trigger"
          aria-label="打开设置"
          onClick={openSettingsDrawer}
        >
          设置
        </button>
      </div>
      <StatusBar usage={usageStrip} />
      {rows.length === 0 ? (
        <p className="app-hint" style={{ padding: "0 12px", opacity: 0.75 }}>
          正在等待来自 Cursor、CodeBuddy 等接入源的会话更新。
        </p>
      ) : null}
      <SessionList
        sessions={rows}
        onRespond={handleRespond}
      />
      {settingsOpen ? (
        <button
          type="button"
          className="app-settings-backdrop"
          aria-label="关闭设置"
          onClick={closeSettingsDrawer}
        />
      ) : null}
      <aside
        className={`app-settings-drawer ${settingsOpen ? "app-settings-drawer--open" : ""}`}
        aria-hidden={!settingsOpen}
      >
        <div className="app-settings-drawer__header">
          <div>
            <h2 className="app-title">CodePal 设置</h2>
            <p className="app-subtitle">低频的接入、修复和诊断操作都放在这里。</p>
          </div>
          <button
            type="button"
            className="app-settings-close"
            aria-label="返回主面板"
            onClick={closeSettingsDrawer}
          >
            关闭
          </button>
        </div>
        <div className="app-settings-drawer__content">
          <IntegrationPanel
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
                  setIntegrationFeedback(result.message);
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
          <DisplayPreferencesPanel
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
          >
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
            <SessionHistoryPanel
              loading={sessionHistoryClearing}
              onClearHistory={() => {
                void clearSessionHistory();
              }}
            />
            <div className="display-panel__subsection-block" aria-label="配置文件">
              <div className="display-panel__header">
                <div className="display-panel__title">配置文件</div>
                <div className="display-panel__subtitle">
                  当前设置以本地 YAML 为准。修改后重新打开设置即可读取最新配置。
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
                  打开 YAML
                </button>
                <button
                  type="button"
                  className="integration-panel__refresh integration-panel__refresh--secondary"
                  onClick={() => {
                    void reloadAppSettings();
                  }}
                >
                  重新加载
                </button>
              </div>
            </div>
          </DisplayPreferencesPanel>
        </div>
      </aside>
    </div>
  );
}
