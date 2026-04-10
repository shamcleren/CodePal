import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdaptivePollScheduler } from "./createAdaptivePollScheduler";

describe("createAdaptivePollScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("backs off after idle polls up to the configured max interval", async () => {
    vi.useFakeTimers();
    const poll = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
    const scheduler = createAdaptivePollScheduler({
      poll,
      fastIntervalMs: 100,
      maxIntervalMs: 400,
    });

    scheduler.start();

    await vi.advanceTimersByTimeAsync(100);
    expect(poll).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(199);
    expect(poll).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(poll).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(399);
    expect(poll).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(poll).toHaveBeenCalledTimes(3);
  });

  it("resets to the fast interval after an active poll", async () => {
    vi.useFakeTimers();
    const poll = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);
    const scheduler = createAdaptivePollScheduler({
      poll,
      fastIntervalMs: 100,
      maxIntervalMs: 400,
    });

    scheduler.start();

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(400);

    expect(poll).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(99);
    expect(poll).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(1);
    expect(poll).toHaveBeenCalledTimes(4);
  });

  it("cancels pending polls when stopped", async () => {
    vi.useFakeTimers();
    const poll = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
    const scheduler = createAdaptivePollScheduler({
      poll,
      fastIntervalMs: 100,
      maxIntervalMs: 400,
    });

    scheduler.start();
    scheduler.stop();

    await vi.advanceTimersByTimeAsync(500);

    expect(poll).not.toHaveBeenCalled();
  });
});
