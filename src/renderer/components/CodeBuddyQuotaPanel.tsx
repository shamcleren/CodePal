import { useEffect, useState } from "react";
import type { AppSettings } from "../../shared/appSettings";
import type { CodeBuddyEndpointSettings } from "../../shared/appSettings";
import type {
  CodeBuddyQuotaDiagnostics,
  CodeBuddyQuotaStatus,
} from "../../shared/codebuddyQuotaTypes";
import { useI18n } from "../i18n";

type CodeBuddyEndpoint = "code" | "enterprise";
type CodeBuddyQuotaUrlSettings = Pick<
  CodeBuddyEndpointSettings,
  "enabled" | "loginUrl" | "quotaEndpoint"
>;
type CodeBuddyQuotaConfigPatch = CodeBuddyQuotaUrlSettings & {
  refreshIntervalMinutes: number;
};

type CodeBuddyQuotaPanelProps = {
  settings: AppSettings["codebuddy"];
  status: CodeBuddyQuotaStatus | null;
  busyEndpoint: CodeBuddyEndpoint | null;
  onLogin: (endpoint: CodeBuddyEndpoint) => void;
  onRefresh: (endpoint: CodeBuddyEndpoint) => void;
  onClear: (endpoint: CodeBuddyEndpoint) => void;
  onSaveConfig: (patch: CodeBuddyQuotaConfigPatch) => void;
};

function statusText(diagnostics: CodeBuddyQuotaDiagnostics | undefined): string {
  return diagnostics?.message ?? "";
}

function parseEndpointUrl(value: string): URL | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

export function deriveCodeBuddyQuotaHost(
  endpointSettings: Pick<CodeBuddyEndpointSettings, "loginUrl" | "quotaEndpoint">,
): string {
  const quotaEndpointUrl = parseEndpointUrl(endpointSettings.quotaEndpoint);
  if (quotaEndpointUrl) {
    return quotaEndpointUrl.host;
  }

  const loginUrl = parseEndpointUrl(endpointSettings.loginUrl);
  return loginUrl?.host ?? "";
}

export function buildCodeBuddyQuotaConfigFromHost(value: string): CodeBuddyQuotaUrlSettings | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      enabled: false,
      loginUrl: "",
      quotaEndpoint: "",
    };
  }

  const url = parseEndpointUrl(trimmed);
  if (!url) {
    return null;
  }

  return {
    enabled: true,
    loginUrl: `${url.origin}/`,
    quotaEndpoint: `${url.origin}/api/query-quota`,
  };
}

export function parseCodeBuddyQuotaRefreshIntervalMinutes(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const minutes = Math.trunc(parsed);
  return minutes >= 1 && minutes <= 1440 ? minutes : null;
}

