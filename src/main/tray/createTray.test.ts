import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const buildFromTemplate = vi.fn((template) => template);
  const setTemplateImage = vi.fn();
  const createFromBuffer = vi.fn(() => ({
    setTemplateImage,
  }));
  const setContextMenu = vi.fn();
  const setToolTip = vi.fn();
  const trayConstructor = vi.fn(() => ({
    setToolTip,
    setContextMenu,
  }));

  return {
    buildFromTemplate,
    createFromBuffer,
    setTemplateImage,
    setContextMenu,
    setToolTip,
    trayConstructor,
  };
});

vi.mock("electron", () => ({
  Menu: {
    buildFromTemplate: mocks.buildFromTemplate,
  },
  Tray: mocks.trayConstructor,
  nativeImage: {
    createFromBuffer: mocks.createFromBuffer,
  },
}));

import { createTray } from "./createTray";

describe("createTray", () => {
  beforeEach(() => {
    mocks.buildFromTemplate.mockClear();
    mocks.createFromBuffer.mockClear();
    mocks.setTemplateImage.mockClear();
    mocks.setContextMenu.mockClear();
    mocks.setToolTip.mockClear();
    mocks.trayConstructor.mockClear();
  });

  it("adds both main-window and settings entries to the tray menu", () => {
    const onOpenMain = vi.fn();
    const onOpenSettings = vi.fn();

    (createTray as unknown as (options: {
      onOpenMain: () => void;
      onOpenSettings: () => void;
    }) => unknown)({
      onOpenMain,
      onOpenSettings,
    });

    const template = mocks.buildFromTemplate.mock.calls[0]?.[0] as Array<{ label?: string }>;

    expect(template).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "打开 CodePal" }),
        expect.objectContaining({ label: "设置" }),
        expect.objectContaining({ label: "Quit CodePal" }),
      ]),
    );
  });

  it("marks the bundled tray icon as a macOS template image", () => {
    (createTray as unknown as (options: {
      onOpenMain: () => void;
      onOpenSettings: () => void;
    }) => unknown)({
      onOpenMain: vi.fn(),
      onOpenSettings: vi.fn(),
    });

    expect(mocks.createFromBuffer).toHaveBeenCalledOnce();
    expect(mocks.setTemplateImage).toHaveBeenCalledWith(true);
  });
});
