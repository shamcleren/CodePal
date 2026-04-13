import { Menu, Tray, nativeImage } from "electron";

/** 32px @2x 黑色模板图，适合 macOS Tray 自动跟随明暗主题 */
const TRAY_TEMPLATE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAAB6ElEQVRYhe3WvU9UQRQF8B+oFH5ViKHRzpjIVlTa2aI2Wql/BEti0JbGVv8Fv+2NlqCVJqKJVlJaKbFAV7dRyFrsvHiZfW+/WBvlJC9vcmbOPfPe3Jm57OJ/x1iXvvO4jFlMDRl/HW/xEE/7FU3jBVojfp6n2NuQ/4FpvMKxjP+BX/1+QcI+HMy4jziNT1Wi+OVfMY/JAY0jJlFPsYq4K1WDz2XmtR0Y56hlk5grG/QgDJgfoXmBhRD/XkHGHFjDidSewpfUvoCb2D+g4QaW8CTEXA9eJ8sELTQzftXwmb+axWomfqMgxkPnnvTeykSPS7h+sJW0ORe9ti1BA4fwHYcz4QFMlJicTe+yzG7onHg3Dw3t39PI+HHcwB3MBD4mVT3wNdzFdZ3nTJVH185Lwehd4O8ryWq8D/zFXh57y2aSoVXB38KZ0B5EW4qqPzCGRe0lONVHnJk0dtGIlmCUGGoJqN4FvcwG2r5VB9E1bBr8ENpM2oiOgyhiLYiPBH5UJ+HRwH8oyLgEq/7cBVdxO7WX7OwuKHAltF+XCf72dfwtxC+9jmmXTXESdcPXg5J2ITNfjgPKSrKXOJ7xTfwc0HxCe/dE9CzJikmsGH1RuqyPojRiTjtxZrUzeBh8xhs8wrMhY+ziH8dveoXn2hMzxfkAAAAASUVORK5CYII=",
  "base64",
);

type CreateTrayOptions = {
  onOpenMain: () => void;
  onOpenSettings: () => void;
};

function createTrayIcon() {
  const icon = nativeImage.createFromBuffer(TRAY_TEMPLATE_PNG, { scaleFactor: 2 });
  icon.setTemplateImage(true);
  return icon;
}

export function createTray(options: CreateTrayOptions): Tray {
  const tray = new Tray(createTrayIcon());
  tray.setToolTip("CodePal");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开 CodePal", click: options.onOpenMain },
      { label: "设置", click: options.onOpenSettings },
      { type: "separator" },
      { label: "Quit CodePal", role: "quit" },
    ]),
  );
  return tray;
}
