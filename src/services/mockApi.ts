import recipesData from '../mocks/recipes.json';
import mealPlansData from '../mocks/mealPlans.json';
import { Recipe, RecipeDTO } from '../types/Recipe';
import { WeeklyPlan } from '../types/MealPlan';
import { ImageSourcePropType } from 'react-native';

type MealPlanDTO = typeof mealPlansData;

const recipeImages: Record<string, ImageSourcePropType> = {
  mediterranean_salad: require('../../assets/recipes/mediterranean-salad.png'),
  chicken_tacos: require('../../assets/recipes/chicken-tacos.png'),
  sheet_pan_salmon: require('../../assets/recipes/sheet-pan-salmon.png'),
  veggie_stir_fry: require('../../assets/recipes/veggie-stir-fry.png'),
  placeholder: require('../../assets/recipes/placeholder.png'),
};

const mapRecipe = (recipe: RecipeDTO): Recipe => ({
  ...recipe,
  image: recipeImages[recipe.imageKey] ?? recipeImages.placeholder,
});

export const getRecipes = async (): Promise<Recipe[]> =>
  Promise.resolve(recipesData.map(mapRecipe));

export const getRecipeById = async (id: string): Promise<Recipe | undefined> => {
  const recipe = recipesData.find((item) => item.id === id);
  return Promise.resolve(recipe ? mapRecipe(recipe) : undefined);
};

export const getWeeklyPlan = async (): Promise<WeeklyPlan> => {
  const recipes = recipesData.map(mapRecipe);
  const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  const mappedMeals = (mealPlansData as MealPlanDTO).meals.map((meal) => ({
    ...meal,
    recipe: recipeMap.get(meal.recipeId),
  }));

  return Promise.resolve({
    weekOf: mealPlansData.weekOf,
    meals: mappedMeals,
  });
};

