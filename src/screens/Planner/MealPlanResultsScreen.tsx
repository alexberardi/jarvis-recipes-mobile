import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Chip,
  Dialog,
  HelperText,
  IconButton,
  Portal,
  Text,
} from 'react-native-paper';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PlannerStackParamList } from '../../navigation/types';
import {
  clearMealPlanJob,
  commitPlan,
  getMealPlanJob,
  getRecipeBySource,
  rerollSlot,
  sortMealOrder,
  sortMealPlanDays,
} from '../../services/mealPlans';
import { Alternative, MealPlanResult, MealSlotResult, MealType } from '../../types/MealPlan';
import { Recipe } from '../../types/Recipe';

type Props = NativeStackScreenProps<PlannerStackParamList, 'MealPlanResults'>;

const noMatchMessage =
  'Could not find a recipe fitting your criteria. Try loosening your constraints or adding recipes that fit the selections.';

// A slot can fail for two quite different reasons, and telling them apart is the
// difference between actionable and baffling. "Add recipes that fit" is wrong
// advice when a matching recipe exists and is simply booked for another day.
const alreadyUsedMessage =
  'Every recipe with these tags is already used elsewhere in this plan. Re-roll another day, pick different tags, or add another recipe with this tag.';

const isAlreadyUsed = (selection?: { warnings?: string[] | null } | null) =>
  (selection?.warnings ?? []).some((w) => w.startsWith('already_used'));

