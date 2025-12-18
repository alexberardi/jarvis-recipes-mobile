import { useQuery } from '@tanstack/react-query';

import { getRecipeById, getRecipes } from '../services/recipes';
import { Recipe } from '../types/Recipe';

export const RECIPES_QUERY_KEY = ['recipes'];

export const useRecipes = () =>
  useQuery({
    queryKey: RECIPES_QUERY_KEY,
    queryFn: getRecipes,
  });

export const useRecipe = (id?: number) =>
  useQuery<Recipe | undefined>({
    queryKey: [...RECIPES_QUERY_KEY, id],
    queryFn: () => (id ? getRecipeById(id) : Promise.resolve(undefined)),
    enabled: Boolean(id),
  });

