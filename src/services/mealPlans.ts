import AsyncStorage from '@react-native-async-storage/async-storage';

import { recipesRequest } from '../api/recipesApi';
import { MealPlanGenerateRequest, MealPlanJobResponse, MealPlanResult } from '../types/MealPlan';
import { Recipe } from '../types/Recipe';

const MEALPLAN_JOB_KEY = '@jarvis_recipes/mealplan_job';

export const generateMealPlanJob = async (
  payload: MealPlanGenerateRequest,
): Promise<{ job_id: string; request_id?: string }> => {
  const res = await recipesRequest<{ job_id: string; request_id?: string }>({
    url: '/meal-plans/generate/jobs',
    method: 'POST',
    data: payload,
  });
  return res;
};

export const getMealPlanJob = async (jobId: string): Promise<MealPlanJobResponse> => {
  const res = await recipesRequest<MealPlanJobResponse>({
    url: `/meal-plans/generate/jobs/${jobId}`,
    method: 'GET',
  });
  return res;
};

export const saveMealPlanJob = async (jobId: string, requestId?: string) => {
  try {
    await AsyncStorage.setItem(
      MEALPLAN_JOB_KEY,
      JSON.stringify({ jobId, requestId, startedAt: Date.now() }),
    );
  } catch (error) {
    console.warn('[mealPlans] Failed to save meal plan job:', error instanceof Error ? error.message : String(error));
  }
};

export const loadMealPlanJob = async (): Promise<{ jobId: string; requestId?: string } | null> => {
  try {
    const raw = await AsyncStorage.getItem(MEALPLAN_JOB_KEY);
    return raw ? (JSON.parse(raw) as { jobId: string; requestId?: string }) : null;
  } catch (error) {
    console.warn('[mealPlans] Failed to load meal plan job:', error instanceof Error ? error.message : String(error));
    return null;
  }
};

export const clearMealPlanJob = async () => {
  try {
    await AsyncStorage.removeItem(MEALPLAN_JOB_KEY);
  } catch (error) {
    console.warn('[mealPlans] Failed to clear meal plan job:', error instanceof Error ? error.message : String(error));
  }
};

const recipeCache = new Map<string, Recipe>();

/**
 * Drop the cache above.
 *
 * Process-lifetime by design -- a recipe body does not change while a plan is
 * being reviewed, and the results screen would otherwise refetch the same recipe
 * for every slot it appears in. Tests need to clear it between cases, since a
 * cached title from one case silently answers the next one's assertion without
 * any request being made.
 */
export const resetRecipeCache = () => recipeCache.clear();

export const getRecipeBySource = async (source: string, id: string): Promise<Recipe> => {
  const key = `${source}:${id}`;
  if (recipeCache.has(key)) return recipeCache.get(key)!;
  const res = await recipesRequest<Recipe>({
    url: `/recipes/${source}/${id}`,
    method: 'GET',
  });
  recipeCache.set(key, res);
  return res;
};

export const sortMealOrder = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert'] as const;

export const sortMealPlanDays = (result?: MealPlanResult | null) =>
  (result?.days ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));


// ── Random plans ──────────────────────────────────────────────────────────────
// The default planning path. Synchronous: no job id, no polling, no progress
// screen. See jarvis-recipes-server/app/services/random_plan_service.py.

export type RandomSlot = {
  date: string;
  meal_type: string;
};

export type RandomSlotResult = {
  date?: string | null;
  meal_type: string;
  recipe_id?: number | null;
  title?: string | null;
  image_url?: string | null;
  total_time_minutes?: number | null;
  servings?: number | null;
};

export type RandomPlanResponse = {
  slots: RandomSlotResult[];
  /** The box ran out before every slot was filled. */
  incomplete: boolean;
};

export const randomPlan = async (
  slots: RandomSlot[],
  excludeRecipeIds: number[] = [],
): Promise<RandomPlanResponse> => {
  const res = await recipesRequest<RandomPlanResponse>({
    url: '/meal-plans/random',
    method: 'POST',
    data: { slots, exclude_recipe_ids: excludeRecipeIds },
  });
  return res;
};

/**
 * Swap one slot. `excludeRecipeIds` should be everything currently on screen so
 * the replacement is neither the rejected recipe nor a duplicate of another slot.
 */
export const rerollSlot = async (
  mealType: string,
  excludeRecipeIds: number[],
  tags: string[] = [],
): Promise<RandomSlotResult> => {
  const res = await recipesRequest<RandomSlotResult>({
    url: '/meal-plans/random/reroll',
    method: 'POST',
    data: { meal_type: mealType, exclude_recipe_ids: excludeRecipeIds, tags },
  });
  return res;
};


// ── Committing a plan ─────────────────────────────────────────────────────────
// Commit turns a proposal into household data. Anything the planner STAGED is
// materialised into a real recipe server-side, which is why each item carries
// its source: a staged id is not a recipe id until commit runs.

export type CommitItem = {
  date: string;
  meal_type: string;
  recipe_id: number;
  source?: 'user' | 'stage';
};

export type CommittedPlan = {
  id: number;
  start_date: string;
  name?: string | null;
};

export const commitPlan = async (
  startDate: string,
  items: CommitItem[],
  name?: string,
): Promise<CommittedPlan> => {
  const res = await recipesRequest<CommittedPlan>({
    url: '/planner/commit',
    method: 'POST',
    data: { start_date: startDate, name, items },
  });
  return res;
};
