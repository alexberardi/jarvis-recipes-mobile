/**
 * Render an ingredient the way a recipe reads: amount, unit, then the item.
 *
 * The amount is stored in its own columns (quantity_display, unit) and the text
 * holds only the item -- "boneless chicken breast", not "1½ lb boneless chicken
 * breast". RecipeDetailScreen rendered `text` alone, so every amount the server
 * had was invisible in the app: a recipe read "russet potatoes / olive oil /
 * garlic powder" with no quantities at all.
 *
 * quantity_display is deliberately the string the source used ("1 1/2", "1/4")
 * rather than the parsed number, so fractions read as fractions instead of
 * 1.5 and 0.25.
 */
export type IngredientParts = {
  text: string;
  quantity_display?: string | null;
  unit?: string | null;
};

export const formatIngredient = (ingredient: IngredientParts): string => {
  const amount = [ingredient.quantity_display, ingredient.unit]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' ');

  const text = ingredient.text?.trim() ?? '';
  if (!amount) return text;
  if (!text) return amount;

  // Some ingredients carry the amount in BOTH places -- "1 1/2 lb beef sirloin"
  // with quantity_display "1 1/2" and unit "lb". Prod data is currently the
  // clean shape (434 of 488 rows keep the amount only in its columns), but the
  // URL and photo importers build ingredients from LLM output, which is not
  // guaranteed to keep them apart. Prepending blindly would print "1 1/2 lb
  // 1 1/2 lb beef sirloin", so treat an amount the text already opens with as
  // already shown.
  if (text.toLowerCase().startsWith(amount.toLowerCase())) return text;

  return `${amount} ${text}`;
};
