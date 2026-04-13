# CodePal Icon Redesign

This folder contains draft source artwork for a cleaner CodePal icon system.

## Files

- `app-icon.svg`: 1024x1024 app icon concept for Dock, Finder, and release assets.
- `app-icon.png`: rendered preview of the current app icon concept.
- `tray-template.svg`: 32x32 macOS menu bar template glyph. It is intentionally transparent and single-color.
- `tray-template.png`: rendered 32x32 tray template preview.
- `preview.svg`: side-by-side preview for app icon and light/dark menu bar use.
- `preview.png`: rendered preview board.
- `build-preview.mjs`: regenerates `preview.svg` from `app-icon.svg` and `tray-template.svg` so the preview does not drift from either source icon.

## Design Notes

- The app icon can use a rounded surface, depth, and color.
- The core mark is a centered monitoring panel, not a face. The three dots are status nodes; the horizontal lines are activity/status rows.
- The tray icon should not be a scaled-down app icon.
- The tray icon must stay backgroundless: no frame fill, no black top strip, no shadow.
- The tray icon should be exported as a black transparent PNG and marked as a template image in Electron.

## Scope

This concept covers CodePal-owned brand assets first:

- app icon
- docs icon
- packaged macOS icon
- tray template icon

Third-party agent icons should not be redrawn into new brand marks. They should be normalized separately for consistent canvas size, transparent padding, and optical alignment.

## Figma Workflow

Drag these SVG files into a new Figma file named `CodePal Icon Redesign`.

Recommended frames:

- `App Icon / 1024`
- `Tray Template / 32`
- `Tray Preview / Light`
- `Tray Preview / Dark`

After choosing a final version, export:

- `app-icon.svg` as a 1024x1024 PNG for `build/icon.png` and `.icns` generation.
- `tray-template.svg` as a 32x32 transparent PNG for `build/tray-template.png`.

When editing either source icon, update `app-icon.svg` or `tray-template.svg`, then run:

```bash
node design/codepal-icon-redesign/build-preview.mjs
rsvg-convert -w 1280 -h 720 design/codepal-icon-redesign/preview.svg -o design/codepal-icon-redesign/preview.png
```
