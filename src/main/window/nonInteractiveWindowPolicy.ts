import type { App } from "electron";

export function shouldUseAccessoryActivationPolicy(input: {
  argv: string[];
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
}): boolean {
  return (
    input.platform === "darwin" &&
    (input.env.CODEPAL_E2E_SILENT === "1" || input.argv.includes("--codepal-hook"))
  );
}

export function applyAccessoryActivationPolicy(app: App, enabled: boolean): void {
  if (!enabled) {
    return;
  }
  try {
    app.setActivationPolicy("accessory");
    app.dock.hide();
  } catch (error) {
    console.error("[CodePal] failed to apply accessory activation policy:", error);
  }
}
