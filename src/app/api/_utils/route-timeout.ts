export async function raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T) {
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeout = new Promise<T>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        resolve(fallback);
      }, timeoutMs);
    });

    const value = await Promise.race([promise, timeout]);
    return { timedOut, value };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
