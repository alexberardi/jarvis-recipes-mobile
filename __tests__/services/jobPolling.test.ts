/**
 * jobPolling: the resume-after-relaunch record and the backoff poller that
 * drives the URL/image import screens.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  backoffScheduleMs,
  clearActiveJob,
  loadActiveJob,
  pollWithBackoff,
  saveActiveJob,
} from '../../src/services/jobPolling';

const JOB = {
  jobId: 'job-1',
  jobType: 'url' as const,
  sourceUrl: 'https://example.test/recipe',
  startedAt: 1_700_000_000_000,
};

describe('jobPolling', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  describe('active job persistence', () => {
    it('round-trips a job so an import survives a relaunch', async () => {
      await saveActiveJob(JOB);
      expect(await loadActiveJob()).toEqual(JOB);

      await clearActiveJob();
      expect(await loadActiveJob()).toBeNull();
    });

    it('returns null rather than throwing on a corrupt record', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      await AsyncStorage.setItem('@jarvis_recipes/active_job', 'not json{');

      expect(await loadActiveJob()).toBeNull();
      warn.mockRestore();
    });
  });

  describe('pollWithBackoff', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns immediately when the first response is already terminal', async () => {
      const fn = jest.fn().mockResolvedValue({ status: 'COMPLETE' });

      await expect(
        pollWithBackoff(fn, (payload: any) => payload.status === 'COMPLETE'),
      ).resolves.toEqual({ status: 'COMPLETE' });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('keeps polling on the backoff schedule until the job is terminal', async () => {
      const fn = jest
        .fn()
        .mockResolvedValueOnce({ status: 'PENDING' })
        .mockResolvedValueOnce({ status: 'RUNNING' })
        .mockResolvedValueOnce({ status: 'COMPLETE' });

      const promise = pollWithBackoff(fn, (payload: any) => payload.status === 'COMPLETE');
      await jest.advanceTimersByTimeAsync(backoffScheduleMs[0] + backoffScheduleMs[1]);

      await expect(promise).resolves.toEqual({ status: 'COMPLETE' });
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('gives up once the overall timeout is past', async () => {
      const fn = jest.fn().mockResolvedValue({ status: 'PENDING' });

      const promise = pollWithBackoff(fn, (payload: any) => payload.status === 'COMPLETE', {
        timeoutMs: 1,
      });
      const assertion = expect(promise).rejects.toThrow('Timed out while processing job.');

      // The elapsed check runs after a poll, so the deadline is only noticed on
      // the second pass — one backoff wait has to actually elapse.
      await jest.advanceTimersByTimeAsync(backoffScheduleMs[0]);

      await assertion;
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('aborts before the first poll when the signal is already aborted', async () => {
      const fn = jest.fn().mockResolvedValue({ status: 'PENDING' });
      const controller = new AbortController();
      controller.abort();

      await expect(
        pollWithBackoff(fn, () => false, { signal: controller.signal }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(fn).not.toHaveBeenCalled();
    });

    it('aborts mid-wait so a cancelled screen stops polling', async () => {
      const fn = jest.fn().mockResolvedValue({ status: 'PENDING' });
      const controller = new AbortController();

      const promise = pollWithBackoff(fn, () => false, { signal: controller.signal });
      const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' });

      // Let the first poll resolve and the backoff wait begin, then cancel.
      await jest.advanceTimersByTimeAsync(0);
      controller.abort();

      await assertion;
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
