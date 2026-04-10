import { beforeEach, describe, expect, it, vi } from "vitest";

const browserWindowMock = vi.fn();

vi.mock("electron", () => ({
  BrowserWindow: browserWindowMock,
}));

describe("createFloatingWindow", () => {
  beforeEach(() => {
    browserWindowMock.mockReset();
    browserWindowMock.mockImplementation(() => ({
      loadURL: vi.fn(),
      loadFile: vi.fn(),
    }));
    vi.unstubAllEnvs();
  });

  it("creates the main floating panel with the larger desktop-first default size", async () => {
    const { createFloatingWindow } = await import("./createFloatingWindow");

    createFloatingWindow();

    expect(browserWindowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 620,
        height: 760,
        minWidth: 520,
        minHeight: 640,
        show: false,
      }),
    );
  });
});
