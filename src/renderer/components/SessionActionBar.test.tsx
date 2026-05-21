import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { SessionActionBar } from "./SessionActionBar";
import type { SessionCapabilityManifest } from "../../shared/capabilityTypes";
import { I18nProvider } from "../i18n";

function render(ui: React.ReactElement): string {
  return renderToStaticMarkup(<I18nProvider locale="en">{ui}</I18nProvider>);
}

function fullCaps(overrides: Partial<SessionCapabilityManifest> = {}): SessionCapabilityManifest {
  const unsupported = { support: "unsupported" as const, confidence: "high" as const };
  return {
    jump: unsupported,
    sendMessage: unsupported,
    openRepo: unsupported,
    ...overrides,
  };
}

const supported = { support: "supported" as const, confidence: "high" as const };
const bestEffort = { support: "best_effort" as const, confidence: "low" as const, reason: "test" };

describe("SessionActionBar", () => {
  beforeEach(() => {
    vi.stubGlobal("codepal", {
      getSessionCapabilities: vi.fn().mockResolvedValue(null),
      executeSessionAction: vi.fn().mockResolvedValue({ ok: true, action: "jump", sessionId: "s1" }),
    });
  });

  it("renders nothing when capabilities are null", () => {
    const html = render(<SessionActionBar sessionId="s1" capabilities={null} />);
    expect(html).toBe("");
  });

  it("renders jump button when capability is supported", () => {
    const html = render(
      <SessionActionBar sessionId="s1" capabilities={fullCaps({ jump: supported })} />,
    );
    expect(html).toContain("Jump");
    expect(html).toContain("session-action-bar__btn");
  });

  it("renders confidence indicator for best_effort jump", () => {
    const html = render(
      <SessionActionBar sessionId="s1" capabilities={fullCaps({ jump: bestEffort })} />,
    );
    expect(html).toContain("~");
    expect(html).toContain("session-action-bar__confidence");
  });

  it("renders nothing when all capabilities are unsupported", () => {
    const html = render(
      <SessionActionBar sessionId="s1" capabilities={fullCaps()} />,
    );
    expect(html).toBe("");
  });

  it("renders nothing when only openRepo is supported (jump not available)", () => {
    const html = render(
      <SessionActionBar sessionId="s1" capabilities={fullCaps({ openRepo: supported })} />,
    );
    expect(html).toBe("");
  });
});
