import { describe, expect, it, vi } from "vitest";
import {
  applyAccessoryActivationPolicy,
  shouldUseAccessoryActivationPolicy,
} from "./nonInteractiveWindowPolicy";

describe("nonInteractiveWindowPolicy", () => {
  it("uses accessory activation for old direct hook invocations on macOS", () => {
    expect(
      shouldUseAccessoryActivationPolicy({
        argv: ["/Applications/CodePal.app/Contents/MacOS/CodePal", "--codepal-hook", "cursor"],
        env: {},
        platform: "darwin",
      }),
    ).toBe(true);
  });

  it("uses accessory activation for silent E2E launches on macOS", () => {
    expect(
      shouldUseAccessoryActivationPolicy({
        argv: ["/Electron", "out/main/main.js"],
        env: { CODEPAL_E2E_SILENT: "1" },
        platform: "darwin",
      }),
    ).toBe(true);
  });

  it("keeps normal app launches interactive", () => {
    expect(
      shouldUseAccessoryActivationPolicy({
        argv: ["/Applications/CodePal.app/Contents/MacOS/CodePal"],
        env: {},
        platform: "darwin",
      }),
    ).toBe(false);
  });

  it("applies the accessory activation policy when enabled", () => {
    const app = {
      setActivationPolicy: vi.fn(),
      dock: { hide: vi.fn() },
    };

    applyAccessoryActivationPolicy(app as never, true);

    expect(app.setActivationPolicy).toHaveBeenCalledWith("accessory");
    expect(app.dock.hide).toHaveBeenCalled();
  });
});
