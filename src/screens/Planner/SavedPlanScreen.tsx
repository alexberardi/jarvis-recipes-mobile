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
import { Plan, deletePlan, getPlan } from '../../services/plans';

type Props = NativeStackScreenProps<PlannerStackParamList, 'SavedPlan'>;

const SavedPlanScreen = ({ navigation, route }: Props) => {
  const { planId } = route.params;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
              onPressMeal={(meal) =>
                navigation.getParent()?.navigate('RecipesTab', {
                  screen: 'RecipeDetail',
                  params: { id: meal.recipe_id },
                })
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
