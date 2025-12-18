export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert';

export type MealSlotRequest = {
  servings: number;
  tags?: string[];
  note?: string | null;
  is_meal_prep?: boolean;
  repeat?: { mode: 'same' | 'similar'; count: number } | null;
  pinned_recipe_id?: string | null;
};

export type DayMealRequest = Partial<Record<MealType, MealSlotRequest>>;

export type MealPlanGenerateRequest = {
  days: { date: string; meals: DayMealRequest }[];
  preferences?: {
    hard?: {
      allergens?: string[];
      excluded_ingredients?: string[];
      diet?: string | null;
    };
    soft?: {
      tags?: string[];
      cuisines?: string[];
      max_prep_minutes?: number;
      max_cook_minutes?: number;
    };
  };
  allow_external_recipes?: boolean;
};

export type Alternative = {
  source: 'user' | 'core' | 'stage';
  recipe_id: string;
  title: string;
  confidence: number;
  reason: string | null;
  matched_tags: string[];
};

export type MealSlotSelection = {
  source: 'user' | 'core' | 'stage';
  recipe_id: string;
  confidence?: number | null;
  matched_tags?: string[];
  warnings?: string[];
  alternatives?: Alternative[];
};

export type MealSlotResult = MealSlotRequest & {
  selection: MealSlotSelection | null;
};

export type DayMealResult = Partial<Record<MealType, MealSlotResult>>;

export type MealPlanResult = {
  days: { date: string; meals: DayMealResult }[];
};

export type MealPlanJobResponse = {
  id: string;
  request_id?: string;
  status: string;
  result?: MealPlanResult | null;
  error_code?: string | null;
  error_message?: string | null;
  message?: string | null;
};

export type ProgressMessage = {
  request_id: string;
  current_day?: string;
  current_meal?: MealType;
  completed_slots?: number;
  total_slots?: number;
  message?: string;
};
import { Recipe } from './Recipe';

export type PlannedMeal = {
  id: string;
  day: string;
  mealType: string;
  recipeId: string;
  recipe?: Recipe;
};

export type WeeklyPlan = {
  weekOf: string;
  meals: PlannedMeal[];
};

