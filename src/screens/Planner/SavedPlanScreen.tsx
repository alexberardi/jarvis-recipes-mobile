/**
 * One saved plan, read-only.
 *
 * Deliberately not editable. A committed plan is what the shopping list is
 * computed from, and letting it be edited in place would silently change a list
 * someone may already be shopping from. Re-planning those days and committing
 * again is the honest way to change it.
 */
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Button, HelperText, Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';

import PlanDays, { dayLabel } from '../../components/PlanDays';
import { PlannerStackParamList } from '../../navigation/types';
import { Plan, PlanItem, deletePlan, getPlan, movePlanItems } from '../../services/plans';

type Props = NativeStackScreenProps<PlannerStackParamList, 'SavedPlan'>;

const SavedPlanScreen = ({ navigation, route }: Props) => {
  const { planId } = route.params;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [movingItemId, setMovingItemId] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      getPlan(planId)
        .then((p) => {
          if (!cancelled) setPlan(p);
        })
        .catch((err: any) => {
          if (!cancelled) setError(err?.response?.data?.detail || 'Could not open that plan.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [planId]),
  );

  const confirmDelete = () => {
    Alert.alert(
      'Delete this plan?',
      'The recipes stay in your box. Only the plan is removed.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePlan(planId);
              navigation.goBack();
            } catch (err: any) {
              setError(err?.response?.data?.detail || 'Could not delete that plan.');
            }
          },
        },
      ],
    );
  };

  /**
   * Move one meal to the previous or next day the plan already covers.
   *
   * The target day comes from the plan's own sorted days rather than calendar
   * arithmetic, so a plan covering Mon/Wed/Fri moves Wed's dinner to Mon
   * instead of to an empty Tuesday it never included.
   *
   * The response replaces local state wholesale: the server may have SWAPPED
   * with whatever occupied the target slot, and recomputed start_date, so
   * patching one item locally would show a plan the server does not have.
   */
  const moveMeal = useCallback(
    async (item: PlanItem, direction: 'earlier' | 'later') => {
      if (!plan) return;
      const days = [...new Set(plan.items.map((i) => i.date))].sort();
      const index = days.indexOf(item.date);
      const target = days[direction === 'earlier' ? index - 1 : index + 1];
      // The arrows are disabled at the ends; this guards a race, not a tap.
      if (!target) return;

      setMovingItemId(item.id);
      setError(null);
      try {
        setPlan(
          await movePlanItems(plan.id, [
            { item_id: item.id, date: target, meal_type: item.meal_type },
          ]),
        );
      } catch (err: any) {
        setError(
          err?.response?.data?.detail || err?.message || 'Could not move that meal.',
        );
      } finally {
        setMovingItemId(null);
      }
    },
    [plan],
  );

  const span = plan?.items.length
    ? (() => {
        const dates = plan.items.map((i) => i.date).sort();
        return dates[0] === dates[dates.length - 1]
          ? dayLabel(dates[0])
          : `${dayLabel(dates[0])} – ${dayLabel(dates[dates.length - 1])}`;
      })()
    : '';

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={plan?.name || 'Meal plan'} subtitle={span} />
        {plan ? (
          <Appbar.Action
            icon="delete-outline"
            onPress={confirmDelete}
            accessibilityLabel="Delete this plan"
          />
        ) : null}
      </Appbar.Header>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          {/* Above the plan, not instead of it: a failed delete must not take
              the plan off screen. */}
          {error ? (
            <HelperText type="error" visible>
              {error}
            </HelperText>
          ) : null}
          {plan ? (
            <PlanDays
              items={plan.items}
              onMoveMeal={moveMeal}
              movingItemId={movingItemId}
              onPressMeal={(meal) =>
                // Within THIS stack, not via the Recipes tab: Back must come
                // back to the plan you were reading.
                navigation.navigate('RecipeDetail', { id: meal.recipe_id })
              }
            />
          ) : (
            <>
              <Text variant="bodyLarge">That plan is no longer available.</Text>
              <Button onPress={() => navigation.goBack()}>Back</Button>
            </>
          )}
        </ScrollView>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48, gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

export default SavedPlanScreen;
