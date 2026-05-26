import { describe, expect, it } from "vitest";
import {
  UNKNOWN_PROJECT_PATH,
  projectDisplayName,
  sortProjectRows,
} from "./projectAttribution";

describe("projectAttribution shared helpers", () => {
  it("derives compact display names and keeps unknown explicit", () => {
    expect(projectDisplayName("/Users/demo/code/CodePal")).toBe("CodePal");
    expect(projectDisplayName("/Users/demo/code/CodePal/")).toBe("CodePal");
    expect(projectDisplayName(UNKNOWN_PROJECT_PATH)).toBe("unknown");
    expect(projectDisplayName(null)).toBe("unknown");
  });

  it("sorts project rows by tokens while keeping unknown last", () => {
    const rows = [
      { projectPath: UNKNOWN_PROJECT_PATH, projectName: "unknown", totalTokens: 999, requestCount: 99 },
      { projectPath: "/repo/api", projectName: "api", totalTokens: 100, requestCount: 5 },
      { projectPath: "/repo/web", projectName: "web", totalTokens: 250, requestCount: 1 },
    ];

    expect(sortProjectRows(rows).map((row) => row.projectName)).toEqual([
      "web",
      "api",
      "unknown",
    ]);
  });
});
