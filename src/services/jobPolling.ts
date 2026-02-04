import AsyncStorage from '@react-native-async-storage/async-storage';

type JobType = 'url' | 'webview' | 'image';

export type PersistedJob = {
  jobId: string;
  jobType: JobType;
  sourceUrl?: string | null;
  startedAt: number;
};

const JOB_STATE_KEY = '@jarvis_recipes/active_job';

export const saveActiveJob = async (job: PersistedJob) => {
  try {
    await AsyncStorage.setItem(JOB_STATE_KEY, JSON.stringify(job));
  } catch (error) {
    console.warn('[jobPolling] Failed to save active job:', error instanceof Error ? error.message : String(error));
  }
};

export const loadActiveJob = async (): Promise<PersistedJob | null> => {
  try {
    const raw = await AsyncStorage.getItem(JOB_STATE_KEY);
    return raw ? (JSON.parse(raw) as PersistedJob) : null;
  } catch (error) {
    console.warn('[jobPolling] Failed to load active job:', error instanceof Error ? error.message : String(error));
    return null;
  }
};

export const clearActiveJob = async () => {
  try {
    await AsyncStorage.removeItem(JOB_STATE_KEY);
  } catch (error) {
    console.warn('[jobPolling] Failed to clear active job:', error instanceof Error ? error.message : String(error));
  }
};

export const backoffScheduleMs = [1000, 2000, 3000];

export const pollWithBackoff = async <T>(
  fn: () => Promise<T>,
  isTerminal: (payload: T) => boolean,
  options: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T> => {
  const { timeoutMs = 90_000, signal } = options;
  const start = Date.now();
  let attempt = 0;
  while (true) {
    if (signal?.aborted) {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      throw err;
    }
    const res = await fn();
    if (isTerminal(res)) return res;
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out while processing job.');
    }
    const delayMs = backoffScheduleMs[Math.min(attempt, backoffScheduleMs.length - 1)];
    attempt += 1;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, delayMs);
      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          },
          { once: true },
        );
      }
    });
  }
};

