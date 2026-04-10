type AdaptivePollSchedulerOptions = {
  poll: () => boolean | Promise<boolean>;
  fastIntervalMs: number;
  maxIntervalMs?: number;
  onError?: (error: unknown) => void;
};

export function createAdaptivePollScheduler(options: AdaptivePollSchedulerOptions) {
  const fastIntervalMs = Math.max(1, options.fastIntervalMs);
  const maxIntervalMs = Math.max(fastIntervalMs, options.maxIntervalMs ?? fastIntervalMs * 4);
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let stopped = true;
  let nextIntervalMs = fastIntervalMs;

  function clearPendingTimeout() {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }
  }

  function schedule(delayMs: number) {
    clearPendingTimeout();
    timeout = setTimeout(() => {
      void tick();
    }, delayMs);
  }

  async function tick() {
    if (stopped || running) {
      return;
    }
    running = true;
    try {
      const hadActivity = await options.poll();
      nextIntervalMs = hadActivity
        ? fastIntervalMs
        : Math.min(maxIntervalMs, Math.max(fastIntervalMs * 2, nextIntervalMs * 2));
    } catch (error) {
      nextIntervalMs = fastIntervalMs;
      options.onError?.(error);
    } finally {
      running = false;
      if (!stopped) {
        schedule(nextIntervalMs);
      }
    }
  }

  return {
    start() {
      if (!stopped) {
        return;
      }
      stopped = false;
      nextIntervalMs = fastIntervalMs;
      schedule(nextIntervalMs);
    },
    stop() {
      stopped = true;
      clearPendingTimeout();
    },
  };
}
