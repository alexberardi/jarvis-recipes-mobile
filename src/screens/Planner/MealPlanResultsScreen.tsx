import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Appbar, Button, Card, HelperText, Text, Chip, IconButton } from 'react-native-paper';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PlannerStackParamList } from '../../navigation/types';
import { getMealPlanJob, getRecipeBySource, sortMealOrder, sortMealPlanDays } from '../../services/mealPlans';
import { Alternative, MealPlanResult, MealSlotResult, MealType } from '../../types/MealPlan';
import { Recipe } from '../../types/Recipe';

type Props = NativeStackScreenProps<PlannerStackParamList, 'MealPlanResults'>;

const noMatchMessage =
  'Could not find a recipe fitting your criteria. Try loosening your constraints or adding recipes that fit the selections.';

const MealPlanResultsScreen = ({ navigation, route }: Props) => {
  const { jobId } = route.params ?? {};
  const [result, setResult] = useState<MealPlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [recipes, setRecipes] = useState<Record<string, Recipe>>({});
  const [expandedAlternatives, setExpandedAlternatives] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const load = async () => {
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
            } catch {
              // Ignore errors for individual recipes
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

  if (error) {
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
                    <Text variant="titleSmall" style={styles.mealTitle}>
                      {meal.charAt(0).toUpperCase() + meal.slice(1)}
                    </Text>
                    <Text>Servings: {slot.servings}</Text>
                    {slot.tags?.length ? <Text>Tags: {slot.tags.join(', ')}</Text> : null}
                    {slot.note ? <Text>Note: {slot.note}</Text> : null}
                    {selection ? (
                      <>
                        <View style={styles.recipeRow}>
                          <Button
                            mode="text"
                            onPress={async () => {
                              try {
                                const rec = await fetchRecipe(selection.source, selection.recipe_id);
                                if (rec?.id) {
                                  navigation.getParent()?.navigate('RecipesTab', {
                                    screen: 'RecipeDetail',
                                    params: { id: rec.id },
                                  });
                                }
                              } catch {
                                // ignore for now
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
                        {noMatchMessage}
                      </HelperText>
                    )}
                  </View>
                );
              })}
            </Card.Content>
          </Card>
        ))}
        <View style={styles.actions}>
          <Button mode="outlined" disabled>
            Shuffle (coming soon)
          </Button>
          <Button mode="outlined" disabled>
            Swap (coming soon)
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
  mealTitle: {
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

