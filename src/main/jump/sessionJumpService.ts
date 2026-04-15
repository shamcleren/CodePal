import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SessionJumpTarget } from "../../shared/sessionTypes";

const execFileAsync = promisify(execFile);

export type SessionJumpResult =
  | { ok: true; mode: "precise" | "activate_app" }
  | { ok: false; error: string };

export type SessionJumpService = {
  jumpTo(target: SessionJumpTarget): Promise<SessionJumpResult>;
};

type SessionJumpServiceDeps = {
  findWindow?: (target: SessionJumpTarget) => Promise<boolean>;
  activateApp?: (appName: string, workspacePath?: string) => Promise<boolean>;
};

async function defaultFindWindow(target: SessionJumpTarget): Promise<boolean> {
  if (!target.appName || !target.workspacePath) {
    return false;
  }
  try {
    await execFileAsync("open", ["-a", target.appName, target.workspacePath]);
    return true;
  } catch {
    return false;
  }
}

async function defaultActivateApp(appName: string, workspacePath?: string): Promise<boolean> {
  try {
    const args = workspacePath ? ["-a", appName, workspacePath] : ["-a", appName];
    await execFileAsync("open", args);
    return true;
  } catch {
    return false;
  }
}

export function createSessionJumpService(
  deps: SessionJumpServiceDeps = {},
): SessionJumpService {
  const findWindow = deps.findWindow ?? defaultFindWindow;
  const activateApp = deps.activateApp ?? defaultActivateApp;

  return {
    async jumpTo(target: SessionJumpTarget): Promise<SessionJumpResult> {
      if (await findWindow(target)) {
        return { ok: true, mode: "precise" };
      }

      if (target.appName && (await activateApp(target.appName, target.workspacePath))) {
        return { ok: true, mode: "activate_app" };
      }

      return {
        ok: false,
        error: "Unable to locate or activate the original tool",
      };
    },
  };
}
