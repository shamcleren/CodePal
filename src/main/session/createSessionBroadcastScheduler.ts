export function createSessionBroadcastScheduler(
  flush: () => void,
  delayMs = 50,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearPending() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return {
    request() {
      if (timer !== null) {
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        flush();
      }, delayMs);
    },

    flushNow() {
      clearPending();
      flush();
    },

    cancel() {
      clearPending();
    },
  };
}
