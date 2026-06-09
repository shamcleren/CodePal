import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultAppSettings } from "../../shared/appSettings";
import type { CodeBuddyQuotaStatus } from "../../shared/codebuddyQuotaTypes";
import {
  buildCodeBuddyQuotaConfigFromHost,
  CodeBuddyQuotaPanel,
  deriveCodeBuddyQuotaHost,
} from "./CodeBuddyQuotaPanel";

describe("CodeBuddyQuotaPanel", () => {
  it("derives a single display host from persisted quota URLs", () => {
    expect(
      deriveCodeBuddyQuotaHost({
        loginUrl: "https://login.example.test/signin",
        quotaEndpoint: "https://quota.example.test/api/query-quota",
      }),
    ).toBe("quota.example.test");
  });

  it("builds login and quota URLs from a bare quota domain", () => {
    expect(buildCodeBuddyQuotaConfigFromHost("quota.example.test")).toEqual({
      enabled: true,
      loginUrl: "https://quota.example.test/",
      quotaEndpoint: "https://quota.example.test/api/query-quota",
    });
    expect(buildCodeBuddyQuotaConfigFromHost("https://quota.example.test/ignored?x=1")).toEqual({
      enabled: true,
      loginUrl: "https://quota.example.test/",
      quotaEndpoint: "https://quota.example.test/api/query-quota",
    });
  });

  it("renders one unified locally configured CodeBuddy quota control without exposing the endpoint", () => {
    const settings = {
      ...defaultAppSettings.codebuddy,
      code: {
        ...defaultAppSettings.codebuddy.code,
        loginUrl: "https://codebuddy.example.test/",
        quotaEndpoint: "https://codebuddy.example.test/api/query-quota",
      },
    };
    const status: CodeBuddyQuotaStatus = {
      code: {
        kind: "code",
        label: "CodeBuddy Code",
        state: "not_connected",
        message: "not connected",
        endpoint: settings.code.quotaEndpoint,
        loginUrl: settings.code.loginUrl,
      },
      enterprise: {
        kind: "internal",
        label: "CodeBuddy Enterprise",
        state: "not_connected",
        message: "not connected",
        endpoint: "",
        loginUrl: "",
      },
    };

    const html = renderToStaticMarkup(
      createElement(CodeBuddyQuotaPanel, {
        settings,
        status,
        busyEndpoint: null,
        onLogin: vi.fn(),
        onRefresh: vi.fn(),
        onClear: vi.fn(),
        onSaveConfig: vi.fn(),
      }),
    );

    expect(html).toContain("CodeBuddy Code / IDE");
    expect(html).toContain("Configured locally");
    expect(html).toContain("Quota domain");
    expect(html).toContain("Refresh interval");
    expect(html).toContain("Save configuration");
    expect(html).toContain('value="codebuddy.example.test"');
    expect(html).toContain('value="5"');
    expect(html).not.toContain("Login URL");
    expect(html).not.toContain("Quota endpoint");
    expect(html).not.toContain("https://codebuddy.example.test/api/query-quota");
    expect(html).toContain("Log in to CodeBuddy");
    expect(html).toContain("Refresh");
    expect(html).not.toContain("CodeBuddy Enterprise");
    expect((html.match(/display-panel__card/g) ?? []).length).toBe(1);
    expect(html).toContain("codebuddy-quota-card");
  });
});
