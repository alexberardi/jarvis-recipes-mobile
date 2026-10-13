import { Recipe } from '../types/Recipe';

/**
 * Narrow the recipe box by title, tags and ingredient.
 *
 * All client-side on purpose: GET /recipes takes no query parameters and
 * already returns every recipe with its tags and ingredients, so filtering
 * here costs one pass over data the app has and makes typing feel instant.
 * Worth revisiting if the box ever outgrows a single response.
 */
export type RecipeFilters = {
  /** Matches the title. */
  query?: string;
  /** Tag names. A recipe must carry ALL of them. */
  tags?: string[];
  /** Matches an ingredient's text. */
  ingredient?: string;
};

const norm = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

export const filterRecipes = (recipes: Recipe[], filters: RecipeFilters): Recipe[] => {
  const query = norm(filters.query);
  const ingredient = norm(filters.ingredient);
  const tags = (filters.tags ?? []).map(norm).filter(Boolean);

  if (!query && !ingredient && !tags.length) return recipes;

  return recipes.filter((recipe) => {
    if (query && !norm(recipe.title).includes(query)) return false;

    if (ingredient) {
      // Substring rather than whole-word: "chick" should find chicken, and
      // ingredient text carries prep clauses ("chicken thighs, trimmed") that a
      // whole-word match would miss half of.
      const hit = (recipe.ingredients ?? []).some((item) => norm(item.text).includes(ingredient));
      if (!hit) return false;
    }

    if (tags.length) {
      // ALL, not ANY: picking "dinner" and "quick" means a quick dinner, which
      // is the only reading that makes a second tag useful.
      const names = (recipe.tags ?? []).map((tag) => norm(tag.name));
      if (!tags.every((wanted) => names.includes(wanted))) return false;
    }

    return true;
  });
};

/** Tag names present in the box, sorted, for the filter chips. */
export const availableTags = (recipes: Recipe[]): string[] => {
  const seen = new Map<string, string>();
  for (const recipe of recipes) {
    for (const tag of recipe.tags ?? []) {
      const key = norm(tag.name);
      // Keep the first spelling seen so the chip reads as the cook wrote it,
      // while matching stays case-insensitive.
      if (key && !seen.has(key)) seen.set(key, tag.name);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
};
