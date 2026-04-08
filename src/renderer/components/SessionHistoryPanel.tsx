type SessionHistoryPanelProps = {
  loading: boolean;
  onClearHistory: () => void;
};

export function SessionHistoryPanel({
  loading,
  onClearHistory,
}: SessionHistoryPanelProps) {
  return (
    <div className="display-panel__subsection-block" aria-label="Session 历史">
      <div className="display-panel__header">
        <div className="display-panel__title">Session 历史</div>
        <div className="display-panel__subtitle">
          清掉已完成、空闲、离线或报错的历史 session，保留正在运行或等待中的 session。
        </div>
      </div>

      <div className="display-panel__actions">
        <button
          type="button"
          className="integration-panel__refresh integration-panel__refresh--secondary"
          disabled={loading}
          onClick={onClearHistory}
        >
          {loading ? "清理中…" : "清空历史 session"}
        </button>
      </div>
    </div>
  );
}