export function CodeBuddyQuotaPanel({
  settings,
  status,
  busyEndpoint,
  onLogin,
  onRefresh,
  onClear,
  onSaveConfig,
}: CodeBuddyQuotaPanelProps) {
  const i18n = useI18n();
  const endpoint: CodeBuddyEndpoint = "code";
  const endpointSettings = settings.code;
  const [draftHost, setDraftHost] = useState(deriveCodeBuddyQuotaHost(endpointSettings));
  const [draftRefreshIntervalMinutes, setDraftRefreshIntervalMinutes] = useState(
    String(settings.refreshIntervalMinutes),
  );
  const diagnostics = status?.code;
  const configured =
    endpointSettings.enabled && endpointSettings.loginUrl && endpointSettings.quotaEndpoint;
  const connected = diagnostics?.state === "connected";
  const busy = busyEndpoint === endpoint;
  const draftUrlConfig = buildCodeBuddyQuotaConfigFromHost(draftHost);
  const draftRefreshInterval = parseCodeBuddyQuotaRefreshIntervalMinutes(
    draftRefreshIntervalMinutes,
  );
  const draftConfig =
    draftUrlConfig !== null && draftRefreshInterval !== null
      ? {
          ...draftUrlConfig,
          refreshIntervalMinutes: draftRefreshInterval,
        }
      : null;
  const configChanged =
    draftConfig !== null &&
    (draftConfig.enabled !== endpointSettings.enabled ||
      draftConfig.loginUrl !== endpointSettings.loginUrl ||
      draftConfig.quotaEndpoint !== endpointSettings.quotaEndpoint ||
      draftConfig.refreshIntervalMinutes !== settings.refreshIntervalMinutes);

  useEffect(() => {
    setDraftHost(deriveCodeBuddyQuotaHost(endpointSettings));
  }, [endpointSettings.loginUrl, endpointSettings.quotaEndpoint]);

  useEffect(() => {
    setDraftRefreshIntervalMinutes(String(settings.refreshIntervalMinutes));
  }, [settings.refreshIntervalMinutes]);

  return (
    <div className="codebuddy-quota" aria-label="CodeBuddy quota">
      <div className="codebuddy-quota__header">
        <div>
          <div className="display-panel__title">CodeBuddy</div>
          <div className="codebuddy-quota__subtitle">
            {i18n.t("codebuddy.helper.code.connected")}
          </div>
        </div>
        <span
          className={`codebuddy-quota__status codebuddy-quota__status--${
            connected ? "connected" : diagnostics?.state ?? "not_connected"
          }`}
        >
          {connected ? i18n.t("codebuddy.usageSuffix") : i18n.t("codebuddy.notSynced")}
        </span>
      </div>
      <div className="display-panel__card codebuddy-quota-card">
        <div className="codebuddy-quota-card__main">
          <div>
            <div className="codebuddy-quota-card__title">{i18n.t("codebuddy.label.code")}</div>
            <div className="codebuddy-quota-card__message">
              {statusText(diagnostics) ||
                (configured ? i18n.t("codebuddy.helper.code.login") : i18n.t("codebuddy.helper.code.config"))}
            </div>
          </div>
          <div className="codebuddy-quota-card__endpoint">
            {configured ? i18n.t("codebuddy.configuredLocally") : i18n.t("codebuddy.configureFirst")}
          </div>
        </div>
        <form
          className="codebuddy-quota-config"
          onSubmit={(event) => {
            event.preventDefault();
            if (!configChanged || draftConfig === null) {
              return;
            }
            onSaveConfig(draftConfig);
          }}
        >
          <label className="codebuddy-quota-config__field">
            <span>{i18n.t("codebuddy.config.quotaHost")}</span>
            <input
              type="text"
              value={draftHost}
              placeholder="quota.example.com"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(event) => setDraftHost(event.target.value)}
            />
          </label>
          <label className="codebuddy-quota-config__field">
            <span>{i18n.t("codebuddy.config.refreshInterval")}</span>
            <input
              type="number"
              min={1}
              max={1440}
              step={1}
              value={draftRefreshIntervalMinutes}
              onChange={(event) => setDraftRefreshIntervalMinutes(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="integration-panel__refresh integration-panel__refresh--secondary"
            disabled={!configChanged || draftConfig === null}
          >
            {i18n.t("codebuddy.config.save")}
          </button>
        </form>
        <div className="codebuddy-quota-card__actions">
          <button
            type="button"
            className="integration-panel__refresh"
            disabled={busy || !configured}
            onClick={() => onLogin(endpoint)}
          >
            {busy
              ? i18n.t(connected ? "codebuddy.reloggingIn" : "codebuddy.loggingIn")
              : i18n.t(connected ? "codebuddy.relogin" : "codebuddy.login")}
          </button>
          <button
            type="button"
            className="integration-panel__refresh integration-panel__refresh--secondary"
            disabled={busy || !configured}
            onClick={() => onRefresh(endpoint)}
          >
            {busy ? i18n.t("codebuddy.refreshing") : i18n.t("codebuddy.refresh")}
          </button>
          <button
            type="button"
            className="integration-panel__refresh integration-panel__refresh--secondary"
            disabled={busy}
            onClick={() => onClear(endpoint)}
          >
            {i18n.t("codebuddy.clearAuth")}
          </button>
        </div>
      </div>
    </div>
  );
}
