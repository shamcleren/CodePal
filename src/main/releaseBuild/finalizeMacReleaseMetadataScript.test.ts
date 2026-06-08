import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("finalize-mac-release-metadata script", () => {
  it("re-uploads final zip and dmg artifacts with refreshed updater metadata", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "scripts/finalize-mac-release-metadata.cjs"),
      "utf8",
    );

    expect(source).toContain("...artifactPaths,");
    expect(source).toContain("...artifactPaths.map((filePath) => `${filePath}.blockmap`),");
    expect(source.indexOf("...artifactPaths,")).toBeLessThan(
      source.indexOf("...artifactPaths.map((filePath) => `${filePath}.blockmap`),"),
    );
  });
});
