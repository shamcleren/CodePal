import type { AppSettings } from "../shared/appSettings";
import type { CodeBuddyQuotaDiagnostics } from "../shared/codebuddyQuotaTypes";
import type { CursorDashboardDiagnostics } from "../shared/cursorDashboardTypes";
import type { IntegrationDiagnostics } from "../shared/integrationTypes";
import type { AppUpdateState } from "../shared/updateTypes";

type SupportDiagnosticsInput = {
  generatedAt: number;
  resolvedLocale: string;
  appSettings: AppSettings;
  appSettingsPath: string;
  homeDir: string;
  integrationDiagnostics: IntegrationDiagnostics | null;
  cursorDashboardDiagnostics: CursorDashboardDiagnostics | null;
  codeBuddyQuotaDiagnostics: CodeBuddyQuotaDiagnostics | null;
  codeBuddyInternalQuotaDiagnostics: CodeBuddyQuotaDiagnostics | null;
  updateState: AppUpdateState | null;
};

function sanitizeLocalPath(path: string | null | undefined, homeDir: string): string {
  if (!path) {
    return "n/a";
  }
  if (!homeDir) {
    return path;
  }
  if (path === homeDir) {
    return "~";
  }
  if (path.startsWith(`${homeDir}/`)) {
    return `~${path.slice(homeDir.length)}`;
  }
  return path;
}

function formatDateTime(value: number | null | undefined): string {
  if (!value) {
    return "n/a";
  }
  return new Date(value).toISOString();
}

function homePath(homeDir: string, suffix: string): string {
  if (!homeDir) {
    return suffix.startsWith("/") ? suffix : `~/${suffix}`;
  }
  return sanitizeLocalPath(`${homeDir}${suffix}`, homeDir);
}

function redactTeamId(teamId: string | null | undefined): string {
  if (!teamId) {
    return "n/a";
  }
  return "redacted";
}

function formatEndpointHost(endpoint: string | null | undefined): string {
  if (!endpoint) {
    return "n/a";
  }
  try {
    return new URL(endpoint).host || "n/a";
  } catch {
    return "n/a";
  }
}

export function buildSupportDiagnosticsReport(input: SupportDiagnosticsInput): string {
  const lines: string[] = [];
  const { integrationDiagnostics, updateState } = input;
  const sanitizedSettingsPath = sanitizeLocalPath(input.appSettingsPath, input.homeDir);

  lines.push("CodePal Support Diagnostics");
  lines.push(`Generated At: ${formatDateTime(input.generatedAt)}`);
  lines.push(`Resolved Locale: ${input.resolvedLocale}`);
  lines.push(`Locale Setting: ${input.appSettings.locale}`);
  lines.push(`Settings Path: ${sanitizedSettingsPath}`);

  if (integrationDiagnostics) {
    lines.push("");
    lines.push("Runtime");
    lines.push(`Build Label: ${integrationDiagnostics.runtime.executableLabel}`);
    lines.push(`Packaged: ${integrationDiagnostics.runtime.packaged ? "yes" : "no"}`);
    if (integrationDiagnostics.listener.mode === "tcp") {
      lines.push(
        `Listener: tcp ${integrationDiagnostics.listener.host ?? "127.0.0.1"}:${integrationDiagnostics.listener.port ?? "n/a"}`,
      );
    } else if (integrationDiagnostics.listener.mode === "socket") {
      lines.push(`Listener: socket ${integrationDiagnostics.listener.socketPath ?? "n/a"}`);
    } else {
      lines.push(`Listener: unavailable ${integrationDiagnostics.listener.message ?? ""}`.trim());
    }

    lines.push("");
    lines.push("Integrations");
    for (const agent of integrationDiagnostics.agents) {
      lines.push(
        `- ${agent.label}: health=${agent.health}, supported=${agent.supported ? "yes" : "no"}, hookInstalled=${agent.hookInstalled ? "yes" : "no"}, lastEventStatus=${agent.lastEventStatus ?? "n/a"}, lastEventAt=${formatDateTime(agent.lastEventAt)}`,
      );
    }
  }

  lines.push("");
  lines.push("Quota and Login");
  lines.push(
    `- Cursor Dashboard: state=${input.cursorDashboardDiagnostics?.state ?? "n/a"}, teamId=${redactTeamId(input.cursorDashboardDiagnostics?.teamId)}, lastSyncAt=${formatDateTime(input.cursorDashboardDiagnostics?.lastSyncAt)}`,
  );
  lines.push(
    `- CodeBuddy Code: state=${input.codeBuddyQuotaDiagnostics?.state ?? "n/a"}, lastSyncAt=${formatDateTime(input.codeBuddyQuotaDiagnostics?.lastSyncAt)}, endpointHost=${formatEndpointHost(input.codeBuddyQuotaDiagnostics?.endpoint)}`,
  );
  lines.push(
    `- CodeBuddy Enterprise: state=${input.codeBuddyInternalQuotaDiagnostics?.state ?? "n/a"}, lastSyncAt=${formatDateTime(input.codeBuddyInternalQuotaDiagnostics?.lastSyncAt)}, endpointHost=${formatEndpointHost(input.codeBuddyInternalQuotaDiagnostics?.endpoint)}`,
  );

  lines.push("");
  lines.push("Update");
  lines.push(`Supported: ${updateState?.supported === true ? "yes" : "no"}`);
  lines.push(`Phase: ${updateState?.phase ?? "n/a"}`);
  lines.push(`Current Version: ${updateState?.currentVersion ?? "n/a"}`);
  lines.push(`Available Version: ${updateState?.availableVersion ?? "n/a"}`);
  lines.push(`Last Checked At: ${formatDateTime(updateState?.lastCheckedAt)}`);
  lines.push(`Error: ${updateState?.errorMessage ?? "n/a"}`);

  lines.push("");
  lines.push("Local Diagnostic Sources");
  lines.push(`- CodePal settings: ${sanitizedSettingsPath}`);
  lines.push(`- Codex sessions: ${homePath(input.homeDir, "/.codex/sessions/")}`);
  lines.push(`- Claude Code logs: ${homePath(input.homeDir, "/.claude/projects/")}`);
  lines.push(`- CodeBuddy logs: ${homePath(input.homeDir, "/.codebuddy/projects/")}`);
  lines.push(`- Cursor hooks config: ${homePath(input.homeDir, "/.cursor/hooks.json")}`);
  lines.push(`- CodeBuddy hooks config: ${homePath(input.homeDir, "/.codebuddy/settings.json")}`);
  lines.push(`- Codex notify config: ${homePath(input.homeDir, "/.codex/config.toml")}`);

  return lines.join("\n");
}
