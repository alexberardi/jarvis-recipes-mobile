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