const MealPlanResultsScreen = ({ navigation, route }: Props) => {
  const { jobId } = route.params ?? {};
  const [result, setResult] = useState<MealPlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [recipes, setRecipes] = useState<Record<string, Recipe>>({});
  const [expandedAlternatives, setExpandedAlternatives] = useState<Record<string, boolean>>({});
  const [rerolling, setRerolling] = useState<string | null>(null);
  const [shuffling, setShuffling] = useState(false);
  const [swapModal, setSwapModal] = useState<{ date: string; meal: MealType } | null>(null);
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(false);

  useEffect(() => {
    const load = async () => {
      // `MealPlanResults` is reachable with no params at all, so there is no job
      // to poll — say so instead of requesting /jobs/undefined.
      if (!jobId) {
        setError('No meal plan to show. Generate a plan first.');
        setLoading(false);
        return;
      }
      try {
        const res = await getMealPlanJob(jobId);
        const normalizedResult = (res as any)?.result?.result ?? res.result;
        if (res.status !== 'COMPLETE' || !normalizedResult) {
          setError('Meal plan not ready yet. Please try again.');
          return;
        }
        setResult(normalizedResult);

        // Pre-fetch all recipe titles for primary selections
        const recipesToFetch: Array<{ source: string; id: string }> = [];
        normalizedResult.days?.forEach((day: any) => {
          Object.values(day.meals || {}).forEach((slot: any) => {
            if (slot?.selection) {
              recipesToFetch.push({
                source: slot.selection.source,
                id: slot.selection.recipe_id,
              });
            }
          });
        });

        // Fetch recipes in parallel
        await Promise.all(
          recipesToFetch.map(async ({ source, id }) => {
            try {
              await fetchRecipe(source, id);
            } catch (error) {
              console.warn('[MealPlanResults] Failed to fetch recipe:', source, id, error instanceof Error ? error.message : String(error));
            }
          }),
        );
      } catch (err: any) {
        setError(err?.message || 'Unable to load meal plan.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [jobId]);

  const days = useMemo(() => (result ? sortMealPlanDays(result) : []), [result]);

  const fetchRecipe = async (source: string, id: string) => {
    const key = `${source}:${id}`;
    if (recipes[key]) return recipes[key];
    const rec = await getRecipeBySource(source, id);
    setRecipes((prev) => ({ ...prev, [key]: rec }));
    return rec;
  };

  /** Every recipe currently on the plan, so a re-roll cannot duplicate one. */
  const usedRecipeIds = (plan: MealPlanResult | null): number[] =>
    (plan?.days ?? []).flatMap((day) =>
      Object.values(day.meals ?? {}).flatMap((slot: any) => {
        const id = slot?.selection?.recipe_id;
        if (!id) return [];
        // STAGED picks carry a stage_recipes UUID, not an integer. Number(uuid)
        // is NaN, JSON.stringify turns NaN into null, and the server's
        // exclude_recipe_ids: List[int] rejects null with a 422 -- so a single
        // staged slot broke re-roll and shuffle for the whole plan.
        //
        // Dropping them is correct, not just safe: a staged recipe is not in the
        // recipes table, so the random picker could never return it anyway and
        // there is nothing to exclude.
        const n = Number(id);
        return Number.isInteger(n) ? [n] : [];
      }),
    );

  /**
   * Re-roll one slot of a generated plan.
   *
   * Uses the same random endpoint as the quick planner rather than re-running the
   * LLM: the person has already seen the LLM's choice and rejected it, so what
   * they want is a different recipe now, not another twenty seconds of thinking.
   * The slot's own tags are sent so the swap still respects how it was configured.
   */
  const rerollSlot_ = async (date: string, meal: MealType) => {
    const slotKey = `${date}-${meal}`;
    setRerolling(slotKey);
    setError(null);
    try {
      const slot = result?.days
        ?.find((d) => d.date === date)
        ?.meals?.[meal] as MealSlotResult | undefined;

      const replacement = await rerollSlot(meal, usedRecipeIds(result), slot?.tags ?? []);
      if (!replacement.recipe_id) return;

      const key = `user:${replacement.recipe_id}`;
      setRecipes((prev) => ({
        ...prev,
        [key]: { id: replacement.recipe_id, title: replacement.title } as any,
      }));

      setResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          days: prev.days.map((day) => {
            if (day.date !== date) return day;
            const mealSlot = (day.meals as any)?.[meal] as MealSlotResult | undefined;
            if (!mealSlot) return day;
            return {
              ...day,
              meals: {
                ...day.meals,
                [meal]: {
                  ...mealSlot,
                  selection: {
                    source: 'user',
                    recipe_id: String(replacement.recipe_id),
                    confidence: null,
                    matched_tags: [],
                    // Re-rolled by hand, so the LLM's alternatives no longer
                    // describe this slot.
                    warnings: [],
                    alternatives: [],
                  },
                },
              },
            };
          }),
        };
      });
    } catch (err: any) {
      setError(
        err?.response?.status === 409
          ? 'No other recipe to swap in. Add more recipes to your box.'
          : err?.response?.data?.detail || err?.message || 'Could not re-roll that meal.',
      );
    } finally {
      setRerolling(null);
    }
  };

  /**
   * Days that could take this slot's meal -- i.e. that have the SAME meal type.
   *
   * Swapping a dinner into a lunch slot would be nonsense (and would silently
   * lose whichever meal had no counterpart), so the modal only ever offers days
   * that already have the same meal planned.
   */
  const swappableDays = (date: string, meal: MealType): string[] =>
    (result?.days ?? [])
      .filter((d) => d.date !== date && (d.meals as any)?.[meal]?.selection)
      .map((d) => d.date);

  /** Exchange two days' selections for one meal type. Purely local. */
  const swapDays = (meal: MealType, dateA: string, dateB: string) => {
    setResult((prev) => {
      if (!prev) return prev;
      const a = (prev.days.find((d) => d.date === dateA)?.meals as any)?.[meal];
      const b = (prev.days.find((d) => d.date === dateB)?.meals as any)?.[meal];
      if (!a || !b) return prev;

      return {
        ...prev,
        days: prev.days.map((day) => {
          if (day.date !== dateA && day.date !== dateB) return day;
          const incoming = day.date === dateA ? b : a;
          const own = day.date === dateA ? a : b;
          return {
            ...day,
            meals: {
              ...day.meals,
              // Only the SELECTION moves. Servings, tags and notes describe the
              // slot -- "Tuesday dinner, 4 people" -- not the recipe, so they
              // stay with the day.
              [meal]: { ...own, selection: incoming.selection },
            },
          };
        }),
      };
    });
    setSwapModal(null);
  };

  /**
   * Save the plan.
   *
   * Everything on this screen is local until now -- the generated picks and any
   * re-rolls, shuffles or swaps on top of them. Commit is what makes it real,
   * and it is also what turns staged picks into recipes in the household box,
   * which is why each item sends its source.
   */
  const commit = async () => {
    if (!result?.days?.length) return;
    setCommitting(true);
    setError(null);
    try {
      const items = result.days.flatMap((day) =>
        Object.entries(day.meals ?? {}).flatMap(([meal, slot]: [string, any]) => {
          const sel = slot?.selection;
          if (!sel?.recipe_id) return [];
          const id = Number(sel.recipe_id);
          // Guard rather than send NaN: exclude_recipe_ids taught us what an
          // unparseable id does to a List[int] endpoint.
          if (!Number.isInteger(id)) return [];
          return [
            {
              date: day.date,
              meal_type: meal,
              recipe_id: id,
              source: sel.source === 'stage' ? ('stage' as const) : ('user' as const),
            },
          ];
        }),
      );

      if (!items.length) {
        setError('Nothing to save yet — every meal is still empty.');
        return;
      }

      const startDate = [...result.days].map((d) => d.date).sort()[0];
      await commitPlan(startDate, items);
      setCommitted(true);
      await clearMealPlanJob();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Could not save the plan.');
    } finally {
      setCommitting(false);
    }
  };

  /** Re-roll every slot in the plan, in order, excluding as it goes. */
  const shuffleAll = async () => {
    if (!result) return;
    setShuffling(true);
    setError(null);
    try {
      for (const day of result.days) {
        for (const meal of sortMealOrder) {
          if ((day.meals as any)?.[meal]) {
            // Sequential on purpose: each swap must see the previous one so the
            // shuffled plan does not repeat a recipe.
            await rerollSlot_(day.date, meal as MealType);
          }
        }
      }
    } finally {
      setShuffling(false);
    }
  };

  const swapRecipe = (date: string, meal: MealType, alternative: Alternative) => {
    if (!result) return;

    setResult((prevResult) => {
      if (!prevResult) return prevResult;

      const updatedDays = prevResult.days.map((day) => {
        if (day.date !== date) return day;

        const mealSlot = (day.meals as any)?.[meal] as MealSlotResult | undefined;
        if (!mealSlot?.selection) return day;

        const currentSelection = mealSlot.selection;
        const currentAlternatives = currentSelection.alternatives ?? [];

        // Create new alternative from current selection
        const newAlternative: Alternative = {
          source: currentSelection.source,
          recipe_id: currentSelection.recipe_id,
          title: recipes[`${currentSelection.source}:${currentSelection.recipe_id}`]?.title ?? 'Recipe',
          confidence: currentSelection.confidence ?? 0.5,
          reason: null,
          matched_tags: currentSelection.matched_tags ?? [],
        };

        // Remove swapped alternative and add current as new alternative
        const updatedAlternatives = [
          newAlternative,
          ...currentAlternatives.filter((alt) => alt.recipe_id !== alternative.recipe_id),
        ];

        // Update selection with alternative
        const updatedSelection = {
          ...currentSelection,
          source: alternative.source,
          recipe_id: alternative.recipe_id,
          confidence: alternative.confidence,
          matched_tags: alternative.matched_tags,
          alternatives: updatedAlternatives,
        };

        return {
          ...day,
          meals: {
            ...day.meals,
            [meal]: {
              ...mealSlot,
              selection: updatedSelection,
            },
          },
        };
      });

      return { ...prevResult, days: updatedDays };
    });
  };

  if (loading) {
    return (
      <>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => navigation.goBack()} />
          <Appbar.Content title="Meal plan" />
        </Appbar.Header>
        <View style={styles.center}>
          <Text>Loading plan…</Text>
        </View>
      </>
    );
  }

  // Only take over the screen when there is nothing else to show. Everything on
  // this screen -- the re-rolls, the shuffles, the day swaps -- is local state,
  // and going Back re-polls the job, so replacing a loaded plan with a dead-end
  // error page threw away work the person could not get back. A failed save is
  // the worst case: the plan is intact and retryable, and the old early return
  // destroyed it.
  if (error && !result) {
    return (
      <>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => navigation.goBack()} />
          <Appbar.Content title="Meal plan" />
        </Appbar.Header>
        <View style={styles.center}>
          <HelperText type="error" visible>
            {error}
          </HelperText>
          <Button onPress={() => navigation.goBack()}>Back</Button>
        </View>
      </>
    );
  }

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Meal plan" />
      </Appbar.Header>
      <ScrollView contentContainerStyle={styles.container}>
        {days.map((day) => (
          <Card key={day.date} style={styles.card}>
            <Card.Title title={day.date} />
            <Card.Content>
              {sortMealOrder.map((meal) => {
                const slot = (day.meals as any)?.[meal] as MealSlotResult | undefined;
                if (!slot) return null;
                const selection = slot.selection;
                const key = selection ? `${selection.source}:${selection.recipe_id}` : null;
                const slotKey = `${day.date}-${meal}`;
                const isExpanded = expandedAlternatives[slotKey];
                const alternatives = selection?.alternatives ?? [];

                return (
                  <View key={slotKey} style={styles.slot}>
                    <View style={styles.mealHeader}>
                      <Text variant="titleSmall" style={styles.mealTitle}>
                        {meal.charAt(0).toUpperCase() + meal.slice(1)}
                      </Text>
                      {/* Same affordance as the quick planner, so re-rolling
                          means the same thing in both places. */}
                      <View style={styles.slotActions}>
                        {/* Only offered when another day has the same meal to
                            trade with -- there is nothing to swap otherwise. */}
                        {selection?.recipe_id &&
                        swappableDays(day.date, meal as MealType).length > 0 ? (
                          <IconButton
                            icon="swap-horizontal"
                            size={20}
                            onPress={() => setSwapModal({ date: day.date, meal: meal as MealType })}
                            disabled={shuffling}
                            accessibilityLabel={`Swap ${meal} on ${day.date} with another day`}
                          />
                        ) : null}
                        {rerolling === slotKey ? (
                          <ActivityIndicator size={20} />
                        ) : (
                          <IconButton
                            icon="dice-5-outline"
                            size={20}
                            onPress={() => rerollSlot_(day.date, meal as MealType)}
                            disabled={shuffling}
                            accessibilityLabel={`Re-roll ${meal} on ${day.date}`}
                          />
                        )}
                      </View>
                    </View>
                    <Text>Servings: {slot.servings}</Text>
                    {slot.tags?.length ? <Text>Tags: {slot.tags.join(', ')}</Text> : null}
                    {slot.note ? <Text>Note: {slot.note}</Text> : null}
                    {/* A slot can carry a selection with no recipe: the server
                        uses it to say WHY the slot is empty. Gate on the recipe,
                        not on the selection object. */}
                    {selection && selection.recipe_id ? (
                      <>
                        <View style={styles.recipeRow}>
                          <Button
                            mode="text"
                            onPress={async () => {
                              try {
                                const rec = await fetchRecipe(selection.source, selection.recipe_id);
                                if (rec?.id) {
                                  // Carry the source: a staged pick's id is a
                                  // stage_recipes UUID, which /recipes/{id}
                                  // cannot parse.
                                  navigation.getParent()?.navigate('RecipesTab', {
                                    screen: 'RecipeDetail',
                                    params: { id: rec.id, source: selection.source },
                                  });
                                }
                              } catch (error) {
                                console.warn('[MealPlanResults] Failed to navigate to recipe:', error instanceof Error ? error.message : String(error));
                              }
                            }}
                            style={styles.recipeButton}
                          >
                            {recipes[key!]?.title ?? 'View recipe'}
                          </Button>
                          {selection.confidence != null && (
                            <Chip compact style={styles.confidenceChip}>
                              {Math.round(selection.confidence * 100)}% match
                            </Chip>
                          )}
                        </View>
                        {selection.warnings?.length ? (
                          <HelperText type="info" visible>
                            {selection.warnings.join(', ')}
                          </HelperText>
                        ) : null}
                        {alternatives.length > 0 && (
                          <View style={styles.alternativesSection}>
                            <Button
                              mode="outlined"
                              compact
                              onPress={() =>
                                setExpandedAlternatives((prev) => ({
                                  ...prev,
                                  [slotKey]: !prev[slotKey],
                                }))
                              }
                              icon={isExpanded ? 'chevron-up' : 'chevron-down'}
                              style={styles.alternativesToggle}
                            >
                              {alternatives.length} other option{alternatives.length > 1 ? 's' : ''}
                            </Button>
                            {isExpanded && (
                              <View style={styles.alternativesList}>
                                {alternatives.map((alt) => (
                                  <Card key={alt.recipe_id} style={styles.alternativeCard}>
                                    <Card.Content>
                                      <View style={styles.alternativeHeader}>
                                        <Text variant="bodyMedium" style={styles.alternativeTitle}>
                                          {alt.title}
                                        </Text>
                                        <IconButton
                                          icon="swap-horizontal"
                                          size={20}
                                          onPress={() => swapRecipe(day.date, meal, alt)}
                                        />
                                      </View>
                                      {alt.confidence != null && (
                                        <Chip compact style={styles.alternativeConfidenceChip}>
                                          {Math.round(alt.confidence * 100)}% match
                                        </Chip>
                                      )}
                                      {alt.reason && (
                                        <Text variant="bodySmall" style={styles.alternativeReason}>
                                          {alt.reason}
                                        </Text>
                                      )}
                                      {alt.matched_tags.length > 0 && (
                                        <View style={styles.matchedTags}>
                                          {alt.matched_tags.slice(0, 3).map((tag) => (
                                            <Chip key={tag} compact>
                                              {tag}
                                            </Chip>
                                          ))}
                                        </View>
                                      )}
                                    </Card.Content>
                                  </Card>
                                ))}
                              </View>
                            )}
                          </View>
                        )}
                      </>
                    ) : (
                      <HelperText type="error" visible>
                        {isAlreadyUsed(selection) ? alreadyUsedMessage : noMatchMessage}
                      </HelperText>
                    )}
                  </View>
                );
              })}
            </Card.Content>
          </Card>
        ))}
        <Portal>
          <Dialog visible={!!swapModal} onDismiss={() => setSwapModal(null)}>
            <Dialog.Title>
              Swap {swapModal?.meal} with
            </Dialog.Title>
            <Dialog.Content>
              <Text variant="bodySmall" style={styles.dialogHint}>
                Only days that already have a {swapModal?.meal} are listed — a
                dinner cannot trade places with a lunch.
              </Text>
              {swapModal
                ? swappableDays(swapModal.date, swapModal.meal).map((other) => {
                    const otherSel = (result?.days.find((d) => d.date === other)?.meals as any)?.[
                      swapModal.meal
                    ]?.selection;
                    const otherKey = otherSel
                      ? `${otherSel.source}:${otherSel.recipe_id}`
                      : null;
                    return (
                      <Button
                        key={other}
                        onPress={() => swapDays(swapModal.meal, swapModal.date, other)}
                      >
                        {other}
                        {otherKey && recipes[otherKey]?.title
                          ? ` · ${recipes[otherKey].title}`
                          : ''}
                      </Button>
                    );
                  })
                : null}
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setSwapModal(null)}>Cancel</Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
        <View style={styles.actions}>
          {/* Screen-level failures (a re-roll with nothing left to pick, a
              rejected save) belong beside the buttons that caused them, with the
              plan still on screen. */}
          {error ? (
            <HelperText type="error" visible>
              {error}
            </HelperText>
          ) : null}
          <Button
            mode="contained"
            icon={committed ? 'check' : 'content-save'}
            onPress={commit}
            loading={committing}
            disabled={committing || committed || !result}
          >
            {committed ? 'Plan saved' : 'Save this plan'}
          </Button>
          {/* "Swap" is gone: the per-slot dice IS the swap, and a global swap
              button had no slot to act on. */}
          <Button
            mode="outlined"
            icon="dice-multiple-outline"
            onPress={shuffleAll}
            loading={shuffling}
            disabled={shuffling || !result}
          >
            {shuffling ? 'Shuffling…' : 'Shuffle all'}
          </Button>
        </View>
      </ScrollView>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    marginBottom: 8,
  },
  slot: {
    marginTop: 8,
    gap: 4,
    paddingVertical: 4,
  },
  slotActions: { flexDirection: 'row', alignItems: 'center' },
  dialogHint: { marginBottom: 8, opacity: 0.7 },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mealTitle: {
    // Never let the dice squeeze the label (see QuickPlanScreen for the same
    // trap: Text shrinks by default inside a row).
    flexShrink: 0,
    fontWeight: 'bold',
  },
  recipeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recipeButton: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  confidenceChip: {
    marginLeft: 'auto',
  },
  alternativesSection: {
    marginTop: 8,
  },
  alternativesToggle: {
    alignSelf: 'flex-start',
  },
  alternativesList: {
    marginTop: 8,
    gap: 8,
  },
  alternativeCard: {
    marginBottom: 4,
  },
  alternativeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alternativeTitle: {
    flex: 1,
    fontWeight: '500',
  },
  alternativeConfidenceChip: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  alternativeReason: {
    marginTop: 4,
    fontStyle: 'italic',
    opacity: 0.8,
  },
  matchedTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 8,
  },
  actions: {
    gap: 8,
    marginTop: 12,
  },
});

export default MealPlanResultsScreen;

