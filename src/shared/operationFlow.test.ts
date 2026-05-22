import { describe, expect, it } from "vitest";
import { buildPreflight, generateOperationId } from "./operationFlow";

describe("buildPreflight", () => {
  it("returns safe risk for jump action", () => {
    const result = buildPreflight("sess-1", "claude", "jump");
    expect(result.proceed).toBe(true);
    expect(result.risk).toBe("safe");
    expect(result.description).toContain("terminal");
    expect(result.warnings).toHaveLength(0);
    expect(result.dryRunAvailable).toBe(false);
    expect(result.target.sessionId).toBe("sess-1");
    expect(result.target.agent).toBe("claude");
    expect(result.target.action).toBe("jump");
  });

  it("returns low risk for sendMessage action with warning", () => {
    const result = buildPreflight("sess-2", "codex", "sendMessage");
    expect(result.risk).toBe("low");
    expect(result.description).toContain("message");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("returns safe risk for openRepo action", () => {
    const result = buildPreflight("sess-3", "claude", "openRepo", "/home/user/project");
    expect(result.risk).toBe("safe");
    expect(result.description).toContain("/home/user/project");
    expect(result.warnings).toHaveLength(0);
  });

  it("includes detail in target when provided", () => {
    const result = buildPreflight("sess-4", "codex", "jump", "tmux pane %42");
    expect(result.target.detail).toBe("tmux pane %42");
  });

  it("generates unique operation ids", () => {
    const id1 = generateOperationId();
    const id2 = generateOperationId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^op-\d+-[a-z0-9]+$/);
  });
});
