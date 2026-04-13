import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

type PngSize = {
  width: number;
  height: number;
};

type PngPixels = PngSize & {
  data: Buffer;
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

function readPngPixels(filePath: string): PngPixels {
  const buffer = fs.readFileSync(path.resolve(projectRoot, filePath));
  const size = readPngSize(filePath);
  const idatChunks: Buffer[] = [];

  for (let offset = 8; offset < buffer.length; ) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "IDAT") {
      idatChunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    }
    offset += length + 12;
  }

  return {
    ...size,
    data: inflateSync(Buffer.concat(idatChunks)),
  };
}

function alphaAt(png: PngPixels, x: number, y: number): number {
  const stride = 1 + png.width * 4;
  return png.data[y * stride + 1 + x * 4 + 3] ?? 0;
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

  it("keeps the macOS tray template backgroundless", () => {
    const tray = readPngPixels("build/tray-template.png");

    for (let x = 0; x < tray.width; x += 1) {
      expect(alphaAt(tray, x, 0), `top edge x=${x}`).toBe(0);
      expect(alphaAt(tray, x, tray.height - 1), `bottom edge x=${x}`).toBe(0);
    }

    for (let y = 0; y < tray.height; y += 1) {
      expect(alphaAt(tray, 0, y), `left edge y=${y}`).toBe(0);
      expect(alphaAt(tray, tray.width - 1, y), `right edge y=${y}`).toBe(0);
    }
  });

  it.skipIf(process.platform !== "darwin")("ships a valid macOS iconset inside build/icon.icns", () => {
    const tempDir = fs.mkdtempSync(path.join("/tmp", "codepal-icon-assets-"));
    const outputDir = path.join(tempDir, "icon.iconset");

    execFileSync("iconutil", [
      "-c",
      "iconset",
      path.resolve(projectRoot, "build/icon.icns"),
      "-o",
      outputDir,
    ]);

    expect(fs.readdirSync(outputDir).sort()).toEqual(
      expect.arrayContaining([
        "icon_128x128.png",
        "icon_128x128@2x.png",
        "icon_16x16@2x.png",
        "icon_256x256.png",
        "icon_256x256@2x.png",
        "icon_32x32@2x.png",
        "icon_512x512.png",
        "icon_512x512@2x.png",
      ]),
    );
    expect(fs.readdirSync(outputDir).sort()).toEqual(
      expect.not.arrayContaining([
        "icon_1024x1024.png",
      ]),
    );
  });
});
