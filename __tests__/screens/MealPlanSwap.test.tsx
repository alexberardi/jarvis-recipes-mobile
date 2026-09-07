/**
 * Swapping a meal between two days.
 *
 * The rule that makes this tractable: a dinner only ever trades with another
 * dinner. Allowing cross-meal swaps would silently drop whichever meal had no
 * counterpart, and "move Tuesday's dinner to Wednesday" is what people actually
 * mean anyway.
 *
 * These test the swap as a pure transformation, which is what it is — no server
 * call, no re-generation.
 */
type Selection = { source: string; recipe_id: string };
type Slot = { servings?: number; tags?: string[]; selection?: Selection | null };
type Day = { date: string; meals: Record<string, Slot> };

/** Mirrors swapDays in MealPlanResultsScreen. */
const swapDays = (days: Day[], meal: string, dateA: string, dateB: string): Day[] => {
  const a = days.find((d) => d.date === dateA)?.meals?.[meal];
  const b = days.find((d) => d.date === dateB)?.meals?.[meal];
  if (!a || !b) return days;
  return days.map((day) => {
    if (day.date !== dateA && day.date !== dateB) return day;
    const incoming = day.date === dateA ? b : a;
    const own = day.date === dateA ? a : b;
    return { ...day, meals: { ...day.meals, [meal]: { ...own, selection: incoming.selection } } };
  });
};

const days = (): Day[] => [
  {
    date: '2026-09-08',
    meals: {
      dinner: { servings: 2, tags: ['quick'], selection: { source: 'user', recipe_id: '10' } },
      lunch: { servings: 1, selection: { source: 'user', recipe_id: '30' } },
    },
  },
  {
    date: '2026-09-09',
    meals: {
      dinner: { servings: 5, tags: ['american'], selection: { source: 'user', recipe_id: '20' } },
    },
  },
];

test('the two recipes change places', () => {
  const out = swapDays(days(), 'dinner', '2026-09-08', '2026-09-09');

  expect(out[0].meals.dinner.selection?.recipe_id).toBe('20');
  expect(out[1].meals.dinner.selection?.recipe_id).toBe('10');
});

test('servings and tags stay with the DAY, not the recipe', () => {
  // "Tuesday dinner, 5 people" describes the slot. Moving a recipe into it must
  // not drag another day's serving count along.
  const out = swapDays(days(), 'dinner', '2026-09-08', '2026-09-09');

  expect(out[0].meals.dinner.servings).toBe(2);
  expect(out[0].meals.dinner.tags).toEqual(['quick']);
  expect(out[1].meals.dinner.servings).toBe(5);
  expect(out[1].meals.dinner.tags).toEqual(['american']);
});

test('other meals on the same day are untouched', () => {
  const out = swapDays(days(), 'dinner', '2026-09-08', '2026-09-09');

  expect(out[0].meals.lunch.selection?.recipe_id).toBe('30');
});

test('swapping into a day with no such meal is a no-op', () => {
  // 09-09 has no lunch. Without this guard the swap would blank 09-08's lunch.
  const out = swapDays(days(), 'lunch', '2026-09-08', '2026-09-09');

  expect(out[0].meals.lunch.selection?.recipe_id).toBe('30');
});

test('swapping twice returns the plan to where it started', () => {
  const once = swapDays(days(), 'dinner', '2026-09-08', '2026-09-09');
  const twice = swapDays(once, 'dinner', '2026-09-08', '2026-09-09');

  expect(twice[0].meals.dinner.selection?.recipe_id).toBe('10');
  expect(twice[1].meals.dinner.selection?.recipe_id).toBe('20');
});


// ── Exclusion ids sent to the server ─────────────────────────────────────────

/** Mirrors usedRecipeIds in MealPlanResultsScreen. */
const usedRecipeIds = (days: Day[]): number[] =>
  days.flatMap((day) =>
    Object.values(day.meals ?? {}).flatMap((slot) => {
      const id = slot?.selection?.recipe_id;
      if (!id) return [];
      const n = Number(id);
      return Number.isInteger(n) ? [n] : [];
    }),
  );

test('a staged recipe does not poison the exclusion list', () => {
  // Staged picks carry a stage_recipes UUID. Number(uuid) is NaN, which
  // JSON.stringify writes as null, and the server's List[int] rejects null with
  // a 422 -- one staged slot used to break re-roll and shuffle for the whole
  // plan. Verified against the API: [null] -> 422, [1] -> 200.
  const withStage: Day[] = [
    {
      date: '2026-09-07',
      meals: {
        dinner: { selection: { source: 'stage', recipe_id: 'f7f4e51c-e8bc-4d98-8859-7a4529923bd2' } },
      },
    },
    { date: '2026-09-08', meals: { dinner: { selection: { source: 'user', recipe_id: '20' } } } },
  ];

  const ids = usedRecipeIds(withStage);

  expect(ids).toEqual([20]);
  expect(ids.some(Number.isNaN)).toBe(false);
});

test('ordinary numeric ids are all kept', () => {
  expect(usedRecipeIds(days())).toEqual(expect.arrayContaining([10, 30, 20]));
});

test('an empty slot contributes nothing', () => {
  const withEmpty: Day[] = [{ date: '2026-09-07', meals: { dinner: { selection: null } } }];

  expect(usedRecipeIds(withEmpty)).toEqual([]);
});
