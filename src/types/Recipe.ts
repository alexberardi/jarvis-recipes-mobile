export type RecipeTag = {
  id: number;
  name: string;
};

export type RecipeIngredient = {
  id: number;
  text: string;
  /**
   * The amount lives in its own fields; `text` holds only the item. The API has
   * always returned these (IngredientRead), but this type omitted them, so the
   * detail screen could not show an amount even when one was stored.
   */
  quantity_display?: string | null;
  quantity_value?: number | null;
  unit?: string | null;
};

export type RecipeStep = {
  id: number;
  step_number: number;
  text: string;
};

export type Recipe = {
  id: number;
  user_id: string;
  title: string;
  description?: string | null;
  servings?: number | null;
  total_time_minutes?: number | null;
  source_type?: 'manual' | 'image' | 'url';
  source_url?: string | null;
  image_url?: string | null;
  created_at?: string;
  updated_at?: string;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  tags: RecipeTag[];
};

export type RecipeCreate = {
  title: string;
  description?: string | null;
  servings?: number | null;
  prep_time_minutes?: number | null;
  cook_time_minutes?: number | null;
  total_time_minutes?: number | null;
  source_type?: 'manual' | 'image' | 'url';
  source_url?: string | null;
  image_url?: string | null;
  ingredients: { text: string; quantity_display?: string | null; unit?: string | null }[];
  steps: { step_number: number; text: string }[];
  tags: string[];
  parse_job_id?: string;
};

export type NewIngredient = {
  id: string;
  text: string;
  quantityDisplay?: string | null;
  unit?: string | null;
};

export type ParsedRecipe = {
  title: string;
  description?: string | null;
  source_url?: string | null;
  image_url?: string | null;
  tags?: string[];
  servings?: number | null;
  estimated_time_minutes?: number | null;
  ingredients?: {
    text: string;
    quantity_display?: string | null;
    unit?: string | null;
  }[];
  steps?: string[];
  notes?: string[];
};

