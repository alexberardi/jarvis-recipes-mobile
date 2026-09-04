/**
 * The thin service clients over `recipesRequest`. `recipesRequest` itself is
 * mocked here — its retry/refresh behaviour is covered in api/recipesApi.test —
 * so what these assert is the request each function actually builds: path,
 * method and body. A wrong verb or a mis-templated id is the whole failure mode
 * of a module this thin.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { recipesRequest } from '../../src/api/recipesApi';
import {
  clearMealPlanJob,
  generateMealPlanJob,
  getMealPlanJob,
  getRecipeBySource,
  loadMealPlanJob,
  saveMealPlanJob,
  sortMealPlanDays,
} from '../../src/services/mealPlans';
import {
  abandonParseJob,
  cancelJob,
  enqueueParseUrl,
  getParseJobStatus,
  getParseJobs,
  submitParsePayload,
} from '../../src/services/parseRecipe';
import {
  createRecipe,
  deleteRecipe,
  getRecipeById,
  getRecipes,
  updateRecipe,
  uploadRecipeImage,
} from '../../src/services/recipes';
import { createTag, getTags } from '../../src/services/tags';

jest.mock('../../src/api/recipesApi', () => ({
  __esModule: true,
  default: { request: jest.fn() },
  recipesRequest: jest.fn(),
}));

const request = recipesRequest as jest.Mock;

describe('service clients', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    request.mockResolvedValue({});
    await AsyncStorage.clear();
  });

  describe('recipes', () => {
    it('lists recipes', async () => {
      await getRecipes();
      expect(request).toHaveBeenCalledWith({ url: '/recipes', method: 'GET' });
    });

    it('fetches one recipe by id', async () => {
      await getRecipeById(42);
      expect(request).toHaveBeenCalledWith({ url: '/recipes/42', method: 'GET' });
    });

    it('creates a recipe with the payload as the body', async () => {
      const payload = { title: 'Tacos', ingredients: [], steps: [], tags: [] };
      await createRecipe(payload);
      expect(request).toHaveBeenCalledWith({
        url: '/recipes',
        method: 'POST',
        data: payload,
      });
    });

    it('updates with PATCH, not PUT', async () => {
      await updateRecipe(42, { title: 'Better Tacos' });
      expect(request).toHaveBeenCalledWith({
        url: '/recipes/42',
        method: 'PATCH',
        data: { title: 'Better Tacos' },
      });
    });

    it('deletes a recipe', async () => {
      await deleteRecipe(42);
      expect(request).toHaveBeenCalledWith({ url: '/recipes/42', method: 'DELETE' });
    });
  });

  describe('uploadRecipeImage', () => {
    it('posts multipart form data and returns the image url', async () => {
      request.mockResolvedValue({ image_url: 'https://example.test/a.jpg' });

      const url = await uploadRecipeImage({ uri: 'file:///a.jpg' });

      expect(url).toBe('https://example.test/a.jpg');
      const config = request.mock.calls[0][0];
      expect(config).toMatchObject({
        url: '/recipes/import/image',
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      expect(config.data).toBeInstanceOf(FormData);
    });

    it('throws when the server answers without an image url', async () => {
      request.mockResolvedValue({});

      await expect(uploadRecipeImage({ uri: 'file:///a.jpg' })).rejects.toThrow(
        'No image_url returned from upload',
      );
    });
  });

  describe('tags', () => {
    it('lists tags', async () => {
      await getTags();
      expect(request).toHaveBeenCalledWith({ url: '/tags', method: 'GET' });
    });

    it('creates a tag by name', async () => {
      await createTag('Weeknight');
      expect(request).toHaveBeenCalledWith({
        url: '/tags',
        method: 'POST',
        data: { name: 'Weeknight' },
      });
    });
  });

  describe('parse jobs', () => {
    it('enqueues a url parse with the llm fallback on', async () => {
      await enqueueParseUrl('https://example.test/recipe');
      expect(request).toHaveBeenCalledWith({
        url: '/recipes/parse-url/async',
        method: 'POST',
        data: { url: 'https://example.test/recipe', use_llm_fallback: true },
      });
    });

    it('bubbles a server error to the caller', async () => {
      request.mockRejectedValue(
        Object.assign(new Error('Bad Request'), { response: { status: 400 } }),
      );

      await expect(enqueueParseUrl('nope')).rejects.toMatchObject({
        response: { status: 400 },
      });
    });

    it('reads job status, the job list, abandon and cancel from their own paths', async () => {
      await getParseJobStatus('job-1');
      await getParseJobs();
      await abandonParseJob('job-1');
      await cancelJob('job-1');

      expect(request.mock.calls.map((call) => call[0])).toEqual([
        { url: '/recipes/jobs/job-1', method: 'GET' },
        { url: '/recipes/parse-url/jobs', method: 'GET' },
        { url: '/recipes/parse-url/jobs/job-1/abandon', method: 'POST' },
        { url: '/recipes/jobs/job-1/cancel', method: 'POST' },
      ]);
    });

    it('submits a pre-parsed payload', async () => {
      await submitParsePayload({ title: 'Tacos' });
      expect(request).toHaveBeenCalledWith({
        url: '/recipes/parse-payload/async',
        method: 'POST',
        data: { title: 'Tacos' },
      });
    });
  });

  describe('meal plans', () => {
    it('posts a generate request and reads a job back', async () => {
      const payload = { days: [{ date: '2026-08-24', meals: {} }] };
      await generateMealPlanJob(payload);
      await getMealPlanJob('mp-1');

      expect(request.mock.calls.map((call) => call[0])).toEqual([
        { url: '/meal-plans/generate/jobs', method: 'POST', data: payload },
        { url: '/meal-plans/generate/jobs/mp-1', method: 'GET' },
      ]);
    });

    it('round-trips the in-progress job through AsyncStorage', async () => {
      await saveMealPlanJob('mp-1', 'req-1');

      const loaded = await loadMealPlanJob();
      expect(loaded).toMatchObject({ jobId: 'mp-1', requestId: 'req-1' });

      await clearMealPlanJob();
      expect(await loadMealPlanJob()).toBeNull();
    });

    it('returns null rather than throwing on a corrupt stored job', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      await AsyncStorage.setItem('@jarvis_recipes/mealplan_job', 'not json{');

      expect(await loadMealPlanJob()).toBeNull();
      warn.mockRestore();
    });

    it('caches a recipe fetched by source so the second read is free', async () => {
      request.mockResolvedValue({ id: 1, title: 'Tacos' });

      const first = await getRecipeBySource('core', 'cached-abc');
      const second = await getRecipeBySource('core', 'cached-abc');

      expect(first).toBe(second);
      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith({
        url: '/recipes/core/cached-abc',
        method: 'GET',
      });
    });

    it('sorts plan days by date and tolerates a missing result', () => {
      const result = {
        days: [{ date: '2026-08-26' }, { date: '2026-08-24' }, { date: '2026-08-25' }],
      } as any;

      expect(sortMealPlanDays(result).map((day: any) => day.date)).toEqual([
        '2026-08-24',
        '2026-08-25',
        '2026-08-26',
      ]);
      expect(sortMealPlanDays(null)).toEqual([]);
      expect(sortMealPlanDays()).toEqual([]);
    });
  });
});
