import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultAppSettings } from "../../shared/appSettings";
import type {
  CodeBuddyQuotaConnectResult,
  CodeBuddyQuotaDiagnostics,
} from "../../shared/codebuddyQuotaTypes";
import type { UsageSnapshot } from "../../shared/usageTypes";
import { createCodeBuddyQuotaRuntime } from "./codebuddyQuotaRuntime";

function diagnostics(label: string): CodeBuddyQuotaDiagnostics {
  return {
    label,
    state: "connected",
    message: `connected ${label}`,
    endpoint: "https://example.test/quota",
  };
}

function result(label: string): CodeBuddyQuotaConnectResult {
  return {
    diagnostics: diagnostics(label),
    synced: true,
  };
}

function service(label: string) {
  return {
    getDiagnostics: vi.fn(async () => diagnostics(label)),
    refreshUsage: vi.fn(async () => result(label)),
    connectAndSync: vi.fn(async () => result(label)),
    clearAuth: vi.fn(async () => diagnostics(label)),
    updateConfig: vi.fn(),
  };
}

describe("codebuddyQuotaRuntime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts CodeBuddy Code quota refresh and routes snapshots", async () => {
    const codeService = service("CodeBuddy Code");
    const enterpriseService = service("CodeBuddy Enterprise");
    let snapshotHandler: ((snapshot: UsageSnapshot) => void) | undefined;
    const onUsageSnapshot = vi.fn();
    const broadcastUsageOverview = vi.fn();

    const runtime = createCodeBuddyQuotaRuntime({
      settings: defaultAppSettings.codebuddy,
      createCodeService: vi.fn((options) => {
        snapshotHandler = options.onUsageSnapshot;
        return codeService;
      }),
      createInternalService: vi.fn(() => enterpriseService),
      onUsageSnapshot,
      broadcastUsageOverview,
    });

    await runtime.refreshEnabled();
    snapshotHandler?.({
      agent: "codebuddy",
      sessionId: "codebuddy-quota",
      source: "provider-derived",
      updatedAt: 1,
      rateLimit: { usedPercent: 5 },
    });

    expect(codeService.refreshUsage).toHaveBeenCalledOnce();
    expect(enterpriseService.refreshUsage).not.toHaveBeenCalled();
    expect(onUsageSnapshot).toHaveBeenCalledWith(expect.objectContaining({ agent: "codebuddy" }));
    expect(broadcastUsageOverview).toHaveBeenCalledOnce();
  });

  it("uses the configured refresh interval and reschedules when settings change", async () => {
    vi.useFakeTimers();
    const codeService = service("CodeBuddy Code");
    const enterpriseService = service("CodeBuddy Enterprise");
    const runtime = createCodeBuddyQuotaRuntime({
      settings: {
        ...defaultAppSettings.codebuddy,
        refreshIntervalMinutes: 2,
      },
      createCodeService: vi.fn(() => codeService),
      createInternalService: vi.fn(() => enterpriseService),
      onUsageSnapshot: vi.fn(),
      broadcastUsageOverview: vi.fn(),
    });

    runtime.start();
    expect(codeService.refreshUsage).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(119_999);
    expect(codeService.refreshUsage).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(codeService.refreshUsage).toHaveBeenCalledTimes(2);

    runtime.updateSettings({
      ...defaultAppSettings.codebuddy,
      refreshIntervalMinutes: 1,
    });

    await vi.advanceTimersByTimeAsync(59_999);
    expect(codeService.refreshUsage).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(codeService.refreshUsage).toHaveBeenCalledTimes(3);

    runtime.stop();
  });

  it("does not create duplicate refresh timers when started twice", async () => {
    vi.useFakeTimers();
    const codeService = service("CodeBuddy Code");
    const runtime = createCodeBuddyQuotaRuntime({
      settings: {
        ...defaultAppSettings.codebuddy,
        refreshIntervalMinutes: 1,
      },
      createCodeService: vi.fn(() => codeService),
      createInternalService: vi.fn(() => service("CodeBuddy Enterprise")),
      onUsageSnapshot: vi.fn(),
      broadcastUsageOverview: vi.fn(),
    });

    runtime.start();
    runtime.start();

    expect(codeService.refreshUsage).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(codeService.refreshUsage).toHaveBeenCalledTimes(2);

    runtime.stop();
  });
});
