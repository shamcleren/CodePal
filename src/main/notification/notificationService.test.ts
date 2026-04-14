import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNotificationService } from "./notificationService";
import type { NotificationSettings } from "../../shared/appSettings";
import { defaultNotificationSettings } from "../../shared/appSettings";

// Use vi.hoisted so these are available in vi.mock factories
const { mockShow, mockOn, MockNotification, mockExecFile } = vi.hoisted(() => {
  const mockShow = vi.fn();
  const mockOn = vi.fn();
  const MockNotification = vi.fn().mockImplementation(() => ({
    show: mockShow,
    on: mockOn,
  }));
  const mockExecFile = vi.fn();
  return { mockShow, mockOn, MockNotification, mockExecFile };
});

vi.mock("electron", () => ({
  Notification: MockNotification,
}));

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));

function makeSettings(overrides?: Partial<NotificationSettings>): NotificationSettings {
  return { ...defaultNotificationSettings, ...overrides };
}

describe("notificationService", () => {
  let getSettings: ReturnType<typeof vi.fn>;
  let getMainWindow: ReturnType<typeof vi.fn>;
  let service: ReturnType<typeof createNotificationService>;

  beforeEach(() => {
    vi.clearAllMocks();
    getSettings = vi.fn(() => makeSettings());
    getMainWindow = vi.fn(() => null);
    service = createNotificationService({
      getNotificationSettings: getSettings,
      getMainWindow,
    });
  });

  it("sends notification on running → completed", () => {
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: "running",
      nextStatus: "completed",
      title: "Fix bug",
    });
    expect(MockNotification).toHaveBeenCalledTimes(1);
    expect(MockNotification.mock.calls[0][0]).toMatchObject({
      title: expect.stringContaining("Cursor"),
      body: "Fix bug",
    });
    expect(mockShow).toHaveBeenCalledTimes(1);
  });

  it("falls back to session task when title is missing", () => {
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: "running",
      nextStatus: "completed",
      task: "Investigate stuck approval prompt",
    });
    expect(MockNotification).toHaveBeenCalledTimes(1);
    expect(MockNotification.mock.calls[0][0]).toMatchObject({
      body: "Investigate stuck approval prompt",
    });
  });

  it("uses a non-empty fallback body when title and task are missing", () => {
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: "running",
      nextStatus: "error",
    });
    expect(MockNotification).toHaveBeenCalledTimes(1);
    expect(MockNotification.mock.calls[0][0]).toMatchObject({
      body: "Open CodePal to inspect the session error.",
    });
  });

  it("sends notification on running → waiting", () => {
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "claude",
      prevStatus: "running",
      nextStatus: "waiting",
    });
    expect(MockNotification).toHaveBeenCalledTimes(1);
  });

  it("sends notification on running → error", () => {
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "codex",
      prevStatus: "running",
      nextStatus: "error",
    });
    expect(MockNotification).toHaveBeenCalledTimes(1);
  });

  it("sends notification on idle → running (resumed)", () => {
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "codebuddy",
      prevStatus: "idle",
      nextStatus: "running",
    });
    expect(MockNotification).toHaveBeenCalledTimes(1);
  });

  it("does NOT notify on offline → running (not a resume)", () => {
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: "offline",
      nextStatus: "running",
    });
    expect(MockNotification).not.toHaveBeenCalled();
  });

  it("does NOT notify when prevStatus is undefined (new session)", () => {
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: undefined,
      nextStatus: "running",
    });
    expect(MockNotification).not.toHaveBeenCalled();
  });

  it("suppresses duplicate notification within 30s debounce", () => {
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: "running",
      nextStatus: "completed",
    });
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: "running",
      nextStatus: "completed",
    });
    expect(MockNotification).toHaveBeenCalledTimes(1);
  });

  it("allows notification after debounce expires", () => {
    vi.useFakeTimers();
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: "running",
      nextStatus: "completed",
    });
    vi.advanceTimersByTime(31_000);
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: "running",
      nextStatus: "completed",
    });
    expect(MockNotification).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("respects master switch off", () => {
    getSettings.mockReturnValue(makeSettings({ enabled: false }));
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: "running",
      nextStatus: "completed",
    });
    expect(MockNotification).not.toHaveBeenCalled();
  });

  it("respects per-state switch off", () => {
    getSettings.mockReturnValue(makeSettings({ completed: false }));
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: "running",
      nextStatus: "completed",
    });
    expect(MockNotification).not.toHaveBeenCalled();
  });

  it("plays sound when soundEnabled is true", () => {
    getSettings.mockReturnValue(makeSettings({ soundEnabled: true }));
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: "running",
      nextStatus: "completed",
    });
    expect(mockExecFile).toHaveBeenCalledTimes(1);
    expect(mockExecFile.mock.calls[0][0]).toBe("afplay");
    expect(mockExecFile.mock.calls[0][1][0]).toContain("Glass.aiff");
  });

  it("activates window and sends focus-session IPC on click", () => {
    const mockWebContents = { send: vi.fn() };
    const mockWindow = {
      isDestroyed: vi.fn(() => false),
      show: vi.fn(),
      focus: vi.fn(),
      webContents: mockWebContents,
    };
    getMainWindow.mockReturnValue(mockWindow);
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: "running",
      nextStatus: "completed",
    });
    expect(mockOn).toHaveBeenCalledWith("click", expect.any(Function));
    const clickHandler = mockOn.mock.calls.find(
      (call: unknown[]) => call[0] === "click",
    )![1] as () => void;
    clickHandler();
    expect(mockWindow.show).toHaveBeenCalled();
    expect(mockWindow.focus).toHaveBeenCalled();
    expect(mockWebContents.send).toHaveBeenCalledWith("codepal:focus-session", "s1");
  });

  it("does NOT play sound when soundEnabled is false", () => {
    service.onSessionStateChange({
      sessionId: "s1",
      tool: "cursor",
      prevStatus: "running",
      nextStatus: "completed",
    });
    expect(mockExecFile).not.toHaveBeenCalled();
  });
});
