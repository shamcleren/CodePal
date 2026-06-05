import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("main process startup safety", () => {
  it("does not mutate third-party agent config during app startup", () => {
    const mainSource = fs.readFileSync(path.resolve(process.cwd(), "src/main/main.ts"), "utf8");

    expect(mainSource).not.toContain(".autoMigrateExistingCodePalHooks(");
    expect(mainSource).not.toContain(".autoInstallMissingSupportedHooks(");
  });
});
