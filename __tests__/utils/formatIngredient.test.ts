import { formatIngredient } from '../../src/utils/formatIngredient';

// The amount is stored separately from the item, and RecipeDetailScreen used to
// render only the item -- so a recipe showed "russet potatoes / olive oil /
// garlic powder" with every quantity the server held invisible.

describe('formatIngredient', () => {
  it('puts the amount and unit before the item', () => {
    expect(
      formatIngredient({ text: 'boneless chicken breast', quantity_display: '1 1/2', unit: 'lbs' }),
    ).toBe('1 1/2 lbs boneless chicken breast');
  });

  it('keeps fractions as written rather than as decimals', () => {
    // quantity_display is the source string for exactly this reason; the parsed
    // quantity_value would render as 0.25.
    expect(formatIngredient({ text: 'oat flour', quantity_display: '1/4', unit: 'cup' })).toBe(
      '1/4 cup oat flour',
    );
  });

  it('handles an amount with no unit', () => {
    expect(formatIngredient({ text: 'onion, diced', quantity_display: '1', unit: null })).toBe(
      '1 onion, diced',
    );
  });

  it('handles a unit that is really a size', () => {
    expect(formatIngredient({ text: 'egg', quantity_display: '1', unit: 'large' })).toBe(
      '1 large egg',
    );
  });

  it('leaves an amount-less ingredient exactly as it reads', () => {
    // "Salt and pepper, to taste" carries no amount on purpose; it must not
    // gain a stray space or an invented quantity.
    expect(formatIngredient({ text: 'Salt and pepper, to taste' })).toBe(
      'Salt and pepper, to taste',
    );
    expect(
      formatIngredient({ text: 'Olive oil spray', quantity_display: null, unit: null }),
    ).toBe('Olive oil spray');
  });

  it('ignores whitespace-only amounts', () => {
    expect(formatIngredient({ text: 'garlic powder', quantity_display: '  ', unit: ' ' })).toBe(
      'garlic powder',
    );
  });

  it('trims without collapsing the gap between amount and item', () => {
    expect(
      formatIngredient({ text: '  sweet potatoes  ', quantity_display: ' 600 ', unit: ' g ' }),
    ).toBe('600 g sweet potatoes');
  });

  it('survives an amount with no item text', () => {
    expect(formatIngredient({ text: '', quantity_display: '2', unit: 'cups' })).toBe('2 cups');
  });
});

describe('formatIngredient with the amount duplicated in the text', () => {
  // The URL and photo importers build ingredients from LLM output, which is not
  // guaranteed to keep the amount out of the text the way the seed scripts do.
  it('does not print the amount twice', () => {
    expect(
      formatIngredient({
        text: '1 1/2 lb beef sirloin',
        quantity_display: '1 1/2',
        unit: 'lb',
      }),
    ).toBe('1 1/2 lb beef sirloin');
  });

  it('matches case-insensitively', () => {
    expect(
      formatIngredient({ text: '2 CUPS jasmine rice', quantity_display: '2', unit: 'cups' }),
    ).toBe('2 CUPS jasmine rice');
  });

  it('still prepends when the text merely starts with a different number', () => {
    // "2 lb" must not be swallowed just because the item begins with "2%".
    expect(
      formatIngredient({ text: '2% milk', quantity_display: '1', unit: 'cup' }),
    ).toBe('1 cup 2% milk');
  });

  it('prepends when only the quantity repeats but the unit does not', () => {
    expect(
      formatIngredient({ text: '1 onion, diced', quantity_display: '1', unit: 'small' }),
    ).toBe('1 small 1 onion, diced');
  });
});
