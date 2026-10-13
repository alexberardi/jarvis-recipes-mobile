import { availableTags, filterRecipes } from '../../src/utils/filterRecipes';
import { Recipe } from '../../src/types/Recipe';

const recipe = (over: Partial<Recipe> = {}): Recipe =>
  ({
    id: 1,
    user_id: '1',
    title: 'Tacos',
    ingredients: [],
    steps: [],
    tags: [],
    ...over,
  }) as Recipe;

const box: Recipe[] = [
  recipe({
    id: 1,
    title: 'Korean BBQ Chicken Tenders',
    tags: [{ id: 1, name: 'dinner' }, { id: 2, name: 'Alex' }],
    ingredients: [
      { id: 1, text: 'boneless, skinless chicken tenders' },
      { id: 2, text: 'gochujang (korean chili paste)' },
    ],
  }),
  recipe({
    id: 2,
    title: 'Steak and Fries',
    tags: [{ id: 1, name: 'dinner' }, { id: 3, name: 'steak' }],
    ingredients: [
      { id: 3, text: 'steaks, about 8 oz each' },
      { id: 4, text: 'russet potatoes' },
    ],
  }),
  recipe({
    id: 3,
    title: 'Bean and Cheese Quesadillas',
    tags: [{ id: 1, name: 'dinner' }, { id: 4, name: 'quick' }],
    ingredients: [{ id: 5, text: 'refried or black beans' }],
  }),
];

describe('filterRecipes', () => {
  it('returns everything when nothing is asked for', () => {
    expect(filterRecipes(box, {})).toHaveLength(3);
    expect(filterRecipes(box, { query: '   ', ingredient: '', tags: [] })).toHaveLength(3);
  });

  it('matches part of a title, case-insensitively', () => {
    expect(filterRecipes(box, { query: 'steak' }).map((r) => r.id)).toEqual([2]);
    expect(filterRecipes(box, { query: 'CHICKEN' }).map((r) => r.id)).toEqual([1]);
  });

  it('finds a recipe by an ingredient the title never mentions', () => {
    // The point of the advanced filter: "what can I make with potatoes?"
    expect(filterRecipes(box, { ingredient: 'potato' }).map((r) => r.id)).toEqual([2]);
    expect(filterRecipes(box, { ingredient: 'gochujang' }).map((r) => r.id)).toEqual([1]);
  });

  it('matches a partial ingredient word', () => {
    // Ingredient text carries prep clauses, so a whole-word match would miss
    // half of them.
    expect(filterRecipes(box, { ingredient: 'chick' }).map((r) => r.id)).toEqual([1]);
  });

  it('filters by tag', () => {
    expect(filterRecipes(box, { tags: ['steak'] }).map((r) => r.id)).toEqual([2]);
    expect(filterRecipes(box, { tags: ['dinner'] })).toHaveLength(3);
  });

  it('requires ALL selected tags, not any of them', () => {
    // Picking "dinner" and "quick" means a quick dinner; ANY would make the
    // second chip pointless.
    expect(filterRecipes(box, { tags: ['dinner', 'quick'] }).map((r) => r.id)).toEqual([3]);
    expect(filterRecipes(box, { tags: ['steak', 'quick'] })).toEqual([]);
  });

  it('matches tags case-insensitively', () => {
    expect(filterRecipes(box, { tags: ['alex'] }).map((r) => r.id)).toEqual([1]);
  });

  it('combines a query with a tag', () => {
    expect(filterRecipes(box, { query: 'and', tags: ['quick'] }).map((r) => r.id)).toEqual([3]);
    expect(filterRecipes(box, { query: 'steak', tags: ['quick'] })).toEqual([]);
  });

  it('combines a title query with an ingredient', () => {
    expect(filterRecipes(box, { query: 'steak', ingredient: 'potato' }).map((r) => r.id)).toEqual([
      2,
    ]);
    // Both must match, or the ingredient filter would widen the search instead
    // of narrowing it.
    expect(filterRecipes(box, { query: 'steak', ingredient: 'beans' })).toEqual([]);
  });

  it('survives a recipe with no tags or ingredients', () => {
    const sparse = [recipe({ id: 9, title: 'Leftovers' })];
    expect(filterRecipes(sparse, { query: 'left' }).map((r) => r.id)).toEqual([9]);
    expect(filterRecipes(sparse, { ingredient: 'anything' })).toEqual([]);
    expect(filterRecipes(sparse, { tags: ['dinner'] })).toEqual([]);
  });

  it('trims the query so a trailing space still matches', () => {
    expect(filterRecipes(box, { query: ' steak ' }).map((r) => r.id)).toEqual([2]);
  });
});

describe('availableTags', () => {
  it('lists each tag once, sorted', () => {
    expect(availableTags(box)).toEqual(['Alex', 'dinner', 'quick', 'steak']);
  });

  it('keeps the spelling the cook used', () => {
    const mixed = [
      recipe({ id: 1, tags: [{ id: 1, name: 'Dinner' }] }),
      recipe({ id: 2, tags: [{ id: 2, name: 'dinner' }] }),
    ];
    // One chip, not two -- matching is case-insensitive, so two would filter
    // identically and look like a bug.
    expect(availableTags(mixed)).toEqual(['Dinner']);
  });

  it('is empty for an empty box', () => {
    expect(availableTags([])).toEqual([]);
  });
});
