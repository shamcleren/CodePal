/* global URL, console, process */

import fs from "node:fs";
import path from "node:path";

const dir = new URL(".", import.meta.url);
const appIconPath = new URL("app-icon.svg", dir);
const trayTemplatePath = new URL("tray-template.svg", dir);
const previewPath = new URL("preview.svg", dir);

const appIconSvg = fs.readFileSync(appIconPath, "utf8");
const appIconInner = appIconSvg
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "")
  .replace("<title>CodePal app icon concept</title>", "");
const trayTemplateSvg = fs.readFileSync(trayTemplatePath, "utf8");
const trayTemplateInner = trayTemplateSvg
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "")
  .replace("<title>CodePal tray template icon</title>", "")
  .replaceAll("#000000", "currentColor");

const previewSvg = `\
<svg width="1280" height="720" viewBox="0 0 1280 720" fill="none" xmlns="http://www.w3.org/2000/svg">
  <title>CodePal icon redesign preview</title>
  <defs>
    <g id="trayIconSource">
${trayTemplateInner
  .split("\n")
  .map((line) => `      ${line}`)
  .join("\n")}
    </g>
    <g id="appIconSource">
${appIconInner
  .split("\n")
  .map((line) => `      ${line}`)
  .join("\n")}
    </g>
  </defs>

  <rect width="1280" height="720" fill="#F6F7F9" />
  <text x="96" y="84" fill="#111827" font-family="Avenir Next, Helvetica, Arial, sans-serif" font-size="34" font-weight="700">CodePal Icon Redesign</text>
  <text x="96" y="122" fill="#526070" font-family="Avenir Next, Helvetica, Arial, sans-serif" font-size="17">A centered app icon plus a separate transparent macOS menu bar glyph.</text>

  <g transform="translate(96 170)">
    <rect width="384" height="420" rx="28" fill="#FFFFFF" stroke="#D8DEE8" />
    <text x="32" y="50" fill="#111827" font-family="Avenir Next, Helvetica, Arial, sans-serif" font-size="20" font-weight="700">App Icon</text>
    <g transform="translate(64 82) scale(0.25)">
      <use href="#appIconSource" />
    </g>
    <text x="32" y="378" fill="#526070" font-family="Avenir Next, Helvetica, Arial, sans-serif" font-size="15">Dock/Finder asset with color and depth.</text>
  </g>

  <g transform="translate(528 170)">
    <rect width="656" height="420" rx="28" fill="#FFFFFF" stroke="#D8DEE8" />
    <text x="32" y="50" fill="#111827" font-family="Avenir Next, Helvetica, Arial, sans-serif" font-size="20" font-weight="700">Menu Bar Template</text>

    <rect x="32" y="92" width="592" height="54" rx="18" fill="#F4F4F5" stroke="#D1D5DB" />
    <circle cx="66" cy="119" r="5" fill="#EF4444" />
    <circle cx="86" cy="119" r="5" fill="#F59E0B" />
    <circle cx="106" cy="119" r="5" fill="#22C55E" />
    <text x="164" y="125" fill="#71717A" font-family="Avenir Next, Helvetica, Arial, sans-serif" font-size="14">Light menu bar</text>
    <g transform="translate(548 103)" color="#1F2937">
      <use href="#trayIconSource" />
    </g>

    <rect x="32" y="172" width="592" height="54" rx="18" fill="#18181B" stroke="#27272A" />
    <circle cx="66" cy="199" r="5" fill="#EF4444" />
    <circle cx="86" cy="199" r="5" fill="#F59E0B" />
    <circle cx="106" cy="199" r="5" fill="#22C55E" />
    <text x="164" y="205" fill="#A1A1AA" font-family="Avenir Next, Helvetica, Arial, sans-serif" font-size="14">Dark menu bar</text>
    <g transform="translate(548 183)" color="#F4F4F5">
      <use href="#trayIconSource" />
    </g>

    <g transform="translate(32 270)">
      <rect width="92" height="92" rx="16" fill="#F8FAFC" stroke="#E5E7EB" />
      <g transform="translate(30 30)" color="#111827">
        <use href="#trayIconSource" />
      </g>
      <text x="116" y="36" fill="#111827" font-family="Avenir Next, Helvetica, Arial, sans-serif" font-size="16" font-weight="700">32x32 transparent source</text>
      <text x="116" y="62" fill="#526070" font-family="Avenir Next, Helvetica, Arial, sans-serif" font-size="14">No background fill, top strip, frame shadow, or scaled app icon details.</text>
    </g>
  </g>
</svg>
`;

fs.writeFileSync(previewPath, previewSvg);
console.log(`Wrote ${path.relative(process.cwd(), previewPath.pathname)}`);
