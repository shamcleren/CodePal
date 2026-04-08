import type {
  IntegrationAgentDiagnostics,
  IntegrationAgentId,
  IntegrationDiagnostics,
} from "../../shared/integrationTypes";

type IntegrationPanelProps = {
  diagnostics: IntegrationDiagnostics | null;
  loading: boolean;
  installingAgentId: IntegrationAgentId | null;
  feedbackMessage: string | null;
  errorMessage: string | null;
  onRefresh: () => void;
  onInstall: (agentId: IntegrationAgentId) => void;
};

function listenerLabel(diagnostics: IntegrationDiagnostics | null): string {
  if (!diagnostics) return "正在加载监听状态…";
  const { listener } = diagnostics;
  if (listener.mode === "tcp") {
    return `接收入口：本机端口 ${listener.port}`;
  }
  if (listener.mode === "socket") {
    return `接收入口：本机连接 ${listener.socketPath}`;
  }
  return listener.message ?? "监听不可用";
}

function lastEventLabel(agent: IntegrationAgentDiagnostics): string {
  if (!agent.lastEventAt || !agent.lastEventStatus) {
    return "最近事件：无";
  }
  return `最近事件：${agent.lastEventStatus} · ${new Date(agent.lastEventAt).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
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
}: IntegrationPanelProps) {
  const runtime = diagnostics?.runtime;
  const attentionAgents = (diagnostics?.agents ?? []).filter((agent) => agent.health !== "active");
  const healthyAgents = (diagnostics?.agents ?? []).filter((agent) => agent.health === "active");
  const allHealthy = diagnostics !== null && attentionAgents.length === 0;

  return (
    <section className="integration-panel" aria-label="接入管理">
      <div className="integration-panel__header">
        <div>
          <div className="integration-panel__title">接入与诊断</div>
          <div className="integration-panel__subtitle">
            需要处理的接入项会展开显示；正常接入也会保留一层简洁状态。
          </div>
          <div className="integration-panel__summary">
            {allHealthy ? "当前接入均已就绪" : listenerLabel(diagnostics)}
          </div>
        </div>
        <button
          type="button"
          className="integration-panel__refresh"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      {runtime && !allHealthy ? (
        <div className="integration-panel__runtime">
          <span title={runtime.executablePath}>{runtime.executableLabel}</span>
          <span>{runtime.packaged ? "打包构建" : "开发运行"}</span>
        </div>
      ) : null}

      {feedbackMessage ? <p className="integration-panel__feedback">{feedbackMessage}</p> : null}
      {errorMessage ? <p className="integration-panel__error">{errorMessage}</p> : null}

      {healthyAgents.length > 0 ? (
        <div className="integration-panel__healthy" aria-label="已就绪接入">
          {healthyAgents.map((agent) => (
            <div key={agent.id} className="integration-panel__healthy-item">
              <div className="integration-panel__healthy-main">
                <span className="integration-panel__healthy-name">{agent.label}</span>
                <span className={hookBadgeClass(agent)}>{agent.healthLabel}</span>
              </div>
              <div className="integration-panel__healthy-meta">
                <span>{agent.statusMessage}</span>
                <span>{lastEventLabel(agent)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {allHealthy ? <div className="integration-panel__feedback">当前没有需要修复或登录的接入项。</div> : null}

      <div className="integration-grid">
        {attentionAgents.map((agent) => {
          const isInstalling = installingAgentId === agent.id;
          return (
            <article key={agent.id} className="integration-card" aria-label={agent.label}>
              <div className="integration-card__header">
                <div>
                  <div className="integration-card__name">{agent.label}</div>
                  <div className="integration-card__message">{agent.statusMessage}</div>
                </div>
                <span className={hookBadgeClass(agent)}>{agent.healthLabel}</span>
              </div>
              <div className="integration-card__path" title={agent.configPath}>
                {compactPathLabel(agent.configPath)}
              </div>
              {agent.lastEventAt || agent.lastEventStatus ? (
                <div className="integration-card__meta">{lastEventLabel(agent)}</div>
              ) : null}
              {shouldShowAction(agent) ? (
                <button
                  type="button"
                  className="integration-card__action"
                  disabled={isInstalling}
                  onClick={() => onInstall(agent.id)}
                >
                  {isInstalling ? "应用中…" : agent.actionLabel}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
