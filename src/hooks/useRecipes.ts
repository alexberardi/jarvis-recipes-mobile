import { useQuery } from '@tanstack/react-query';

import { getRecipeById, getRecipes } from '../services/recipes';
import { getRecipeBySource } from '../services/mealPlans';
import { Recipe } from '../types/Recipe';

export const RECIPES_QUERY_KEY = ['recipes'];

export const useRecipes = () =>
  useQuery({
    queryKey: RECIPES_QUERY_KEY,
    queryFn: getRecipes,
  });

/**
 * A recipe, by committed id or by (source, id).
 *
 * `source` exists for meal-plan drill-in. The planner stages core recipes, so a
 * slot may reference a stage_recipes UUID that /recipes/{id} cannot parse -- it
 * expects an integer and 422s. Passing the source routes to /recipes/{source}/{id}
 * instead.
 */
export const useRecipe = (id?: number | string, source?: string) =>
  useQuery<Recipe | undefined>({
    queryKey: [...RECIPES_QUERY_KEY, source ?? 'user', id],
    queryFn: () => {
      if (!id) return Promise.resolve(undefined);
      if (source && source !== 'user') return getRecipeBySource(source, String(id));
      return getRecipeById(Number(id));
    },
    enabled: Boolean(id),
  });

