import type { CursorDashboardDiagnostics } from "../../shared/cursorDashboardTypes";

type CursorDashboardPanelProps = {
  diagnostics: CursorDashboardDiagnostics | null;
  loading: boolean;
  onConnect: () => void;
  onRefresh: () => void;
  onClearAuth: () => void;
};

function lastSyncLabel(diagnostics: CursorDashboardDiagnostics | null): string {
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

export function CursorDashboardPanel({
  diagnostics,
  loading,
  onConnect,
  onRefresh,
  onClearAuth,
}: CursorDashboardPanelProps) {
  const connected = diagnostics?.state === "connected";
  const reconnectRequired = diagnostics?.state === "expired";
  const actionLabel = connected
    ? loading
      ? "刷新中…"
      : "刷新"
    : reconnectRequired
      ? loading
        ? "重新登录中…"
        : "重新登录 Cursor"
      : loading
        ? "登录中…"
        : "登录 Cursor";

  return (
    <div className="display-panel__subsection-block" aria-label="Cursor 用量">
      <div className="display-panel__header">
        <div className="display-panel__title">Cursor 用量</div>
        <div className="display-panel__subtitle">
          登录 Cursor 网页后，CodePal 会读取当前会话 cookie 并拉取 team spend。
        </div>
      </div>

      <div className="display-panel__summary">
        <span>{diagnostics?.message ?? "未连接 Cursor Dashboard"}</span>
        {diagnostics?.teamId ? <span>{`Team ${diagnostics.teamId}`}</span> : null}
        <span>{lastSyncLabel(diagnostics)}</span>
      </div>

      <div className="display-panel__actions">
        <button
          type="button"
          className="integration-panel__refresh"
          disabled={loading}
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
