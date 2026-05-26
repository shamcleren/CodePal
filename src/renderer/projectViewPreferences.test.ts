import { describe, expect, it } from "vitest";
import {
  readAnalyticsPagePreferences,
  readSessionListPreferences,
  writeAnalyticsPagePreferences,
  writeSessionListPreferences,
} from "./projectViewPreferences";

function fakeStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("projectViewPreferences", () => {
  it("persists project order and project visibility state", () => {
    const storage = fakeStorage();

    writeSessionListPreferences({
      projectOrder: ["CodePal", "gateway"],
      collapsedProjectKeys: ["gateway"],
      expandedProjectSessionKeys: ["CodePal"],
    }, storage);

    expect(readSessionListPreferences(storage)).toEqual({
      projectOrder: ["CodePal", "gateway"],
      collapsedProjectKeys: ["gateway"],
      expandedProjectSessionKeys: ["CodePal"],
    });
  });

  it("persists analytics local controls independently from project view state", () => {
    const storage = fakeStorage();

    writeSessionListPreferences({
      projectOrder: ["sessions-project"],
      collapsedProjectKeys: [],
      expandedProjectSessionKeys: [],
    }, storage);
    writeAnalyticsPagePreferences({
      range: "custom",
      customStart: "2026-05-01",
      customEnd: "2026-05-26",
      breakdownMode: "agent",
      granularity: "day",
      metric: "cost",
      projectFilter: "/repo/CodePal",
      agentFilter: "codex",
      modelFilter: "gpt-5",
    }, storage);

    expect(readSessionListPreferences(storage).projectOrder).toEqual(["sessions-project"]);
    expect(readAnalyticsPagePreferences(storage)).toEqual({
      range: "custom",
      customStart: "2026-05-01",
      customEnd: "2026-05-26",
      breakdownMode: "agent",
      granularity: "day",
      metric: "cost",
      projectFilter: "/repo/CodePal",
      agentFilter: "codex",
      modelFilter: "gpt-5",
    });
  });

  it("normalizes invalid analytics preferences", () => {
    const storage = fakeStorage();
    storage.setItem("codepal.analytics.local-preferences.v1", JSON.stringify({
      range: "forever",
      customStart: 1,
      customEnd: "2026-05-26",
      breakdownMode: "project",
      granularity: "week",
      metric: "cost",
      projectFilter: "",
      agentFilter: "codex",
      modelFilter: 99,
    }));

    expect(readAnalyticsPagePreferences(storage)).toEqual({
      range: "7d",
      customStart: "",
      customEnd: "2026-05-26",
      breakdownMode: "project",
      granularity: "hour",
      metric: "cost",
      projectFilter: undefined,
      agentFilter: "codex",
      modelFilter: undefined,
    });
  });

  it("falls back to empty preferences for corrupt stored JSON", () => {
    const storage = fakeStorage();
    storage.setItem("codepal.sessions.project-view-preferences.v1", "{");

    expect(readSessionListPreferences(storage)).toEqual({
      projectOrder: [],
      collapsedProjectKeys: [],
      expandedProjectSessionKeys: [],
    });
  });
});
