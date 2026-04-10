import type {
  IntegrationAgentDiagnostics,
  IntegrationAgentId,
  IntegrationDiagnostics,
  IntegrationAgentCheck,
} from "../../shared/integrationTypes";
import { useI18n } from "../i18n";

type IntegrationPanelProps = {
  diagnostics: IntegrationDiagnostics | null;
  loading: boolean;
  installingAgentId: IntegrationAgentId | null;
  feedbackMessage: string | null;
  errorMessage: string | null;
  onRefresh: () => void;
  onInstall: (agentId: IntegrationAgentId) => void;
  showHeader?: boolean;
};

function listenerLabel(diagnostics: IntegrationDiagnostics | null, t: ReturnType<typeof useI18n>["t"]): string {
  if (!diagnostics) return t("integration.listener.loading");
  const { listener } = diagnostics;
  if (listener.mode === "tcp") {
    return t("integration.listener.tcp", { port: listener.port });
  }
  if (listener.mode === "socket") {
    return t("integration.listener.socket", { socketPath: listener.socketPath });
  }
  return listener.message ?? t("integration.listener.unavailable");
}

function lastEventLabel(
  agent: IntegrationAgentDiagnostics,
  i18n: ReturnType<typeof useI18n>,
): string {
  if (!agent.lastEventAt || !agent.lastEventStatus) {
    return i18n.t("integration.lastEvent.none");
  }
  return i18n.t("integration.lastEvent.value", { status: agent.lastEventStatus, time: i18n.formatDateTime(agent.lastEventAt, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }) });
}

function hookBadgeClass(agent: IntegrationAgentDiagnostics): string {
  switch (agent.health) {
    case "legacy_path":
      return "hook-badge hook-badge--legacy";
    case "active":
      return "hook-badge hook-badge--active";
    case "repair_needed":
      return "hook-badge hook-badge--repair";
    default:
      return "hook-badge hook-badge--inactive";
  }
}

function compactPathLabel(pathValue: string): string {
  const segments = pathValue.split("/");
  if (segments.length <= 3) {
    return pathValue;
  }
  return `…/${segments.slice(-2).join("/")}`;
}

function checkBadgeClass(check: IntegrationAgentCheck): string {
  return check.ok ? "hook-badge hook-badge--active" : "hook-badge hook-badge--repair";
}

function shouldShowAction(agent: IntegrationAgentDiagnostics): boolean {
  return agent.supported && agent.health !== "active";
}

export function IntegrationPanel({
  diagnostics,
  loading,
  installingAgentId,
  feedbackMessage,
  errorMessage,
  onRefresh,
  onInstall,
  showHeader = true,
}: IntegrationPanelProps) {
  const i18n = useI18n();
  const runtime = diagnostics?.runtime;
  const attentionAgents = (diagnostics?.agents ?? []).filter((agent) => agent.health !== "active");
  const healthyAgents = (diagnostics?.agents ?? []).filter((agent) => agent.health === "active");
  const allHealthy = diagnostics !== null && attentionAgents.length === 0;

  return (
    <section className="integration-panel" aria-label={i18n.t("integration.section")}>
      <div className="integration-panel__header">
        <div>
          {showHeader ? (
            <>
              <div className="integration-panel__title">{i18n.t("integration.title")}</div>
              <div className="integration-panel__subtitle">
                {i18n.t("integration.subtitle")}
              </div>
            </>
          ) : null}
          <div className="integration-panel__summary">
            {allHealthy ? i18n.t("integration.allHealthy") : listenerLabel(diagnostics, i18n.t)}
          </div>
        </div>
        <button
          type="button"
          className="integration-panel__refresh"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? i18n.t("integration.refreshing") : i18n.t("integration.refresh")}
        </button>
      </div>

      {runtime && !allHealthy ? (
        <div className="integration-panel__runtime">
          <span title={runtime.executablePath}>{runtime.executableLabel}</span>
          <span>{runtime.packaged ? i18n.t("integration.runtime.packaged") : i18n.t("integration.runtime.dev")}</span>
        </div>
      ) : null}

      {feedbackMessage ? <p className="integration-panel__feedback">{feedbackMessage}</p> : null}
      {errorMessage ? <p className="integration-panel__error">{errorMessage}</p> : null}

      {healthyAgents.length > 0 ? (
        <div className="integration-panel__healthy" aria-label={i18n.t("integration.healthy")}>
          {healthyAgents.map((agent) => (
            <div
              key={agent.id}
              className="integration-panel__healthy-item"
              title={i18n.translateMessage(
                agent.statusMessage,
                agent.statusMessageKey,
                agent.statusMessageParams,
              )}
            >
              <div className="integration-panel__healthy-main">
                <span className="integration-panel__healthy-name">{agent.label}</span>
                <span className={hookBadgeClass(agent)}>{i18n.translateMessage(agent.healthLabel, agent.healthLabelKey)}</span>
              </div>
              <div className="integration-panel__healthy-meta">
                <span>{lastEventLabel(agent, i18n)}</span>
                {agent.checks?.map((check) => (
                  <span key={check.id} className="integration-panel__healthy-check">
                    {`${i18n.translateMessage(check.label, check.labelKey)} ${i18n.translateMessage(
                      check.statusLabel,
                      check.statusLabelKey,
                    )}`}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {allHealthy ? <div className="integration-panel__feedback">{i18n.t("integration.noActionNeeded")}</div> : null}

      {!allHealthy ? (
        <div className="integration-panel__feedback">
          {i18n.t("integration.repairNotice")}
        </div>
      ) : null}

      <div className="integration-grid">
        {attentionAgents.map((agent) => {
          const isInstalling = installingAgentId === agent.id;
          return (
            <article key={agent.id} className="integration-card" aria-label={agent.label}>
              <div className="integration-card__header">
                <div>
                  <div className="integration-card__name">{agent.label}</div>
                  <div className="integration-card__message">
                    {i18n.translateMessage(agent.statusMessage, agent.statusMessageKey, agent.statusMessageParams)}
                  </div>
                </div>
                <span className={hookBadgeClass(agent)}>{i18n.translateMessage(agent.healthLabel, agent.healthLabelKey)}</span>
              </div>
              <div className="integration-card__path" title={agent.configPath}>
                {compactPathLabel(agent.configPath)}
              </div>
              {agent.checks?.length ? (
                <div className="integration-card__checks">
                  {agent.checks.map((check) => (
                    <div key={check.id} className="integration-card__check">
                      <span className="integration-card__check-label">
                        {i18n.translateMessage(check.label, check.labelKey)}
                      </span>
                      <span className={checkBadgeClass(check)}>
                        {i18n.translateMessage(check.statusLabel, check.statusLabelKey)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              {agent.lastEventAt || agent.lastEventStatus ? (
                <div className="integration-card__meta">{lastEventLabel(agent, i18n)}</div>
              ) : null}
              {shouldShowAction(agent) ? (
                <button
                  type="button"
                  className="integration-card__action"
                  disabled={isInstalling}
                  onClick={() => onInstall(agent.id)}
                >
                  {isInstalling
                    ? i18n.t("integration.action.applying")
                    : i18n.translateMessage(agent.actionLabel, agent.actionLabelKey)}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
