import { Notification } from "electron";
import { execFile } from "node:child_process";
import type { NotificationSettings } from "../../shared/appSettings";
import type { SessionStatus } from "../../shared/sessionTypes";
import type { BrowserWindow } from "electron";
import type { PendingActionCreated } from "../session/sessionStore";

const DEBOUNCE_MS = 30_000;

const KNOWN_TOOL_LABELS: Record<string, string> = {
  claude: "Claude Code",
  cursor: "Cursor",
  codex: "Codex",
  codebuddy: "CodeBuddy",
  goland: "GoLand",
  pycharm: "PyCharm",
  jetbrains: "JetBrains",
};

type NotifiableTransition = {
  settingsKey: keyof Pick<NotificationSettings, "completed" | "waiting" | "error" | "resumed">;
  titleZh: string;
  titleEn: string;
  sound: string;
};

function classifyTransition(
  prevStatus: SessionStatus | undefined,
  nextStatus: SessionStatus,
): NotifiableTransition | null {
  if (prevStatus === undefined) return null;
  if (prevStatus === nextStatus) return null;

  if (nextStatus === "completed" && (prevStatus === "running" || prevStatus === "waiting")) {
    return { settingsKey: "completed", titleZh: "任务完成", titleEn: "task completed", sound: "Glass" };
  }
  if (nextStatus === "waiting" && (prevStatus === "running" || prevStatus === "completed")) {
    return { settingsKey: "waiting", titleZh: "等待决策", titleEn: "waiting for decision", sound: "Ping" };
  }
  if (nextStatus === "error" && (prevStatus === "running" || prevStatus === "waiting")) {
    return { settingsKey: "error", titleZh: "任务出错", titleEn: "task errored", sound: "Basso" };
  }
  if (nextStatus === "running" && prevStatus === "idle") {
    return { settingsKey: "resumed", titleZh: "恢复活动", titleEn: "resumed", sound: "Tink" };
  }
  return null;
}

function toolLabel(tool: string): string {
  return KNOWN_TOOL_LABELS[tool] ?? tool.charAt(0).toUpperCase() + tool.slice(1);
}

export interface NotificationService {
  onSessionStateChange(params: {
    sessionId: string;
    tool: string;
    prevStatus: SessionStatus | undefined;
    nextStatus: SessionStatus;
    title?: string;
    task?: string;
    lastUserMessage?: string;
  }): void;
  onPendingActionCreated(params: PendingActionCreated): void;
}

function buildNotificationBody(params: {
  lastUserMessage?: string;
  title?: string;
  task?: string;
  nextStatus: SessionStatus;
}): string {
  const userMsg = params.lastUserMessage?.trim();
  if (userMsg) {
    return userMsg.length > 120 ? `${userMsg.slice(0, 117)}...` : userMsg;
  }

  const title = params.title?.trim();
  if (title) {
    return title;
  }

  const task = params.task?.trim();
  if (task) {
    return task;
  }

  switch (params.nextStatus) {
    case "completed":
      return "Open CodePal to review the completed session.";
    case "waiting":
      return "Open CodePal to review the pending decision.";
    case "error":
      return "Open CodePal to inspect the session error.";
    case "running":
      return "Open CodePal to review the resumed session.";
    default:
      return "Open CodePal to inspect this session.";
  }
}

export function createNotificationService(deps: {
  getNotificationSettings: () => NotificationSettings;
  getMainWindow: () => BrowserWindow | null;
}): NotificationService {
  const lastNotified = new Map<string, number>();

  return {
    onSessionStateChange({ sessionId, tool, prevStatus, nextStatus, title, task, lastUserMessage }) {
      const settings = deps.getNotificationSettings();
      if (!settings.enabled) return;

      const transition = classifyTransition(prevStatus, nextStatus);
      if (!transition) return;
      if (!settings[transition.settingsKey]) return;

      const debounceKey = `${sessionId}:${transition.settingsKey}`;
      const now = Date.now();
      const last = lastNotified.get(debounceKey);
      if (last !== undefined && now - last < DEBOUNCE_MS) return;
      lastNotified.set(debounceKey, now);

      const label = toolLabel(tool);
      const notification = new Notification({
        title: `${label} ${transition.titleZh}`,
        body: buildNotificationBody({ lastUserMessage, title, task, nextStatus }),
        silent: true,
      });

      notification.on("click", () => {
        const win = deps.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.show();
          win.focus();
          win.webContents.send("codepal:focus-session", sessionId);
        }
      });

      notification.show();

      if (settings.soundEnabled) {
        const soundPath = `/System/Library/Sounds/${transition.sound}.aiff`;
        execFile("afplay", [soundPath], (err) => {
          if (err) {
            console.warn("[CodePal Notification] sound playback failed:", err.message);
          }
        });
      }
    },

    onPendingActionCreated({ sessionId, tool, pendingCount, title, task }) {
      const settings = deps.getNotificationSettings();
      if (!settings.enabled) return;

      // 仅在通知功能整体开启时触发（复用 waiting 设置键作为审批通知开关）
      if (!settings.waiting) return;

      const debounceKey = `${sessionId}:pending_action`;
      const now = Date.now();
      const last = lastNotified.get(debounceKey);
      if (last !== undefined && now - last < DEBOUNCE_MS) return;
      lastNotified.set(debounceKey, now);

      const label = toolLabel(tool);
      const body =
        pendingCount === 1
          ? "需要你的审批"
          : `${pendingCount} 条操作需要你的审批`;
      const titleText = `${label} · ${title ?? task ?? "未知会话"}`;

      const notification = new Notification({
        title: titleText,
        body,
        silent: true,
      });

      notification.on("click", () => {
        const win = deps.getMainWindow();
        if (win && !win.isDestroyed()) {
          win.show();
          win.focus();
          win.webContents.send("codepal:focus-session", sessionId);
        }
      });

      notification.show();

      if (settings.soundEnabled) {
        const soundPath = `/System/Library/Sounds/Ping.aiff`;
        execFile("afplay", [soundPath], (err) => {
          if (err) {
            console.warn("[CodePal Notification] sound playback failed:", err.message);
          }
        });
      }
    },
  };
}
