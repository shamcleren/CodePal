import type { CodeBuddyQuotaDiagnostics } from "../../shared/codebuddyQuotaTypes";

type CodeBuddyQuotaPanelProps = {
  diagnostics: CodeBuddyQuotaDiagnostics | null;
  loading: boolean;
  onConnect: () => void;
  onRefresh: () => void;
  onClearAuth: () => void;
};

function lastSyncLabel(diagnostics: CodeBuddyQuotaDiagnostics | null): string {
  if (!diagnostics?.lastSyncAt) {
    return "尚未同步";
  }
  return new Date(diagnostics.lastSyncAt).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CodeBuddyQuotaPanel({
  diagnostics,
  loading,
  onConnect,
  onRefresh,
  onClearAuth,
}: CodeBuddyQuotaPanelProps) {
  const connected = diagnostics?.state === "connected";
  const reconnectRequired = diagnostics?.state === "expired";
  const missingConfiguration = !diagnostics?.loginUrl || !diagnostics?.endpoint;
  const label =
    diagnostics?.kind === "internal"
      ? "CodeBuddy 内网版"
      : diagnostics?.kind === "code"
        ? "CodeBuddy Code / IDE"
        : diagnostics?.label ?? "CodeBuddy";
  const scopeText =
    diagnostics?.kind === "internal"
      ? "覆盖「CodeBuddy（内网版）插件、With、Knot、Claude Code Internal、Gemini CLI Internal、Codex CLI Internal、OpenClaw（内网版）」数据。"
      : "覆盖「CodeBuddy IDE、CodeBuddy Code」个人用量与限额情况。";
  const actionLabel = connected
    ? loading
      ? "刷新中…"
      : "刷新"
    : missingConfiguration
      ? "先配置登录地址"
    : reconnectRequired
      ? loading
        ? "重新登录中…"
        : "重新登录 CodeBuddy"
      : loading
        ? "登录中…"
        : "登录 CodeBuddy";
  const helperText =
    diagnostics?.kind === "internal"
      ? missingConfiguration
        ? "请先在设置文件中填写登录地址和额度地址，再回来完成 CodeBuddy 内网版登录。"
        : connected || reconnectRequired
          ? "CodePal 会自动刷新 CodeBuddy 内网版聚合额度。"
          : "如果你已在浏览器登录过，仍需在 CodePal 弹出的窗口内再登录一次，才能读取内网版隔离会话 cookie。"
      : missingConfiguration
        ? "请先在设置文件中填写登录地址和额度地址，再回来完成 IDE / Code 用量登录。"
        : connected || reconnectRequired
          ? "CodePal 会自动刷新 CodeBuddy IDE / Code 月度额度。"
          : "如果你已在浏览器登录过，仍需在 CodePal 弹出的窗口内再登录一次，才能读取 IDE / Code 隔离会话 cookie。";

  return (
    <div className="display-panel__subsection-block" aria-label={`${label} 用量`}>
      <div className="display-panel__header">
        <div className="display-panel__title">{label} 用量</div>
        <div className="display-panel__subtitle">{scopeText}</div>
        <div className="display-panel__subtitle">{helperText}</div>
      </div>

      <div className="display-panel__summary">
        <span>{diagnostics?.message ?? "未连接 CodeBuddy 用量"}</span>
        <span>{lastSyncLabel(diagnostics)}</span>
      </div>

      <div className="display-panel__actions">
        <button
          type="button"
          className="integration-panel__refresh"
          disabled={loading || missingConfiguration}
          onClick={connected ? onRefresh : onConnect}
        >
          {actionLabel}
        </button>
        {connected || reconnectRequired ? (
          <button
            type="button"
            className="integration-panel__refresh integration-panel__refresh--secondary"
            disabled={loading}
            onClick={onClearAuth}
          >
            删除登录态
          </button>
        ) : null}
      </div>
    </div>
  );
}
