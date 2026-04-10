import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionBroadcastScheduler } from "./createSessionBroadcastScheduler";

describe("createSessionBroadcastScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces multiple requests into a single flush", () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const scheduler = createSessionBroadcastScheduler(flush, 50);

    scheduler.request();
    scheduler.request();
    scheduler.request();

    expect(flush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);

    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("flushes immediately when requested", () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const scheduler = createSessionBroadcastScheduler(flush, 50);

    scheduler.request();
    scheduler.flushNow();

    expect(flush).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending flush", () => {
    vi.useFakeTimers();
    const flush = vi.fn();
    const scheduler = createSessionBroadcastScheduler(flush, 50);

    scheduler.request();
    scheduler.cancel();

    vi.advanceTimersByTime(50);
    expect(flush).not.toHaveBeenCalled();
  });
});
