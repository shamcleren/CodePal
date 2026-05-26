import { describe, expect, it } from "vitest";
import { moveProjectKey, orderKeyedItems, orderProjectGroups } from "./projectGroups";

describe("projectGroups", () => {
  it("moves a project key before another project key", () => {
    expect(moveProjectKey(["CodePal", "gateway", "unknown"], "unknown", "CodePal")).toEqual([
      "unknown",
      "CodePal",
      "gateway",
    ]);
  });

  it("keeps order stable for missing or identical drag targets", () => {
    const order = ["CodePal", "gateway", "unknown"];

    expect(moveProjectKey(order, "missing", "CodePal")).toEqual(order);
    expect(moveProjectKey(order, "CodePal", "missing")).toEqual(order);
    expect(moveProjectKey(order, "CodePal", "CodePal")).toEqual(order);
  });

  it("orders known groups first and appends new groups in incoming order", () => {
    expect(orderProjectGroups([
      { key: "CodePal" },
      { key: "gateway" },
      { key: "new" },
    ], ["gateway", "missing", "CodePal"])).toEqual([
      { key: "gateway" },
      { key: "CodePal" },
      { key: "new" },
    ]);
  });

  it("orders keyed items inside a project while keeping new sessions visible", () => {
    expect(orderKeyedItems([
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ], ["b", "a"])).toEqual([
      { id: "b" },
      { id: "a" },
      { id: "c" },
    ]);
  });
});
