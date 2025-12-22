import { recipesRequest } from '../api/recipesApi';
import { Recipe, RecipeCreate } from '../types/Recipe';

export const getRecipes = async (): Promise<Recipe[]> => {
  return recipesRequest<Recipe[]>({ url: '/recipes', method: 'GET' });
};

export const getRecipeById = async (id: number): Promise<Recipe> => {
  return recipesRequest<Recipe>({ url: `/recipes/${id}`, method: 'GET' });
};

export const createRecipe = async (payload: RecipeCreate & { parse_job_id?: string }): Promise<Recipe> => {
  return recipesRequest<Recipe>({ url: '/recipes', method: 'POST', data: payload });
};

export type RecipeUpdate = {
  title?: string;
  description?: string | null;
  servings?: number | null;
  prep_time_minutes?: number | null;
  cook_time_minutes?: number | null;
  total_time_minutes?: number | null;
  source_type?: 'manual' | 'image' | 'url';
  source_url?: string | null;
  image_url?: string | null;
  ingredients?: { text: string; quantity_display?: string | null; unit?: string | null }[];
  steps?: { step_number: number; text: string }[];
  tags?: string[];
};

export const updateRecipe = async (id: number, payload: RecipeUpdate): Promise<Recipe> => {
  return recipesRequest<Recipe>({ url: `/recipes/${id}`, method: 'PATCH', data: payload });
};

export const deleteRecipe = async (id: number): Promise<void> => {
  return recipesRequest<void>({ url: `/recipes/${id}`, method: 'DELETE' });
};

export const uploadRecipeImage = async (file: {
  uri: string;
  name?: string;
  type?: string;
}): Promise<string> => {
  const formData = new FormData();
  formData.append('file', {
    uri: file.uri,
    name: file.name ?? 'recipe.jpg',
    type: file.type ?? 'image/jpeg',
  } as any);

  const res = await recipesRequest<any>({
    url: '/recipes/import/image',
    method: 'POST',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  const imageUrl = (res as any)?.image_url;
  if (!imageUrl) {
    throw new Error('No image_url returned from upload');
  }
  return imageUrl;
};

