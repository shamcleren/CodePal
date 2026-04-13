import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

type PngSize = {
  width: number;
  height: number;
};

const projectRoot = process.cwd();

function readPngSize(filePath: string): PngSize {
  const buffer = fs.readFileSync(path.resolve(projectRoot, filePath));
  expect(buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

describe("icon assets", () => {
  it("keeps packaged, docs, tray, and renderer PNG icons square", () => {
    const iconPaths = [
      "build/icon.png",
      "build/tray-template.png",
      "docs/icon.png",
      "src/renderer/assets/claude-app-icon.png",
      "src/renderer/assets/codebuddy-app-icon.png",
      "src/renderer/assets/codex-app-icon.png",
      "src/renderer/assets/cursor-app-icon.png",
      "src/renderer/assets/jetbrains-app-icon.png",
      "src/renderer/assets/pycharm-app-icon.png",
    ];

    for (const iconPath of iconPaths) {
      const size = readPngSize(iconPath);
      expect(size.width, iconPath).toBe(size.height);
      expect(size.width, iconPath).toBeGreaterThanOrEqual(16);
    }
  });

  it("ships a valid macOS iconset inside build/icon.icns", () => {
    const tempDir = fs.mkdtempSync(path.join("/tmp", "codepal-icon-assets-"));
    const outputDir = path.join(tempDir, "icon.iconset");

    execFileSync("iconutil", [
      "-c",
      "iconset",
      path.resolve(projectRoot, "build/icon.icns"),
      "-o",
      outputDir,
    ]);

    expect(fs.readdirSync(outputDir).sort()).toEqual([
      "icon_128x128.png",
      "icon_128x128@2x.png",
      "icon_16x16@2x.png",
      "icon_256x256.png",
      "icon_256x256@2x.png",
      "icon_32x32@2x.png",
      "icon_512x512.png",
      "icon_512x512@2x.png",
    ]);
  });
});
