import { ParsedRecipe } from '../../types/Recipe';

export const mapParsedRecipeToParams = (recipe: ParsedRecipe, jobId: string, warnings?: string[]) => {
  return {
    initialRecipe: {
      title: recipe.title ?? '',
      description: recipe.description ?? '',
      sourceUrl: recipe.source_url ?? '',
      tags: recipe.tags ?? [],
      servings: recipe.servings ?? null,
      prepMinutes: recipe.estimated_time_minutes ?? null,
      cookMinutes: null,
      imageUrl: recipe.image_url ?? '',
      ingredients:
        recipe.ingredients?.map((ing, idx) => ({
          id: `${jobId}-${idx}`,
          text: ing.text,
          quantityDisplay: ing.quantity_display ?? null,
          unit: ing.unit ?? null,
        })) ?? [],
      steps: recipe.steps ?? [],
      notes: recipe.notes ?? [],
    },
    parseWarnings: warnings ?? [],
    parseJobId: jobId,
    parsedUrl: recipe.source_url ?? '',
  };
};

// Normalize recipe_draft shape from ingestion jobs into a ParsedRecipe-compatible object.
export const mapRecipeDraftToParsed = (draft: any): ParsedRecipe => {
  const ingredients =
    draft?.ingredients?.map((ing: any) => ({
      text: ing?.name ? (ing?.notes ? `${ing.name} — ${ing.notes}` : ing.name) : '',
      quantity_display: ing?.quantity ?? null,
      unit: ing?.unit ?? null,
    })) ?? [];

  return {
    title: draft?.title ?? '',
    description: draft?.description ?? '',
    source_url: draft?.source?.source_url ?? draft?.source_url ?? null,
    image_url: draft?.source?.image_url ?? draft?.image_url ?? null,
    tags: draft?.tags ?? [],
    servings: draft?.servings ?? null,
    estimated_time_minutes: draft?.total_time_minutes ?? draft?.prep_time_minutes ?? null,
    ingredients,
    steps: draft?.steps ?? [],
    notes: draft?.notes ?? [],
  };
};

