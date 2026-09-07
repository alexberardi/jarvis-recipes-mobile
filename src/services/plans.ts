/**
 * Saved meal plans.
 *
 * Separate from services/mealPlans, which is about MAKING a plan (random picks,
 * the LLM job, committing). This is about the plans that already exist.
 */
import { recipesRequest } from '../api/recipesApi';

export type PlanSummary = {
  id: number;
  name?: string | null;
  /** Derived from the meals, not the row: a plan for Mon/Tue/Fri is 3 days. */
  start_date: string;
  end_date: string;
  meal_count: number;
  created_at: string;
};

export type PlanItem = {
  id: number;
  date: string;
  meal_type: string;
  recipe_id: number;
  /** Denormalised server-side so a 21-meal plan is one request, not twenty-two. */
  title?: string | null;
  image_url?: string | null;
  total_time_minutes?: number | null;
};

export type Plan = {
  id: number;
  user_id: string;
  name?: string | null;
  start_date: string;
  items: PlanItem[];
};

export const listPlans = async (): Promise<PlanSummary[]> =>
  recipesRequest<PlanSummary[]>({ url: '/planner/plans', method: 'GET' });

export const getPlan = async (id: number): Promise<Plan> =>
  recipesRequest<Plan>({ url: `/planner/plans/${id}`, method: 'GET' });

export const deletePlan = async (id: number): Promise<void> =>
  recipesRequest<void>({ url: `/planner/plans/${id}`, method: 'DELETE' });

/**
 * The plan to show for "what are we eating".
 *
 * The server returns `{}` rather than 404 when there is none, because "no plan
 * yet" is the normal state for a new household and not an error worth a red
 * screen. Normalised to null here so callers can just check for it.
 */
export const getCurrentPlan = async (): Promise<Plan | null> => {
  const res = await recipesRequest<Plan | Record<string, never>>({
    url: '/planner/current',
    method: 'GET',
  });
  return res && 'id' in res ? (res as Plan) : null;
};

/** Meals grouped by day, in date then meal-of-day order. */
export const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert'] as const;

export const groupByDay = (items: PlanItem[]): { date: string; meals: PlanItem[] }[] => {
  const days = new Map<string, PlanItem[]>();
  for (const item of items) {
    const bucket = days.get(item.date) ?? [];
    bucket.push(item);
    days.set(item.date, bucket);
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, meals]) => ({
      date,
      // By time of day, never by insertion: the server returns items in whatever
      // order they were committed, which is the order the picker was tapped.
      meals: [...meals].sort(
        (a, b) =>
          MEAL_ORDER.indexOf(a.meal_type as any) - MEAL_ORDER.indexOf(b.meal_type as any),
      ),
    }));
};
